"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsWorkspace } from "@/lib/analytics";
import { formatComponent } from "@/lib/analytics";

const palette = {
  red: "#ed6672",
  redSoft: "#f29aa2",
  teal: "#51c7a1",
  blue: "#75a9f5",
  amber: "#e9b65f",
  violet: "#ac92ed",
  slate: "#8a9bb2",
  grid: "#26364a",
};

const bloodGroupColors = [
  "#ee6875",
  "#e99b67",
  "#d8b15d",
  "#79c6a9",
  "#64b8bd",
  "#7198df",
  "#a58ce5",
  "#db8cc4",
];

const tooltipStyle = {
  background: "#111e2e",
  border: "1px solid #34445a",
  borderRadius: 9,
  color: "#e6edf7",
  fontSize: 11,
};

const axisStyle = { fill: "#8292a8", fontSize: 10 };

export function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`card chart-card ${className}`}>
      <div className="card-heading">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="card-subtitle">{subtitle}</p>
        </div>
      </div>
      {children}
    </article>
  );
}

export function ChartLoading({ label = "Loading chart data..." }: { label?: string }) {
  return (
    <div aria-label={label} className="chart-loading" role="status">
      <span className="skeleton-line skeleton-line-wide" />
      <span className="skeleton-chart" />
      <span className="skeleton-line" />
    </div>
  );
}

export function ChartEmpty({ message = "No data is available for these filters." }: { message?: string }) {
  return <div className="chart-empty">{message}</div>;
}

