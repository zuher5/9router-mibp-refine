"use client";

import { useState, useEffect } from "react";
import { SectionTitle, EmptyState, LoadingState, AuthNeeded, Toggle } from "../_components/ui";
import { fetchKeys, createKey, deleteKey, setKeyActive } from "../_lib/api";

function maskKey(k) {
  if (!k || k.length < 10) return "••••";
  return `${k.slice(0, 6)}••••${k.slice(-4)}`;
}

export default function MobileEndpointPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshKey, setFreshKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const load = async () => {
    try {
      setKeys(await fetchKeys());
    } catch (err) {
      if (err?.status === 401) setAuthNeeded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/v1` : "/v1";

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const create = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const data = await createKey(name.trim());
      if (data.key) {
        setFreshKey(data.key);
        copy(data.key);
      }
      setName("");
      setShowForm(false);
      await load();
    } catch {} finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {} finally {
      setConfirmId(null);
    }
  };

  const toggle = async (k) => {
    const next = !(k.isActive !== false);
    setKeys((prev) => prev.map((x) => (x.id === k.id ? { ...x, isActive: next } : x)));
    try {
      await setKeyActive(k.id, next);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>Base URL</SectionTitle>
      <button
        type="button"
        onClick={() => copy(baseUrl)}
        className="m-touch-target w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border bg-bg/90 active:bg-bg-subtle text-left"
      >
        <span className="flex-1 min-w-0 font-mono text-xs text-text truncate">{baseUrl}</span>
        <span className="material-symbols-outlined text-[18px] text-text-muted shrink-0">
          {copied ? "check" : "content_copy"}
        </span>
      </button>

      {freshKey ? (
        <div className="p-3.5 rounded-xl border border-success/40 bg-success/10 flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-success uppercase">New key (copied)</span>
          <span className="font-mono text-xs text-text break-all">{freshKey}</span>
        </div>
      ) : null}

      {authNeeded ? <AuthNeeded /> : null}

      <SectionTitle
        right={
          <button type="button" onClick={() => setShowForm((v) => !v)} className="m-touch-target text-[11px] font-bold text-primary px-2">
            {showForm ? "Cancel" : "+ New key"}
          </button>
        }
      >
        API keys
      </SectionTitle>

      {showForm ? (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name"
            aria-label="Key name"
            className="m-touch-target flex-1 min-w-0 px-3 rounded-xl border border-border bg-bg-subtle text-xs text-text"
          />
          <button
            type="button"
            onClick={create}
            disabled={!name.trim() || creating}
            className="m-touch-target px-4 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50"
          >
            {creating ? "…" : "Create"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <LoadingState>Loading keys</LoadingState>
      ) : !keys.length ? (
        <EmptyState icon="key">No API keys yet</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((k) => (
            <div key={k.id} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-text truncate">{k.name || "Unnamed key"}</p>
                  <p className="text-[11px] font-mono text-text-muted">{maskKey(k.key)}</p>
                </div>
                <Toggle checked={k.isActive !== false} label={`Toggle ${k.name}`} onChange={() => toggle(k)} />
              </div>
              <div className="flex gap-2 border-t border-border/50 pt-2">
                {k.key ? (
                  <button type="button" onClick={() => copy(k.key)} className="m-touch-target flex-1 text-[11px] font-bold text-primary">
                    Copy
                  </button>
                ) : null}
                {confirmId === k.id ? (
                  <>
                    <button type="button" onClick={() => remove(k.id)} className="m-touch-target flex-1 text-[11px] font-bold text-error">
                      Confirm delete
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="m-touch-target flex-1 text-[11px] font-bold text-text-muted">
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmId(k.id)} className="m-touch-target flex-1 text-[11px] font-bold text-error">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
