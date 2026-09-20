"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MobileProviderSheet from "../_components/MobileProviderSheet";
import { Sheet, SegControl, SectionTitle, EmptyState, LoadingState, AuthNeeded } from "../_components/ui";
import { MOBILE_PERIODS, fmtTokens, timeAgo } from "../_lib/format";
import { fetchUsageStats, fetchUsageChart, fetchMobileProviders } from "../_lib/api";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const MobileProviderTopology = dynamic(() => import("../_components/MobileProviderTopology"), { ssr: false });

function providerColor(id) {
  return AI_PROVIDERS[id]?.color || "#6b7280";
}

function RequestDetail({ request, onClose }) {
  if (!request) return null;
  const ok = !request.status || request.status === "ok" || request.status === "success";
  const rows = [
    ["Model", request.model || "unknown", true],
    ["Provider", request.provider || "-", false],
    ["Status", ok ? "success" : String(request.status), false],
    ["Time", request.timestamp ? new Date(request.timestamp).toLocaleString() : "-", false],
    ["Input tokens", fmtTokens(request.promptTokens), true],
    ["Cached tokens", fmtTokens(request.cachedTokens), true],
    ["Output tokens", fmtTokens(request.completionTokens), true],
    ["Cost", request.cost != null ? `$${Number(request.cost).toFixed(5)}` : "-", true],
    ["Latency", request.latencyMs != null ? `${request.latencyMs} ms` : "-", true],
    ["Connection", request.connectionId ? String(request.connectionId).slice(0, 12) : "-", true],
  ];
  return (
    <Sheet title={request.model || "Request"} subtitle={request.provider} onClose={onClose}>
      <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-bg-subtle/40">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{k}</span>
            <span className={`text-xs font-semibold text-text text-right break-all ${mono ? "font-mono" : ""}`}>{v}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

RequestDetail.propTypes = {
  request: PropTypes.object,
  onClose: PropTypes.func.isRequired,
};

export default function MobileUsagePage() {
  const [period, setPeriod] = useState("today");
  const [chartMode, setChartMode] = useState("tokens");
  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUsageStats(period)
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setAuthNeeded(false);
        }
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

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    fetchUsageChart(period === "today" || period === "24h" ? "7d" : period)
      .then((data) => {
        if (!cancelled) setChart(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    fetchMobileProviders()
      .then((list) => {
        if (!cancelled) setProviders(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authNeeded) return;
    const es = new EventSource("/api/usage/stream");
    es.onopen = () => setIsLive(true);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: payload.activeRequests || [],
            recentRequests: payload.recentRequests || prev.recentRequests || [],
            errorProvider: payload.errorProvider ?? prev.errorProvider,
          };
        });
      } catch {}
    };
    es.onerror = () => setIsLive(false);
    return () => es.close();
  }, [authNeeded]);

  const topProviders = useMemo(() => {
    const entries = Object.entries(stats?.byProvider || {});
    return entries
      .map(([id, d]) => ({ id, requests: d.requests || 0, cost: d.cost || 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [stats]);

  const totalRequests = stats?.totalRequests || 0;
  const totalCost = stats?.totalCost || 0;
  const promptTokens = stats?.totalPromptTokens || 0;
  const cachedTokens = stats?.totalCachedTokens || 0;
  const completionTokens = stats?.totalCompletionTokens || 0;
  const lastProvider = stats?.recentRequests?.[0]?.provider || "";
  const errorProvider = stats?.errorProvider || "";
  const hasChart = chart.some((d) => (d.tokens || 0) > 0 || (d.cost || 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <SegControl label="Period" options={MOBILE_PERIODS} value={period} onChange={setPeriod} />
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-bg-subtle text-[11px] font-semibold shrink-0">
          <span className={`w-2 h-2 rounded-full ${isLive ? "bg-success" : "bg-text-muted"}`} />
          <span className={isLive ? "text-success" : "text-text-muted"}>{isLive ? "LIVE" : "OFFLINE"}</span>
        </div>
      </div>

      {authNeeded ? <AuthNeeded /> : null}

      {loading && !stats ? (
        <LoadingState>Loading usage</LoadingState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3.5 rounded-xl border border-border bg-bg/80 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Total requests</span>
              <span className="text-2xl font-black tracking-tight text-text">{totalRequests.toLocaleString()}</span>
            </div>
            <div className="p-3.5 rounded-xl border border-border bg-bg/80 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Est. cost</span>
              <span className="text-2xl font-black tracking-tight text-warning">${totalCost.toFixed(3)}</span>
            </div>
            <div className="p-3 rounded-xl border border-border bg-bg/80 flex items-center justify-between col-span-2">
              <div className="flex-1 text-center">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Input</span>
                <span className="text-sm font-bold text-primary font-mono">{fmtTokens(promptTokens)}</span>
              </div>
              <div className="w-[1px] h-6 bg-border" aria-hidden="true" />
              <div className="flex-1 text-center">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Cached</span>
                <span className="text-sm font-bold text-info font-mono">{fmtTokens(cachedTokens)}</span>
              </div>
              <div className="w-[1px] h-6 bg-border" aria-hidden="true" />
              <div className="flex-1 text-center">
                <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">Output</span>
                <span className="text-sm font-bold text-success font-mono">{fmtTokens(completionTokens)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle
              right={
                <SegControl
                  label="Chart mode"
                  options={[
                    { value: "tokens", label: "Tokens" },
                    { value: "cost", label: "Cost" },
                  ]}
                  value={chartMode}
                  onChange={setChartMode}
                />
              }
            >
              Traffic
            </SectionTitle>
            <div className="rounded-xl border border-border bg-bg/80 p-2">
              {chartLoading ? (
                <div className="h-[180px] flex items-center justify-center text-xs text-text-muted">Loading chart…</div>
              ) : !hasChart ? (
                <div className="h-[180px] flex items-center justify-center text-xs text-text-muted">No traffic in range</div>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chart} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} tickLine={false} axisLine={false} minTickGap={32} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (chartMode === "cost" ? `$${v}` : fmtTokens(v))} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => (chartMode === "cost" ? `$${Number(v).toFixed(4)}` : fmtTokens(v))}
                    />
                    <Area
                      type="monotone"
                      dataKey={chartMode}
                      stroke="#E56A4A"
                      strokeWidth={2}
                      fill="#E56A4A"
                      fillOpacity={0.18}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SectionTitle
              right={
                stats?.activeRequests?.length > 0 ? (
                  <span className="text-xs text-warning font-bold">{stats.activeRequests.length} active</span>
                ) : null
              }
            >
              Provider topology
            </SectionTitle>
            <MobileProviderTopology
              providers={providers}
              activeRequests={stats?.activeRequests || []}
              lastProvider={lastProvider}
              errorProvider={errorProvider}
              onSelectProvider={(p) => setSelectedProvider(p)}
            />
          </div>

          {topProviders.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <SectionTitle>Top cost</SectionTitle>
              <div className="rounded-xl border border-border bg-bg/90 divide-y divide-border/60 overflow-hidden">
                {topProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProvider({ provider: p.id })}
                    className="m-touch-target w-full flex items-center gap-3 px-3.5 py-2.5 text-left active:bg-bg-subtle"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: providerColor(p.id) }} />
                    <span className="flex-1 min-w-0 text-xs font-bold text-text truncate">
                      {AI_PROVIDERS[p.id]?.name || p.id}
                    </span>
                    <span className="text-[11px] font-mono text-text-muted shrink-0">{p.requests.toLocaleString()} req</span>
                    <span className="text-[11px] font-mono font-bold text-warning shrink-0">${p.cost.toFixed(3)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <SectionTitle right={<span className="text-[11px] text-text-muted font-mono">{(stats?.recentRequests || []).length} items</span>}>
              Recent requests
            </SectionTitle>
            {!(stats?.recentRequests || []).length ? (
              <EmptyState icon="receipt_long">No recent requests recorded</EmptyState>
            ) : (
              <div className="flex flex-col gap-1.5">
                {stats.recentRequests.slice(0, 10).map((r, i) => {
                  const ok = !r.status || r.status === "ok" || r.status === "success";
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedRequest(r)}
                      className="m-touch-target w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border/70 bg-bg/90 active:bg-bg-subtle text-left"
                    >
                      <span className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-success" : "bg-error"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-mono font-medium text-text truncate">{r.model || "unknown"}</span>
                          <span className="block text-[10px] font-semibold text-text-muted uppercase">
                            {r.provider} · {timeAgo(r.timestamp)}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-bold">
                        <span className="text-primary">{fmtTokens(r.promptTokens)}↑</span>
                        <span className="text-success">{fmtTokens(r.completionTokens)}↓</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <MobileProviderSheet provider={selectedProvider} stats={stats} onClose={() => setSelectedProvider(null)} />
      {selectedRequest ? <RequestDetail request={selectedRequest} onClose={() => setSelectedRequest(null)} /> : null}
    </div>
  );
}
