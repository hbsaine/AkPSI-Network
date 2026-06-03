import { alumniData } from "./alumni_data.js";
import { 
  isMock,
  submitPendingAlumnus, 
  subscribeApprovedSubmissions, 
  subscribePendingSubmissions, 
  approvePendingAlumnus, 
  deletePendingAlumnus 
} from "./firebase.js";

// ---------------------------------------------------------------------------
// 1. GLOBAL STATE & DESIGN CONFIGURATION
// ---------------------------------------------------------------------------
const COMPANY_TYPE = {
  Deloitte: "Big 4", PwC: "Big 4", EY: "Big 4", KPMG: "Big 4",
  BMO: "Finance", "Goldman Sachs": "Finance", "JPMorgan Chase": "Finance",
  "Bank of America": "Finance", Barclays: "Finance", "William Blair": "Finance",
  "Lincoln International": "Finance",
  RSM: "Accounting", "Arthur J Gallagher": "Accounting",
  Oracle: "Tech", Amazon: "Tech", "Amazon Web Services": "Tech", Microsoft: "Tech",
  Target: "Retail", ALDI: "Operations", CDW: "Tech",
  Lockton: "Insurance", Uline: "Operations",
};

const BASELINE_RECRUITERS = [
  {
    id: "recruiter-rsm",
    name: "Mary Clare Toomajian",
    title: "Sr. Campus Recruiter — Consulting",
    company: "RSM US LLP",
    linkedin: "https://www.linkedin.com/in/mary-clare-toomajian",
    email: "maryclare.toomajian@rsmus.com",
    isRecruiter: true
  },
  {
    id: "recruiter-uline",
    name: "Jonalyn Trimboli",
    title: "Campus Recruiter",
    company: "Uline",
    linkedin: "https://www.linkedin.com/in/jonalyn-trimboli-4a221176/",
    email: "jtrimboli@uline.com",
    isRecruiter: true
  },
];

// Outreach Templates
const outreachTemplates = {
  chat: {
    subject: () => `Iowa AKPsi Career Network: Coffee Chat Inquiry`,
    body: (user, alum) => `Hi ${alum.name},\n\nHope all is well! My name is ${user}, and I am an active brother of Alpha Kappa Psi at the University of Iowa (Tippie College of Business).\n\nI came across your profile on the AKPsi Career Network and would love to connect. I am very interested in your career path as a ${alum.position} at ${alum.company} and was wondering if you might have 15 minutes for a brief coffee chat in the coming weeks.\n\nThank you so much for your time and continued support of our active chapter!\n\nIn Brotherhood,\n${user}`
  },
  prep: {
    subject: () => `Iowa AKPsi Career Network: Interview Prep & Guidance Request`,
    body: (user, alum) => `Hi ${alum.name},\n\nHope you are having a wonderful week! My name is ${user}, and I am an active brother of AKPsi at Iowa.\n\nI am currently preparing for upcoming recruitment interviews in the ${alum.company} pipeline for ${alum.position} roles. Knowing your incredibly successful background, I would be extremely grateful for any guidance, mock questions, or general interview prep advice you could share.\n\nThank you so much!\n\nIn Brotherhood,\n${user}`
  },
  referral: {
    subject: () => `Iowa AKPsi Career Network: Career Inquiry & Referral Advice`,
    body: (user, alum) => `Hi ${alum.name},\n\nMy name is ${user}, and I am an active brother of AKPsi at the University of Iowa.\n\nI am highly interested in pursuing a career at ${alum.company} and noticed you currently work there as a ${alum.position}. I would love to learn more about the team culture and inquire if you would be open to sharing advice on how to put forward a strong application in the upcoming cycle.\n\nBest regards and thank you in advance,\n\nIn Brotherhood,\n${user}`
  }
};

// Memory Storage
let currentApprovedAlumni = [];
let currentApprovedRecruiters = [];
let currentPendingQueue = [];
let outreachAlumnus = null;
let outreachTrack = null;

// Search States
let searchQuery = "";
let onlyCoffeeChats = false;

// ---------------------------------------------------------------------------
// 2. DATA NORMALIZATION & CLASSIFICATION
// ---------------------------------------------------------------------------
const normalizeName = (name) => {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
};

const getActiveEmail = (alumnus) => {
  if (!alumnus.email) return null;
  if (alumnus.isLiveDbEntry && alumnus.createdAt) {
    const ageInMs = Date.now() - alumnus.createdAt;
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
    if (ageInMs > ninetyDaysInMs) {
      return null;
    }
  }
  return alumnus.email;
};

