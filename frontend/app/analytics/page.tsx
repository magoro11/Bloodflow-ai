"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Filter, Info, ShieldAlert } from "lucide-react";
import {
  BloodGroupChart,
  ChartCard,
  ChartEmpty,
  ChartLoading,
  ComponentInventoryChart,
  DemandForecastChart,
  ExpiryChart,
  FacilityPerformanceChart,
  InventoryStatusChart,
  StockCoverageChart,
  SupplyDemandChart,
  TransferActivityChart,
} from "@/components/charts/AnalyticsCharts";
import { AppShell, type AppFacility } from "@/components/dashboard/AppShell";
import { api, getToken } from "@/lib/api";
import {
  analyticsWorkspacePath,
  dateDaysAgo,
  type AnalyticsWorkspace,
} from "@/lib/analytics";
import { useRouter } from "next/navigation";

type User = { email: string; role: string; facility_id: string | null };
type Facility = AppFacility & { simulated: boolean };
type DateRange = 30 | 90 | 180;
type Horizon = 7 | 14 | 30;

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const components = [
  ["", "All components"],
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

function downloadCsv(workspace: AnalyticsWorkspace) {
  const rows = [
    ["date", "observed_demand", "moving_average_baseline", "variability_lower", "variability_upper"],
    ...workspace.forecast_series.map((point) => [
      point.date,
      point.actual_demand ?? "",
      point.predicted_demand ?? "",
      point.lower_bound ?? "",
      point.upper_bound ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bloodflow-demand-${workspace.filters.date_from}-to-${workspace.filters.date_to}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState("");
  const [county, setCounty] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [component, setComponent] = useState("");
  const [rangeDays, setRangeDays] = useState<DateRange>(30);
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
    setSessionReady(true);
  }, [router]);

  useEffect(() => {
    if (!sessionReady || !user) return;
    let active = true;
    const dateTo = dateDaysAgo(0);
    const dateFrom = dateDaysAgo(rangeDays - 1);
    setLoading(true);
    setError("");
    Promise.all([
      api<Facility[]>("/api/facilities"),
      api<AnalyticsWorkspace>(analyticsWorkspacePath({
        dateFrom,
        dateTo,
        facilityId: facilityId || undefined,
        county: county || undefined,
        bloodGroup: bloodGroup || undefined,
        component: component || undefined,
        horizonDays,
      })),
    ])
      .then(([facilityData, nextWorkspace]) => {
        if (!active) return;
        const accessibleFacilities = user.facility_id
          ? facilityData.filter((facility) => facility.id === user.facility_id)
          : facilityData;
        setFacilities(accessibleFacilities);
        setWorkspace(nextWorkspace);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Could not load analytics.";
        if (message.toLowerCase().includes("bearer token")) router.replace("/login");
        else setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bloodGroup, component, county, facilityId, horizonDays, rangeDays, refreshKey, router, sessionReady, user]);

  const counties = useMemo(() => [...new Set(facilities.map((facility) => facility.county))].sort(), [facilities]);
  const accessibleFacilities = useMemo(
    () => user?.facility_id ? facilities.filter((facility) => facility.id === user.facility_id) : facilities,
    [facilities, user?.facility_id],
  );
  const facilityOptions = accessibleFacilities.map(({ id, name, county: facilityCounty }) => ({ id, name, county: facilityCounty }));
  const workspaceFiltersChanged = Boolean(county || bloodGroup || component || facilityId);
  const unavailable = !workspace?.summary.history_days_with_data;

  return (
    <AppShell
      activeHref="/analytics"
      allowAllFacilities={!user?.facility_id}
      facilities={facilityOptions}
      facilityId={facilityId}
      notificationCount={0}
      onFacilityChange={(value) => {
        setFacilityId(value);
        const selected = accessibleFacilities.find((facility) => facility.id === value);
        setCounty(selected?.county ?? "");
      }}
      title="Analytics"
      user={user ?? { email: "Loading", role: "member" }}
    >
      <div className="analytics-intro">
        <div><h2>Network performance, in context.</h2><p>Explore demand, stock and transfer records from the selected synthetic data window.</p></div>
        <button className="button analytics-export" disabled={!workspace || loading} onClick={() => workspace && downloadCsv(workspace)} type="button"><Download size={15} /> Export demand CSV</button>
      </div>

      <section aria-label="Analytics filters" className="analytics-filter-panel">
        <div className="analytics-filter-heading"><Filter size={15} /><b>Filters</b><span>Updates are calculated from the API for each selection.</span></div>
        <div className="analytics-filter-grid">
          <label><span>Date range</span><select aria-label="Date range" onChange={(event) => setRangeDays(Number(event.target.value) as DateRange)} value={rangeDays}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option></select></label>
          <label><span>County</span><select aria-label="County" onChange={(event) => {
            const value = event.target.value;
            setCounty(value);
            if (user?.facility_id) setFacilityId(user.facility_id);
            else setFacilityId("");
          }} value={county}><option value="">All accessible counties</option>{counties.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label><span>Blood group</span><select aria-label="Blood group" onChange={(event) => setBloodGroup(event.target.value)} value={bloodGroup}><option value="">All groups</option>{bloodGroups.map((group) => <option key={group}>{group}</option>)}</select></label>
          <label><span>Component</span><select aria-label="Component" onChange={(event) => setComponent(event.target.value)} value={component}>{components.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Forecast horizon</span><select aria-label="Forecast horizon" onChange={(event) => setHorizonDays(Number(event.target.value) as Horizon)} value={horizonDays}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
        </div>
      </section>

      {error && <div className="app-error" role="alert"><ShieldAlert size={16} /><span>{error}</span><button onClick={() => setRefreshKey((value) => value + 1)} type="button">Retry</button></div>}

      <section aria-label="Filtered network summary" className="analytics-summary-grid">
        <AnalyticsMetric label="Eligible units" value={workspace?.summary.eligible_units} loading={loading} detail="Current stock snapshot" />
        <AnalyticsMetric label="Observed demand" value={workspace?.summary.mean_daily_demand} loading={loading} detail="Average units per day" decimals />
        <AnalyticsMetric label="Expiring in 30 days" value={workspace?.summary.expiring_30d} loading={loading} detail="Eligible units" />
        <AnalyticsMetric label="Transfer records" value={workspace?.transfer_activity.reduce((total, item) => total + item.count, 0)} loading={loading} detail={`Within selected ${rangeDays}-day window`} />
      </section>

      <div className="analytics-section-heading"><div><span className="section-kicker">DEMAND & FORECAST</span><h2>Observed patterns and baseline outlook</h2></div><span className="chart-source-pill"><i /> {workspace?.synthetic_data ? "Synthetic API records" : "API records"}</span></div>
      <section className="analytics-grid">
        <ChartCard className="analytics-chart-wide" subtitle={`Actual historical demand and ${horizonDays}-day moving-average projection`} title="Demand trend · actual vs. predicted">
          {loading ? <ChartLoading /> : workspace ? <DemandForecastChart data={workspace.forecast_series} /> : <ChartEmpty />}
          {workspace && <div className="chart-footnote">{workspace.forecast_interval_method}</div>}
        </ChartCard>
        <ChartCard subtitle="Evaluation requires stored predictions compared against later observed demand." title="Forecast accuracy">
          <div className="accuracy-metrics">
            <AccuracyMetric label="MAE" value={workspace?.forecast_quality.mae} />
            <AccuracyMetric label="RMSE" value={workspace?.forecast_quality.rmse} />
            <AccuracyMetric label="WAPE" value={workspace?.forecast_quality.wape} suffix="%" />
          </div>
          <div className="analytics-limitation"><Info size={15} /><span>{workspace?.forecast_quality.reason ?? "Loading forecast evaluation status."}</span></div>
        </ChartCard>
        <ChartCard subtitle="Current eligible units against cumulative baseline demand" title="Network supply vs. demand">
          {loading ? <ChartLoading /> : workspace ? <SupplyDemandChart data={workspace.supply_demand_series} /> : <ChartEmpty />}
          <div className="chart-footnote">Current supply is a snapshot; historical inventory levels are not stored.</div>
        </ChartCard>
        <ChartCard subtitle="Coverage bands use current eligible units divided by observed daily demand." title="Facility stock coverage">
          {loading ? <ChartLoading /> : workspace ? <StockCoverageChart data={workspace.stock_coverage_distribution} /> : <ChartEmpty />}
          <div className="chart-footnote">Rule-based planning signal only, not a clinical risk score.</div>
        </ChartCard>
        <ChartCard subtitle="Historical shortage events in the selected window" title="Shortage frequency">
          <div className="analytics-data-unavailable"><Info size={17} /><b>Not available</b><span>Historical inventory snapshots are not stored, so past shortage events cannot be counted.</span></div>
        </ChartCard>
      </section>

      <div className="analytics-section-heading"><div><span className="section-kicker">INVENTORY HEALTH</span><h2>What is available, and what needs attention</h2></div></div>
      <section className="analytics-grid">
        <ChartCard subtitle="Eligible units grouped by ABO/Rh blood group" title="Blood group distribution">
          {loading ? <ChartLoading /> : workspace ? <BloodGroupChart data={workspace.blood_group_distribution} /> : <ChartEmpty />}
        </ChartCard>
        <ChartCard subtitle="Eligible, reserved, quarantined, expired and other unit records" title="Inventory status">
          {loading ? <ChartLoading /> : workspace ? <InventoryStatusChart data={workspace.inventory_status_distribution} /> : <ChartEmpty />}
        </ChartCard>
        <ChartCard className="analytics-chart-wide" subtitle="Unit records by component and eligibility state" title="Component distribution">
          {loading ? <ChartLoading /> : workspace ? <ComponentInventoryChart data={workspace.component_distribution} /> : <ChartEmpty />}
        </ChartCard>
        <ChartCard className="analytics-chart-wide" subtitle="Cumulative count of eligible units within each expiry window" title="Expiry monitoring">
          {loading ? <ChartLoading /> : workspace ? <ExpiryChart data={workspace.expiry_monitoring} /> : <ChartEmpty />}
          <div className="chart-footnote">The 7-, 14- and 30-day values are cumulative windows and use today&apos;s stock.</div>
        </ChartCard>
        <ChartCard className="analytics-chart-wide" subtitle={`Current eligible inventory and ${horizonDays}-day baseline demand`} title="Facility comparison">
          {loading ? <ChartLoading /> : workspace ? <FacilityPerformanceChart data={workspace.facility_performance} /> : <ChartEmpty />}
        </ChartCard>
      </section>

      <div className="analytics-section-heading"><div><span className="section-kicker">NETWORK ACTIVITY</span><h2>Transfers and operational follow-through</h2></div></div>
      <section className="analytics-grid analytics-grid-bottom">
        <ChartCard subtitle="Recorded proposal, approval, completion and blocked status counts" title="Transfer activity">
          {loading ? <ChartLoading /> : workspace ? <TransferActivityChart data={workspace.transfer_activity} /> : <ChartEmpty />}
        </ChartCard>
        <article className="card analytics-limitation-card">
          <div className="analytics-limitation-icon"><Info size={17} /></div>
          <h3>Impact and wastage metrics</h3>
          <p>Historical wastage events, counterfactual transfer outcomes and optimization baselines are not recorded in this prototype, so avoided wastage and transfer impact cannot be measured.</p>
          <div className="limitation-state"><span /> {unavailable && !loading ? "Demand history is unavailable for this filter." : workspaceFiltersChanged ? "Metrics reflect the selected filters." : "Filters apply to demand, stock and transfer data."}</div>
          <div className="limitation-state"><span /> {workspace?.limitations.transfer_rejection_status_available ? "Rejected state available." : "Blocked transfers are tracked; rejected state is not defined by the API."}</div>
          <div className="limitation-state"><span /> {workspace?.limitations.wastage_events_available ? "Wastage records available." : "No separate wastage-event records are stored."}</div>
        </article>
      </section>
      <div className="safety-banner"><ShieldAlert size={15} /><span>Simulated operational decision support. Forecast intervals are descriptive historical variability, not calibrated confidence estimates.</span></div>
    </AppShell>
  );
}

function AnalyticsMetric({ label, value, detail, loading, decimals = false }: { label: string; value?: number | null; detail: string; loading: boolean; decimals?: boolean }) {
  return (
    <article className="analytics-summary-card">
      <span>{label}</span>
      <strong>{loading ? "—" : value === null || value === undefined ? "N/A" : decimals ? value.toFixed(2) : value.toLocaleString()}</strong>
      <small>{detail}</small>
    </article>
  );
}

function AccuracyMetric({ label, value, suffix = "" }: { label: string; value: number | null | undefined; suffix?: string }) {
  return <div><span>{label}</span><b>{value === null || value === undefined ? "N/A" : `${value.toFixed(2)}${suffix}`}</b></div>;
}
