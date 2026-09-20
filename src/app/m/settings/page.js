"use client";

import Link from "next/link";

export default function MobileSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">MOBILE APP SETTINGS</h2>

      <div className="rounded-xl border border-border bg-bg/90 divide-y divide-border/60 overflow-hidden">
        <div className="p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-text">9Router Web Edition</p>
            <p className="text-[10px] text-text-muted">v1.0.13 Mobile-Optimized</p>
          </div>
          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">READY</span>
        </div>

        <Link
          href="/dashboard/usage"
          className="p-3.5 flex items-center justify-between text-text hover:bg-bg-subtle transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-primary">desktop_windows</span>
            <span className="text-xs font-semibold">Switch to Full Desktop View</span>
          </div>
          <span className="material-symbols-outlined text-[16px] text-text-muted">chevron_right</span>
        </Link>
      </div>

      <div className="p-3.5 rounded-xl border border-border/70 bg-bg-subtle/40 text-center">
        <p className="text-xs text-text-muted">
          Optimized for Android Chrome PWA and Native WebView wrappers.
        </p>
      </div>
    </div>
  );
}