// Programmatic Classifier into 4 parent pillars
const classifyCompany = (companyName, roles = []) => {
  const cleanComp = (companyName || "").trim();
  const type = COMPANY_TYPE[cleanComp];
  
  if (type) {
    if (["Big 4", "Accounting"].includes(type)) return "recruitment";
    if (type === "Finance") return "outreach";
    if (type === "Tech") return "technical";
    if (["Retail", "Operations", "Insurance"].includes(type)) return "foundational";
  }

  // Keywords matching in roles or company names
  const roleText = roles.join(" ").toLowerCase();
  const compText = cleanComp.toLowerCase();

  if (
    roleText.includes("software") || roleText.includes("developer") || 
    roleText.includes("engineer") || roleText.includes("data") || 
    roleText.includes("tech") || roleText.includes("technical") || 
    roleText.includes("analytics") || roleText.includes("architect") ||
    compText.includes("technology") || compText.includes("software")
  ) {
    return "technical";
  }

  if (
    roleText.includes("consultant") || roleText.includes("consulting") || 
    roleText.includes("auditor") || roleText.includes("audit") || 
    roleText.includes("tax") || roleText.includes("advisor") ||
    compText.includes("consulting") || compText.includes("advisors")
  ) {
    return "recruitment";
  }

  if (
    roleText.includes("analyst") || roleText.includes("finance") || 
    roleText.includes("investment") || roleText.includes("credit") || 
    roleText.includes("banking") || roleText.includes("capital") || 
    roleText.includes("wealth") || roleText.includes("portfolio") ||
    compText.includes("bank") || compText.includes("capital") || compText.includes("wealth")
  ) {
    return "outreach";
  }

  // Fallback to Foundational Assets (for general business ops, marketing, retail, sales, accounting)
  return "foundational";
};

// Maps company names to corresponding CSS classes
const getCompanyClass = (companyName) => {
  const cleanName = (companyName || "").trim();
  const type = COMPANY_TYPE[cleanName] || "default";
  return `company-pill-${type.toLowerCase().replace(/\s+/g, "-")}`;
};

// ---------------------------------------------------------------------------
// 3. PIPELINE: DATA MERGING & AGGREGATIONS
// ---------------------------------------------------------------------------
const getMergedData = (approvedDbList) => {
  // 1. Normalize static baseline
  const normalizedBaseline = alumniData.map((a, i) => {
    let company = (a.company || "").trim();
    let city = (a.city || "").trim();
    let linkedin = (a.linkedin || "").trim();
    let position = (a.position || "").trim();
    let email = (a.email || "").trim();

    if (company === "ALDI USA") company = "ALDI";
    if (company === "BMO Harris") company = "BMO";
    if (city === "Minnepolis") city = "Minneapolis";
    if (city === "Schumberg") city = "Schaumburg";
    if (city === "Herdon") city = "Herndon";

    if (!company) company = "Company Unspecified";
    if (!position) position = "Role Unspecified";
    if (!city) city = "Location Unspecified";

    if (linkedin.startsWith("https://www.inkedin.com")) {
      linkedin = linkedin.replace("https://www.inkedin.com", "https://www.linkedin.com");
    }

    return {
      id: `static-${i}`,
      name: (a.name || "").trim(),
      email,
      company,
      position,
      city,
      linkedin,
      gradYear: a.gradYear || "N/A"
    };
  });

  // 2. Separate approved submissions into alumni and recruiters
  const cloudAlumni = approvedDbList
    .filter(s => !s.isRecruiter)
    .map(s => {
      let company = (s.company || "").trim();
      let city = (s.city || "").trim();
      
      if (company === "ALDI USA") company = "ALDI";
      if (company === "BMO Harris") company = "BMO";
      if (city === "Minnepolis") city = "Minneapolis";
      if (city === "Schumberg") city = "Schaumburg";
      if (city === "Herdon") city = "Herndon";

      return {
        id: s.id,
        name: (s.name || "").trim(),
        email: (s.email || "").trim(),
        company: company || "Company Unspecified",
        position: (s.position || "").trim() || "Role Unspecified",
        city: city || "Location Unspecified",
        linkedin: (s.linkedin || "").trim(),
        gradYear: s.gradYear || "N/A",
        isLiveDbEntry: true,
        createdAt: s.createdAt
      };
    });

  const cloudRecruiters = approvedDbList
    .filter(s => s.isRecruiter)
    .map(s => ({
      id: s.id,
      name: (s.name || "").trim(),
      title: s.position || s.title || "Campus Recruiter",
      company: (s.company || "").trim(),
      linkedin: (s.linkedin || "").trim(),
      email: (s.email || "").trim(),
      isLiveDbEntry: true,
      createdAt: s.createdAt
    }));

  // Merge alumni (hot-swapping matching baseline duplicate entries in place)
  const cloudMap = new Map();
  cloudAlumni.forEach(a => {
    const key = normalizeName(a.name);
    if (key) cloudMap.set(key, a);
  });

  const uniqueBaseline = normalizedBaseline.filter(
    a => !cloudMap.has(normalizeName(a.name))
  );

  const mergedAlumni = [...cloudAlumni, ...uniqueBaseline];

  // Merge recruiters
  const recruiterMap = new Map();
  cloudRecruiters.forEach(r => {
    const key = normalizeName(r.name);
    if (key) recruiterMap.set(key, r);
  });

  const uniqueRecruitersBaseline = BASELINE_RECRUITERS.filter(
    r => !recruiterMap.has(normalizeName(r.name))
  );

  const mergedRecruiters = [...cloudRecruiters, ...uniqueRecruitersBaseline];

  return { mergedAlumni, mergedRecruiters };
};

// ---------------------------------------------------------------------------
// 4. RENDERING ENGINE: DYNAMIC LAYOUT & UI COMPONENTS
// ---------------------------------------------------------------------------

