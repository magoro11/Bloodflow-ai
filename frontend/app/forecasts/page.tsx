"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Info, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChartCard, ChartEmpty, ChartLoading, DemandForecastChart } from "@/components/charts/AnalyticsCharts";
import { AppShell, type AppFacility } from "@/components/dashboard/AppShell";
import { api, getToken } from "@/lib/api";
import { analyticsWorkspacePath, dateDaysAgo, type AnalyticsWorkspace } from "@/lib/analytics";

type User = { email: string; role: string; facility_id: string | null };
type Facility = AppFacility;
type DateRange = 30 | 90 | 180;
type Horizon = 7 | 14 | 30;

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const components = [
  ["whole_blood", "Whole blood"],
  ["red_blood_cells", "Red blood cells"],
  ["platelets", "Platelets"],
  ["plasma", "Plasma"],
];

function storedUser(): User | null {
  try {
    const user = JSON.parse(window.localStorage.getItem("bloodflow_user") ?? "null") as User | null;
    return user && typeof user.email === "string" && typeof user.role === "string" ? user : null;
  } catch {
    return null;
  }
}

function localDateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function ForecastsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [component, setComponent] = useState("red_blood_cells");
  const [rangeDays, setRangeDays] = useState<DateRange>(90);
  const [horizonDays, setHorizonDays] = useState<Horizon>(7);
  const [workspace, setWorkspace] = useState<AnalyticsWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const currentUser = storedUser();
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    setUser(currentUser);
    setFacilityId(currentUser.facility_id ?? "");
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready || !user) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<Facility[]>("/api/facilities"),
      api<AnalyticsWorkspace>(analyticsWorkspacePath({
        dateFrom: dateDaysAgo(rangeDays - 1),
        dateTo: dateDaysAgo(0),
        facilityId: facilityId || undefined,
        bloodGroup,
        component,
        horizonDays,
      })),
    ])
      .then(([facilityData, data]) => {
        if (!active) return;
        setFacilities(user.facility_id ? facilityData.filter((item) => item.id === user.facility_id) : facilityData);
        setWorkspace(data);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Could not load forecast data.";
        if (message.toLowerCase().includes("bearer token")) router.replace("/login");
        else setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bloodGroup, component, facilityId, horizonDays, rangeDays, ready, refreshKey, router, user]);

  const facilityOptions = useMemo(() => facilities.map(({ id, name, county }) => ({ id, name, county })), [facilities]);
  const summary = workspace?.summary;
  const stockDays = summary?.mean_daily_demand && summary.mean_daily_demand > 0
    ? summary.eligible_units / summary.mean_daily_demand
    : null;
  const expectedStockout = stockDays !== null && stockDays <= horizonDays
    ? localDateAfter(Math.max(0, Math.ceil(stockDays)))
    : null;

  return (
    <AppShell
      activeHref="/forecasts"
      allowAllFacilities={!user?.facility_id}
      facilities={facilityOptions}
      facilityId={facilityId}
      onFacilityChange={setFacilityId}
      title="PredictAI forecasts"
      user={user ?? { email: "Loading", role: "member" }}
    >
      <section className="forecast-intro">
        <div><span className="section-kicker">DEMAND PLANNING</span><h2>Transparent baseline projections.</h2><p>Explore observed demand and a moving-average outlook for the selected blood product.</p></div>
        <div className="forecast-model-tag"><Sparkles size={15} /><span><b>Moving average baseline</b><small>One model is implemented</small></span></div>
      </section>

      <section aria-label="Forecast filters" className="forecast-filter-panel">
        <label><CalendarDays size={14} /><span className="sr-only">Historical window</span>
          <select aria-label="Historical window" onChange={(event) => setRangeDays(Number(event.target.value) as DateRange)} value={rangeDays}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option></select>
        </label>
        <label><span>Blood group</span><select aria-label="Blood group" onChange={(event) => setBloodGroup(event.target.value)} value={bloodGroup}>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
        <label><span>Component</span><select aria-label="Component" onChange={(event) => setComponent(event.target.value)} value={component}>{components.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label><span>Forecast horizon</span><select aria-label="Forecast horizon" onChange={(event) => setHorizonDays(Number(event.target.value) as Horizon)} value={horizonDays}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
        <button aria-label="Refresh forecast" className="icon-button" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)} type="button"><Activity size={16} /></button>
      </section>

      {error && <div className="app-error" role="alert"><ShieldAlert size={16} /><span>{error}</span><button onClick={() => setRefreshKey((value) => value + 1)} type="button">Retry</button></div>}

      <section className="forecast-metric-grid">
        <ForecastMetric label="Observed daily average" value={summary?.mean_daily_demand} suffix=" units/day" loading={loading} />
        <ForecastMetric label={`${horizonDays}-day baseline demand`} value={summary?.mean_daily_demand === null || summary?.mean_daily_demand === undefined ? null : summary.mean_daily_demand * horizonDays} suffix=" units" loading={loading} />
        <ForecastMetric label="Eligible stock" value={summary?.eligible_units} suffix=" units" loading={loading} />
        <article className="forecast-metric"><span>Estimated stock cover</span><strong>{loading ? "—" : stockDays === null ? "N/A" : `${stockDays.toFixed(1)} days`}</strong><small>Uses current eligible stock ÷ observed average</small></article>
      </section>

      <section className="forecast-content-grid">
        <ChartCard className="forecast-chart-card" subtitle={`${rangeDays}-day observed window · ${horizonDays}-day moving-average outlook`} title={`${bloodGroup} ${components.find(([key]) => key === component)?.[1] ?? component}`}>
          {loading ? <ChartLoading /> : workspace ? <DemandForecastChart data={workspace.forecast_series} /> : <ChartEmpty />}
          {workspace && <div className="chart-footnote">{workspace.forecast_interval_method}</div>}
        </ChartCard>

        <div className="forecast-side-column">
          <article className="card forecast-stockout-card">
            <div className="card-heading"><div><h2 className="card-title">Expected stockout review</h2><p className="card-subtitle">A simple stock-cover indicator</p></div><ShieldAlert size={17} /></div>
            {loading ? <div className="skeleton-value" /> : expectedStockout
              ? <><strong>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${expectedStockout}T12:00:00`))}</strong><p>At the observed average, current eligible stock may be consumed within this forecast horizon. Review the underlying records.</p></>
              : <><strong>{summary?.mean_daily_demand ? "Beyond selected horizon" : "Insufficient demand history"}</strong><p>This baseline is not a stockout guarantee; verify consumption and local operational context.</p></>}
          </article>

          <article className="card forecast-accuracy-card">
            <div className="card-heading"><div><h2 className="card-title">Model evaluation</h2><p className="card-subtitle">No validated comparison available</p></div><Info size={16} /></div>
            <div className="forecast-evaluation-values">
              <span><b>MAE</b><strong>N/A</strong></span><span><b>RMSE</b><strong>N/A</strong></span><span><b>WAPE</b><strong>N/A</strong></span>
            </div>
            <p>{workspace?.forecast_quality.reason ?? "Historical predictions are not stored, so error metrics cannot be calculated."}</p>
          </article>
        </div>
      </section>

      <section className="forecast-bottom-grid">
        <article className="card forecast-factors-card">
          <div className="card-heading"><div><h2 className="card-title">Observed contributing factors</h2><p className="card-subtitle">Inputs available to this simple baseline</p></div><Info size={16} /></div>
          <div className="factor-list">
            <div><span>Historical daily average</span><b>{summary?.mean_daily_demand === null || summary?.mean_daily_demand === undefined ? "N/A" : `${summary.mean_daily_demand.toFixed(2)} units`}</b></div>
            <div><span>Historical variability</span><b>{workspace?.forecast_interval_method.includes("standard deviation") ? "Daily standard deviation" : "N/A"}</b></div>
            <div><span>Current eligible stock</span><b>{summary?.eligible_units.toLocaleString() ?? "—"} units</b></div>
            <div><span>History window with observations</span><b>{summary?.history_days_with_data ?? 0} days</b></div>
          </div>
          <p className="chart-footnote">These are descriptive inputs, not causal explanations. No weather, seasonality or clinical factors are included.</p>
        </article>
        <article className="card forecast-comparison-card">
          <div className="card-heading"><div><h2 className="card-title">Model comparison</h2><p className="card-subtitle">Only one baseline model is currently implemented.</p></div></div>
          <div className="single-model-row"><span><Sparkles size={16} /> Moving-average baseline</span><b>Available</b></div>
          <div className="model-unavailable"><Info size={15} /><span>Seasonal, Random Forest and XGBoost comparisons require additional training and time-based evaluation data.</span></div>
        </article>
      </section>

      <div className="safety-banner"><ShieldAlert size={15} /><span>Planning support only. The variability range is not a calibrated confidence interval, and the estimated stockout date is an indicative calculation, not a clinical or operational guarantee.</span></div>
    </AppShell>
  );
}

function ForecastMetric({ label, value, suffix, loading }: { label: string; value?: number | null; suffix: string; loading: boolean }) {
  return <article className="forecast-metric"><span>{label}</span><strong>{loading ? "—" : value === null || value === undefined ? "N/A" : `${value.toFixed(1)}${suffix}`}</strong><small>Calculated from selected API data</small></article>;
}
