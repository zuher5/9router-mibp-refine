"use client";

import { useState, useEffect, useMemo } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { SegControl, SectionTitle, EmptyState, LoadingState, AuthNeeded } from "../_components/ui";
import { fetchUsageStats } from "../_lib/api";

export default function MobileQuotaPage() {
  const [period, setPeriod] = useState("30d");
  const [stats, setStats] = useState(null);
  const [sort, setSort] = useState("cost");
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUsageStats(period)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (!cancelled && err?.status === 401) setAuthNeeded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const rows = useMemo(() => {
    const entries = Object.entries(stats?.byProvider || {}).map(([id, d]) => ({
      id,
      requests: d.requests || 0,
      cost: d.cost || 0,
      promptTokens: d.promptTokens || 0,
      completionTokens: d.completionTokens || 0,
    }));
    entries.sort((a, b) => (sort === "cost" ? b.cost - a.cost : b.requests - a.requests));
    return entries;
  }, [stats, sort]);

  const max = rows[0] ? (sort === "cost" ? rows[0].cost : rows[0].requests) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SegControl
          label="Period"
          options={[
            { value: "7d", label: "7D" },
            { value: "30d", label: "30D" },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <SegControl
          label="Sort"
          options={[
            { value: "cost", label: "Cost" },
            { value: "requests", label: "Reqs" },
          ]}
          value={sort}
          onChange={setSort}
        />
      </div>

      {authNeeded ? <AuthNeeded /> : null}

      <SectionTitle>Spend by provider</SectionTitle>

      {loading && !stats ? (
        <LoadingState>Loading quota</LoadingState>
      ) : !rows.length ? (
        <EmptyState icon="data_usage">No usage in this period</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const color = AI_PROVIDERS[r.id]?.color || "#6b7280";
            const pct = max > 0 ? Math.max(3, Math.round(((sort === "cost" ? r.cost : r.requests) / max) * 100)) : 0;
            return (
              <div key={r.id} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text truncate">{AI_PROVIDERS[r.id]?.name || r.id}</span>
                  <span className="text-[11px] font-mono font-bold text-warning shrink-0">
                    {sort === "cost" ? `$${r.cost.toFixed(3)}` : `${r.requests.toLocaleString()} req`}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-subtle overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
                  <span>{r.requests.toLocaleString()} req</span>
                  <span>${r.cost.toFixed(3)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
