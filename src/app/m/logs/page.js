"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { Sheet, SegControl, SectionTitle, EmptyState, LoadingState, AuthNeeded } from "../_components/ui";
import { fetchRequestDetails } from "../_lib/api";
import { fmtTokens, timeAgo } from "../_lib/format";

const PAGE_SIZE = 20;

const LOG_COLORS = {
  LOG: "text-green-400",
  INFO: "text-blue-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
  DEBUG: "text-purple-400",
};

function ConsoleView() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const max = CONSOLE_LOG_CONFIG.maxLines || 300;
        if (msg.type === "init") setLogs((msg.logs || []).slice(-max));
        else if (msg.type === "line") setLogs((prev) => [...prev, msg.line].slice(-max));
        else if (msg.type === "lines") setLogs((prev) => [...prev, ...(msg.lines || [])].slice(-max));
        else if (msg.type === "clear") setLogs([]);
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [logs]);

  const clear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
    } catch {}
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className={`text-[11px] font-bold ${connected ? "text-success" : "text-text-muted"}`}>
          {connected ? "STREAMING" : "OFFLINE"}
        </span>
        <button
          type="button"
          onClick={clear}
          className="m-touch-target px-3 text-[11px] font-bold text-error"
        >
          Clear
        </button>
      </div>
      <div ref={boxRef} className="h-[52dvh] overflow-y-auto rounded-xl border border-border bg-black p-3 font-mono text-[11px] leading-relaxed">
        {!logs.length ? (
          <span className="text-text-muted">No console output yet.</span>
        ) : (
          logs.map((line, i) => {
            const tag = (line.match(/\[(\w+)\]/g) || [])[1]?.replace(/\[|\]/g, "");
            return (
              <div key={i} className={`whitespace-pre-wrap break-all ${LOG_COLORS[tag] || "text-green-400"}`}>
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MobileLogsPage() {
  const [tab, setTab] = useState("requests");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (p, append) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const { details } = await fetchRequestDetails({ page: p, pageSize: PAGE_SIZE });
      setItems((prev) => (append ? [...prev, ...details] : details));
      setHasMore(details.length >= PAGE_SIZE);
      setPage(p);
    } catch (err) {
      if (err?.status === 401) setAuthNeeded(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "requests") load(1, false);
  }, [tab, load]);

  return (
    <div className="flex flex-col gap-3">
      <SegControl
        label="Log view"
        options={[
          { value: "requests", label: "Requests" },
          { value: "console", label: "Console" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {authNeeded && tab === "requests" ? <AuthNeeded /> : null}

      {tab === "console" ? (
        <ConsoleView />
      ) : loading ? (
        <LoadingState>Loading request logs</LoadingState>
      ) : !items.length ? (
        <EmptyState icon="receipt_long">No request logs yet</EmptyState>
      ) : (
        <>
          <SectionTitle right={<span className="text-[11px] text-text-muted font-mono">{items.length} shown</span>}>
            Request logs
          </SectionTitle>
          <div className="flex flex-col gap-2">
            {items.map((r, i) => {
              const ok = !r.status || r.status === "ok" || r.status === "success";
              return (
                <button
                  key={r.id || i}
                  type="button"
                  onClick={() => setDetail(r)}
                  className="m-touch-target w-full p-3 rounded-xl border border-border bg-bg/90 active:bg-bg-subtle text-left flex flex-col gap-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-success" : "bg-error"}`} />
                    <span className="text-xs font-mono font-bold text-text truncate flex-1">{r.model || "unknown"}</span>
                    <span className="text-[10px] font-semibold text-text-muted shrink-0">{timeAgo(r.timestamp || r.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-muted border-t border-border/40 pt-1.5">
                    <span className="font-semibold uppercase">{r.provider || "-"}</span>
                    <span className="font-mono">
                      <span className="text-primary">{fmtTokens(r.promptTokens)} in</span> ·{" "}
                      <span className="text-success">{fmtTokens(r.completionTokens)} out</span>
                      {r.latencyMs != null ? <span className="text-text-muted"> · {r.latencyMs}ms</span> : null}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => load(page + 1, true)}
              className="m-touch-target w-full py-2.5 rounded-xl border border-border bg-bg-subtle text-xs font-bold text-text disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}

      {detail ? (
        <Sheet title={detail.model || "Request"} subtitle={detail.provider} onClose={() => setDetail(null)}>
          <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border overflow-hidden">
            {[
              ["Status", detail.status || "success", false],
              ["Time", detail.timestamp || detail.createdAt ? new Date(detail.timestamp || detail.createdAt).toLocaleString() : "-", false],
              ["Input", fmtTokens(detail.promptTokens), true],
              ["Cached", fmtTokens(detail.cachedTokens), true],
              ["Output", fmtTokens(detail.completionTokens), true],
              ["Cost", detail.cost != null ? `$${Number(detail.cost).toFixed(5)}` : "-", true],
              ["Latency", detail.latencyMs != null ? `${detail.latencyMs} ms` : "-", true],
              ["Connection", detail.connectionId ? String(detail.connectionId).slice(0, 16) : "-", true],
              ["Account", detail.accountName || "-", false],
            ].map(([k, v, mono]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-bg-subtle/40">
                <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{k}</span>
                <span className={`text-xs font-semibold text-text text-right break-all ${mono ? "font-mono" : ""}`}>{v}</span>
              </div>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
