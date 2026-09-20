"use client";

import PropTypes from "prop-types";
import { AI_PROVIDERS } from "@/shared/constants/providers";

export default function MobileProviderSheet({ provider, stats, onClose }) {
  if (!provider) return null;

  const config = AI_PROVIDERS[provider.provider] || { color: "#6b7280", name: provider.provider };
  const pid = provider.provider?.toLowerCase();
  const stat = stats?.byProvider?.[pid] || { requests: 0, cost: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0 };
  
  const activeModels = (stats?.activeRequests || [])
    .filter((r) => r.provider?.toLowerCase() === pid)
    .map((r) => r.model);

  const fmt = (n) => (n || 0).toLocaleString();
  const fmtTokens = (n) => {
    if (!n) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg bg-bg rounded-t-2xl border-t border-border p-5 shadow-2xl z-10 flex flex-col gap-4 animate-slide-up">
        {/* Drag handle pill */}
        <div className="w-10 h-1 rounded-full bg-border mx-auto -mt-1 mb-1" />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0"
              style={{ backgroundColor: `${config.color || "#6b7280"}20`, color: config.color || "#6b7280" }}
            >
              {(config.textIcon || provider.provider.slice(0, 2)).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-bold text-text leading-snug">{config.name || provider.provider}</h3>
              <p className="text-xs font-mono text-text-muted">{provider.provider}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-text-muted hover:text-text hover:bg-bg-subtle"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Status Live */}
        {activeModels.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-success animate-ping" />
            <span className="truncate">Active Now: {activeModels.join(", ")}</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="p-3 rounded-xl border border-border bg-bg-subtle/50">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">REQUESTS</span>
            <span className="text-xl font-bold text-text">{fmt(stat.requests)}</span>
          </div>
          <div className="p-3 rounded-xl border border-border bg-bg-subtle/50">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">EST. COST</span>
            <span className="text-xl font-bold text-warning">${(stat.cost || 0).toFixed(3)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl border border-border bg-bg-subtle/50 text-center">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block mb-0.5">INPUT</span>
            <span className="text-sm font-bold text-primary">{fmtTokens(stat.promptTokens)}</span>
          </div>
          <div className="p-2.5 rounded-xl border border-border bg-bg-subtle/50 text-center">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block mb-0.5">CACHED</span>
            <span className="text-sm font-bold text-info">{fmtTokens(stat.cachedTokens)}</span>
          </div>
          <div className="p-2.5 rounded-xl border border-border bg-bg-subtle/50 text-center">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block mb-0.5">OUTPUT</span>
            <span className="text-sm font-bold text-success">{fmtTokens(stat.completionTokens)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm active:opacity-90"
        >
          Close
        </button>
      </div>
    </div>
  );
}

MobileProviderSheet.propTypes = {
  provider: PropTypes.object,
  stats: PropTypes.object,
  onClose: PropTypes.func.isRequired,
};
