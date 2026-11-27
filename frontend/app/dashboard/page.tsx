"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Map as MapIcon,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
} from "lucide-react";
import {
  ChartCard,
  ChartEmpty,
  ChartLoading,
  DemandForecastChart,
  FacilityPerformanceChart,
  BloodGroupChart,
  SupplyDemandChart,
} from "@/components/charts/AnalyticsCharts";
import { AppShell, type AppFacility } from "@/components/dashboard/AppShell";
import { api, getToken } from "@/lib/api";
import {
  analyticsWorkspacePath,
  dateDaysAgo,
  formatComponent,
  type AnalyticsWorkspace,
} from "@/lib/analytics";

type User = { email: string; role: string; facility_id: string | null };
type Facility = AppFacility & { facility_type: string; latitude: number; longitude: number; simulated: boolean };
type Alert = {
  id: string;
  facility_id: string;
  facility_name: string;
  blood_group: string;
  component: string;
  risk_level: string;
  eligible_stock: number;
  expected_demand_7d: number;
  explanation: string;
};
type Transfer = {
  id: string;
  source_facility_id: string;
  destination_facility_id: string;
  blood_group: string;
  component: string;
  units: number;
  status: string;
};
type InventoryUnit = {
  id: string;
  facility_id: string;
  blood_group: string;
  component: string;
  collection_date: string;
  expiry_date: string;
  screening_status: "released" | "pending" | "quarantined";
  reservation_status: "available" | "reserved" | "transferred";
  cold_chain_status: "normal" | "breach";
};
type UnitStatus = "available" | "reserved" | "transferred" | "quarantined" | "expired" | "review";
type InventoryFilter = "all" | UnitStatus;
type DateRange = 30 | 90 | 180;
type Horizon = 7 | 14 | 30;

const inventoryFilters: Array<{ label: string; value: InventoryFilter }> = [
  { label: "All units", value: "all" },
  { label: "Available", value: "available" },
  { label: "Reserved", value: "reserved" },
  { label: "Expired", value: "expired" },
  { label: "Quarantined", value: "quarantined" },
  { label: "Transferred", value: "transferred" },
  { label: "Review needed", value: "review" },
];

