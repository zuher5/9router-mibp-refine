"use client";

import Link from "next/link";
import { setDesktopPreference } from "../layout";

const GROUPS = [
  {
    title: "Routing",
    items: [
      { href: "/m/endpoint", label: "Endpoint & Keys", desc: "API URL and access keys", icon: "api" },
      { href: "/m/combos", label: "Combos", desc: "Model routing combos", icon: "layers" },
      { href: "/m/pools", label: "Proxy Pools", desc: "Outbound proxy pools", icon: "lan" },
      { href: "/m/quota", label: "Quota", desc: "Spend by provider", icon: "data_usage" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/m/profile", label: "Profile & Access", desc: "Login, version, session", icon: "person" },
      { href: "/m/settings", label: "About this app", desc: "Mobile build info", icon: "info" },
    ],
  },
];

const DESKTOP_ONLY = [
  { href: "/dashboard/translator", label: "Translator", icon: "translate" },
  { href: "/dashboard/mitm", label: "Antigravity MITM", icon: "security" },
  { href: "/dashboard/skills", label: "Skills", icon: "extension" },
  { href: "/dashboard/token-saver", label: "Token Saver", icon: "savings" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal" },
  { href: "/dashboard/media-providers/web", label: "Web Fetch & Search", icon: "travel_explore" },
];

export default function MobileMorePage() {
  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider px-1">{g.title}</span>
          <div className="rounded-xl border border-border bg-bg/90 divide-y divide-border/60 overflow-hidden">
            {g.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="m-touch-target flex items-center gap-3 px-3.5 py-2.5 active:bg-bg-subtle"
              >
                <span className="material-symbols-outlined text-[20px] text-primary shrink-0">{item.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-text">{item.label}</span>
                  <span className="block text-[11px] text-text-muted truncate">{item.desc}</span>
                </span>
                <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0">chevron_right</span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-text-muted uppercase tracking-wider px-1">Desktop pages</span>
        <div className="rounded-xl border border-border bg-bg/90 divide-y divide-border/60 overflow-hidden">
          {DESKTOP_ONLY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={setDesktopPreference}
              className="m-touch-target flex items-center gap-3 px-3.5 py-2.5 active:bg-bg-subtle"
            >
              <span className="material-symbols-outlined text-[20px] text-text-muted shrink-0">{item.icon}</span>
              <span className="flex-1 min-w-0 text-xs font-semibold text-text">{item.label}</span>
              <span className="material-symbols-outlined text-[16px] text-text-muted shrink-0">desktop_windows</span>
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-text-muted px-1">These open the full desktop view.</p>
      </div>
    </div>
  );
}