// 4.1 Stats Counters
const initStatsCounters = (alumniCount, companiesCount, recruitersCount) => {
  const animateValue = (id, target) => {
    const el = document.getElementById(id);
    if (!el) return;
    let start = 0;
    const duration = 1000;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        el.textContent = Math.round(target).toLocaleString();
        clearInterval(timer);
      } else {
        el.textContent = Math.round(start).toLocaleString();
      }
    }, 16);
  };

  animateValue("stat-alumni-count", alumniCount);
  animateValue("stat-placements-count", companiesCount);
  animateValue("stat-recruiters-count", recruitersCount);
};

// 4.2 Timeline SVG Bar Chart
const renderSVGChart = (gradYearData) => {
  const container = document.getElementById("svg-chart-container");
  if (!container) return;

  const width = 640;
  const height = 220;
  const paddingLeft = 30;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(...gradYearData.map(d => d.count), 1);

  // Build bars & grid lines
  const gridLines = [];
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const yVal = Math.round((maxVal / yTicks) * i);
    const yPos = chartHeight - (chartHeight / yTicks) * i + paddingTop;
    gridLines.push(`
      <line x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" stroke="#f1f5f9" stroke-width="1.5" />
      <text x="${paddingLeft - 8}" y="${yPos + 4}" fill="#94a3b8" font-size="10" text-anchor="end" font-weight="600">${yVal}</text>
    `);
  }

  const barWidth = Math.floor(chartWidth / gradYearData.length) - 8;
  const bars = [];
  const xLabels = [];

  gradYearData.forEach((d, idx) => {
    const xPos = paddingLeft + (chartWidth / gradYearData.length) * idx + 4;
    const barHeight = (d.count / maxVal) * chartHeight;
    const yPos = chartHeight - barHeight + paddingTop;

    // Gradient bar coloring based on size density
    let barColor = "#93c5fd"; // light blue
    if (d.count > 20) barColor = "#1e3a8a"; // deep navy
    else if (d.count > 12) barColor = "#3b82f6"; // medium blue

    bars.push(`
      <rect 
        class="chart-bar-rect" 
        x="${xPos}" 
        y="${yPos}" 
        width="${barWidth}" 
        height="${barHeight}" 
        fill="${barColor}" 
        rx="4" 
        data-year="${d.year}" 
        data-count="${d.count}"
      />
    `);

    xLabels.push(`
      <text x="${xPos + barWidth / 2}" y="${height - 10}" fill="#94a3b8" font-size="10.5" font-weight="600" text-anchor="middle">${d.label}</text>
    `);
  });

  // Compile final SVG
  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="width-100-percent" style="overflow: visible;">
      ${gridLines.join("")}
      ${bars.join("")}
      ${xLabels.join("")}
    </svg>
    <div id="chart-tooltip-bubble" class="chart-tooltip-bubble"></div>
  `;

  // Attach hover details to SVG bars
  const tooltip = document.getElementById("chart-tooltip-bubble");
  const rects = container.querySelectorAll(".chart-bar-rect");

  rects.forEach(rect => {
    rect.addEventListener("mousemove", (e) => {
      const year = rect.getAttribute("data-year");
      const count = rect.getAttribute("data-count");
      
      // Calculate floating position inside container bounds
      const containerRect = container.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      tooltip.textContent = `Class of 20${year.slice(1)}: ${count} alumni`;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.style.display = "block";
    });

    rect.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });
};

// 4.3 Metro Placements List
const renderMetroPlacements = (topCities, maxCount) => {
  const container = document.getElementById("metro-placements-list");
  if (!container) return;

  container.innerHTML = topCities.map((c, i) => {
    const widthPct = Math.max(20, (c.count / maxCount) * 80);
    const opacityVal = 0.6 + (c.count / maxCount) * 0.4;
    return `
      <div class="city-row">
        <div class="city-info">
          <span class="city-rank">${i + 1}</span>
          <span class="city-name">${c.city}</span>
        </div>
        <div class="city-bar-wrapper">
          <div class="city-progress-bar" style="width: ${widthPct}px; opacity: ${opacityVal};"></div>
          <span class="city-count">${c.count}</span>
        </div>
      </div>
    `;
  }).join("");
};

// 4.4 Verified Recruiter Cards
const renderRecruiters = (recruitersList) => {
  const container = document.getElementById("recruiters-grid-container");
  if (!container) return;

  container.innerHTML = recruitersList.map(r => {
    const initials = r.name.split(" ").map(n => n[0]).join("");
    const emailButton = r.email 
      ? `<a href="mailto:${r.email}?subject=Iowa%20AKPsi%20Recruiting%20Inquiry" class="btn btn-secondary padding-email-recruiter">Email Recruiter</a>`
      : "";
    const linkedinButton = r.linkedin
      ? `<a href="${r.linkedin}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary padding-linkedin-recruiter" title="LinkedIn Profile">
           <span class="btn-linkedin-icon icon-linkedin-recruiter">in</span>
         </a>`
      : "";

    return `
      <div class="recruiter-card">
        <div class="recruiter-meta">
          <div class="recruiter-avatar">${initials}</div>
          <div>
            <div class="recruiter-name">${r.name}</div>
            <div class="recruiter-title">${r.title}</div>
          </div>
        </div>
        <div class="recruiter-company">${r.company}</div>
        <div class="recruiter-badge-row">
          <span class="verified-pill verified-pill-recruiter">● VERIFIED</span>
          ${emailButton}
          ${linkedinButton}
        </div>
      </div>
    `;
  }).join("");
};

// 4.5 Core Directory: Accordions and Alumni Cards grouping
const renderDirectory = (alumniList) => {
  // Group alumni by company
  const companyGroups = {};
  alumniList.forEach(a => {
    if (!companyGroups[a.company]) {
      companyGroups[a.company] = {
        name: a.company,
        class: getCompanyClass(a.company),
        alumni: []
      };
    }
    companyGroups[a.company].alumni.push(a);
  });

  // Sort companies by placements volume descending, secondary by name
  const sortedCompanies = Object.values(companyGroups).sort((a, b) => {
    if (b.alumni.length !== a.alumni.length) return b.alumni.length - a.alumni.length;
    return a.name.localeCompare(b.name);
  });

  // Clear existing nodes inside accordion contents
  const pillars = {
    foundational: { el: document.getElementById("companies-foundational"), countEl: document.getElementById("count-foundational"), list: [] },
    recruitment: { el: document.getElementById("companies-recruitment"), countEl: document.getElementById("count-recruitment"), list: [] },
    technical: { el: document.getElementById("companies-technical"), countEl: document.getElementById("count-technical"), list: [] },
    outreach: { el: document.getElementById("companies-outreach"), countEl: document.getElementById("count-outreach"), list: [] }
  };

  Object.values(pillars).forEach(p => {
    if (p.el) p.el.innerHTML = "";
  });

  // Distribute companies into respective pillars based on tags and roles
  sortedCompanies.forEach(comp => {
    const rolesList = comp.alumni.map(a => a.position);
    const pillarKey = classifyCompany(comp.name, rolesList);
    if (pillars[pillarKey]) {
      pillars[pillarKey].list.push(comp);
    }
  });

  // Render company blocks and profiles inside target shells
  Object.entries(pillars).forEach(([key, p]) => {
    if (!p.el) return;

    p.countEl.textContent = `${p.list.length} companies`;

    if (p.list.length === 0) {
      p.el.innerHTML = `<p class="no-matches-desc" style="padding: 12px 0;">No placements currently matching in this track.</p>`;
      return;
    }

    p.el.innerHTML = p.list.map(comp => {
      // Build cards for alumni in this company
      const alumniCards = comp.alumni.map(a => {
        const activeEmail = getActiveEmail(a);
        
        let actionMarkup = "";
        if (activeEmail) {
          actionMarkup = `
            <button class="btn btn-primary btn-flex-1 btn-trigger-outreach" data-alumnus-id="${a.id}">
              Reach Out ✉️
            </button>
            ${a.linkedin ? `
              <a href="${a.linkedin}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-modal-linkedin" title="LinkedIn Profile">
                <span class="btn-linkedin-icon">in</span>
              </a>
            ` : ""}
          `;
        } else if (a.linkedin) {
          actionMarkup = `
            <a href="${a.linkedin}" target="_blank" rel="noopener noreferrer" class="btn btn-linkedin btn-flex-1">
              <span class="btn-linkedin-icon linkedin-bg-transparent font-14">in</span>
              View LinkedIn Profile
            </a>
          `;
        } else {
          actionMarkup = `
            <button class="btn btn-secondary btn-flex-1" disabled>No Contact Provided</button>
          `;
        }

        return `
          <div class="alumni-card" data-alumnus-name="${normalizeName(a.name)}" data-alumnus-id="${a.id}" data-alumnus-email="${activeEmail ? 'yes' : 'no'}">
            <div>
              <div class="alumni-card-header">
                <div>
                  <h4 class="alumni-card-name">${a.name}</h4>
                  <div class="alumni-card-role">${a.position}</div>
                </div>
                <span class="alumni-card-badge ${comp.class}">${comp.name}</span>
              </div>
              <div class="alumni-card-details">
                <div class="alumni-card-detail-item">📍 ${a.city}</div>
                <div class="alumni-card-detail-item">🎓 Class of ${a.gradYear}</div>
              </div>
            </div>
            <div class="alumni-card-actions">
              ${actionMarkup}
            </div>
          </div>
        `;
      }).join("");

      const displayTag = COMPANY_TYPE[comp.name.trim()] || "Default";
      const badgeClass = getCompanyClass(comp.name);

      return `
        <div class="company-group" data-company-name="${normalizeName(comp.name)}">
          <h3 class="company-group-title">
            ${comp.name} 
            <span class="company-type-badge ${badgeClass}">${displayTag}</span>
          </h3>
          <div class="alumni-grid">
            ${alumniCards}
          </div>
        </div>
      `;
    }).join("");
  });

  // Attach outreach action events directly to dynamic buttons
  document.querySelectorAll(".btn-trigger-outreach").forEach(btn => {
    btn.addEventListener("click", () => {
      const alumId = btn.getAttribute("data-alumnus-id");
      const alum = currentApprovedAlumni.find(a => a.id === alumId);
      if (alum) {
        openOutreachModal(alum);
      }
    });
  });
};

// ---------------------------------------------------------------------------
// 5. DYNAMIC KEYSTROKE SEARCH & ENGINE FILTERING
// ---------------------------------------------------------------------------
const filterDirectory = () => {
  const query = searchQuery.trim().toLowerCase();
  const hasQuery = query.length >= 2;
  const showChatsOnly = onlyCoffeeChats;

  const accordions = document.querySelectorAll(".accordion-item");
  const noResultsCard = document.getElementById("no-results-card");
  
  let totalMatchingAlumni = 0;

  accordions.forEach(accordion => {
    const compGroups = accordion.querySelectorAll(".company-group");
    let accordionHasMatches = false;

    compGroups.forEach(group => {
      const compName = group.getAttribute("data-company-name") || "";
      const cards = group.querySelectorAll(".alumni-card");
      let groupHasMatches = false;

      cards.forEach(card => {
        const alumName = card.getAttribute("data-alumnus-name") || "";
        const role = card.querySelector(".alumni-card-role")?.textContent.toLowerCase() || "";
        const city = card.querySelector(".alumni-card-detail-item:first-child")?.textContent.toLowerCase() || "";
        const gradYear = card.querySelector(".alumni-card-detail-item:last-child")?.textContent.toLowerCase() || "";
        const hasEmail = card.getAttribute("data-alumnus-email") === "yes";

        // Coffee Chats filter condition check
        const passesCoffeeChat = !showChatsOnly || hasEmail;

        // Query text matching check across fields
        let passesQuery = true;
        if (hasQuery) {
          const tokens = query.split(/\s+/).filter(Boolean);
          passesQuery = tokens.every(token => 
            alumName.includes(token) || 
            compName.includes(token) || 
            role.includes(token) || 
            city.includes(token) || 
            gradYear.includes(token)
          );
        }

        if (passesCoffeeChat && passesQuery) {
          card.style.display = "flex";
          groupHasMatches = true;
          totalMatchingAlumni++;
        } else {
          card.style.display = "none";
        }
      });

      // Show/hide company container based on profile matches
      if (groupHasMatches) {
        group.style.display = "block";
        accordionHasMatches = true;
      } else {
        group.style.display = "none";
      }
    });

    // Show/hide parent accordion container based on matches
    if (accordionHasMatches) {
      accordion.style.display = "block";
      
      // Critical Auto-Expansion Rule: Open accordion if search queries are active
      if (hasQuery) {
        accordion.classList.add("expanded");
        accordion.querySelector(".accordion-header").setAttribute("aria-expanded", "true");
      }
    } else {
      accordion.style.display = "none";
    }
  });

  // Display empty fallback message if total placement count is 0
  if (totalMatchingAlumni === 0 && (hasQuery || showChatsOnly)) {
    noResultsCard.style.display = "block";
  } else {
    noResultsCard.style.display = "none";
  }
};

// ---------------------------------------------------------------------------
// 6. OUTREACH COMPILER MODAL HANDLERS
// ---------------------------------------------------------------------------
const openOutreachModal = (alum) => {
  outreachAlumnus = alum;
  outreachTrack = null;

  const modal = document.getElementById("outreach-modal");
  const targetLabel = document.getElementById("outreach-target-name");
  const nameInput = document.getElementById("outreach-user-name");
  const previewDrawer = document.getElementById("email-preview-drawer");

  targetLabel.textContent = `${alum.name} — ${alum.company}`;
  nameInput.value = localStorage.getItem("akpsi_user_outreach_name") || "";
  
  // Reset preview panel view state
  previewDrawer.style.display = "none";
  document.getElementById("error-outreach-user-name").textContent = "";

  modal.style.display = "flex";
};

const compileEmailPreview = () => {
  const userName = document.getElementById("outreach-user-name").value.trim();
  const nameError = document.getElementById("error-outreach-user-name");

  if (!userName) {
    nameError.textContent = "Please enter your name to customize your email template.";
    return;
  }
  nameError.textContent = "";
  localStorage.setItem("akpsi_user_outreach_name", userName);

  const template = outreachTemplates[outreachTrack];
  if (!template || !outreachAlumnus) return;

  const previewDrawer = document.getElementById("email-preview-drawer");
  const toEl = document.getElementById("preview-email-to");
  const subEl = document.getElementById("preview-email-subject");
  const bodyEl = document.getElementById("preview-email-body");

  toEl.textContent = getActiveEmail(outreachAlumnus) || "N/A";
  subEl.textContent = template.subject();
  bodyEl.textContent = template.body(userName, outreachAlumnus);

  previewDrawer.style.display = "block";
  
  // Smooth scroll modal body to reveal preview drawer contents
  setTimeout(() => {
    const modalBody = document.querySelector(".modal-body");
    if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
  }, 100);
};

// ---------------------------------------------------------------------------
// 7. FIREBASE INTEGRATION & FORM HANDLERS
// ---------------------------------------------------------------------------
const initUpdateHub = () => {
  const toggleAlumniBtn = document.getElementById("toggle-alumni-form-btn");
  const toggleRecruiterBtn = document.getElementById("toggle-recruiter-form-btn");
  const alumniForm = document.getElementById("alumni-footprint-form");
  const recruiterForm = document.getElementById("recruiter-contact-form");
  const successBanner = document.getElementById("hub-success-banner");
  const formWrapper = document.getElementById("forms-inner-wrapper");

  toggleAlumniBtn.addEventListener("click", () => {
    toggleAlumniBtn.classList.replace("btn-secondary", "btn-primary");
    toggleRecruiterBtn.classList.replace("btn-primary", "btn-secondary");
    alumniForm.style.display = "grid";
    recruiterForm.style.display = "none";
    successBanner.style.display = "none";
    formWrapper.style.display = "block";
  });

  toggleRecruiterBtn.addEventListener("click", () => {
    toggleRecruiterBtn.classList.replace("btn-secondary", "btn-primary");
    toggleAlumniBtn.classList.replace("btn-primary", "btn-secondary");
    recruiterForm.style.display = "grid";
    alumniForm.style.display = "none";
    successBanner.style.display = "none";
    formWrapper.style.display = "block";
  });

  // Submission validation and handling for Alumni
  alumniForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameVal = document.getElementById("alumni-form-name").value.trim();
    const compVal = document.getElementById("alumni-form-company").value.trim();
    const roleVal = document.getElementById("alumni-form-role").value.trim();
    const cityVal = document.getElementById("alumni-form-city").value.trim();
    const gradVal = document.getElementById("alumni-form-grad").value.trim();
    const linkedinVal = document.getElementById("alumni-form-linkedin").value.trim();

    let valid = true;
    
    // Clear validation states
    document.getElementById("error-alumni-name").textContent = "";
    document.getElementById("error-alumni-company").textContent = "";
    document.getElementById("error-alumni-role").textContent = "";
    document.getElementById("error-alumni-linkedin").textContent = "";

    if (!nameVal) {
      document.getElementById("error-alumni-name").textContent = "Full name is required.";
      valid = false;
    }
    if (!compVal) {
      document.getElementById("error-alumni-company").textContent = "Company name is required.";
      valid = false;
    }
    if (!roleVal) {
      document.getElementById("error-alumni-role").textContent = "Role / Position is required.";
      valid = false;
    }
    if (!linkedinVal) {
      document.getElementById("error-alumni-linkedin").textContent = "LinkedIn URL is required.";
      valid = false;
    } else if (!/^https?:\/\//i.test(linkedinVal)) {
      document.getElementById("error-alumni-linkedin").textContent = "Must start with http:// or https://";
      valid = false;
    }

    if (!valid) return;

    try {
      await submitPendingAlumnus({
        name: nameVal,
        email: "",
        company: compVal,
        position: roleVal,
        city: cityVal,
        linkedin: linkedinVal,
        gradYear: gradVal ? parseInt(gradVal) : null,
        isRecruiter: false
      });

      // Clear input fields and show success alert
      alumniForm.reset();
      formWrapper.style.display = "none";
      successBanner.style.display = "block";
    } catch (err) {
      console.error("Alumni update hub submit error:", err);
    }
  });

  // Submission validation and handling for Recruiters
  recruiterForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameVal = document.getElementById("recruiter-form-name").value.trim();
    const titleVal = document.getElementById("recruiter-form-title").value.trim();
    const compVal = document.getElementById("recruiter-form-company").value.trim();
    const emailVal = document.getElementById("recruiter-form-email").value.trim();
    const linkedinVal = document.getElementById("recruiter-form-linkedin").value.trim();

    let valid = true;

    // Clear validation states
    document.getElementById("error-recruiter-name").textContent = "";
    document.getElementById("error-recruiter-title").textContent = "";
    document.getElementById("error-recruiter-company").textContent = "";
    document.getElementById("error-recruiter-linkedin").textContent = "";

    if (!nameVal) {
      document.getElementById("error-recruiter-name").textContent = "Recruiter name is required.";
      valid = false;
    }
    if (!titleVal) {
      document.getElementById("error-recruiter-title").textContent = "Recruiter title is required.";
      valid = false;
    }
    if (!compVal) {
      document.getElementById("error-recruiter-company").textContent = "Company name is required.";
      valid = false;
    }
    if (!linkedinVal) {
      document.getElementById("error-recruiter-linkedin").textContent = "LinkedIn URL is required.";
      valid = false;
    } else if (!/^https?:\/\//i.test(linkedinVal)) {
      document.getElementById("error-recruiter-linkedin").textContent = "Must start with http:// or https://";
      valid = false;
    }

    if (!valid) return;

    try {
      await submitPendingAlumnus({
        name: nameVal,
        email: emailVal,
        company: compVal,
        position: titleVal,
        city: "",
        linkedin: linkedinVal,
        gradYear: null,
        isRecruiter: true
      });

      recruiterForm.reset();
      formWrapper.style.display = "none";
      successBanner.style.display = "block";
    } catch (err) {
      console.error("Recruiter contact hub submit error:", err);
    }
  });

  document.getElementById("add-another-update-btn").addEventListener("click", () => {
    successBanner.style.display = "none";
    formWrapper.style.display = "block";
  });
};

// ---------------------------------------------------------------------------
// 8. PRO DEV ADMIN DASHBOARD SYSTEM
// ---------------------------------------------------------------------------
const initAdminModeration = () => {
  const loginWrapper = document.getElementById("admin-login-wrapper");
  const moderationWrapper = document.getElementById("admin-moderation-wrapper");
  const logoutBtn = document.getElementById("admin-logout-btn");
  const loginForm = document.getElementById("admin-login-form");
  const errorText = document.getElementById("admin-login-error");

  let pendingUnsubscribe = null;

  const showModerationInterface = () => {
    loginWrapper.style.display = "none";
    moderationWrapper.style.display = "block";
    logoutBtn.style.display = "inline-flex";

    // Subscribe to real-time pending updates queue
    pendingUnsubscribe = subscribePendingSubmissions((list) => {
      currentPendingQueue = list;
      renderPendingQueue(list);
    });
  };

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("admin-access-key-input").value;
    const correctKey = "tippie-prodev"; // baseline clearance password
    
    if (val === correctKey) {
      showModerationInterface();
      errorText.textContent = "";
      loginForm.reset();
    } else {
      errorText.textContent = "Invalid security key. Access denied.";
    }
  });

  logoutBtn.addEventListener("click", () => {
    if (pendingUnsubscribe) {
      pendingUnsubscribe();
      pendingUnsubscribe = null;
    }
    moderationWrapper.style.display = "none";
    logoutBtn.style.display = "none";
    loginWrapper.style.display = "block";
  });
};

const renderPendingQueue = (pendingList) => {
  const grid = document.getElementById("admin-submissions-grid");
  const emptyMsg = document.getElementById("admin-empty-queue-msg");

  if (!grid || !emptyMsg) return;

  if (pendingList.length === 0) {
    grid.innerHTML = "";
    emptyMsg.style.display = "block";
    return;
  }
  emptyMsg.style.display = "none";

  grid.innerHTML = pendingList.map(item => {
    const typeBadge = item.isRecruiter 
      ? `<span class="verified-pill verified-pill-recruiter">RECRUITER</span>`
      : `<span class="verified-pill verified-pill-alumni">ALUMNI</span>`;
    
    const details = item.isRecruiter
      ? `
        <div class="admin-pending-card-details">
          <div>Role: ${item.position || "N/A"}</div>
          <div>Company: ${item.company || "N/A"}</div>
          <div>Email: ${item.email || "N/A"}</div>
          <div class="admin-pending-card-link-wrapper">
            LinkedIn: <a href="${item.linkedin}" target="_blank" rel="noopener noreferrer">${item.linkedin}</a>
          </div>
        </div>
      `
      : `
        <div class="admin-pending-card-details">
          <div>Company: ${item.company || "N/A"}</div>
          <div>Role: ${item.position || "N/A"}</div>
          <div>City: ${item.city || "N/A"}</div>
          <div>Grad: ${item.gradYear || "N/A"}</div>
          <div class="admin-pending-card-link-wrapper">
            LinkedIn: <a href="${item.linkedin}" target="_blank" rel="noopener noreferrer">${item.linkedin}</a>
          </div>
        </div>
      `;

    return `
      <div class="ui-card admin-pending-card" data-pending-id="${item.id}">
        <div class="admin-pending-card-header">
          <h4 class="admin-pending-card-title">${item.name}</h4>
          ${typeBadge}
        </div>
        ${details}
        <div class="admin-card-actions">
          <button class="btn btn-admin-success admin-action-btn btn-approve-pending" data-pending-id="${item.id}">Approve</button>
          <button class="btn btn-admin-danger admin-action-btn btn-delete-pending" data-pending-id="${item.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  // Attach control triggers for Approve/Delete
  grid.querySelectorAll(".btn-approve-pending").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pending-id");
      try {
        await approvePendingAlumnus(id);
      } catch (err) {
        console.error("Failed to approve submission:", err);
      }
    });
  });

  grid.querySelectorAll(".btn-delete-pending").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-pending-id");
      try {
        await deletePendingAlumnus(id);
      } catch (err) {
        console.error("Failed to delete submission:", err);
      }
    });
  });
};

