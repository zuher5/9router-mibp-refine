"use client";

import { useState, useEffect } from "react";

export default function MobileLogsPage() {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/usage/stats?period=today");
        if (res.ok) {
          const data = await res.json();
          setRequests(data.recentRequests || []);
        }
      } catch {}
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">REQUEST LOGS</h2>
        <span className="text-xs font-mono text-text-muted">{requests.length} logged</span>
      </div>

      {!requests.length ? (
        <div className="py-12 text-center text-xs text-text-muted rounded-xl border border-border">
          No logs recorded today
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r, i) => {
            const ok = !r.status || r.status === "ok" || r.status === "success";
            return (
              <div key={i} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${ok ? "bg-success" : "bg-error"}`} />
                    <span className="text-xs font-mono font-bold text-text truncate">{r.model}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-text-muted">{r.timestamp?.slice(11, 19)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-muted border-t border-border/40 pt-1.5">
                  <span className="font-semibold uppercase">{r.provider}</span>
                  <span className="font-mono">
                    <span className="text-primary">{r.promptTokens} in</span> •{" "}
                    <span className="text-success">{r.completionTokens} out</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
