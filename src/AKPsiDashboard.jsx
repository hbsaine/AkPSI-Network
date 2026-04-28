import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { alumniData } from "./alumni_data.js";

// ---------------------------------------------------------------------------
// Hardcoded data
// ---------------------------------------------------------------------------
const EMPTY_FORM = { recruiterName: "", title: "", company: "", email: "", linkedin: "" };

const RECRUITERS = [
  {
    name: "Mary Clare Toomajian",
    title: "Sr. Campus Recruiter — Consulting",
    company: "RSM US LLP",
    linkedin: "https://www.linkedin.com/in/mary-clare-toomajian",
  },
  {
    name: "Jonalyn Trimboli",
    title: "Campus Recruiter",
    company: "Uline",
    linkedin: "https://www.linkedin.com/in/jonalyn-trimboli",
  },
];

// Company-type tag map for pill colours
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

const TYPE_COLORS = {
  "Big 4": "#1e40af",
  Finance: "#0f766e",
  Accounting: "#4338ca",
  Insurance: "#6d28d9",
  Tech: "#0369a1",
  Retail: "#b45309",
  Operations: "#be185d",
  default: "#475569",
};

function pillColor(companyName) {
  const type = COMPANY_TYPE[companyName] || "default";
  return TYPE_COLORS[type] || TYPE_COLORS.default;
}

// ---------------------------------------------------------------------------
// AnimatedNumber
// ---------------------------------------------------------------------------
function AnimatedNumber({ target, duration = 1500 }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) { setCurrent(target); clearInterval(timer); }
      else setCurrent(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <span>{current.toLocaleString()}</span>;
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------
function StatCard({ label, value, sublabel, accent, delay }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: "28px 24px", borderRadius: 16,
      background: "white", border: `1px solid ${accent}22`,
      boxShadow: `0 4px 24px ${accent}15`,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 48, fontWeight: 800, color: "#0a1628", lineHeight: 1 }}>
        <AnimatedNumber target={value} />
      </div>
      {sublabel && <div style={{ fontSize: 13, color: "#8895a7", marginTop: 8 }}>{sublabel}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompanyPill
// ---------------------------------------------------------------------------
function CompanyPill({ name, count, onClick }) {
  const [hovered, setHovered] = useState(false);
  const bg = pillColor(name);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "8px 16px", borderRadius: 100, margin: "4px 6px",
        background: hovered ? `${bg}18` : `${bg}0d`,
        border: `1px solid ${hovered ? bg + "55" : bg + "25"}`,
        cursor: "pointer", userSelect: "none",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "all 0.15s ease",
        boxShadow: hovered ? `0 4px 12px ${bg}25` : "none",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: bg }}>{name}</span>
      <span style={{
        fontSize: 11, fontWeight: 700, color: "white", background: bg,
        borderRadius: 100, padding: "2px 8px", minWidth: 20, textAlign: "center",
      }}>{count}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlumniModal
