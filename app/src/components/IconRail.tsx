import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { L } from "../labels.ts";

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const items = [
  { to: "/", label: L.nav.home, end: true, icon: icon("M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10") },
  { to: "/leads", label: L.nav.leads, end: false, icon: icon("M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z") },
  { to: "/pipeline", label: L.nav.opportunities, end: false, icon: icon("M3 6h5v12H3zM10 6h5v8h-5zM17 6h4v5h-4z") },
  { to: "/contacts", label: L.nav.contacts, end: false, icon: icon("M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-7 8-7s8 3 8 7") },
  { to: "/accounts", label: L.nav.accounts, end: false, icon: icon("M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2") },
];

export default function IconRail() {
  return (
    <nav className="rail" aria-label={L.app.name}>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} title={i.label} aria-label={i.label} className={({ isActive }) => (isActive ? "rail-link active" : "rail-link")}>
          {i.icon}
        </NavLink>
      ))}
    </nav>
  );
}
