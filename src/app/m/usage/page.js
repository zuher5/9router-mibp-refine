"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import MobileProviderSheet from "../components/MobileProviderSheet";

const MobileProviderTopology = dynamic(() => import("../components/MobileProviderTopology"), { ssr: false });

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
];

function fmtTokens(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MobileUsagePage() {
  const [period, setPeriod] = useState("today");
  const [stats, setStats] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/usage/stats?period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, [period]);

  const fetchProviders = useCallback(async () => {
    try {
      const [resConn, resNodes] = await Promise.all([
        fetch("/api/providers"),
        fetch("/api/provider-nodes"),
      ]);
      const connData = resConn.ok ? await resConn.json() : { connections: [] };
      const nodesData = resNodes.ok ? await resNodes.json() : { nodes: [] };

      const nodeMap = (nodesData.nodes || []).reduce((acc, n) => {
        acc[n.id] = n.name;
        return acc;
      }, {});

      const activeList = (connData.connections || [])
        .filter((c) => c.isActive !== false)
        .map((c) => ({
          provider: c.provider,
          name: c.name,
          nodeName: nodeMap[c.provider],
        }));

      // Dedup
      const seen = new Set();
      const deduped = [];
      for (const p of activeList) {
        const key = p.provider?.toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          deduped.push(p);
        }
      }
      if (!seen.has("opencode")) {
        deduped.push({ provider: "opencode", name: "OpenCode Free" });
      }
      setProviders(deduped);
    } catch {
      // Providers fetch fallback
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Realtime stream SSE
  useEffect(() => {
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
  }, []);

  const totalRequests = stats?.totalRequests || 0;
  const totalCost = stats?.totalCost || 0;
  const promptTokens = stats?.totalPromptTokens || 0;
  const cachedTokens = stats?.totalCachedTokens || 0;
  const completionTokens = stats?.totalCompletionTokens || 0;

  const lastProvider = stats?.recentRequests?.[0]?.provider || "";
  const errorProvider = stats?.errorProvider || "";

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controls: Period selector + Live pill */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-bg-subtle border border-border">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                period === p.value
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-bg-subtle text-[11px] font-semibold">
          <span
            className={`w-2 h-2 rounded-full ${
              isLive ? "bg-success animate-pulse" : "bg-text-muted"
            }`}
          />
          <span className={isLive ? "text-success" : "text-text-muted"}>
            {isLive ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Top 2x2 Overview Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3.5 rounded-xl border border-border bg-bg/80 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            TOTAL REQUESTS
          </span>
          <span className="text-2xl font-black tracking-tight text-text">
            {totalRequests.toLocaleString()}
          </span>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-bg/80 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
            EST. COST
          </span>
          <span className="text-2xl font-black tracking-tight text-warning">
            ${totalCost.toFixed(3)}
          </span>
        </div>

        <div className="p-3 rounded-xl border border-border bg-bg/80 flex items-center justify-between col-span-2">
          <div className="flex-1 text-center">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">INPUT</span>
            <span className="text-sm font-bold text-primary">{fmtTokens(promptTokens)}</span>
          </div>
          <div className="w-[1px] h-6 bg-border" />
          <div className="flex-1 text-center">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">CACHED</span>
            <span className="text-sm font-bold text-info">{fmtTokens(cachedTokens)}</span>
          </div>
          <div className="w-[1px] h-6 bg-border" />
          <div className="flex-1 text-center">
            <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block">OUTPUT</span>
            <span className="text-sm font-bold text-success">{fmtTokens(completionTokens)}</span>
          </div>
        </div>
      </div>

      {/* Mobile Provider Topology (ReactFlow Mobile 1:1) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
            PROVIDER TOPOLOGY
          </span>
          {stats?.activeRequests?.length > 0 && (
            <span className="text-xs text-yellow-400 font-bold">
              {stats.activeRequests.length} active
            </span>
          )}
        </div>
        <MobileProviderTopology
          providers={providers}
          activeRequests={stats?.activeRequests || []}
          lastProvider={lastProvider}
          errorProvider={errorProvider}
          onSelectProvider={(p) => setSelectedProvider(p)}
        />
      </div>

      {/* Recent Requests Mobile Cards */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
            RECENT REQUESTS
          </span>
          <span className="text-[11px] text-text-muted font-mono">
            {(stats?.recentRequests || []).length} items
          </span>
        </div>

        {!(stats?.recentRequests || []).length ? (
          <div className="py-8 text-center text-xs text-text-muted rounded-xl border border-border bg-bg-subtle/50">
            No recent requests recorded
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {stats.recentRequests.slice(0, 10).map((r, i) => {
              const ok = !r.status || r.status === "ok" || r.status === "success";
              return (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 bg-bg/90 active:bg-bg-subtle transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        ok ? "bg-success" : "bg-error"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-medium text-text truncate">
                        {r.model || "unknown"}
                      </p>
                      <p className="text-[10px] font-semibold text-text-muted uppercase">
                        {r.provider} • {timeAgo(r.timestamp)}
                      </p>
                    </div>
                  </div>

                  {/* Tokens In/Out badge */}
                  <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px] font-bold">
                    <span className="text-primary">{fmtTokens(r.promptTokens)}↑</span>
                    <span className="text-success">{fmtTokens(r.completionTokens)}↓</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Provider Detail Bottom Sheet */}
      <MobileProviderSheet
        provider={selectedProvider}
        stats={stats}
        onClose={() => setSelectedProvider(null)}
      />
    </div>
  );
}
