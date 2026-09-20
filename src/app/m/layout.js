"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import PropTypes from "prop-types";
import "./mobile.css";

// Five primary destinations. Everything else lives under the More hub
// so primary actions stay one thumb tap away.
const NAV_ITEMS = [
  { href: "/m/usage", label: "Usage", icon: "monitoring" },
  { href: "/m/providers", label: "Providers", icon: "hub" },
  { href: "/m/chat", label: "Chat", icon: "chat" },
  { href: "/m/logs", label: "Logs", icon: "terminal" },
  { href: "/m/more", label: "More", icon: "apps" },
];

export function setDesktopPreference() {
  try {
    document.cookie = "pref_desktop=1; path=/; max-age=31536000; SameSite=Lax";
  } catch {
    /* ignore */
  }
}

function isActivePath(pathname, href) {
  if (pathname === href) return true;
  // Sub-pages (endpoint, combos, pools, quota, profile) highlight the More tab.
  if (href === "/m/more") {
    return ["/m/endpoint", "/m/combos", "/m/pools", "/m/quota", "/m/profile", "/m/settings"].some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
  }
  return pathname.startsWith(`${href}/`);
}

export default function MobileLayout({ children }) {
  const pathname = usePathname() || "";

  return (
    <div className="flex flex-col min-h-dvh w-full bg-bg text-text select-none antialiased">
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-bg/85 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="9Router" className="w-6 h-6 object-contain" />
          <span className="font-bold text-base tracking-tight text-primary">9Router</span>
          <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-primary/10 text-primary border border-primary/20">
            Mobile
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/usage"
            onClick={setDesktopPreference}
            className="m-touch-target flex items-center gap-1 text-xs text-text-muted hover:text-text px-2 py-1 rounded-md border border-border/60 bg-bg-subtle"
            title="Desktop Mode"
          >
            <span className="material-symbols-outlined text-[15px]">desktop_windows</span>
            <span>Desktop</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-3.5 py-4 pb-24 overflow-x-hidden">
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="m-bottom-nav fixed bottom-0 inset-x-0 z-50 flex items-stretch justify-around h-16 bg-bg/95 backdrop-blur-lg border-t border-border shadow-lg max-w-lg mx-auto"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`m-touch-target flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors ${
                active ? "text-primary font-semibold" : "text-text-muted hover:text-text"
              }`}
            >
              <span className={`material-symbols-outlined text-[22px] ${active ? "scale-110" : ""}`}>
                {item.icon}
              </span>
              <span className="text-[11px] leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

MobileLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
