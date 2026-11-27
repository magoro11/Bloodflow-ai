"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Boxes,
  ChevronDown,
  Droplets,
  LayoutDashboard,
  Map,
  Menu,
  PanelLeftClose,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Truck,
  X,
} from "lucide-react";

const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "Facilities", href: "/facilities", icon: Map },
  { label: "PredictAI", href: "/forecasts", icon: Sparkles },
  { label: "Shortage alerts", href: "/alerts", icon: ShieldAlert },
  { label: "Transfers", href: "/transfers", icon: Truck },
  { label: "Cold chain", href: "/cold-chain", icon: Droplets },
  { label: "Analytics", href: "/analytics", icon: Activity },
];

export type AppFacility = { id: string; name: string; county: string };

export function AppShell({
  children,
  title,
  eyebrow = "BloodFlow AI · Network operations",
  activeHref,
  user,
  facilities = [],
  facilityId = "",
  onFacilityChange,
  notificationCount = 0,
  allowAllFacilities = true,
  appearance = "blood-inventory",
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
  activeHref: string;
  user: { email: string; role: string };
  facilities?: AppFacility[];
  facilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  notificationCount?: number;
  allowAllFacilities?: boolean;
  appearance?: "default" | "blood-inventory";
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const filteredNavigation = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? navigation.filter((item) => item.label.toLowerCase().includes(needle)) : navigation;
  }, [search]);

  function signOut() {
    window.localStorage.removeItem("bloodflow_token");
    window.localStorage.removeItem("bloodflow_user");
    router.replace("/login");
  }

  function closeMenus() {
    setMobileOpen(false);
    setSearchOpen(false);
    setProfileOpen(false);
  }

  return (
    <div className={`app-shell ${appearance === "blood-inventory" ? "app-shell-inventory" : ""} ${collapsed ? "app-shell-collapsed" : ""} ${mobileOpen ? "app-shell-mobile-open" : ""}`}>
      {mobileOpen && <button aria-label="Close navigation" className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
      <aside className="app-sidebar">
        <Link aria-label="BloodFlow AI public homepage" className="app-brand" href="/" onClick={closeMenus}>
          <span className="brand-mark"><Droplets size={18} strokeWidth={2.2} /></span>
          <span className="app-brand-copy">BloodFlow <b>AI</b></span>
        </Link>
        <div className="app-sidebar-label">Workspace</div>
        <nav aria-label="Main navigation" className="app-nav">
          {navigation.map(({ label, href, icon: Icon }) => (
            <Link
              aria-current={activeHref === href ? "page" : undefined}
              className={`app-nav-link ${activeHref === href ? "active" : ""}`}
              href={href}
              key={href}
              onClick={closeMenus}
              title={collapsed ? label : undefined}
            >
              <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          <div className="app-data-status"><span /> SIMULATED DEMO DATA</div>
          <Link className="app-nav-link" href="/settings" onClick={closeMenus}>
            <Settings aria-hidden="true" size={18} strokeWidth={1.8} /><span>Settings</span>
          </Link>
          <Link className="app-back-home" href="/" onClick={closeMenus}>← Back to homepage</Link>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-leading">
            <button
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              className="icon-button mobile-menu-button"
              onClick={() => setMobileOpen((value) => !value)}
              type="button"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="icon-button sidebar-collapse-button"
              onClick={() => setCollapsed((value) => !value)}
              type="button"
            >
              <PanelLeftClose size={17} />
            </button>
            <div className="app-page-heading">
              <div className="eyebrow">{eyebrow}</div>
              <h1 className="title">{title}</h1>
            </div>
          </div>
          <div className="app-topbar-actions">
            <div className={`global-search ${searchOpen ? "is-open" : ""}`}>
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="Search workspace"
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 140)}
                onChange={(event) => setSearch(event.target.value)}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setSearchOpen(false);
                  if (event.key === "Enter" && filteredNavigation[0]) {
                    router.push(filteredNavigation[0].href);
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Search workspace"
                value={search}
              />
              {searchOpen && search.trim() && (
                <div className="search-results">
                  {filteredNavigation.length ? filteredNavigation.map((item) => (
                    <Link href={item.href} key={item.href} onClick={() => { setSearch(""); closeMenus(); }}>
                      {item.label}<span>Open</span>
                    </Link>
                  )) : <div className="search-no-results">No matching pages</div>}
                </div>
              )}
            </div>
            {facilities.length > 0 && onFacilityChange && (
              <label className="facility-picker">
                <Map aria-hidden="true" size={15} />
                <select aria-label="Select facility" disabled={!allowAllFacilities && facilities.length === 1} onChange={(event) => onFacilityChange(event.target.value)} value={facilityId}>
                  {allowAllFacilities && <option value="">All accessible facilities</option>}
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>{facility.name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" size={14} />
              </label>
            )}
            <Link aria-label={`Notifications${notificationCount ? `, ${notificationCount} active` : ""}`} className="icon-button notification-button" href="/alerts">
              <Bell size={17} />
              {notificationCount > 0 && <span className="notification-count">{notificationCount > 9 ? "9+" : notificationCount}</span>}
            </Link>
            <div className="profile-wrap">
              <button
                aria-expanded={profileOpen}
                aria-label="Open profile menu"
                className="profile-button"
                onClick={() => setProfileOpen((value) => !value)}
                type="button"
              >
                <span className="profile-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
                <span className="profile-copy"><b>{user.email}</b><small>{user.role.replaceAll("_", " ")}</small></span>
                <ChevronDown aria-hidden="true" size={14} />
              </button>
              {profileOpen && (
                <div className="profile-menu">
                  <div className="profile-menu-email">{user.email}</div>
                  <button onClick={signOut} type="button">Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
