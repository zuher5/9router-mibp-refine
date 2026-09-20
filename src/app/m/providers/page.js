"use client";

import { useState, useEffect, useMemo } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { Sheet, SegControl, SectionTitle, EmptyState, LoadingState, AuthNeeded, Toggle } from "../_components/ui";
import { fetchAllConnections, setConnectionActive, testProviders } from "../_lib/api";
import { timeAgo } from "../_lib/format";

function connStatus(c) {
  const inCooldown = Object.entries(c).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  if (c.isActive === false) return { key: "disabled", label: "Disabled", cls: "bg-border text-text-muted" };
  if (inCooldown) return { key: "cooldown", label: "Cooldown", cls: "bg-warning/10 text-warning border border-warning/30" };
  if (c.testStatus === "error" || c.testStatus === "expired" || c.testStatus === "unavailable")
    return { key: "error", label: c.testStatus, cls: "bg-error/10 text-error border border-error/30" };
  return { key: "active", label: "Active", cls: "bg-success/10 text-success border border-success/30" };
}

export default function MobileProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchAllConnections()
      .then((list) => {
        if (!cancelled) setConnections(list);
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
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const c of connections) {
      const key = c.provider?.toLowerCase() || "unknown";
      if (!map.has(key)) map.set(key, { provider: c.provider, connections: [] });
      map.get(key).connections.push(c);
    }
    return [...map.values()].map((g) => {
      const active = g.connections.filter((c) => c.isActive !== false).length;
      const errors = g.connections.filter((c) => connStatus(c).key === "error").length;
      return { ...g, active, errors, total: g.connections.length };
    });
  }, [connections]);

  const visible = groups.filter((g) => {
    if (filter === "active") return g.active > 0;
    if (filter === "errors") return g.errors > 0;
    return true;
  });

  const toggleGroup = async (g, next) => {
    setConnections((prev) => prev.map((c) => (c.provider === g.provider ? { ...c, isActive: next } : c)));
    if (detail?.provider === g.provider) {
      setDetail({ ...detail, connections: detail.connections.map((c) => ({ ...c, isActive: next })) });
    }
    try {
      await Promise.allSettled(g.connections.map((c) => (c.id ? setConnectionActive(c.id, next) : Promise.resolve())));
    } catch {}
  };

  const runTest = async (providerId) => {
    setTesting(true);
    setTestMsg("");
    try {
      const data = await testProviders(providerId ? "provider" : "all", providerId);
      const s = data.summary;
      setTestMsg(s ? `${s.passed}/${s.total} passed` : "Test finished");
    } catch {
      setTestMsg("Test request failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SegControl
          label="Provider filter"
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "errors", label: "Errors" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <button
          type="button"
          disabled={testing}
          onClick={() => runTest(null)}
          className="m-touch-target shrink-0 px-3 py-1.5 rounded-xl border border-border bg-bg-subtle text-xs font-bold text-text active:opacity-80 disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test all"}
        </button>
      </div>

      {testMsg ? (
        <div className="px-3.5 py-2.5 rounded-xl border border-border bg-bg-subtle text-xs text-text">{testMsg}</div>
      ) : null}

      {authNeeded ? <AuthNeeded /> : null}

      <SectionTitle right={<span className="text-xs font-mono text-text-muted">{groups.length} providers</span>}>
        Providers
      </SectionTitle>

      {loading ? (
        <LoadingState>Loading providers</LoadingState>
      ) : !visible.length ? (
        <EmptyState icon="hub">No providers match this filter</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((g) => {
            const config = AI_PROVIDERS[g.provider] || { color: "#6b7280", name: g.provider };
            return (
              <div key={g.provider} className="rounded-xl border border-border bg-bg/90 overflow-hidden">
                <div className="flex items-center gap-1 p-1.5">
                  <button
                    type="button"
                    onClick={() => setDetail(g)}
                    className="m-touch-target flex items-center gap-3 p-1.5 text-left active:bg-bg-subtle rounded-lg flex-1 min-w-0"
                  >
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                      style={{ backgroundColor: `${config.color}20`, color: config.color }}
                    >
                      {(config.textIcon || g.provider.slice(0, 2)).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-text truncate">{config.name || g.provider}</span>
                      <span className="block text-[10px] font-mono text-text-muted truncate">
                        {g.active}/{g.total} active{g.errors > 0 ? ` · ${g.errors} error` : ""}
                      </span>
                    </span>
                  </button>
                  <Toggle
                    checked={g.active > 0}
                    label={`Toggle ${g.provider}`}
                    onChange={(next) => toggleGroup(g, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detail ? (
        <Sheet
          title={AI_PROVIDERS[detail.provider]?.name || detail.provider}
          subtitle={`${detail.total} connections`}
          onClose={() => setDetail(null)}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testing}
              onClick={() => runTest(detail.provider)}
              className="m-touch-target flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm active:opacity-90 disabled:opacity-50"
            >
              {testing ? "Testing…" : "Run test"}
            </button>
            <Toggle
              checked={detail.connections.some((c) => c.isActive !== false)}
              label={`Toggle ${detail.provider}`}
              onChange={(next) => toggleGroup(detail, next)}
            />
          </div>
          <div className="flex flex-col gap-2">
            {detail.connections.map((c) => {
              const st = connStatus(c);
              return (
                <div key={c.id || c.name} className="p-3 rounded-xl border border-border bg-bg-subtle/40 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-text truncate">{c.name || c.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span className="font-mono">{c.authType || "key"}</span>
                    {c.lastErrorAt ? <span>err {timeAgo(c.lastErrorAt)}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
