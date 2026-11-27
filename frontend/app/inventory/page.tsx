"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BloodGroupChart,
  ChartCard,
  ChartEmpty,
  ChartLoading,
  ComponentInventoryChart,
  ExpiryChart,
  InventoryStatusChart,
} from "@/components/charts/AnalyticsCharts";
import { AppShell, type AppFacility } from "@/components/dashboard/AppShell";
import { api, getToken } from "@/lib/api";
import { analyticsWorkspacePath, dateDaysAgo, type AnalyticsWorkspace } from "@/lib/analytics";

type Facility = AppFacility;

type InventoryUnit = {
  id: string;
  facility_id: string;
  blood_group: string;
  component: string;
  collection_date: string;
  expiry_date: string;
  screening_status: string;
  reservation_status: string;
  cold_chain_status: string;
  transfer_id: string | null;
};

type User = {
  email: string;
  role: string;
  facility_id: string | null;
};

type FilterStatus = "all" | "eligible" | "expiring" | "reserved" | "quarantined" | "expired";

const groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const components = [
  ["whole_blood", "Whole blood"],
  ["red_blood_cells", "Red blood cells"],
  ["platelets", "Platelets"],
  ["plasma", "Plasma"],
];
const pageSize = 20;

function isEligible(unit: InventoryUnit): boolean {
  return (
    unit.screening_status === "released" &&
    unit.reservation_status === "available" &&
    unit.cold_chain_status === "normal" &&
    unit.expiry_date >= new Date().toISOString().slice(0, 10)
  );
}

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatComponent(value: string): string {
  return components.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export default function InventoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [componentFilter, setComponentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [chartsLoading, setChartsLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartsError, setChartsError] = useState("");
  const [analytics, setAnalytics] = useState<AnalyticsWorkspace | null>(null);
  const [chartsRefreshKey, setChartsRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [registerFacilityId, setRegisterFacilityId] = useState("");
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [component, setComponent] = useState("red_blood_cells");
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(dateAfter(35));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextFacilities = await api<Facility[]>("/api/facilities");
      const nextUnits: InventoryUnit[] = [];
      for (let offset = 0; ; offset += 500) {
        const batch = await api<InventoryUnit[]>(`/api/inventory/units?limit=500&offset=${offset}`);
        nextUnits.push(...batch);
        if (batch.length < 500) break;
      }
      const accessibleFacilities = user?.facility_id
        ? nextFacilities.filter((facility) => facility.id === user.facility_id)
        : nextFacilities;
      setFacilities(accessibleFacilities);
      setUnits(nextUnits);
      setRegisterFacilityId((current) => current || accessibleFacilities[0]?.id || "");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not load inventory.";
      if (message.toLowerCase().includes("bearer token")) router.replace("/login");
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [router, user?.facility_id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const currentUser = JSON.parse(window.localStorage.getItem("bloodflow_user") ?? "null") as User | null;
    setFacilityFilter(currentUser?.facility_id ?? "");
    setUser(currentUser);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setChartsLoading(true);
    setChartsError("");
    api<AnalyticsWorkspace>(analyticsWorkspacePath({
      dateFrom: dateDaysAgo(29),
      dateTo: dateDaysAgo(0),
      facilityId: facilityFilter || undefined,
      bloodGroup: groupFilter || undefined,
      component: componentFilter || undefined,
      horizonDays: 7,
    }))
      .then((data) => { if (active) setAnalytics(data); })
      .catch((reason: unknown) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "Could not load inventory charts.";
        if (message.toLowerCase().includes("bearer token")) router.replace("/login");
        else setChartsError(message);
      })
      .finally(() => { if (active) setChartsLoading(false); });
    return () => { active = false; };
  }, [chartsRefreshKey, componentFilter, facilityFilter, groupFilter, router, user]);

  useEffect(() => {
    if (user) void loadData();
  }, [loadData, user]);

  const facilityNames = useMemo(
    () => new Map(facilities.map((facility) => [facility.id, facility.name])),
    [facilities],
  );
  const scopedUnits = useMemo(
    () => units.filter((unit) => !facilityFilter || unit.facility_id === facilityFilter),
    [facilityFilter, units],
  );
  const eligibleCount = useMemo(() => scopedUnits.filter(isEligible).length, [scopedUnits]);
  const expiryCount = useMemo(
    () => scopedUnits.filter((unit) => isEligible(unit) && daysUntil(unit.expiry_date) <= 7).length,
    [scopedUnits],
  );
  const quarantineCount = useMemo(
    () => scopedUnits.filter((unit) => unit.screening_status === "quarantined" || unit.cold_chain_status === "breach").length,
    [scopedUnits],
  );

  const filteredUnits = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scopedUnits.filter((unit) => {
      const facilityName = facilityNames.get(unit.facility_id) ?? "";
      const matchesSearch =
        !needle ||
        unit.id.toLowerCase().includes(needle) ||
        unit.blood_group.toLowerCase().includes(needle) ||
        facilityName.toLowerCase().includes(needle);
      const matchesGroup = !groupFilter || unit.blood_group === groupFilter;
      const matchesComponent = !componentFilter || unit.component === componentFilter;
      const remainingDays = daysUntil(unit.expiry_date);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "eligible" && isEligible(unit)) ||
        (statusFilter === "expiring" && isEligible(unit) && remainingDays <= 7) ||
        (statusFilter === "reserved" && unit.reservation_status === "reserved") ||
        (statusFilter === "quarantined" && (unit.screening_status === "quarantined" || unit.cold_chain_status === "breach")) ||
        (statusFilter === "expired" && remainingDays < 0);
      return matchesSearch && matchesGroup && matchesComponent && matchesStatus;
    });
  }, [scopedUnits, facilityNames, search, groupFilter, componentFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredUnits.length / pageSize));
  const visibleUnits = filteredUnits.slice((page - 1) * pageSize, page * pageSize);
  const canRegister = user?.role !== "read_only_analyst" && facilities.length > 0;

  function updateFilter<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  async function registerUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await api<InventoryUnit>("/api/inventory/units", {
        method: "POST",
        body: JSON.stringify({
          facility_id: registerFacilityId,
          blood_group: bloodGroup,
          component,
          collection_date: collectionDate,
          expiry_date: expiryDate,
          screening_status: "released",
          reservation_status: "available",
          cold_chain_status: "normal",
        }),
      });
      setShowForm(false);
      await loadData();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not register unit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      activeHref="/inventory"
      allowAllFacilities={!user?.facility_id}
      facilities={facilities}
      facilityId={facilityFilter}
      onFacilityChange={(value) => { setFacilityFilter(value); setPage(1); }}
      title="Inventory"
      user={user ?? { email: "Loading", role: "member" }}
    >
      <div className="inventory-page">
        <header className="inventory-page-intro">
          <div>
            <p className="inventory-lede">Unit-level visibility with eligibility and expiry status at a glance.</p>
            <span className="badge"><span className="status-dot" /> SIMULATED DATA</span>
          </div>
          <div className="toolbar">
            {canRegister && <button className="button primary" onClick={() => { setFormError(""); setShowForm(true); }}>＋ Register unit</button>}
          </div>
        </header>

        <div className="inventory-safety"><span>i</span><div><strong>Eligibility is checked server-side.</strong> Expired, unreleased, reserved, or cold-chain-breach units are excluded from available stock.</div></div>
        {error && <div className="inventory-error" role="alert"><span>{error}</span><button className="button" onClick={() => void loadData()}>Retry</button></div>}

        <section className="grid metric-grid inventory-metrics" aria-label="Inventory summary">
          <InventoryMetric label="Total unit records" value={loading ? "—" : scopedUnits.length.toLocaleString()} detail="Individual inventory units" icon="▤" />
          <InventoryMetric label="Eligible available" value={loading ? "—" : eligibleCount.toLocaleString()} detail="Released · in date · unreserved" icon="✓" tone="good" />
          <InventoryMetric label="Expiring in 7 days" value={loading ? "—" : expiryCount.toLocaleString()} detail="Review allocation and expiry" icon="◷" tone="warn" />
          <InventoryMetric label="Quarantined" value={loading ? "—" : quarantineCount.toLocaleString()} detail="Requires qualified review" icon="!" tone="bad" />
        </section>

        <div className="inventory-chart-heading"><div><span className="section-kicker">INVENTORY INTELLIGENCE</span><h2>Stock mix and expiry</h2></div><span className="chart-source-pill"><i /> API aggregates · synthetic data</span></div>
        {chartsError && <div className="inventory-error" role="alert"><span>{chartsError}</span><button className="button" onClick={() => setChartsRefreshKey((value) => value + 1)}>Retry</button></div>}
        <section className="inventory-chart-grid" aria-label="Inventory charts">
          <ChartCard subtitle="Eligible units across the current accessible scope" title="Blood group distribution">
            {chartsLoading ? <ChartLoading /> : analytics ? <BloodGroupChart data={analytics.blood_group_distribution} /> : <ChartEmpty />}
          </ChartCard>
          <ChartCard subtitle="Eligible, reserved, quarantined and expired unit counts" title="Inventory status">
            {chartsLoading ? <ChartLoading /> : analytics ? <InventoryStatusChart data={analytics.inventory_status_distribution} /> : <ChartEmpty />}
          </ChartCard>
          <ChartCard className="inventory-chart-wide" subtitle="Inventory status grouped by component" title="Component distribution">
            {chartsLoading ? <ChartLoading /> : analytics ? <ComponentInventoryChart data={analytics.component_distribution} /> : <ChartEmpty />}
          </ChartCard>
          <ChartCard className="inventory-chart-wide" subtitle="Cumulative eligible units expiring within each window" title="Expiry monitoring">
            {chartsLoading ? <ChartLoading /> : analytics ? <ExpiryChart data={analytics.expiry_monitoring} /> : <ChartEmpty />}
            <div className="chart-footnote">Expiry values are cumulative windows against current stock.</div>
          </ChartCard>
        </section>

        <section className="card inventory-card">
          <div className="inventory-heading">
            <div>
              <h2 className="card-title">Blood unit records</h2>
              <div className="card-subtitle">{filteredUnits.length.toLocaleString()} matching units · Search or filter to narrow results</div>
            </div>
            <button className="button" disabled={loading} onClick={() => void loadData()}>↻ Refresh</button>
          </div>

          <div className="inventory-filters">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input aria-label="Search inventory" onChange={(event) => updateFilter(setSearch, event.target.value)} placeholder="Search unit, group, or facility" value={search} />
            </label>
            <label className="filter-field"><span>Blood group</span><select aria-label="Filter by blood group" onChange={(event) => updateFilter(setGroupFilter, event.target.value)} value={groupFilter}><option value="">All groups</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
            <label className="filter-field"><span>Component</span><select aria-label="Filter by component" onChange={(event) => updateFilter(setComponentFilter, event.target.value)} value={componentFilter}><option value="">All components</option>{components.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="filter-field"><span>Stock status</span><select aria-label="Filter by stock status" onChange={(event) => updateFilter(setStatusFilter, event.target.value as FilterStatus)} value={statusFilter}>
              <option value="all">All statuses</option><option value="eligible">Eligible</option><option value="expiring">Expiring soon</option><option value="reserved">Reserved</option><option value="quarantined">Quarantined</option><option value="expired">Expired</option>
            </select></label>
          </div>

          <div className="table-wrap inventory-table-wrap">
            <table className="inventory-table">
              <thead><tr><th>Blood product</th><th>Facility</th><th>Collection date</th><th>Expiry date</th><th>Screening</th><th>Cold chain</th><th>Reservation</th><th>Eligibility</th></tr></thead>
              <tbody>
                {loading && <tr><td className="inventory-empty" colSpan={8}><span className="button-spinner" /> Loading inventory records...</td></tr>}
                {!loading && visibleUnits.map((unit) => (
                  <tr key={unit.id}>
                    <td><span className="group-badge">{unit.blood_group}</span><span className="product-name">{formatComponent(unit.component)}</span><small className="unit-reference">{unit.id.slice(0, 8).toUpperCase()}</small></td>
                    <td><strong className="facility-cell">{facilityNames.get(unit.facility_id) ?? "Unknown facility"}</strong></td>
                    <td>{formatDate(unit.collection_date)}</td>
                    <td><span className={daysUntil(unit.expiry_date) <= 7 ? "date-warning" : ""}>{formatDate(unit.expiry_date)}</span>{daysUntil(unit.expiry_date) <= 7 && daysUntil(unit.expiry_date) >= 0 && <small className="expiry-note">{daysUntil(unit.expiry_date) === 0 ? "Expires today" : `${daysUntil(unit.expiry_date)} days left`}</small>}</td>
                    <td><StatusTag value={unit.screening_status} /></td>
                    <td><StatusTag value={unit.cold_chain_status} /></td>
                    <td><StatusTag value={unit.reservation_status} /></td>
                    <td><span className={`eligibility-tag ${isEligible(unit) ? "eligible" : "ineligible"}`}><span />{isEligible(unit) ? "Eligible" : "Excluded"}</span></td>
                  </tr>
                ))}
                {!loading && !visibleUnits.length && <tr><td className="inventory-empty" colSpan={8}>{scopedUnits.length ? "No units match these filters. Try broadening your search." : "No inventory records yet. Register a unit to get started."}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="inventory-pagination">
            <span>Showing {filteredUnits.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredUnits.length)} of {filteredUnits.length}</span>
            <div className="toolbar"><button className="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>← Previous</button><span className="page-number">{page} / {pageCount}</span><button className="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next →</button></div>
          </div>
        </section>
        <div className="inventory-footnote">Decision support only · Verify each unit&apos;s screening and cold-chain status with qualified personnel before operational use.</div>
      {showForm && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <section aria-labelledby="register-title" aria-modal="true" className="unit-modal" role="dialog">
            <div className="modal-heading"><div><div className="eyebrow">INVENTORY INTAKE</div><h2 id="register-title">Register blood unit</h2><p>New records are marked available only when screening and cold-chain status are clear.</p></div><button aria-label="Close dialog" className="modal-close" onClick={() => setShowForm(false)}>×</button></div>
            <form onSubmit={registerUnit}>
              <label className="field">Facility<select required value={registerFacilityId} onChange={(event) => setRegisterFacilityId(event.target.value)}>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name} · {facility.county}</option>)}</select></label>
              <div className="unit-form-row">
                <label className="field">Blood group<select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)}>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
                <label className="field">Component<select value={component} onChange={(event) => setComponent(event.target.value)}>{components.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <div className="unit-form-row">
                <label className="field">Collection date<input type="date" max={new Date().toISOString().slice(0, 10)} required value={collectionDate} onChange={(event) => setCollectionDate(event.target.value)} /></label>
                <label className="field">Expiry date<input type="date" required value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></label>
              </div>
              {formError && <p className="login-error" role="alert">{formError}</p>}
              <div className="modal-actions"><button className="button" onClick={() => setShowForm(false)} type="button">Cancel</button><button className="button primary" disabled={saving} type="submit">{saving ? "Saving..." : "Save unit"}</button></div>
            </form>
          </section>
        </div>
      )}
      </div>
    </AppShell>
  );
}

function InventoryMetric({ label, value, detail, icon, tone = "" }: { label: string; value: string; detail: string; icon: string; tone?: string }) {
  return (
    <article className="card inventory-metric">
      <div className="inventory-metric-top"><span className="metric-label">{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">{detail}</div>
    </article>
  );
}

function StatusTag({ value }: { value: string }) {
  const normalized = value.replaceAll("_", " ");
  const tone = ["released", "normal", "available"].includes(value) ? "status-good" : ["quarantined", "breach"].includes(value) ? "status-danger" : "status-neutral";
  return <span className={`status-tag ${tone}`}><span />{normalized}</span>;
}
