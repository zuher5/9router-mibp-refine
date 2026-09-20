"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { setDesktopPreference } from "../layout";
import { SectionTitle, EmptyState, LoadingState, AuthNeeded, Sheet } from "../_components/ui";
import { fetchCliToolStatuses } from "../_lib/api";

// Mirrors desktop src/shared/constants/cliTools.js status logic:
// installed -> Connected, installed but not pointed at 9Router -> Not configured.
const TOOLS = [
  { id: "claude", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "opencode", name: "OpenCode" },
  { id: "droid", name: "Droid" },
  { id: "openclaw", name: "OpenClaw" },
  { id: "hermes", name: "Hermes" },
  { id: "cowork", name: "CoWork" },
  { id: "copilot", name: "Copilot" },
  { id: "cline", name: "Cline" },
  { id: "kilo", name: "Kilo" },
  { id: "deepseek-tui", name: "DeepSeek TUI" },
  { id: "jcode", name: "JCode" },
  { id: "grok-build", name: "Grok Build" },
  { id: "devin", name: "Devin" },
];

function toolStatus(status) {
  if (!status) return { key: "unknown", label: "Unknown", cls: "bg-border text-text-muted" };
  if (!status.installed) return { key: "missing", label: "Not installed", cls: "bg-border text-text-muted" };
  if (status.has9Router) return { key: "ok", label: "Connected", cls: "bg-success/10 text-success border border-success/30" };
  return { key: "idle", label: "Not configured", cls: "bg-warning/10 text-warning border border-warning/30" };
}

function DetailSheet({ tool, status, onClose }) {
  const st = toolStatus(status);
  const rows = [
    ["Status", st.label],
    ["Installed", status?.installed ? "Yes" : "No"],
    ["Points at 9Router", status?.has9Router ? "Yes" : "No"],
  ];
  if (status?.configPath) rows.push(["Config file", status.configPath]);
  return (
    <Sheet title={tool.name} subtitle={`/dashboard/cli-tools/${tool.id}`} onClose={onClose}>
      <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-bg-subtle/40">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{k}</span>
            <span className="text-xs font-semibold text-text text-right break-all">{v}</span>
          </div>
        ))}
      </div>
      <Link
        href={`/dashboard/cli-tools/${tool.id}`}
        onClick={setDesktopPreference}
        className="m-touch-target w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm active:opacity-90"
      >
        <span className="material-symbols-outlined text-[18px]">desktop_windows</span>
        Configure on desktop
      </Link>
    </Sheet>
  );
}

export default function MobileCliToolsPage() {
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      setStatuses(await fetchCliToolStatuses());
    } catch (err) {
      if (err?.status === 401) setAuthNeeded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = TOOLS.reduce(
    (acc, t) => {
      const key = toolStatus(statuses[t.id]).key;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="flex flex-col gap-3">
      {authNeeded ? <AuthNeeded /> : null}
      <SectionTitle
        right={
          <span className="text-xs font-mono text-text-muted">
            {counts.ok || 0} connected{counts.idle ? ` · ${counts.idle} idle` : ""}
          </span>
        }
      >
        CLI tools
      </SectionTitle>

      {loading ? (
        <LoadingState>Loading CLI tools</LoadingState>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {TOOLS.map((tool) => {
            const st = toolStatus(statuses[tool.id]);
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setDetail(tool)}
                className="m-touch-target flex flex-col items-start gap-1.5 p-3 rounded-xl border border-border bg-bg/90 active:bg-bg-subtle text-left"
              >
                <span className="text-xs font-bold text-text truncate w-full">{tool.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-text-muted px-1">
        Status reflects the machine running 9Router. Configuration and model tuning happen in the desktop
        CLI Tools pages.
      </p>

      {detail ? (
        <DetailSheet tool={detail} status={statuses[detail.id]} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  );
}