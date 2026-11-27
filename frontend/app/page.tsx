"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ClipboardCheck,
  Droplets,
  GitBranch,
  HeartPulse,
  Layers3,
  Menu,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import type { PublicAnalyticsPreview } from "@/lib/analytics";

const publicTooltip = {
  background: "#111e2e",
  border: "1px solid #34445a",
  borderRadius: 9,
  color: "#e6edf7",
  fontSize: 10,
};

const features = [
  {
    icon: Activity,
    title: "PredictAI",
    description: "Compare observed demand with a transparent moving-average baseline to make emerging supply pressure easier to review.",
    label: "BASELINE FORECASTING",
  },
  {
    icon: GitBranch,
    title: "NetworkLink",
    description: "Surface potential facility-to-facility transfers while keeping recommendation and approval in qualified human hands.",
    label: "HUMAN-REVIEWED",
  },
  {
    icon: Layers3,
    title: "Inventory intelligence",
    description: "See released, reserved, expired and quarantined units separately so operational stock is not overstated.",
    label: "UNIT-LEVEL VISIBILITY",
  },
  {
    icon: ShieldCheck,
    title: "Cold-chain monitoring",
    description: "Record temperature excursions, flag affected units and keep them out of eligible stock pending review.",
    label: "SAFETY-FIRST WORKFLOW",
  },
];

const workflow = [
  ["01", "Connect the picture", "Bring facility inventory and historical demand into one operational view."],
  ["02", "Review the signal", "Compare current eligible stock with transparent, synthetic demand baselines."],
  ["03", "Coordinate a response", "Review a suggested movement and verify details with qualified staff."],
  ["04", "Record the outcome", "Keep approvals, transfer status and cold-chain exceptions visible."],
];