// ---------------------------------------------------------------------------
function AlumniModal({ company, alumni, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(10,22,40,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .alumni-row:hover { background: #f8faff; }
        .modal-scroll::-webkit-scrollbar { width: 6px; }
        .modal-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
        .modal-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {/* Card — stop propagation so clicks inside don't close */}
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white", borderRadius: 20, width: "100%", maxWidth: 560,
          maxHeight: "70vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 64px rgba(10,22,40,0.25)",
          animation: "fadeIn 0.2s ease",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "24px 24px 16px", borderBottom: "1px solid #e8ecf2",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0a1628" }}>{company}</h2>
            <div style={{
              marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6,
              background: "#eff6ff", borderRadius: 100, padding: "4px 12px",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1d4ed8" }}>
                {alumni.length} AKPsi {alumni.length === 1 ? "alumnus" : "alumni"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: "50%", border: "1px solid #e2e8f0",
              background: "#f8fafc", cursor: "pointer", fontSize: 16, color: "#64748b",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Alumni list */}
        <div className="modal-scroll" style={{ overflowY: "auto", padding: "8px 0" }}>
          {alumni.map((a, i) => (
            <div
              key={i}
              className="alumni-row"
              style={{
                padding: "14px 24px",
                borderBottom: i < alumni.length - 1 ? "1px solid #f1f5f9" : "none",
                transition: "background 0.1s",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0a1628", marginBottom: 2 }}>{a.name}</div>
                  {a.position && (
                    <div style={{ fontSize: 13, color: "#475569", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.position}</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {a.city && (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{a.city}</span>
                    )}
                    {a.city && a.gradYear && (
                      <span style={{ fontSize: 12, color: "#cbd5e1" }}>·</span>
                    )}
                    {a.gradYear && (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>Class of {a.gradYear}</span>
                    )}
                  </div>
                </div>
                {a.linkedin && (
                  <a
                    href={a.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="LinkedIn"
                    style={{
                      flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                      background: "#0a66c2", display: "flex", alignItems: "center",
                      justifyContent: "center", textDecoration: "none", color: "white",
                      fontSize: 13, fontWeight: 700,
                    }}
                  >in</a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecruiterForm
// ---------------------------------------------------------------------------
const INPUT_STYLE = {
  width: "100%", boxSizing: "border-box",
  padding: "10px 14px", borderRadius: 10,
  border: "1px solid #dde3ed", fontSize: 14, color: "#0a1628",
  background: "white", outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
  fontFamily: "inherit",
};

function FormInput({ label, required, error, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
      </label>
      <input
        {...props}
        onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        style={{
          ...INPUT_STYLE,
          borderColor: error ? "#ef4444" : focused ? "#3b82f6" : "#dde3ed",
          boxShadow: focused ? (error ? "0 0 0 3px rgba(239,68,68,0.12)" : "0 0 0 3px rgba(59,130,246,0.12)") : "none",
        }}
      />
      {error && <span style={{ fontSize: 12, color: "#ef4444" }}>{error}</span>}
    </div>
  );
}

function RecruiterForm() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

  function set(field) {
    return (e) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      if (errors[field]) setErrors((err) => ({ ...err, [field]: "" }));
    };
  }

  function validate() {
    const e = {};
    if (!form.recruiterName.trim()) e.recruiterName = "Recruiter name is required.";
    if (!form.title.trim()) e.title = "Title is required.";
    if (!form.company.trim()) e.company = "Company is required.";
    if (!form.linkedin.trim()) e.linkedin = "LinkedIn URL is required.";
    else if (!/^https?:\/\//i.test(form.linkedin.trim())) e.linkedin = "Must start with https://";
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const e2 = validate();
    if (Object.keys(e2).length) { setErrors(e2); return; }
    setSubmitted(true);
    setForm(EMPTY_FORM);
    setErrors({});
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #0a1628, #1e3a5f)",
      borderRadius: 16, padding: "40px 32px", marginTop: 24, marginBottom: 48,
      position: "relative", overflow: "hidden",
    }}>
      {/* decorative blobs */}
      <div style={{ position: "absolute", top: -40, right: -20, width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -60, left: -30, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: "0 0 6px 0" }}>Add Your Recruiter</h2>
        <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 28, lineHeight: 1.6 }}>
          Got an internship or job offer? Add your recruiter so future AKPsi members can connect with them.
        </p>

        {submitted ? (
          <div style={{
            background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)",
            borderRadius: 12, padding: "24px", textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#6ee7b7", marginBottom: 8 }}>Recruiter Submitted!</div>
            <div style={{ fontSize: 14, color: "#a7f3d0", lineHeight: 1.6 }}>
              Thanks! Your recruiter has been added to the AKPsi Career Network. Pro Dev will verify this contact within 48 hours.
            </div>
            <button
              onClick={() => setSubmitted(false)}
              style={{
                marginTop: 18, padding: "8px 20px", borderRadius: 100,
                border: "1px solid rgba(16,185,129,0.4)", background: "transparent",
                color: "#6ee7b7", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >Add another</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="form-grid">
              <FormInput
                label="Recruiter Name" required
                type="text" placeholder="Jane Smith"
                value={form.recruiterName} onChange={set("recruiterName")}
                error={errors.recruiterName}
              />
              <FormInput
                label="Title" required
                type="text" placeholder="e.g. Campus Recruiter"
                value={form.title} onChange={set("title")}
                error={errors.title}
              />
            </div>
            <FormInput
              label="Company" required
              type="text" placeholder="Deloitte, Goldman Sachs, ..."
              value={form.company} onChange={set("company")}
              error={errors.company}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="form-grid">
              <FormInput
                label="Email" required={false}
                type="email" placeholder="recruiter@company.com"
                value={form.email} onChange={set("email")}
                error={errors.email}
              />
              <FormInput
                label="LinkedIn URL" required
                type="url" placeholder="https://linkedin.com/in/..."
                value={form.linkedin} onChange={set("linkedin")}
                error={errors.linkedin}
              />
            </div>
            <button
              type="submit"
              onMouseEnter={() => setBtnHovered(true)}
              onMouseLeave={() => setBtnHovered(false)}
              style={{
                marginTop: 4, padding: "14px 36px", borderRadius: 100, border: "none",
                background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer",
                boxShadow: btnHovered ? "0 6px 24px rgba(37,99,235,0.55)" : "0 4px 16px rgba(37,99,235,0.4)",
                transform: btnHovered ? "scale(1.02)" : "scale(1)",
                transition: "all 0.15s ease",
                alignSelf: "flex-start",
                letterSpacing: 0.3,
              }}
            >
              Submit Recruiter →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function AKPsiDashboard() {
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);

  // ── Derived data ──────────────────────────────────────────────────────────
  const companyCounts = useMemo(() => {
    const map = {};
    for (const a of alumniData) {
      if (!a.company) continue;
      map[a.company] = (map[a.company] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, []);

  const uniqueCompaniesCount = companyCounts.length;

  const gradYearData = useMemo(() => {
    const map = {};
    for (const a of alumniData) {
      if (!a.gradYear) continue;
      const label = "'" + String(a.gradYear).slice(2);
      map[label] = (map[label] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, count]) => ({ year, count }));
  }, []);

  const topCities = useMemo(() => {
    const map = {};
    for (const a of alumniData) {
      if (!a.city) continue;
      // Normalise slight variations
      const city = a.city.trim();
      map[city] = (map[city] || 0) + 1;
    }
    return Object.entries(map)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, []);

  const maxCityCount = topCities[0]?.count || 1;

  const visibleCompanies = showAllCompanies ? companyCounts : companyCounts.slice(0, 15);

  const modalAlumni = useMemo(() => {
    if (!selectedCompany) return [];
    return alumniData
      .filter((a) => a.company === selectedCompany)
      .sort((a, b) => {
        if (a.gradYear && b.gradYear) return b.gradYear - a.gradYear;
        if (a.gradYear) return -1;
        if (b.gradYear) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [selectedCompany]);

  // ── Styles helpers ────────────────────────────────────────────────────────
  const cardStyle = {
    background: "white", borderRadius: 16, padding: "28px 24px",
    border: "1px solid #e8ecf2", boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f0f4ff 0%, #fafbff 50%, #f5f7ff 100%)",
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&display=swap" rel="stylesheet" />

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { overflow-x: hidden; margin: 0; }
        @media (max-width: 768px) {
          .stat-row { flex-direction: column !important; }
          .two-col { flex-direction: column !important; }
          .recruiter-row { flex-direction: column !important; }
          .form-grid { grid-template-columns: 1fr !important; }
          .modal-card { margin: 8px !important; max-height: calc(100vh - 16px) !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0a1628 0%, #1a2744 60%, #1e3a5f 100%)",
        padding: "48px 24px 56px", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -80, right: -40, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -60, left: "30%", width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 800, color: "white",
            }}>ΑΚΨ</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#60a5fa", letterSpacing: 2, textTransform: "uppercase" }}>Career Network</span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: "white", margin: 0, lineHeight: 1.2, letterSpacing: -0.5 }}>
            AKPsi Career Network
          </h1>
          <p style={{ fontSize: 17, color: "#94a3b8", marginTop: 12, lineHeight: 1.6, maxWidth: 520, marginBottom: 0 }}>
            Tracking 17 years of AKPsi placement history — alumni, corporate partners, and verified recruiter relationships across the Tippie College of Business.
          </p>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px" }}>

        {/* Stat Cards */}
        <div className="stat-row" style={{ display: "flex", gap: 16, marginTop: -32, position: "relative", zIndex: 2 }}>
          <StatCard label="Alumni" value={alumniData.length} sublabel={`Across ${uniqueCompaniesCount} companies`} accent="#3b82f6" delay={200} />
          <StatCard label="Companies" value={uniqueCompaniesCount} sublabel="From Big 4 to startups" accent="#6366f1" delay={400} />
          <StatCard label="Verified Recruiters" value={2} sublabel="And growing every placement" accent="#10b981" delay={600} />
        </div>

        {/* Grad Year Chart */}
        <div style={{ ...cardStyle, marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0a1628", margin: 0 }}>Alumni by Graduation Year</h2>
              <p style={{ fontSize: 13, color: "#8895a7", marginTop: 4, marginBottom: 0 }}>17 years of AKPsi career history at Tippie</p>
            </div>
            <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>2009 — 2025</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gradYearData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 12, fill: "#8895a7" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#8895a7" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e8ecf2", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 13 }}
                formatter={(value) => [`${value} alumni`, "Count"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {gradYearData.map((entry, i) => (
                  <Cell key={i} fill={entry.count > 20 ? "#1d4ed8" : entry.count > 12 ? "#3b82f6" : "#93c5fd"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Companies + Cities */}
        <div className="two-col" style={{ display: "flex", gap: 16, marginTop: 24 }}>

          {/* Where AKPsi Works */}
          <div style={{ ...cardStyle, flex: "1.2 1 0", minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0a1628", margin: "0 0 4px 0" }}>Where AKPsi Works</h2>
            <p style={{ fontSize: 13, color: "#8895a7", marginBottom: 16 }}>
              Click any company to see the alumni there
            </p>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {visibleCompanies.map((c, i) => (
                <CompanyPill
                  key={i}
                  name={c.name}
                  count={c.count}
                  onClick={() => setSelectedCompany(c.name)}
                />
              ))}
            </div>
            {companyCounts.length > 15 && (
              <button
                onClick={() => setShowAllCompanies((v) => !v)}
                style={{
                  marginTop: 14, padding: "8px 18px", borderRadius: 100,
                  border: "1px solid #e2e8f0", background: showAllCompanies ? "#f1f5f9" : "white",
                  fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {showAllCompanies
                  ? "Show fewer companies"
                  : `Show all ${companyCounts.length} companies`}
              </button>
            )}
          </div>

          {/* Top Cities */}
          <div style={{ ...cardStyle, flex: "0.8 1 0", minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0a1628", margin: "0 0 4px 0" }}>Top Cities</h2>
            <p style={{ fontSize: 13, color: "#8895a7", marginBottom: 16 }}>Where our alumni land</p>
            {topCities.map((c, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: i < topCities.length - 1 ? "1px solid #f3f4f6" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", width: 18 }}>{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>{c.city}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: Math.max(24, (c.count / maxCityCount) * 100),
                    height: 6, borderRadius: 3,
                    background: "linear-gradient(90deg, #3b82f6, #6366f1)",
                    opacity: 0.6 + (c.count / maxCityCount) * 0.4,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#475569", minWidth: 28, textAlign: "right" }}>{c.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Verified Recruiters */}
        <div style={{
          background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)",
          borderRadius: 16, padding: "28px 24px", marginTop: 24,
          border: "1px solid #bbf7d0",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,0.5)" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#064e3b", margin: 0 }}>Verified Recruiter Contacts</h2>
          </div>
          <p style={{ fontSize: 13, color: "#6b7f72", marginBottom: 20 }}>
            Recruiters with confirmed AKPsi relationships — verified through internships and case competitions
          </p>
          <div className="recruiter-row" style={{ display: "flex", gap: 12 }}>
            {RECRUITERS.map((r, i) => (
              <div key={i} style={{
                flex: 1, background: "white", borderRadius: 12, padding: "20px",
                border: "1px solid #d1fae5", boxShadow: "0 2px 8px rgba(16,185,129,0.08)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0,
                  }}>
                    {r.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0a1628" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7f72" }}>{r.title}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>{r.company}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 10px", borderRadius: 100,
                    background: "#10b98118", fontSize: 11, fontWeight: 700, color: "#059669", letterSpacing: 0.5,
                  }}>● VERIFIED</div>
                  {r.linkedin && (
                    <a href={r.linkedin} target="_blank" rel="noopener noreferrer" style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 12, color: "#0a66c2", fontWeight: 600, textDecoration: "none",
                    }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 4, background: "#0a66c2",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        color: "white", fontSize: 10, fontWeight: 700,
                      }}>in</span>
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <RecruiterForm />
      </div>

      {/* Modal */}
      {selectedCompany && (
        <AlumniModal
          company={selectedCompany}
          alumni={modalAlumni}
          onClose={() => setSelectedCompany(null)}
        />
      )}
    </div>
  );
}