export function DemandForecastChart({ data }: { data: AnalyticsWorkspace["forecast_series"] }) {
  const chartData = data.map((point) => ({
    ...point,
    forecast_band: point.lower_bound === null || point.upper_bound === null
      ? null
      : [point.lower_bound, point.upper_bound],
  }));
  if (!data.some((point) => point.actual_demand !== null || point.predicted_demand !== null)) return <ChartEmpty />;
  return (
    <div aria-label="Historical and forecast demand chart" className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `Date: ${value}`} />
          <Legend wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
          <Area dataKey="forecast_band" name="Historical variability range" type="monotone" stroke="none" fill={palette.red} fillOpacity={0.14} connectNulls={false} />
          <Line dataKey="actual_demand" name="Observed demand" type="monotone" stroke={palette.blue} strokeWidth={2} dot={false} connectNulls={false} />
          <Line dataKey="predicted_demand" name="Moving-average baseline" type="monotone" stroke={palette.red} strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BloodGroupChart({ data }: { data: AnalyticsWorkspace["blood_group_distribution"] }) {
  const values = data.filter((item) => item.eligible_units > 0);
  if (!values.length) return <ChartEmpty />;
  return (
    <div aria-label="Eligible inventory by blood group" className="chart-frame chart-frame-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={values} dataKey="eligible_units" nameKey="blood_group" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">
            {values.map((entry) => (
              <Cell key={entry.blood_group} fill={bloodGroupColors[data.findIndex((item) => item.blood_group === entry.blood_group) % bloodGroupColors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value.toLocaleString(), "Eligible units"]} />
          <Legend wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ComponentInventoryChart({ data }: { data: AnalyticsWorkspace["component_distribution"] }) {
  const chartData = data.map((item) => ({ ...item, component_label: formatComponent(item.component) }));
  if (!chartData.length) return <ChartEmpty />;
  return (
    <div aria-label="Inventory status by blood component" className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="component_label" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
          <Bar dataKey="eligible" name="Eligible" fill={palette.teal} radius={[3, 3, 0, 0]} />
          <Bar dataKey="reserved" name="Reserved" fill={palette.blue} radius={[3, 3, 0, 0]} />
          <Bar dataKey="quarantined" name="Quarantined" fill={palette.red} radius={[3, 3, 0, 0]} />
          <Bar dataKey="expired" name="Expired" fill={palette.amber} radius={[3, 3, 0, 0]} />
          <Bar dataKey="other" name="Other / pending" fill={palette.slate} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InventoryStatusChart({ data }: { data: AnalyticsWorkspace["inventory_status_distribution"] }) {
  const colors: Record<string, string> = {
    eligible: palette.teal,
    reserved: palette.blue,
    quarantined: palette.red,
    expired: palette.amber,
    other: palette.slate,
  };
  const values = data.filter((item) => item.units > 0);
  if (!values.length) return <ChartEmpty />;
  return (
    <div aria-label="Inventory status distribution" className="chart-frame chart-frame-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={values} dataKey="units" nameKey="status" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">
            {values.map((entry) => <Cell key={entry.status} fill={colors[entry.status] ?? palette.slate} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [value.toLocaleString(), "Units"]} />
          <Legend wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SupplyDemandChart({ data }: { data: AnalyticsWorkspace["supply_demand_series"] }) {
  if (!data.length) return <ChartEmpty message="Demand history is not available for the selected filters." />;
  return (
    <div aria-label="Current eligible stock compared with cumulative forecast demand" className="chart-frame">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `Date: ${value}`} />
          <Legend wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
          <Area dataKey="eligible_stock" name="Current eligible stock" type="monotone" stroke={palette.teal} fill={palette.teal} fillOpacity={0.12} />
          <Area dataKey="cumulative_forecast_demand" name="Cumulative baseline demand" type="monotone" stroke={palette.red} fill={palette.red} fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FacilityPerformanceChart({ data }: { data: AnalyticsWorkspace["facility_performance"] }) {
  const chartData = data.map((item) => ({
    ...item,
    facility_label: item.facility_name.replace(/ (County )?Referral Hospital| Regional Hospital| Blood Centre/, ""),
  }));
  if (!chartData.length) return <ChartEmpty />;
  return (
    <div aria-label="Eligible stock and forecast demand by facility" className="chart-frame chart-frame-tall">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 14, bottom: 5, left: 5 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="facility_label" tick={axisStyle} tickLine={false} axisLine={false} width={110} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
          <Bar dataKey="eligible_units" name="Eligible stock" fill={palette.teal} radius={[0, 4, 4, 0]} />
          <Bar dataKey="forecast_demand" name="Forecast demand" fill={palette.red} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StockCoverageChart({ data }: { data: AnalyticsWorkspace["stock_coverage_distribution"] }) {
  const colors: Record<string, string> = {
    critical: palette.red,
    high: palette.amber,
    medium: palette.blue,
    low: palette.teal,
    no_history: palette.slate,
  };
  const labels: Record<string, string> = { no_history: "No demand history" };
  const values = data.filter((item) => item.facilities > 0);
  if (!values.length) return <ChartEmpty />;
  return (
    <div aria-label="Rule-based facility stock coverage bands" className="chart-frame chart-frame-donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={values} dataKey="facilities" nameKey="coverage_band" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">
            {values.map((entry) => <Cell key={entry.coverage_band} fill={colors[entry.coverage_band] ?? palette.slate} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [value, labels[name] ?? name]} />
          <Legend formatter={(value) => labels[String(value)] ?? String(value)} wrapperStyle={{ color: "#a6b3c5", fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExpiryChart({ data }: { data: AnalyticsWorkspace["expiry_monitoring"] }) {
  if (!data.length) return <ChartEmpty />;
  return (
    <div aria-label="Eligible inventory expiring within selected horizons" className="chart-frame chart-frame-short">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="horizon_days" tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}d`} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `Within ${value} days`} />
          <Bar dataKey="units" name="Eligible units expiring" fill={palette.amber} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TransferActivityChart({ data }: { data: AnalyticsWorkspace["transfer_activity"] }) {
  const colors: Record<string, string> = {
    recommended: palette.violet,
    approved: palette.blue,
    completed: palette.teal,
    blocked: palette.red,
  };
  if (!data.length) return <ChartEmpty />;
  return (
    <div aria-label="Transfer activity by current status" className="chart-frame chart-frame-short">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="status" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" name="Transfers" radius={[5, 5, 0, 0]}>
            {data.map((entry) => <Cell key={entry.status} fill={colors[entry.status] ?? palette.slate} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
