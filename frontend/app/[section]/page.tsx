"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/dashboard/AppShell";
import { api, getToken } from "@/lib/api";

const titles: Record<string, string> = {
  inventory: "Inventory Management",
  facilities: "Facilities",
  alerts: "Shortage Alerts",
  forecasts: "Demand Forecasts",
  transfers: "Transfer Recommendations",
  "cold-chain": "Cold-Chain Events",
  analytics: "Network Analytics",
  settings: "Settings",
};

type User = { email: string; role: string };

function getStoredUser(): User | null {
  try {
    const user = JSON.parse(window.localStorage.getItem("bloodflow_user") ?? "null") as User | null;
    return user && typeof user.email === "string" && typeof user.role === "string" ? user : null;
  } catch {
    return null;
  }
}

export default function SectionPage() {
  const router = useRouter();
  const params = useParams<{ section: string }>();
  const section = params.section;
  const title = titles[section];
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState("");

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
    const paths: Record<string, string> = {
      inventory: "/api/inventory/units?limit=100",
      facilities: "/api/facilities",
      alerts: "/api/alerts",
      transfers: "/api/transfers",
      analytics: "/api/analytics/network",
      forecasts: "/api/facilities",
      "cold-chain": "/api/temperature-events",
    };
    if (section === "settings") {
      setRows([{ environment: "Simulated demo", backend: "FastAPI", database: "SQLite local / PostgreSQL deployment", safety: "Human review required" }]);
      return;
    }
    void api<unknown>(paths[section] ?? "/api/facilities")
      .then((data) => {
        const list = Array.isArray(data) ? data : [data];
        setRows(list as Record<string, unknown>[]);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load data"));
  }, [router, section]);

  if (!title) return <div className="main"><Link href="/">← Command Center</Link><h1>Page not found</h1></div>;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].filter((key) => key !== "password_hash");

  return (
    <AppShell activeHref={`/${section}`} title={title} user={user ?? { email: "Loading", role: "member" }}>
        {error && <div className="app-error" role="alert">{error}</div>}
        {section === "cold-chain" && <div className="notice">Reported breaches immediately quarantine the unit. This prototype does not provide a workflow for clearing quarantine; qualified human review is required.</div>}
        {section === "forecasts" && <div className="notice">Available prototype forecast: 7–30 day moving-average baseline. Random Forest/XGBoost training, time-based validation, uncertainty intervals, and WAPE/MAE/RMSE evaluation are not implemented.</div>}
        {section === "inventory" && <div className="card-subtitle" style={{ marginBottom: 12 }}>Unit records are shown. Only released, in-date, unreserved, normal-cold-chain stock counts as eligible.</div>}
        {rows.length ? <section className="card table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>
          {rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{typeof row[column] === "object" ? JSON.stringify(row[column]) : String(row[column] ?? "—")}</td>)}</tr>)}
        </tbody></table></section> : !error && <div className="card empty">No records available.</div>}
        <div className="notice">Operational decision support only. No compatibility decisions, transfusion decisions, or automatic transfer dispatch.</div>
    </AppShell>
  );
}
