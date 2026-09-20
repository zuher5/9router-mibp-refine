"use client";

import { useState, useEffect, useRef } from "react";
import { getModelsByProviderId } from "@/shared/constants/models";
import { isAnthropicCompatibleProvider, isOpenAICompatibleProvider } from "@/shared/constants/providers";
import { EmptyState, LoadingState, AuthNeeded } from "../_components/ui";
import { fetchAllConnections, fetchProviderModels, sendChatCompletion } from "../_lib/api";

function textOf(v) {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(" ");
  if (typeof v === "object") return v.message || v.error || "";
  return String(v);
}

function chunkText(chunk) {
  if (!chunk || typeof chunk !== "object") return "";
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};
  const pieces = [delta.content, choice?.message?.content, chunk.output_text, chunk.text].map(textOf).filter(Boolean);
  return pieces[0] || "";
}

function normalizeLive(model, connection) {
  const rawId = typeof model === "string" ? model : model?.id || model?.name || model?.model || "";
  if (!rawId) return null;
  const display = typeof model === "string" ? model : model?.name || model?.displayName || rawId;
  const compat = isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider);
  const requestModel = compat && !rawId.includes("/") ? `${connection.provider}/${rawId}` : rawId;
  return { id: requestModel, requestModel, name: display };
}

function parseModelsPayload(data) {
  if (Array.isArray(data?.models)) return data.models;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data)) return data;
  return [];
}

export default function MobileChatPage() {
  const [connections, setConnections] = useState([]);
  const [connId, setConnId] = useState("");
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllConnections()
      .then((list) => {
        if (cancelled) return;
        const active = list.filter((c) => c.isActive !== false);
        setConnections(active);
        if (active[0]?.id) setConnId(active[0].id);
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

  useEffect(() => {
    if (!connId) {
      setModels([]);
      setModelId("");
      return;
    }
    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;
    let cancelled = false;
    setModelsLoading(true);
    const statics = (getModelsByProviderId(conn.provider) || [])
      .filter((m) => m?.id)
      .map((m) => ({ id: `${conn.provider}/${m.id}`, requestModel: `${conn.provider}/${m.id}`, name: m.name || m.id }));
    Promise.allSettled([fetchProviderModels(conn.id)]).then(([live]) => {
      if (cancelled) return;
      const liveModels = live.status === "fulfilled" ? parseModelsPayload(live.value).map((m) => normalizeLive(m, conn)).filter(Boolean) : [];
      const seen = new Set();
      const merged = [...liveModels, ...statics].filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      setModels(merged);
      setModelId((prev) => (merged.some((m) => m.id === prev) ? prev : merged[0]?.id || ""));
      setModelsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [connId, connections]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !modelId) return;
    setError("");
    const model = models.find((m) => m.id === modelId);
    const next = [...messages, { role: "user", content: text }, { role: "assistant", content: "", streaming: true }];
    setMessages(next);
    setDraft("");
    setSending(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const res = await sendChatCompletion({
        model: model?.requestModel || modelId,
        messages: next.filter((m) => !m.streaming).map((m) => ({ role: m.role, content: m.content })),
        signal: abortRef.current.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("Empty response stream");
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const txt = chunkText(JSON.parse(payload));
            if (txt) {
              acc += txt;
              const snap = acc;
              setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: snap } : m)));
            }
          } catch {}
        }
      }
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, streaming: false } : m)));
    } catch (err) {
      if (err?.name === "AbortError") {
        setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, streaming: false } : m)));
      } else {
        setError(err?.message || "Send failed");
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setSending(false);
    }
  };

  const selectCls =
    "m-touch-target w-full px-3 rounded-xl border border-border bg-bg-subtle text-xs font-semibold text-text";

  return (
    <div className="flex flex-col gap-3">
      {authNeeded ? <AuthNeeded /> : null}
      {loading ? (
        <LoadingState>Loading providers</LoadingState>
      ) : !connections.length ? (
        <EmptyState icon="hub">No active provider connections. Add one on desktop or Providers tab.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">Connection</span>
              <select value={connId} onChange={(e) => setConnId(e.target.value)} className={selectCls} aria-label="Connection">
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.provider}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">
                Model{modelsLoading ? " (…)" : ""}
              </span>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={selectCls} aria-label="Model">
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div ref={listRef} className="flex flex-col gap-2 min-h-[220px] max-h-[52dvh] overflow-y-auto rounded-xl border border-border bg-bg/60 p-2.5">
            {!messages.length ? (
              <p className="m-auto text-xs text-text-muted text-center px-6">Pick a model and send a test prompt.</p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === "user" ? "self-end bg-primary text-white" : "self-start bg-bg-subtle border border-border text-text"
                  }`}
                >
                  {m.content || (m.streaming ? "…" : "")}
                </div>
              ))
            )}
          </div>

          {error ? <div className="px-3 py-2 rounded-xl border border-error/40 bg-error/10 text-xs text-error">{error}</div> : null}

          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="Type a test prompt…"
              aria-label="Message"
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-border bg-bg-subtle text-[13px] text-text placeholder:text-text-subtle resize-none"
            />
            {sending ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label="Stop"
                className="m-touch-target w-12 h-12 rounded-xl bg-error text-white flex items-center justify-center shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || !modelId}
                aria-label="Send"
                className="m-touch-target w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              setMessages([]);
              setError("");
            }}
            className="m-touch-target self-center px-3 text-[11px] font-semibold text-text-muted"
          >
            Clear conversation
          </button>
        </>
      )}
    </div>
  );
}
