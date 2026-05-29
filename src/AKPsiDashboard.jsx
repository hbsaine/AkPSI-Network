import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
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
// Design System Branding Constants
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



// Baseline Recruiters list
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

// Empty form templates
const EMPTY_ALUMNI_FORM = { name: "", company: "", position: "", city: "", email: "", linkedin: "", gradYear: "" };
const EMPTY_RECRUITER_FORM = { recruiterName: "", title: "", company: "", email: "", linkedin: "" };

// ---------------------------------------------------------------------------
// Sub-Component: AnimatedNumber
// ---------------------------------------------------------------------------
function AnimatedNumber({ target, duration = 1200 }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) { 
        setCurrent(target); 
        clearInterval(timer); 
      } else {
        setCurrent(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <span>{current.toLocaleString()}</span>;
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
// Helper to normalize names for duplicate detection and state hot-swapping
const normalizeName = (name) => {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
};

// Expiry fallback (Option N): hides emails and defaults to LinkedIn if card is > 90 days old
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

// Map company name to simplified lower-case class modifier
function getCompanyClass(companyName) {
  const cleanName = (companyName || "").trim();
  const type = COMPANY_TYPE[cleanName] || "default";
  return `company-pill-${type.toLowerCase().replace(/\s+/g, "-")}`;
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
export default function AKPsiDashboard() {
  // --- View States ---
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [onlyCoffeeChats, setOnlyCoffeeChats] = useState(false);
  
  // --- Firebase Cloud Data States ---
  const [approvedSubmissions, setApprovedSubmissions] = useState([]);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  
  // --- Outreach Modal States ---
  const [outreachAlumnus, setOutreachAlumnus] = useState(null);
  const [outreachTrack, setOutreachTrack] = useState(null);
  const [copied, setCopied] = useState(false);

  const [outreachName, setOutreachName] = useState(() => {
    return localStorage.getItem("akpsi_user_outreach_name") || "";
  });
  const [outreachNameError, setOutreachNameError] = useState("");

  // --- Admin Panel States ---
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminError, setAdminError] = useState("");

  // --- Update Hub Form States ---
  const [formType, setFormType] = useState("alumni"); // "alumni" or "recruiter"
  const [alumniForm, setAlumniForm] = useState(EMPTY_ALUMNI_FORM);
  const [recruiterForm, setRecruiterForm] = useState(EMPTY_RECRUITER_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [formSubmitted, setFormSubmitted] = useState(false);

  // --- Debounce searchQuery state with a 150ms timeout for viewport performance safety ---
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // --- Subscribe to Approved Submissions ---
  useEffect(() => {
    const unsubscribe = subscribeApprovedSubmissions((list) => {
      setApprovedSubmissions(list);
    });
    return () => unsubscribe();
  }, []);

  // --- Subscribe to Pending Submissions (Admin Only) ---
  useEffect(() => {
    if (!isAdminAuthenticated) return;
    const unsubscribe = subscribePendingSubmissions((list) => {
      setPendingSubmissions(list);
    });
    return () => unsubscribe();
  }, [isAdminAuthenticated]);



  // ---------------------------------------------------------------------------
  // 1. DATA INGESTION & NORMALIZATION PIPELINE
  // ---------------------------------------------------------------------------
  const normalizedAlumniBaseline = useMemo(() => {
    return alumniData.map((a, i) => {
      let company = (a.company || "").trim();
      let city = (a.city || "").trim();
      let linkedin = (a.linkedin || "").trim();
      let position = (a.position || "").trim();
      let email = (a.email || "").trim();
      let name = (a.name || "").trim();

      // Dynamic Company Aliasing Normalization
      if (company === "ALDI USA") company = "ALDI";
      if (company === "BMO Harris") company = "BMO";

      // City Typo Correction
      if (city === "Minnepolis") city = "Minneapolis";
      if (city === "Schumberg") city = "Schaumburg";
      if (city === "Herdon") city = "Herndon";

      // Structural Fallbacks
      if (!company) company = "Company Unspecified";
      if (!position) position = "Role Unspecified";
      if (!city) city = "Location Unspecified";

      // Normalize broken URL links
      if (linkedin && linkedin.startsWith("https://www.inkedin.com")) {
        linkedin = linkedin.replace("https://www.inkedin.com", "https://www.linkedin.com");
      }

      return {
        id: `static-${i}`,
        name,
        email,
        company,
        position,
        city,
        linkedin,
        gradYear: a.gradYear || "N/A"
      };
    });
  }, []);

  // Combine baseline data with approved cloud entries, hot-swapping baseline duplicate matches
  const mergedAlumni = useMemo(() => {
    // Separate recruiter cloud entries from alumni cloud entries
    const cloudAlumni = approvedSubmissions
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

    const cloudMap = new Map();
    cloudAlumni.forEach((a) => {
      const key = normalizeName(a.name);
      if (key) cloudMap.set(key, a);
    });

    // Cleanly hot-swap out matching baseline entries
    const uniqueBaseline = normalizedAlumniBaseline.filter(
      a => !cloudMap.has(normalizeName(a.name))
    );

    const combined = [...cloudAlumni, ...uniqueBaseline];
    return combined.map(a => ({
      ...a,
      searchIndex: {
        name: (a.name || "").toLowerCase(),
        company: (a.company || "").toLowerCase(),
        position: (a.position || "").toLowerCase(),
        city: (a.city || "").toLowerCase(),
        gradYear: String(a.gradYear || "").toLowerCase()
      }
    }));
  }, [normalizedAlumniBaseline, approvedSubmissions]);

  // Combined Recruiters list, hot-swapping baseline duplicate matches
  const mergedRecruiters = useMemo(() => {
    const cloudRecruiters = approvedSubmissions
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

    const cloudMap = new Map();
    cloudRecruiters.forEach((r) => {
      const key = normalizeName(r.name);
      if (key) cloudMap.set(key, r);
    });

    const uniqueBaseline = BASELINE_RECRUITERS.filter(
      r => !cloudMap.has(normalizeName(r.name))
    );

    return [...cloudRecruiters, ...uniqueBaseline];
  }, [approvedSubmissions]);

  // ---------------------------------------------------------------------------
  // 2. MULTI-FIELD SEARCH & INDEXING PARSER (Option B: Weighted Relevance)
  // ---------------------------------------------------------------------------
  const searchTokens = useMemo(() => {
    // 2-character gate safeguard for responsive stability
    const trimmedQuery = debouncedSearchQuery.trim().toLowerCase();
    if (trimmedQuery.length < 2) return [];
    return trimmedQuery.split(/\s+/).filter(Boolean);
  }, [debouncedSearchQuery]);

  const filteredAlumni = useMemo(() => {
    let base = mergedAlumni;
    if (onlyCoffeeChats) {
      base = base.filter(a => getActiveEmail(a) !== null);
    }

    if (searchTokens.length === 0) {
      if (onlyCoffeeChats) {
        return [...base].sort((a, b) => {
          const yearA = a.gradYear === "N/A" ? 0 : parseInt(a.gradYear) || 0;
          const yearB = b.gradYear === "N/A" ? 0 : parseInt(b.gradYear) || 0;
          if (yearB !== yearA) return yearB - yearA;
          return (a.name || "").localeCompare(b.name || "");
        });
      }
      return base;
    }
    
    const scored = base.map((a) => {
      const { name, company, position, city, gradYear } = a.searchIndex;

      let relevanceScore = 0;

      for (const token of searchTokens) {
        if (name.includes(token)) {
          relevanceScore += 10;
          if (name === token) relevanceScore += 5;
        }
        if (company.includes(token)) {
          relevanceScore += 5;
          if (company === token) relevanceScore += 5;
        }
        if (position.includes(token)) {
          relevanceScore += 4;
          if (position === token) relevanceScore += 5;
        }
        if (city.includes(token)) {
          relevanceScore += 3;
          if (city === token) relevanceScore += 5;
        }
        if (gradYear.includes(token)) {
          relevanceScore += 2;
          if (gradYear === token) relevanceScore += 5;
        }
      }

      return { ...a, relevanceScore };
    });

    // Keep only matches with relevanceScore > 0
    const matched = scored.filter(a => a.relevanceScore > 0);

    // Sort by descending score, secondary by descending Graduation Year
    return matched.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      const yearA = a.gradYear === "N/A" ? 0 : parseInt(a.gradYear) || 0;
      const yearB = b.gradYear === "N/A" ? 0 : parseInt(b.gradYear) || 0;
      if (yearB !== yearA) {
        return yearB - yearA;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [mergedAlumni, searchTokens, onlyCoffeeChats]);

  const isSearchActive = searchTokens.length > 0 || onlyCoffeeChats;

  // ---------------------------------------------------------------------------
  // 3. STATISTICAL DERIVATIVES & AGGREGATIONS
  // ---------------------------------------------------------------------------
  const companyCounts = useMemo(() => {
    const map = {};
    for (const a of mergedAlumni) {
      if (!a.company || a.company === "Company Unspecified") continue;
      map[a.company] = (map[a.company] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [mergedAlumni]);

  const uniqueCompaniesCount = companyCounts.length;

  const gradYearData = useMemo(() => {
    const map = {};
    for (const a of mergedAlumni) {
      if (!a.gradYear || a.gradYear === "N/A") continue;
      const label = "'" + String(a.gradYear).slice(2);
      map[label] = (map[label] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, count]) => ({ year, count }));
  }, [mergedAlumni]);

  const topCities = useMemo(() => {
    const map = {};
    for (const a of mergedAlumni) {
      if (!a.city || a.city === "Location Unspecified") continue;
      map[a.city] = (map[a.city] || 0) + 1;
    }
    return Object.entries(map)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [mergedAlumni]);

  const maxCityCount = topCities[0]?.count || 1;

  const visibleCompanies = showAllCompanies ? companyCounts : companyCounts.slice(0, 15);

  const modalAlumni = useMemo(() => {
    if (!selectedCompany) return [];
    return mergedAlumni
      .filter((a) => a.company === selectedCompany)
      .sort((a, b) => {
        if (a.gradYear !== "N/A" && b.gradYear !== "N/A") return b.gradYear - a.gradYear;
        if (a.gradYear !== "N/A") return -1;
        if (b.gradYear !== "N/A") return 1;
        return a.name.localeCompare(b.name);
      });
  }, [selectedCompany, mergedAlumni]);

  // ---------------------------------------------------------------------------
  // 4. BI-DIRECTIONAL OUTREACH MAILTO COMPILER
  // ---------------------------------------------------------------------------
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

  const handleOutreachAction = (trackId) => {
    if (!outreachName.trim()) {
      setOutreachNameError("Please enter your name to customize your email template.");
      return;
    }
    setOutreachNameError("");
    localStorage.setItem("akpsi_user_outreach_name", outreachName.trim());
    setOutreachTrack(trackId);
  };

  const handleCopyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  };

  const handleSendEmail = () => {
    const template = outreachTemplates[outreachTrack];
    const email = getActiveEmail(outreachAlumnus);
    if (template && outreachAlumnus && email) {
      const subject = encodeURIComponent(template.subject());
      const body = encodeURIComponent(template.body(outreachName.trim(), outreachAlumnus));
      const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
      
      setOutreachAlumnus(null);
      setOutreachTrack(null);
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = mailtoUrl;
    }
  };

  // ---------------------------------------------------------------------------
  // 5. UPDATE HUB FORM VALIDATION & PROCESSOR
  // ---------------------------------------------------------------------------
  const handleAlumniFormChange = (field) => (e) => {
    setAlumniForm(prev => ({ ...prev, [field]: e.target.value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: "" }));
  };

  const handleRecruiterFormChange = (field) => (e) => {
    setRecruiterForm(prev => ({ ...prev, [field]: e.target.value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: "" }));
  };

  const submitAlumniUpdate = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!alumniForm.name.trim()) errors.name = "Full name is required.";
    if (!alumniForm.company.trim()) errors.company = "Company is required.";
    if (!alumniForm.position.trim()) errors.position = "Current position is required.";
    if (!alumniForm.linkedin.trim()) errors.linkedin = "LinkedIn URL is required.";
    else if (!/^https?:\/\//i.test(alumniForm.linkedin.trim())) errors.linkedin = "Must start with http:// or https://";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      await submitPendingAlumnus({
        name: alumniForm.name,
        email: "",
        company: alumniForm.company,
        position: alumniForm.position,
        city: "",
        linkedin: alumniForm.linkedin,
        gradYear: null,
        isRecruiter: false
      });
      setFormSubmitted(true);
      setAlumniForm(EMPTY_ALUMNI_FORM);
      setFormErrors({});
    } catch (err) {
      console.error("Form submission error:", err);
    }
  };

  const submitRecruiterUpdate = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!recruiterForm.recruiterName.trim()) errors.recruiterName = "Recruiter name is required.";
    if (!recruiterForm.title.trim()) errors.title = "Recruiter title is required.";
    if (!recruiterForm.company.trim()) errors.company = "Company is required.";
    if (!recruiterForm.linkedin.trim()) errors.linkedin = "LinkedIn URL is required.";
    else if (!/^https?:\/\//i.test(recruiterForm.linkedin.trim())) errors.linkedin = "Must start with http:// or https://";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      await submitPendingAlumnus({
        name: recruiterForm.recruiterName,
        email: recruiterForm.email,
        company: recruiterForm.company,
        position: recruiterForm.title,
        linkedin: recruiterForm.linkedin,
        isRecruiter: true
      });
      setFormSubmitted(true);
      setRecruiterForm(EMPTY_RECRUITER_FORM);
      setFormErrors({});
    } catch (err) {
      console.error("Form submission error:", err);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. PRO DEV CHAIR ADMIN CONTROLLER
  // ---------------------------------------------------------------------------
  const handleAdminLogin = (e) => {
    e.preventDefault();
    const key = import.meta.env.VITE_ADMIN_ACCESS_KEY || "tippie-prodev";
    if (adminKeyInput === key) {
      setIsAdminAuthenticated(true);
      setAdminError("");
    } else {
      setAdminError("Invalid security key. Access denied.");
    }
  };

  const handleApprove = async (id) => {
    try {
      await approvePendingAlumnus(id);
    } catch (err) {
      console.error("Failed to approve submission:", err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deletePendingAlumnus(id);
    } catch (err) {
      console.error("Failed to delete submission:", err);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Google fonts link */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap" rel="stylesheet" />

      {/* ── HEADER BANNER ── */}
      <div className="header-banner">
        <div className="header-inner">
          <div className="badge-row">
            <div className="chapter-logo-badge">ΑΚΨ</div>
            <span className="header-tagline">Career Network</span>
            {isMock && <span className="verified-pill">Local Offline Mode</span>}
          </div>
          <h1 className="header-title">AKPsi Career Network</h1>
          <p className="header-description">
            Standardizing career placement oversight for Alpha Kappa Psi at the Tippie College of Business. Look up members, reach out for referrals, and manage verified recruiter contacts.
          </p>
        </div>
      </div>

      <div className="main-content">
        {/* ── SCORECARDS SECTION ── */}
        <div className="stat-grid">
          <div className="stat-card">
            <div>
              <div className="stat-card-label stat-blue">Alumni Directory</div>
              <div className="stat-card-value">
                <AnimatedNumber target={mergedAlumni.length} />
              </div>
              <div className="stat-card-sublabel">Iowa graduates tracked</div>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-card-label stat-indigo">Placements</div>
              <div className="stat-card-value">
                <AnimatedNumber target={uniqueCompaniesCount} />
              </div>
              <div className="stat-card-sublabel">Individual companies</div>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <div className="stat-card-label stat-emerald">Recruiter Core</div>
              <div className="stat-card-value">
                <AnimatedNumber target={mergedRecruiters.length} />
              </div>
              <div className="stat-card-sublabel">Verified relationships</div>
            </div>
          </div>
        </div>

        {/* ── SEARCH INDEXING BAR ── */}
        <div className="search-controls-container">
          <div className="search-controls-wrapper">
            <div className="search-input-wrapper">
              <svg className="search-icon-svg" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search by name, company, role, city, or grad year..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search-btn" onClick={() => setSearchQuery("")}>×</button>
              )}
            </div>

            {/* Coffee Chat Pill Button Toggle */}
            <button 
              type="button"
              className={`coffee-toggle-btn ${onlyCoffeeChats ? 'active' : ''}`}
              onClick={() => setOnlyCoffeeChats(!onlyCoffeeChats)}
            >
              <span className="coffee-icon">☕</span>
              <span className="coffee-label">Open to Coffee Chats</span>
            </button>
          </div>
        </div>

        {/* ── GLOBAL SEARCH MODE DIRECTORY ── */}
        {isSearchActive ? (
          <div className="ui-card">
            <div className="section-title-wrap">
              <div>
                <h2 className="section-title">Search Results</h2>
                <p className="section-subtitle">Displaying {filteredAlumni.length} matching profiles based on your filters</p>
              </div>
              <button className="btn btn-secondary" onClick={() => { setSearchQuery(""); setOnlyCoffeeChats(false); }}>Clear Filters</button>
            </div>
            
            {filteredAlumni.length === 0 ? (
              <div className="text-center-padded">
                <div className="no-matches-icon">🔍</div>
                <h3 className="no-matches-title">No matches found</h3>
                <p className="no-matches-desc">Try adjusting your spelling or searching by city/grad year.</p>
              </div>
            ) : (
              <div className="alumni-grid">
                {filteredAlumni.map((a) => {
                  const companyClass = getCompanyClass(a.company);
                  return (
                    <div key={a.id} className="alumni-card">
                      <div>
                        <div className="alumni-card-header">
                          <div>
                            <h3 className="alumni-card-name">{a.name}</h3>
                            <div className="alumni-card-role">{a.position}</div>
                          </div>
                          <span className={`alumni-card-badge ${companyClass}`}>
                            {a.company}
                          </span>
                        </div>
                        <div className="alumni-card-details">
                          <div className="alumni-card-detail-item">
                            <span>📍</span> {a.city}
                          </div>
                          <div className="alumni-card-detail-item">
                            <span>🎓</span> Class of {a.gradYear}
                          </div>
                        </div>
                      </div>
                      <div className="alumni-card-actions">
                        {getActiveEmail(a) ? (
                          <>
                            <button className="btn btn-primary btn-flex-1" onClick={() => { setOutreachAlumnus(a); setOutreachTrack(null); }}>
                              Reach Out ✉️
                            </button>
                            {a.linkedin && (
                              <a href={a.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-modal-linkedin" title="View LinkedIn Profile">
                                <span className="btn-linkedin-icon">in</span>
                              </a>
                            )}
                          </>
                        ) : (
                          a.linkedin ? (
                            <a href={a.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-linkedin btn-flex-1">
                              <span className="btn-linkedin-icon linkedin-bg-transparent font-14">in</span>
                              View LinkedIn Profile
                            </a>
                          ) : (
                            <button className="btn btn-secondary btn-flex-1" disabled>
                              No Contact Provided
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* ── STANDARD DEFAULT VIEW ── */
          <>
            {/* GRADUATION YEAR HISTORICAL ANALYTICS */}
            {/* On Mobile viewports, this drawer is wrapped inside a collapsible accordion */}
            <div className="analytics-drawer">
              <div className="analytics-drawer-header" onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}>
                <div className="analytics-drawer-title">
                  <span>📊</span> Alumni Placement Timeline History
                </div>
                <div className={`analytics-drawer-arrow ${isAnalyticsOpen ? 'open' : ''}`}>▼</div>
              </div>
              <div className={`analytics-drawer-content ${isAnalyticsOpen ? 'open' : 'closed'}`}>
                <div className="margin-bottom-16">
                  <h3 className="analytics-sub-title">Placements by Graduation Year</h3>
                  <p className="analytics-sub-desc">Visualizing graduation densities over a 17-year operational index at Tippie</p>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={gradYearData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#8895a7" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#8895a7" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => [`${value} alumni`, "Placements"]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {gradYearData.map((entry, i) => (
                        <Cell key={i} fill={entry.count > 20 ? "#1d4ed8" : entry.count > 12 ? "#3b82f6" : "#93c5fd"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* TWO COLUMNS SUMMARY LAYOUT */}
            <div className="content-columns">
              {/* Primary: Company Index */}
              <div className="col-primary">
                <div className="ui-card">
                  <div className="section-title-wrap">
                    <div>
                      <h2 className="section-title">Where AKPsi Works</h2>
                      <p className="section-subtitle">Click any company to list alumni placements</p>
                    </div>
                  </div>
                  <div className="pills-container">
                    {visibleCompanies.map((c, i) => {
                      const companyClass = getCompanyClass(c.name);
                      return (
                        <div
                          key={i}
                          role="button"
                          tabIndex={0}
                          className={`company-pill ${companyClass}`}
                          onClick={() => setSelectedCompany(c.name)}
                          onKeyDown={(e) => e.key === "Enter" && setSelectedCompany(c.name)}
                        >
                          <span>{c.name}</span>
                          <span className="company-pill-count">
                            {c.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {companyCounts.length > 15 && (
                    <button
                      className="btn-toggle-companies"
                      onClick={() => setShowAllCompanies(!showAllCompanies)}
                    >
                      {showAllCompanies ? "Show fewer companies" : `Show all ${companyCounts.length} companies`}
                    </button>
                  )}
                </div>
              </div>

              {/* Secondary: Top Cities */}
              <div className="col-secondary">
                <div className="ui-card height-100">
                  <div>
                    <h2 className="section-title">Top Metro Placements</h2>
                    <p className="section-subtitle">Top operational hubs for Iowa alumni</p>
                  </div>
                  <div className="cities-list margin-top-18">
                    {topCities.map((c, i) => (
                      <div key={i} className="city-row">
                        <div className="city-info">
                          <span className="city-rank">{i + 1}</span>
                          <span className="city-name">{c.city}</span>
                        </div>
                        <div className="city-bar-wrapper">
                          <div 
                            className="city-progress-bar"
                            style={{
                              "--city-width": `${Math.max(20, (c.count / maxCityCount) * 80)}px`,
                              "--city-opacity": 0.6 + (c.count / maxCityCount) * 0.4
                            }}
                          />
                          <span className="city-count">{c.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* VERIFIED RECRUITERS LAYOUT */}
            <div className="recruiters-wrapper">
              <div className="flex-center-gap-10">
                <span className="pulse-emerald" />
                <h2 className="section-title recruiter-dir-title">Verified Recruiter Directory</h2>
              </div>
              <p className="section-subtitle recruiter-dir-desc">
                Direct human resources access channels with confirmed Iowa AKPsi corporate relations.
              </p>
              <div className="recruiter-grid">
                {mergedRecruiters.map((r) => (
                  <div key={r.id} className="recruiter-card">
                    <div className="recruiter-meta">
                      <div className="recruiter-avatar">
                        {r.name.split(" ").map((n) => n[0]).join("")}
                      </div>
                      <div>
                        <div className="recruiter-name">{r.name}</div>
                        <div className="recruiter-title">{r.title}</div>
                      </div>
                    </div>
                    <div className="recruiter-company">{r.company}</div>
                    <div className="recruiter-badge-row">
                      <span className="verified-pill">● VERIFIED</span>
                      {r.email && (
                        <a href={`mailto:${r.email}?subject=Iowa%20AKPsi%20Recruiting%20Inquiry`} className="btn btn-secondary padding-email-recruiter">
                          Email Recruiter
                        </a>
                      )}
                      {r.linkedin && (
                        <a href={r.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-secondary padding-linkedin-recruiter">
                          <span className="btn-linkedin-icon icon-linkedin-recruiter">in</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── ALUMNI & RECRUITER UPDATE HUB ── */}
        <div className="update-hub-container">
          <div className="form-wrapper">
            <h2 className="update-hub-title">Update Hub</h2>
            <p className="update-hub-desc">
              Maintain historical accuracy! Update your employment footprint, add new recruiter connections, or toggle referral access.
            </p>

            {/* Toggle form inputs */}
            <div className="flex-gap-10-margin-bottom-24">
              <button 
                className={`btn ${formType === "alumni" ? "btn-primary" : "btn-secondary"} padding-hub-toggle-btn`}
                onClick={() => { setFormType("alumni"); setFormSubmitted(false); }}
              >
                Alumni Footprint Update
              </button>
              <button 
                className={`btn ${formType === "recruiter" ? "btn-primary" : "btn-secondary"} padding-hub-toggle-btn`}
                onClick={() => { setFormType("recruiter"); setFormSubmitted(false); }}
              >
                New Recruiter Contact
              </button>
            </div>

            {formSubmitted ? (
              <div className="success-banner-container">
                <div className="success-banner-check">✓</div>
                <div className="success-banner-title">Pending Submission Filed!</div>
                <div className="success-banner-desc">
                  Thank you! Your information has been securely pushed to the pending review queue. A Professional Development Chair will audit your credentials and merge it live shortly.
                </div>
                <button className="btn btn-secondary success-banner-btn" onClick={() => setFormSubmitted(false)}>
                  Add Another Update
                </button>
              </div>
            ) : (
              formType === "alumni" ? (
                /* Alumni Form */
                <form onSubmit={submitAlumniUpdate} noValidate className="form-grid form-grid-full-width">
                  <div className="form-group">
                    <label className="form-label">Full Name <span className="color-red">*</span></label>
                    <input type="text" className="form-input" placeholder="Stephanie Coupland" value={alumniForm.name} onChange={handleAlumniFormChange("name")} />
                    {formErrors.name && <span className="form-error-msg">{formErrors.name}</span>}
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Company <span className="color-red">*</span></label>
                      <input type="text" className="form-input" placeholder="e.g. Deloitte" value={alumniForm.company} onChange={handleAlumniFormChange("company")} />
                      {formErrors.company && <span className="form-error-msg">{formErrors.company}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Current Role / Position <span className="color-red">*</span></label>
                      <input type="text" className="form-input" placeholder="e.g. Consultant" value={alumniForm.position} onChange={handleAlumniFormChange("position")} />
                      {formErrors.position && <span className="form-error-msg">{formErrors.position}</span>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">LinkedIn Profile URL <span className="color-red">*</span></label>
                    <input type="url" className="form-input" placeholder="https://www.linkedin.com/in/username" value={alumniForm.linkedin} onChange={handleAlumniFormChange("linkedin")} />
                    {formErrors.linkedin && <span className="form-error-msg">{formErrors.linkedin}</span>}
                  </div>

                  <button type="submit" className="btn btn-primary align-self-start-margin-top-12">
                    Submit Alumnus Footprint →
                  </button>
                </form>
              ) : (
                /* Recruiter Form */
                <form onSubmit={submitRecruiterUpdate} noValidate className="form-grid form-grid-full-width">
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Recruiter Full Name <span className="color-red">*</span></label>
                      <input type="text" className="form-input" placeholder="Jane Smith" value={recruiterForm.recruiterName} onChange={handleRecruiterFormChange("recruiterName")} />
                      {formErrors.recruiterName && <span className="form-error-msg">{formErrors.recruiterName}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Title / Role <span className="color-red">*</span></label>
                      <input type="text" className="form-input" placeholder="e.g. Campus Recruiter" value={recruiterForm.title} onChange={handleRecruiterFormChange("title")} />
                      {formErrors.title && <span className="form-error-msg">{formErrors.title}</span>}
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Target Corporation <span className="color-red">*</span></label>
                      <input type="text" className="form-input" placeholder="e.g. RSM US LLP" value={recruiterForm.company} onChange={handleRecruiterFormChange("company")} />
                      {formErrors.company && <span className="form-error-msg">{formErrors.company}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Recruiter Contact Email</label>
                      <input type="email" className="form-input" placeholder="recruiter@corporation.com" value={recruiterForm.email} onChange={handleRecruiterFormChange("email")} />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Recruiter LinkedIn URL <span className="color-red">*</span></label>
                    <input type="url" className="form-input" placeholder="https://www.linkedin.com/in/recruiter" value={recruiterForm.linkedin} onChange={handleRecruiterFormChange("linkedin")} />
                    {formErrors.linkedin && <span className="form-error-msg">{formErrors.linkedin}</span>}
                  </div>

                  <button type="submit" className="btn btn-primary align-self-start-margin-top-12">
                    Submit Recruiter Contact →
                  </button>
                </form>
              )
            )}
          </div>
        </div>

        {/* ── FOOTER & ADMIN LOGIN SEED ── */}
        <div className="footer-border-padding">
          <div className="footer-copyright">
            © Alpha Kappa Psi | University of Iowa | Tippie College of Business
          </div>
          <button className="btn btn-secondary footer-admin-btn" onClick={() => setIsAdminMode(!isAdminMode)}>
            {isAdminMode ? "Exit Administrative Panel" : "Pro Dev Chair Portal"}
          </button>
        </div>

        {/* ADMIN DASHBOARD INLINE ROUTE */}
        {isAdminMode && (
          <div className="ui-card admin-panel-card">
            <div className="admin-panel-header">
              <div className="admin-badge">🔒 Professional Development Chair Mode</div>
              {isAdminAuthenticated && (
                <button className="btn btn-secondary admin-logout-btn" onClick={() => setIsAdminAuthenticated(false)}>Logout</button>
              )}
            </div>

            {!isAdminAuthenticated ? (
              <div className="admin-login-card">
                <h3 className="admin-login-inner-title">Chair Authorization Required</h3>
                <p className="admin-login-inner-desc">Enter the chapter environment access key to audit pending recruiter and alumni records.</p>
                <form onSubmit={handleAdminLogin} className="flex-col-gap-12">
                  <input 
                    type="password" 
                    className="form-input admin-password-input" 
                    placeholder="Enter VITE_ADMIN_ACCESS_KEY..." 
                    value={adminKeyInput}
                    onChange={(e) => setAdminKeyInput(e.target.value)}
                  />
                  {adminError && <div className="admin-error-text">{adminError}</div>}
                  <button type="submit" className="btn btn-primary width-100-percent">Verify and Access Portal</button>
                </form>
              </div>
            ) : (
              <div>
                <div className="admin-moderation-title-area">
                  <h3 className="admin-moderation-title">Pending Moderation Queue</h3>
                  <p className="admin-moderation-desc">Verify new submissions before they are merged into the public Tippie directory</p>
                </div>

                {pendingSubmissions.length === 0 ? (
                  <div className="admin-empty-state">
                    <div className="admin-empty-state-icon">🎉</div>
                    <h4 className="admin-empty-state-title">No pending tasks</h4>
                    <p className="admin-empty-state-desc">The database queue is fully processed and clean!</p>
                  </div>
                ) : (
                  <div className="admin-submissions-grid">
                    {pendingSubmissions.map((s) => (
                      <div key={s.id} className="alumni-card admin-pending-card">
                        <div>
                          <div className="admin-pending-card-header">
                            <h4 className="admin-pending-card-title">{s.name}</h4>
                            <span className={`verified-pill ${s.isRecruiter ? 'verified-pill-recruiter' : 'verified-pill-alumni'}`}>
                              {s.isRecruiter ? "RECRUITER" : "ALUMNUS"}
                            </span>
                          </div>
                          <div className="admin-pending-card-subtitle">{s.position} — {s.company}</div>
                          
                          <div className="admin-pending-card-details">
                            {s.city && <div>📍 Location: {s.city}</div>}
                            {s.gradYear && <div>🎓 Class of {s.gradYear}</div>}
                            {s.email && <div>✉️ Email: {s.email}</div>}
                            {s.linkedin && (
                              <div className="admin-pending-card-link-wrapper">
                                🔗 LinkedIn: <a href={s.linkedin} target="_blank" rel="noopener noreferrer">{s.linkedin}</a>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="admin-card-actions">
                          <button className="btn btn-admin-success admin-action-btn" onClick={() => handleApprove(s.id)}>
                            ✓ Approve
                          </button>
                          <button className="btn btn-admin-danger admin-action-btn" onClick={() => handleDelete(s.id)}>
                            ✗ Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── COMPANY ALUMNI MODAL (Where AKPsi Works) ── */}
      {selectedCompany && (
        <div className="modal-overlay" onClick={() => setSelectedCompany(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{selectedCompany}</h2>
                <div className="modal-pill-stats-container">
                  <span className="modal-pill-stats-dot" />
                  <span className="modal-pill-stats-text">
                    {modalAlumni.length} AKPsi {modalAlumni.length === 1 ? "alumnus" : "alumni"}
                  </span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedCompany(null)}>×</button>
            </div>
            
            <div className="modal-body modal-body-padded-bottom">
              {modalAlumni.map((a) => (
                <div key={a.id} className="modal-row-item">
                  <div className="modal-row-info">
                    <div className="modal-row-name">{a.name}</div>
                    <div className="modal-row-role">{a.position}</div>
                    <div className="modal-row-metadata">
                      <span>{a.city}</span>
                      <span>·</span>
                      <span>Class of {a.gradYear}</span>
                    </div>
                  </div>
                  <div className="recruiter-badge-row">
                    {getActiveEmail(a) ? (
                      <button className="btn btn-primary btn-modal-outreach" onClick={() => { setSelectedCompany(null); setOutreachAlumnus(a); setOutreachTrack(null); }}>
                        Reach Out ✉️
                      </button>
                    ) : (
                      a.linkedin && (
                        <a href={a.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-linkedin btn-modal-outreach">
                          View LinkedIn Profile
                        </a>
                      )
                    )}
                    {getActiveEmail(a) && a.linkedin && (
                      <a href={a.linkedin} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-modal-linkedin">
                        <span className="btn-linkedin-icon">in</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── OUTREACH SELECTOR MODAL (Reach Out Flow) ── */}
      {outreachAlumnus && (
        <div className="modal-overlay" onClick={() => setOutreachAlumnus(null)}>
          <div className="modal-card modal-card-max-width-500" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Outreach Compiler</h2>
                <div className="modal-outreach-subtitle">
                  Connect with {outreachAlumnus.name} at {outreachAlumnus.company}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setOutreachAlumnus(null)}>×</button>
            </div>
            
            <div className="modal-body">
              {outreachTrack ? (
                /* STEP 2: Live Email Outreach Preview */
                <div className="outreach-preview-container">
                  <div className="outreach-preview-header-row">
                    <span className="outreach-preview-header-title">Live Preview</span>
                    <button className="outreach-back-btn" onClick={() => setOutreachTrack(null)}>
                      ← Back to Intents
                    </button>
                  </div>

                  <div className="outreach-preview-card">
                    <div className="outreach-preview-field">
                      <div className="outreach-preview-label">To</div>
                      <div className="outreach-preview-value">{getActiveEmail(outreachAlumnus)}</div>
                    </div>
                    <div className="outreach-preview-field">
                      <div className="outreach-preview-label">Subject</div>
                      <div className="outreach-preview-value">
                        {outreachTemplates[outreachTrack].subject()}
                      </div>
                    </div>
                    <div className="outreach-preview-field">
                      <div className="outreach-preview-label">Body Template</div>
                      <pre className="outreach-preview-body-value">
                        {outreachTemplates[outreachTrack].body(outreachName.trim(), outreachAlumnus)}
                      </pre>
                    </div>
                    <div className="outreach-preview-back-field">
                      <button className="outreach-back-btn" onClick={() => setOutreachTrack(null)}>
                        ← Change Outreach Intent
                      </button>
                    </div>
                  </div>

                  <div className="outreach-preview-actions-row">
                    <button 
                      className="btn btn-primary btn-flex-1" 
                      onClick={handleSendEmail}
                    >
                      Send Email
                    </button>
                    <button 
                      className="btn btn-secondary btn-flex-1" 
                      onClick={() => handleCopyToClipboard(outreachTemplates[outreachTrack].body(outreachName.trim(), outreachAlumnus))}
                    >
                      Copy Email Body
                    </button>
                    {copied && (
                      <span className="outreach-copied-alert">
                        ✓ Copied to Clipboard
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* STEP 1: Intent Selection */
                <>
                  {/* Personalization Inputs */}
                  <div className="form-group modal-outreach-form-group">
                    <label className="form-label modal-outreach-label">
                      Your Full Name <span className="color-red">*</span>
                    </label>
                    <input 
                      type="text" 
                      className="form-input modal-outreach-input" 
                      placeholder="Enter your name to sign the email..."
                      value={outreachName}
                      onChange={(e) => {
                        setOutreachName(e.target.value);
                        setOutreachNameError("");
                      }}
                    />
                    {outreachNameError && <span className="form-error-msg">{outreachNameError}</span>}
                  </div>

                  {/* Outreach Tracks */}
                  <div className="modal-outreach-section-title">
                    SELECT OUTREACH INTENT:
                  </div>
                  
                  <div className="outreach-tracks">
                    <div className="outreach-track-card" onClick={() => handleOutreachAction("chat")}>
                      <div>
                        <div className="outreach-track-title">☕ General Networking / Coffee Chat</div>
                        <div className="outreach-track-desc">Informal 15-minute chat to learn about their path.</div>
                      </div>
                      <span className="outreach-track-arrow">→</span>
                    </div>

                    <div className="outreach-track-card" onClick={() => handleOutreachAction("prep")}>
                      <div>
                        <div className="outreach-track-title">📝 Interview Preparation</div>
                        <div className="outreach-track-desc">Request mock-question advice for company interviews.</div>
                      </div>
                      <span className="outreach-track-arrow">→</span>
                    </div>

                    <div className="outreach-track-card" onClick={() => handleOutreachAction("referral")}>
                      <div>
                        <div className="outreach-track-title">🤝 Internal Corporate Referral Inquiry</div>
                        <div className="outreach-track-desc">Inquire politely on putting forward a strong application.</div>
                      </div>
                      <span className="outreach-track-arrow">→</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