export default function HomePage() {
  const [preview, setPreview] = useState<PublicAnalyticsPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api<PublicAnalyticsPreview>("/api/analytics/preview")
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch((reason: unknown) => {
        if (active) setPreviewError(reason instanceof Error ? reason.message : "Demo analytics are temporarily unavailable.");
      });
    return () => { active = false; };
  }, []);

  const summary = preview?.summary;
  const stats = [
    { value: summary?.facility_count, label: "Simulated facilities", suffix: "" },
    { value: summary?.eligible_units, label: "Eligible unit records", suffix: "" },
    { value: summary?.forecast_history_days, label: "Days of sample history", suffix: "d" },
    { value: summary?.active_transfer_recommendations, label: "Active recommendations", suffix: "" },
  ];

  return (
    <main className="marketing-site">
      <header className="site-nav">
        <Link aria-label="BloodFlow AI homepage" className="site-brand" href="/">
          <span className="brand-mark"><Droplets size={18} /></span>
          <span>BloodFlow <b>AI</b></span>
        </Link>
        <nav aria-label="Public navigation" className={`site-links${mobileMenuOpen ? " site-links-open" : ""}`} id="public-navigation">
          <a className="active" href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a>
          <a href="#platform" onClick={() => setMobileMenuOpen(false)}>Platform</a>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</a>
          <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
        </nav>
        <div className="site-nav-actions">
          <Link className="site-login" href="/login">Log in</Link>
          <Link className="site-get-started" href="/login">Get started <ArrowUpRight size={15} /></Link>
        </div>
        <button
          aria-controls="public-navigation"
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="site-nav-mobile-toggle"
          onClick={() => setMobileMenuOpen((open) => !open)}
          type="button"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      <section className="hero-section" id="home">
        <div className="hero-copy">
          <div className="hero-overline"><span /> PREDICTIVE SUPPLY INTELLIGENCE · SIMULATED DEMO</div>
          <h1>Predict blood shortages <span>before they happen.</span></h1>
          <p>BloodFlow AI brings inventory visibility, demand signals and human-reviewed coordination together to help teams plan for a more reliable blood supply.</p>
          <div className="hero-actions">
            <Link className="hero-primary" href="/dashboard">Explore platform <ArrowRight size={16} /></Link>
            <a className="hero-secondary" href="#how-it-works"><span><ArrowDown size={14} /></span> See how it works</a>
          </div>
          <div className="hero-trust"><ShieldCheck size={15} /><span>Decision support for qualified teams. Never an automatic clinical or transfusion decision.</span></div>
        </div>

        <div aria-label="Simulated network analytics preview" className="hero-preview" id="platform">
          <div className="preview-glow" />
          <div className="preview-window">
            <div className="preview-top">
              <div><span className="preview-app-mark"><Droplets size={13} /></span><b>Network overview</b></div>
              <span className="preview-simulated"><i /> SIMULATED DATA</span>
            </div>
            <div className="preview-window-title">Supply, in clearer view<span>Past 14 days · synthetic history</span></div>
            <div className="preview-metrics">
              <div><span>Eligible units</span><strong>{summary ? summary.eligible_units.toLocaleString() : "—"}</strong><small>Across accessible facilities</small></div>
              <div><span>Near expiry</span><strong>{summary ? summary.near_expiry_units.toLocaleString() : "—"}</strong><small>Eligible · next 7 days</small></div>
            </div>
            <div className="preview-chart-title"><span>Observed network demand</span><span>Units / day</span></div>
            <div className="preview-chart">
              {preview?.demand_series.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={preview.demand_series} margin={{ top: 8, right: 4, left: -26, bottom: 0 }}>
                    <defs><linearGradient id="landingDemand" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ef6672" stopOpacity={0.3} /><stop offset="100%" stopColor="#ef6672" stopOpacity={0.01} /></linearGradient></defs>
                    <CartesianGrid stroke="#243449" strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#788ba3", fontSize: 8 }} tickLine={false} axisLine={false} minTickGap={30} />
                    <YAxis tick={{ fill: "#788ba3", fontSize: 8 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={publicTooltip} labelFormatter={(value) => `Date: ${value}`} formatter={(value: number) => [value, "Observed demand"]} />
                    <Area dataKey="actual_demand" type="monotone" stroke="#ef6672" strokeWidth={2} fill="url(#landingDemand)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="preview-chart-empty">{previewError || "Loading API-backed demo analytics..."}</div>
              )}
            </div>
            <div className="preview-chart-foot"><span><i /> Observed demand</span><span>Source: simulated API records</span></div>
            <div className="preview-facility-row">
              <div className="preview-map-dots"><i /><i /><i /></div>
              <span>{summary ? `${summary.facility_count} simulated facilities reporting` : "Loading network summary"}</span>
              <ArrowUpRight size={14} />
            </div>
          </div>
          <div className="preview-float-chip"><span><HeartPulse size={15} /></span><div><b>Human-led decisions</b><small>Review every recommendation</small></div><ShieldCheck size={15} /></div>
        </div>
      </section>

      <section aria-label="Simulated network statistics" className="stats-strip">
        <div className="stats-strip-caption"><span className="live-dot" /> DEMO NETWORK SNAPSHOT <small>Figures loaded from the API · synthetic records</small></div>
        <div className="stats-list">
          {stats.map((stat) => (
            <div className="stat-item" key={stat.label}>
              <strong className={preview ? "stat-loaded" : ""}>{stat.value === undefined ? "—" : `${stat.value.toLocaleString()}${stat.suffix}`}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="marketing-section features-section" id="features">
        <div className="section-intro">
          <span className="section-kicker">ONE CONNECTED WORKFLOW</span>
          <h2>Make every supply signal easier to act on.</h2>
          <p>Purpose-built tools bring together the operational picture without replacing professional judgement.</p>
        </div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, description, label }, index) => (
            <article className="feature-card" key={title}>
              <div className={`feature-icon feature-icon-${index}`}><Icon size={20} strokeWidth={1.8} /></div>
              <span className="feature-label">{label}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <Link href={index === 0 ? "/forecasts" : index === 1 ? "/transfers" : index === 2 ? "/inventory" : "/cold-chain"}>Explore capability <ArrowRight size={14} /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-heading">
          <span className="section-kicker">FROM SIGNAL TO REVIEW</span>
          <h2>Four steps. People stay in control.</h2>
          <p>A transparent workflow keeps the operational team at the center of every decision.</p>
        </div>
        <div className="workflow-grid">
          {workflow.map(([number, title, description], index) => (
            <article className="workflow-step" key={number}>
              <div className="workflow-number">{number}<span>{index < workflow.length - 1 && <i />}</span></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="impact-section" id="about">
        <div className="impact-copy">
          <span className="section-kicker">INTENDED IMPACT</span>
          <h2>More shared context.<br /><span>Better-informed coordination.</span></h2>
          <p>When teams can see eligible inventory and demand signals across a network, they have more context to review potential shortages, prioritize conversations and coordinate responsibly.</p>
          <div className="impact-points">
            <div><ClipboardCheck size={17} /><span><b>Improve operational visibility</b><small>Understand what is available, reserved or under review.</small></span></div>
            <div><Truck size={17} /><span><b>Support earlier coordination</b><small>Make facility-to-facility discussions more informed.</small></span></div>
          </div>
          <Link className="text-link" href="/dashboard">View the demo workspace <ArrowRight size={15} /></Link>
        </div>
        <div className="impact-card">
          <div className="impact-card-top"><span><Activity size={16} /> Network visibility</span><span className="impact-demo-label">SIMULATED</span></div>
          <div className="impact-card-main">
            <div className="impact-number">{summary ? summary.eligible_units.toLocaleString() : "—"}</div>
            <div className="impact-number-caption">eligible units visible in this demo snapshot</div>
          </div>
          <div className="impact-bars" aria-label="Eligible units by blood group">
            {preview?.blood_group_distribution.map((item) => {
              const max = Math.max(1, ...preview.blood_group_distribution.map((entry) => entry.eligible_units));
              return (
                <div className="impact-bar-row" key={item.blood_group}>
                  <span>{item.blood_group}</span><div><i style={{ width: `${Math.max(3, (item.eligible_units / max) * 100)}%` }} /></div><b>{item.eligible_units}</b>
                </div>
              );
            })}
            {!preview && <div className="impact-loading">Loading API data…</div>}
          </div>
          <div className="impact-card-foot"><span>Current eligible stock by group</span><span>API aggregate</span></div>
        </div>
      </section>

      <section className="responsible-section">
        <div className="responsible-mark"><ShieldCheck size={22} /></div>
        <div>
          <span className="section-kicker">TECHNOLOGY WITH RESPONSIBILITY</span>
          <h2>Useful signals. Honest limits.</h2>
          <p>This prototype uses simulated records and a simple moving-average baseline. It does not claim clinical effectiveness, make compatibility or transfusion decisions, or dispatch transfers automatically. Forecast confidence intervals and accuracy scores are not currently validated or available.</p>
        </div>
        <Link href="/login">Explore the demo <ArrowRight size={15} /></Link>
      </section>

      <section className="closing-cta">
        <div><span className="section-kicker">BLOODFLOW AI · DEMO WORKSPACE</span><h2>See the network with more context.</h2><p>Explore the simulated supply intelligence workspace.</p></div>
        <Link className="hero-primary" href="/dashboard">Open dashboard <ArrowRight size={16} /></Link>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Link aria-label="BloodFlow AI homepage" className="site-brand" href="/">
              <span className="brand-mark"><Droplets size={17} /></span><span>BloodFlow <b>AI</b></span>
            </Link>
            <p>Supply intelligence and human-reviewed coordination for blood services.</p>
            <span className="footer-demo-note">SIMULATED PROTOTYPE · NOT A CLINICAL SYSTEM</span>
          </div>
          <div className="footer-column"><b>Platform</b><Link href="/dashboard">Dashboard</Link><Link href="/forecasts">PredictAI</Link><Link href="/inventory">Inventory</Link><Link href="/analytics">Analytics</Link></div>
          <div className="footer-column"><b>Explore</b><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About</a><Link href="/login">Log in</Link></div>
          <div className="footer-column"><b>Contact</b><span>Network partnerships</span><span className="footer-placeholder">hello@example.org (demo placeholder)</span><span>Kenya · East Africa</span></div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} BloodFlow AI · Demonstration prototype</span><span>Data displayed is synthetic and for demonstration only.</span></div>
      </footer>
    </main>
  );
}