// ---------------------------------------------------------------------------
// 9. INITIALIZATION BOOTSTRAP PIPELINE
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Update local offline badge if Firebase config is working
  const localBadge = document.getElementById("local-mode-badge");
  if (localBadge) {
    localBadge.textContent = isMock ? "Local Offline Mode" : "Cloud Firestore Connected";
    if (!isMock) {
      localBadge.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
      localBadge.style.color = "var(--brand-emerald)";
      localBadge.style.borderColor = "rgba(16, 185, 129, 0.25)";
    }
  }

  // Subscribe to real-time APPROVED database entries
  subscribeApprovedSubmissions((approvedSubmissionsList) => {
    const { mergedAlumni, mergedRecruiters } = getMergedData(approvedSubmissionsList);
    currentApprovedAlumni = mergedAlumni;
    currentApprovedRecruiters = mergedRecruiters;

    // 1. Gather statistical details
    const uniqueCompNames = new Set(mergedAlumni.map(a => a.company).filter(Boolean));
    const totalUniqueCompanies = uniqueCompNames.size;

    // Timeline grad year densities aggregation (2008 to 2024 index)
    const timelineCounts = {};
    for (let yr = 2008; yr <= 2024; yr++) {
      timelineCounts[yr] = 0;
    }
    mergedAlumni.forEach(a => {
      const yr = parseInt(a.gradYear);
      if (yr >= 2008 && yr <= 2024) {
        timelineCounts[yr] = (timelineCounts[yr] || 0) + 1;
      }
    });
    const gradYearTimelineData = Object.entries(timelineCounts).map(([year, count]) => ({
      year: year,
      label: `'${year.slice(2)}`,
      count: count
    }));

    // Top metro placements list aggregation
    const cityCountsMap = {};
    mergedAlumni.forEach(a => {
      if (a.city && a.city !== "Location Unspecified") {
        cityCountsMap[a.city] = (cityCountsMap[a.city] || 0) + 1;
      }
    });
    const topCitiesList = Object.entries(cityCountsMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const maxCityCount = topCitiesList[0]?.count || 1;

    // 2. Hydrate UI panels dynamically
    initStatsCounters(mergedAlumni.length, totalUniqueCompanies, mergedRecruiters.length);
    renderDirectory(mergedAlumni);
    renderRecruiters(mergedRecruiters);
    renderSVGChart(gradYearTimelineData);
    renderMetroPlacements(topCitiesList, maxCityCount);

    // Apply any active filters immediately if list updates
    filterDirectory();
  });

  // Attach search listeners
  const searchInput = document.getElementById("directory-search-input");
  const clearSearchBtn = document.getElementById("clear-search-btn");
  const coffeeToggleBtn = document.getElementById("coffee-toggle-btn");

  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (searchQuery) {
      clearSearchBtn.style.display = "block";
    } else {
      clearSearchBtn.style.display = "none";
    }
    filterDirectory();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchQuery = "";
    searchInput.value = "";
    clearSearchBtn.style.display = "none";
    filterDirectory();

    // Reset accordion classes to collapsed states when search is cleared
    document.querySelectorAll(".accordion-item").forEach(acc => {
      acc.classList.remove("expanded");
      acc.querySelector(".accordion-header").setAttribute("aria-expanded", "false");
    });
  });

  coffeeToggleBtn.addEventListener("click", () => {
    onlyCoffeeChats = !onlyCoffeeChats;
    if (onlyCoffeeChats) {
      coffeeToggleBtn.classList.add("active");
    } else {
      coffeeToggleBtn.classList.remove("active");
    }
    filterDirectory();
  });

  // Attach Accordion Toggle Event click handlers
  document.querySelectorAll(".accordion-header").forEach(header => {
    header.addEventListener("click", () => {
      const item = header.parentElement;
      const isExpanded = item.classList.contains("expanded");
      
      if (isExpanded) {
        item.classList.remove("expanded");
        header.setAttribute("aria-expanded", "false");
      } else {
        item.classList.add("expanded");
        header.setAttribute("aria-expanded", "true");
      }
    });
  });

  // Attach Quick-Access Scroll Click actions
  document.getElementById("qa-resume-card").addEventListener("click", () => {
    const acc = document.getElementById("pillar-foundational");
    acc.classList.add("expanded");
    acc.scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("qa-tracker-card").addEventListener("click", () => {
    const acc = document.getElementById("pillar-recruitment");
    acc.classList.add("expanded");
    acc.scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("qa-interview-card").addEventListener("click", () => {
    const acc = document.getElementById("pillar-technical");
    acc.classList.add("expanded");
    acc.scrollIntoView({ behavior: "smooth" });
  });

  document.getElementById("qa-alumni-card").addEventListener("click", () => {
    document.getElementById("directory-search-input").focus();
    document.getElementById("directory-search-input").scrollIntoView({ behavior: "smooth" });
  });

  // Modal Outreach events
  const modal = document.getElementById("outreach-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const trackChatBtn = document.getElementById("track-chat-btn");
  const trackPrepBtn = document.getElementById("track-prep-btn");
  const trackReferralBtn = document.getElementById("track-referral-btn");
  const triggerMailtoBtn = document.getElementById("trigger-mailto-btn");
  const copyPreviewBtn = document.getElementById("copy-preview-btn");

  modalCloseBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  trackChatBtn.addEventListener("click", () => {
    outreachTrack = "chat";
    compileEmailPreview();
  });
  trackPrepBtn.addEventListener("click", () => {
    outreachTrack = "prep";
    compileEmailPreview();
  });
  trackReferralBtn.addEventListener("click", () => {
    outreachTrack = "referral";
    compileEmailPreview();
  });

  triggerMailtoBtn.addEventListener("click", () => {
    const template = outreachTemplates[outreachTrack];
    const email = getActiveEmail(outreachAlumnus);
    const userName = document.getElementById("outreach-user-name").value.trim();

    if (template && outreachAlumnus && email && userName) {
      const subject = encodeURIComponent(template.subject());
      const body = encodeURIComponent(template.body(userName, outreachAlumnus));
      const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
      
      modal.style.display = "none";
      window.location.href = mailtoUrl;
    }
  });

  copyPreviewBtn.addEventListener("click", () => {
    const bodyContent = document.getElementById("preview-email-body").textContent;
    navigator.clipboard.writeText(bodyContent)
      .then(() => {
        const copyLabel = document.getElementById("copy-preview-label");
        copyLabel.textContent = "Copied! ✓";
        setTimeout(() => {
          copyLabel.textContent = "Copy Draft";
        }, 2000);
      })
      .catch(err => {
        console.error("Outreach preview copy to clipboard failed:", err);
      });
  });

  // Initialize Forms & Admin Boards
  initUpdateHub();
  initAdminModeration();
});
