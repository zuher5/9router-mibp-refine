"use client";

import { useState, useEffect } from "react";
import { SectionTitle, EmptyState, LoadingState, AuthNeeded, Toggle } from "../_components/ui";
import { fetchPools, setPoolActive, testPool } from "../_lib/api";

export default function MobilePoolsPage() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPools()
      .then((list) => {
        if (!cancelled) setPools(list);
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

  const toggle = async (pool) => {
    const next = !(pool.isActive !== false);
    setPools((prev) => prev.map((p) => (p.id === pool.id ? { ...p, isActive: next } : p)));
    try {
      await setPoolActive(pool.id, next);
    } catch {}
  };

  const test = async (pool) => {
    setTestingId(pool.id);
    setTestMsg("");
    try {
      const data = await testPool(pool.id);
      setTestMsg(data?.ok === false ? "Pool test failed" : "Pool test passed");
    } catch {
      setTestMsg("Pool test failed");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {authNeeded ? <AuthNeeded /> : null}
      {testMsg ? (
        <div className="px-3.5 py-2.5 rounded-xl border border-border bg-bg-subtle text-xs text-text">{testMsg}</div>
      ) : null}
      <SectionTitle right={<span className="text-xs font-mono text-text-muted">{pools.length} pools</span>}>
        Proxy pools
      </SectionTitle>

      {loading ? (
        <LoadingState>Loading pools</LoadingState>
      ) : !pools.length ? (
        <EmptyState icon="lan">No proxy pools configured</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {pools.map((pool) => (
            <div key={pool.id} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-text truncate">{pool.name}</p>
                  {pool.url || pool.endpoint ? (
                    <p className="text-[11px] font-mono text-text-muted truncate">{pool.url || pool.endpoint}</p>
                  ) : null}
                </div>
                <Toggle checked={pool.isActive !== false} label={`Toggle ${pool.name}`} onChange={() => toggle(pool)} />
              </div>
              <div className="border-t border-border/50 pt-2">
                <button
                  type="button"
                  disabled={testingId === pool.id}
                  onClick={() => test(pool)}
                  className="m-touch-target w-full text-[11px] font-bold text-primary disabled:opacity-50"
                >
                  {testingId === pool.id ? "Testing…" : "Test pool"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
