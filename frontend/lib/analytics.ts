export type AnalyticsFilters = {
  dateFrom: string;
  dateTo: string;
  facilityId?: string;
  county?: string;
  bloodGroup?: string;
  component?: string;
  horizonDays: 7 | 14 | 30;
};

export type AnalyticsWorkspace = {
  filters: {
    date_from: string;
    date_to: string;
    facility_id: string | null;
    county: string | null;
    blood_group: string | null;
    component: string | null;
    horizon_days: number;
  };
  synthetic_data: boolean;
  summary: {
    facility_count: number;
    total_units: number;
    eligible_units: number;
    reserved_units: number;
    quarantined_units: number;
    expired_units: number;
    expiring_7d: number;
    expiring_14d: number;
    expiring_30d: number;
    mean_daily_demand: number | null;
    history_days_with_data: number;
  };
  forecast_series: Array<{
    date: string;
    actual_demand: number | null;
    predicted_demand: number | null;
    lower_bound: number | null;
    upper_bound: number | null;
  }>;
  forecast_interval_method: string;
  forecast_quality: {
    mae: number | null;
    rmse: number | null;
    wape: number | null;
    available: boolean;
    reason: string;
  };
  supply_demand_series: Array<{
    day: number;
    date: string;
    eligible_stock: number;
    cumulative_forecast_demand: number;
  }>;
  blood_group_distribution: Array<{ blood_group: string; eligible_units: number }>;
  component_distribution: Array<{
    component: string;
    eligible: number;
    reserved: number;
    quarantined: number;
    expired: number;
    other: number;
  }>;
  inventory_status_distribution: Array<{ status: string; units: number }>;
  facility_performance: Array<{
    facility_id: string;
    facility_name: string;
    eligible_units: number;
    forecast_demand: number;
    has_demand_history: boolean;
  }>;
  stock_coverage_distribution: Array<{ coverage_band: string; facilities: number }>;
  expiry_monitoring: Array<{ horizon_days: number; units: number }>;
  transfer_activity: Array<{ status: string; count: number }>;
  recent_activity: Array<{
    id: string;
    description: string;
    status: string;
    created_at: string;
  }>;
  limitations: {
    synthetic_data: boolean;
    stock_supply_is_current_snapshot: boolean;
    historical_stock_levels_available: boolean;
    transfer_rejection_status_available: boolean;
    wastage_events_available: boolean;
  };
};

export type PublicAnalyticsPreview = {
  synthetic_data: boolean;
  summary: {
    facility_count: number;
    eligible_units: number;
    near_expiry_units: number;
    forecast_history_days: number;
    active_transfer_recommendations: number;
  };
  blood_group_distribution: Array<{ blood_group: string; eligible_units: number }>;
  demand_series: Array<{ date: string; actual_demand: number }>;
};

export function analyticsWorkspacePath(filters: AnalyticsFilters): string {
  const params = new URLSearchParams({
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    horizon_days: String(filters.horizonDays),
  });
  if (filters.facilityId) params.set("facility_id", filters.facilityId);
  if (filters.county) params.set("county", filters.county);
  if (filters.bloodGroup) params.set("blood_group", filters.bloodGroup);
  if (filters.component) params.set("component", filters.component);
  return `/api/analytics/workspace?${params.toString()}`;
}

export function dateDaysAgo(days: number, from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatComponent(value: string): string {
  return {
    whole_blood: "Whole blood",
    red_blood_cells: "Red blood cells",
    platelets: "Platelets",
    plasma: "Plasma",
  }[value] ?? value.replaceAll("_", " ");
}