function getStoredUser(): User | null {
  try {
    const user = JSON.parse(window.localStorage.getItem("bloodflow_user") ?? "null") as User | null;
    return user && typeof user.email === "string" && typeof user.role === "string" ? user : null;
  } catch {
    return null;
  }
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function fullDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function getUnitStatus(unit: InventoryUnit, today: string): UnitStatus {
  if (unit.expiry_date < today) return "expired";
  if (unit.screening_status === "quarantined" || unit.cold_chain_status === "breach") return "quarantined";
  if (unit.reservation_status === "transferred") return "transferred";
  if (unit.reservation_status === "reserved") return "reserved";
  if (unit.screening_status === "released" && unit.cold_chain_status === "normal" && unit.reservation_status === "available") {
    return "available";
  }
  return "review";
}

async function loadInventoryUnits(facilityId: string): Promise<InventoryUnit[]> {
  const units: InventoryUnit[] = [];
  for (let offset = 0; ; offset += 500) {
    const params = new URLSearchParams({ limit: "500", offset: String(offset) });
    if (facilityId) params.set("facility_id", facilityId);
    const batch = await api<InventoryUnit[]>(`/api/inventory/units?${params.toString()}`);
    units.push(...batch);
    if (batch.length < 500) return units;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState("");
  const [rangeDays, setRangeDays] = useState<DateRange>(30);
  const [horizonDays, setHorizonDays] = useState<Horizon>(7);
  const [workspace, setWorkspace] = useState<AnalyticsWorkspace | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const storedUser = getStoredUser();
    if (!storedUser) {
      window.localStorage.removeItem("bloodflow_token");
      window.localStorage.removeItem("bloodflow_user");
      router.replace("/login");
      return;
    }
    setUser(storedUser);
    setFacilityId(storedUser.facility_id ?? "");
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
      api<Alert[]>("/api/alerts"),
      api<Transfer[]>("/api/transfers"),
      api<AnalyticsWorkspace>(analyticsWorkspacePath({
        dateFrom,
        dateTo,
        facilityId: facilityId || undefined,
        horizonDays,
      })),
      loadInventoryUnits(facilityId),
    ])
      .then(([nextFacilities, nextAlerts, nextTransfers, nextWorkspace, nextInventoryUnits]) => {
        if (!active) return;
        const accessibleFacilities = user.facility_id
          ? nextFacilities.filter((facility) => facility.id === user.facility_id)
          : nextFacilities;
        setAllFacilities(nextFacilities);
        setFacilities(accessibleFacilities);
        setAlerts(nextAlerts);
        setTransfers(nextTransfers);
        setWorkspace(nextWorkspace);
        setInventoryUnits(nextInventoryUnits);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Could not load dashboard data.";
        if (message.toLowerCase().includes("bearer token")) router.replace("/login");
        else setError(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [facilityId, horizonDays, rangeDays, refreshKey, router, sessionReady, user]);

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => !facilityId || alert.facility_id === facilityId),
    [alerts, facilityId],
  );
  const shortageAlerts = visibleAlerts.filter((alert) => alert.risk_level !== "expiry");
  const urgentAlerts = visibleAlerts.filter((alert) => alert.risk_level === "critical" || alert.risk_level === "high");
  const accessibleFacilities = useMemo(
    () => user?.facility_id ? facilities.filter((facility) => facility.id === user.facility_id) : facilities,
    [facilities, user?.facility_id],
  );
  const userName = user?.email.split("@")[0].split(/[._-]/)[0] ?? "there";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const canRecommend = user?.role === "blood_bank_manager" || user?.role === "network_administrator";
  const today = new Date().toISOString().slice(0, 10);
  const inventoryCounts = useMemo(() => {
    const counts: Record<UnitStatus, number> = {
      available: 0,
      reserved: 0,
      transferred: 0,
      quarantined: 0,
      expired: 0,
      review: 0,
    };
    for (const unit of inventoryUnits) counts[getUnitStatus(unit, today)] += 1;
    return counts;
  }, [inventoryUnits, today]);
  const filteredInventory = useMemo(() => {
    const needle = inventorySearch.trim().toLowerCase();
    return inventoryUnits.filter((unit) => {
      const matchesStatus = inventoryFilter === "all" || getUnitStatus(unit, today) === inventoryFilter;
      const matchesSearch = !needle || [unit.blood_group, formatComponent(unit.component), unit.id]
        .some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesSearch;
    });
  }, [inventoryFilter, inventorySearch, inventoryUnits, today]);
  const inventoryPageSize = 12;
  const inventoryPageCount = Math.max(1, Math.ceil(filteredInventory.length / inventoryPageSize));
  const visibleInventory = filteredInventory.slice((inventoryPage - 1) * inventoryPageSize, inventoryPage * inventoryPageSize);
  const facilityNames = useMemo(() => new Map(allFacilities.map((facility) => [facility.id, facility.name])), [allFacilities]);

  const recommendTransfer = useCallback(async () => {
    const defaultSource = allFacilities.find((facility) => facility.county.toLowerCase() === "nairobi");
    const sourceFacilityId = facilityId || user?.facility_id || defaultSource?.id;
    const source = allFacilities.find((facility) => facility.id === sourceFacilityId);
    const destinationCounty = source?.county.toLowerCase() === "kisumu" ? "nairobi" : "kisumu";
    const destination = allFacilities.find(
      (facility) => facility.id !== sourceFacilityId && facility.county.toLowerCase() === destinationCounty,
    );
    if (!sourceFacilityId || !destination) {
      setError("A source and destination facility are required to create this recommendation.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api<Transfer>("/api/transfers/recommend", {
        method: "POST",
        body: JSON.stringify({
          ...(user?.role === "network_administrator" ? { source_facility_id: sourceFacilityId } : {}),
          destination_facility_id: destination.id,
          blood_group: "O+",
          component: "red_blood_cells",
          units: 3,
        }),
      });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create a recommendation.");
    } finally {
      setBusy(false);
    }
  }, [allFacilities, facilityId, user?.facility_id, user?.role]);

  async function approveTransfer(transferId: string) {
    setBusy(true);
    setError("");
    try {
      await api<Transfer>(`/api/transfers/${transferId}/approve`, { method: "POST" });
      setRefreshKey((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not approve this recommendation.");
    } finally {
      setBusy(false);
    }
  }

  const recentActivities = workspace?.recent_activity ?? [];
  const facilityOptions = accessibleFacilities.map(({ id, name, county }) => ({ id, name, county }));

  return (
    <AppShell
      activeHref="/dashboard"
      appearance="blood-inventory"
      allowAllFacilities={!user?.facility_id}
      facilities={facilityOptions}
      facilityId={facilityId}
      notificationCount={urgentAlerts.length}
      onFacilityChange={(nextFacilityId) => { setFacilityId(nextFacilityId); setInventoryPage(1); }}
      title="Blood inventory"
      eyebrow="BloodFlow AI · Inventory dashboard"
      user={user ?? { email: "Loading", role: "member" }}
    >
      <section className="dashboard-welcome">
        <div>
          <div className="dashboard-welcome-kicker"><span className="live-dot" /> NETWORK OPERATIONS · DEMO ENVIRONMENT</div>
          <h2>{greeting}, {userName}.</h2>
          <p>Here&apos;s the latest supply picture for your accessible network.</p>
        </div>
        <div className="dashboard-controls">
          <label className="select-control"><CalendarDays size={15} /><span className="sr-only">Historical date range</span>
            <select aria-label="Historical date range" onChange={(event) => setRangeDays(Number(event.target.value) as DateRange)} value={rangeDays}>
              <option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={180}>Last 180 days</option>
            </select>
          </label>
          <button aria-label="Refresh dashboard data" className="icon-button" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)} type="button"><RefreshCw size={16} /></button>
        </div>
      </section>

      {error && <div className="app-error" role="alert"><ShieldAlert size={16} /><span>{error}</span><button onClick={() => setRefreshKey((value) => value + 1)} type="button">Retry</button></div>}

      <section aria-label="Network overview" className="dashboard-kpis">
        <MetricCard label="Total units" value={inventoryUnits.length} detail="Units in the selected facility scope" icon={<Boxes size={17} />} tone="teal" loading={loading} />
        <MetricCard label="Available" value={inventoryCounts.available} detail="Released · in date · unreserved" icon={<PackageCheck size={17} />} tone="teal" loading={loading} />
        <MetricCard label="Used" value="Not tracked" detail="The API does not record post-use units" icon={<Info size={17} />} loading={loading} />
        <MetricCard label="Expired" value={inventoryCounts.expired} detail="Expiry date has passed" icon={<Clock3 size={17} />} tone="amber" loading={loading} />
      </section>

      <section aria-labelledby="inventory-browser-title" className="inventory-browser card">
        <div className="inventory-browser-heading">
          <div>
            <div className="inventory-section-kicker">UNIT-LEVEL VIEW · {loading ? "LOADING" : `${inventoryUnits.length.toLocaleString()} UNITS`}</div>
            <h2 id="inventory-browser-title">Blood inventory</h2>
            <p>Search stock by blood group, component, or unit reference.</p>
          </div>
          <div className="inventory-quick-stats">
            <span><MapIcon size={14} />{loading ? "—" : workspace?.summary.facility_count ?? 0} facilities</span>
            <span><ShieldAlert size={14} />{loading ? "—" : shortageAlerts.length} shortage signals</span>
            <span><Clock3 size={14} />{loading ? "—" : workspace?.summary.expiring_7d ?? 0} expiring in 7d</span>
            <Link href="/inventory">Manage inventory <ArrowRight size={14} /></Link>
          </div>
        </div>
        <div className="inventory-browser-controls">
          <label className="inventory-search">
            <Search aria-hidden="true" size={16} />
            <input
              aria-label="Search inventory by blood group, component, or unit reference"
              onChange={(event) => { setInventorySearch(event.target.value); setInventoryPage(1); }}
              placeholder="Search blood group or component"
              value={inventorySearch}
            />
          </label>
          <div aria-label="Filter inventory by status" className="inventory-status-filters" role="group">
            {inventoryFilters.map(({ label, value }) => (
              <button
                aria-pressed={inventoryFilter === value}
                className={inventoryFilter === value ? "active" : ""}
                key={value}
                onClick={() => { setInventoryFilter(value); setInventoryPage(1); }}
                type="button"
              >
                {label}
                {value !== "all" && <span>{inventoryCounts[value]}</span>}
              </button>
            ))}
          </div>
        </div>
        <p className="inventory-data-note"><Info size={14} />Used units are not tracked by the current API. Reserved and transferred units are shown separately.</p>
        {loading ? (
          <div aria-label="Loading inventory units" className="blood-unit-grid">
            {Array.from({ length: 6 }, (_, index) => <div className="blood-unit-skeleton" key={index}><i /><i /><i /></div>)}
          </div>
        ) : visibleInventory.length ? (
          <>
            <div className="blood-unit-grid">
              {visibleInventory.map((unit) => {
                const status = getUnitStatus(unit, today);
                const statusLabel = status === "review" ? "Review needed" : status.charAt(0).toUpperCase() + status.slice(1);
                const groupClass = unit.blood_group.toLowerCase().replace("+", "positive").replace("-", "negative");
                return (
                  <article className="blood-unit-card" key={unit.id}>
                    <div className={`blood-unit-card-top blood-group-${groupClass}`}>
                      <div><span>Blood group</span><strong>{unit.blood_group}</strong></div>
                      <span className={`blood-unit-status status-${status}`}>{statusLabel}</span>
                    </div>
                    <div className="blood-unit-card-body">
                      <div className="blood-unit-component"><span><PackageCheck size={14} /> Component</span><strong>{formatComponent(unit.component)}</strong></div>
                      <div className="blood-unit-dates">
                        <div><span>Collected</span><time dateTime={unit.collection_date}>{fullDateLabel(unit.collection_date)}</time></div>
                        <div><span>Expires</span><time dateTime={unit.expiry_date}>{fullDateLabel(unit.expiry_date)}</time></div>
                      </div>
                      <div className="blood-unit-facility"><MapIcon size={13} /><span>{facilityNames.get(unit.facility_id) ?? "Facility not listed"}</span><small>Unit {unit.id.slice(0, 8)}</small></div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="inventory-pagination">
              <span>Showing {((inventoryPage - 1) * inventoryPageSize) + 1}–{Math.min(inventoryPage * inventoryPageSize, filteredInventory.length)} of {filteredInventory.length} units</span>
              <div>
                <button aria-label="Previous inventory page" disabled={inventoryPage <= 1} onClick={() => setInventoryPage((page) => Math.max(1, page - 1))} type="button">Previous</button>
                <span>Page {inventoryPage} of {inventoryPageCount}</span>
                <button aria-label="Next inventory page" disabled={inventoryPage >= inventoryPageCount} onClick={() => setInventoryPage((page) => Math.min(inventoryPageCount, page + 1))} type="button">Next</button>
              </div>
            </div>
          </>
        ) : (
          <div className="inventory-empty-state">
            <PackageCheck size={22} />
            <strong>{inventoryUnits.length ? "No units match these filters" : "No inventory units in this scope"}</strong>
            <span>{inventoryUnits.length ? "Try another blood group, component, or status." : "Inventory records returned by the API will appear here."}</span>
            {(inventoryFilter !== "all" || inventorySearch) && <button onClick={() => { setInventoryFilter("all"); setInventorySearch(""); setInventoryPage(1); }} type="button">Clear filters</button>}
          </div>
        )}
      </section>

      <section className="dashboard-grid dashboard-grid-main">
        <ChartCard
          className="dashboard-demand-card"
          subtitle="Observed history with a moving-average baseline · synthetic data"
          title="Blood demand forecast"
        >
          <div className="chart-card-toolbar">
            <span className="chart-source-pill"><i /> API-backed series</span>
            <label className="mini-select"><span className="sr-only">Forecast horizon</span>
              <select aria-label="Forecast horizon" onChange={(event) => setHorizonDays(Number(event.target.value) as Horizon)} value={horizonDays}>
                <option value={7}>7-day view</option><option value={14}>14-day view</option><option value={30}>30-day view</option>
              </select>
            </label>
          </div>
          {loading ? <ChartLoading /> : workspace ? <DemandForecastChart data={workspace.forecast_series} /> : <ChartEmpty />}
          {workspace && <div className="chart-footnote">{workspace.forecast_interval_method}</div>}
        </ChartCard>

        <article className="card alert-panel">
          <div className="card-heading">
            <div><h2 className="card-title">Critical signals</h2><p className="card-subtitle">{urgentAlerts.length} high-priority items · review with facility teams</p></div>
            <Link aria-label="See all shortage alerts" className="quiet-link" href="/alerts"><ArrowUpRight size={16} /></Link>
          </div>
          {loading ? <div className="list-skeleton"><i /><i /><i /></div> : urgentAlerts.length ? urgentAlerts.slice(0, 4).map((alert) => (
            <div className="priority-alert" key={alert.id}>
              <span className={`priority-mark ${alert.risk_level === "critical" ? "critical" : ""}`}><ShieldAlert size={15} /></span>
              <div><div><b>{alert.blood_group} {formatComponent(alert.component)}</b><span className={`severity-label ${alert.risk_level}`}>{alert.risk_level}</span></div>
                <p>{alert.facility_name} · {alert.eligible_stock} eligible</p>
                <small>{alert.explanation}</small>
              </div>
            </div>
          )) : <div className="chart-empty compact-empty">No high-priority supply alerts in this view.</div>}
          <Link className="panel-footer-link" href="/alerts">Review all alerts <ArrowRight size={14} /></Link>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <ChartCard subtitle="Eligible units across the current accessible scope" title="Blood group distribution">
          {loading ? <ChartLoading /> : workspace ? <BloodGroupChart data={workspace.blood_group_distribution} /> : <ChartEmpty />}
        </ChartCard>
        <ChartCard subtitle="Current eligible stock compared with cumulative baseline demand" title="Supply vs. demand">
          {loading ? <ChartLoading /> : workspace ? <SupplyDemandChart data={workspace.supply_demand_series} /> : <ChartEmpty />}
          {workspace?.limitations.stock_supply_is_current_snapshot && <div className="chart-footnote">Supply is a current snapshot, not a projected inventory trajectory.</div>}
        </ChartCard>
      </section>

      <section className="dashboard-grid dashboard-grid-lower">
        <ChartCard subtitle={`Current eligible inventory and ${horizonDays}-day baseline demand`} title="Facility performance">
          {loading ? <ChartLoading /> : workspace ? <FacilityPerformanceChart data={workspace.facility_performance} /> : <ChartEmpty />}
        </ChartCard>
        <article className="card network-status-card">
          <div className="card-heading"><div><h2 className="card-title">Network status</h2><p className="card-subtitle">Facility reporting and operational signals</p></div><span className="network-live-chip"><i /> DEMO</span></div>
          {loading ? <div className="list-skeleton"><i /><i /><i /></div> : facilities.map((facility) => {
            const facilityAlerts = visibleAlerts.filter((alert) => alert.facility_id === facility.id && alert.risk_level !== "expiry");
            const facilityStock = workspace?.facility_performance.find((item) => item.facility_id === facility.id)?.eligible_units ?? 0;
            return (
              <div className="network-facility-row" key={facility.id}>
                <span className={`facility-status-dot ${facilityAlerts.length ? "has-alert" : ""}`} />
                <div><b>{facility.name}</b><small>{facility.county} County · {facility.simulated ? "Simulated feed" : "Configured feed"}</small></div>
                <div className="facility-stock"><strong>{facilityStock.toLocaleString()}</strong><small>eligible</small></div>
              </div>
            );
          })}
          {!loading && facilities.length === 0 && <ChartEmpty message="No facilities are available in this scope." />}
          <div className="network-card-note"><CheckCircle2 size={14} /> Data reflects the latest API response, not real-time telemetry.</div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-lower">
        <article className="card activity-card">
          <div className="card-heading"><div><h2 className="card-title">Recent transfer activity</h2><p className="card-subtitle">Recommendation history for the selected date range</p></div><Link className="quiet-link" href="/transfers">View all <ArrowUpRight size={14} /></Link></div>
          {loading ? <div className="list-skeleton"><i /><i /><i /></div> : recentActivities.length ? recentActivities.map((activity) => (
            <div className="activity-row" key={activity.id}>
              <span className={`activity-icon activity-${activity.status}`}><TruckIcon /></span>
              <div><b>{activity.description}</b><small>{dateLabel(activity.created_at.slice(0, 10))} · {activity.status}</small></div>
              {activity.status === "recommended" && canRecommend && transfers.some((transfer) => transfer.id === activity.id) && (
                <button aria-label="Human approve transfer" className="button small-button" disabled={busy} onClick={() => void approveTransfer(activity.id)} type="button">Review</button>
              )}
            </div>
          )) : <div className="chart-empty compact-empty">No transfer records in this date range.</div>}
        </article>

        <article className="card quick-actions-card">
          <div className="card-heading"><div><h2 className="card-title">Quick actions</h2><p className="card-subtitle">Move from signal to review</p></div><Sparkles size={17} className="quick-action-spark" /></div>
          <Link className="quick-action-link" href="/inventory"><span className="quick-action-icon"><PackageCheck size={17} /></span><span><b>Review eligible stock</b><small>Open unit-level inventory</small></span><ArrowRight size={15} /></Link>
          <Link className="quick-action-link" href="/forecasts"><span className="quick-action-icon"><Activity size={17} /></span><span><b>Explore a forecast</b><small>Inspect demand history and baseline</small></span><ArrowRight size={15} /></Link>
          <Link className="quick-action-link" href="/alerts"><span className="quick-action-icon"><ShieldAlert size={17} /></span><span><b>Review shortage signals</b><small>See current network alerts</small></span><ArrowRight size={15} /></Link>
          {canRecommend && <button className="quick-action-primary" disabled={busy || loading} onClick={() => void recommendTransfer()} type="button"><Plus size={16} />{busy ? "Working..." : "Create transfer recommendation"}</button>}
        </article>
      </section>

      <div className="safety-banner"><ShieldAlert size={15} /><span>Synthetic decision support only. Verify each unit&apos;s eligibility and independently review every proposed movement with qualified personnel.</span><Link href="/#about">Safety notes <ArrowRight size={13} /></Link></div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "blue",
  loading,
}: {
  label: string;
  value?: number | string;
  detail: string;
  icon: React.ReactNode;
  tone?: string;
  loading: boolean;
}) {
  return (
    <article className="dashboard-metric">
      <div className={`metric-icon-wrap ${tone}`}>{icon}</div>
      <div className="dashboard-metric-label">{label}</div>
      <div className={`dashboard-metric-value ${typeof value === "string" ? "dashboard-metric-value-text" : ""}`}>{loading ? <span className="skeleton-value" /> : typeof value === "number" ? value.toLocaleString() : value ?? "—"}</div>
      <div className="dashboard-metric-detail">{detail}</div>
    </article>
  );
}

function TruckIcon() {
  return <Truck size={15} />;
}
