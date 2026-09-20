"use client";

import { useState, useEffect, useMemo } from "react";
import { SectionTitle, EmptyState, LoadingState, AuthNeeded, Toggle } from "../_components/ui";
import { fetchCombos, deleteCombo, setCapacityAdapter } from "../_lib/api";

// Capacity adapter (Vision/Audio): request needing a capability the target model
// lacks falls back to the first enabled model here. Port of the desktop
// CAPACITY_ADAPTER_CAPS block in dashboard/combos — mobile reads only.
const CAPS = [
  { key: "vision", label: "Vision", icon: "visibility", desc: "Image input fallback" },
  { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "Audio input fallback" },
];

function normalizeCapEntry(entry) {
  if (Array.isArray(entry)) {
    return { enabled: true, roundRobin: false, models: entry.map((e) => e?.model || e).filter(Boolean) };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
      roundRobin: !!entry.roundRobin,
      models: Array.isArray(entry.models) ? entry.models.filter(Boolean) : [],
    };
  }
  return { enabled: true, roundRobin: false, models: [] };
}

export default function MobileCombosPage() {
  const [combos, setCombos] = useState([]);
  const [caps, setCaps] = useState({});
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [copied, setCopied] = useState("");
  const [capsLoading, setCapsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchCombos(),
      fetch("/api/settings", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})),
    ]).then(([c, s]) => {
      if (cancelled) return;
      if (c.status === "fulfilled" && c.value) setCombos(c.value);
      if (s.status === "fulfilled" && s.value) {
        const raw = s.value.capacityAdapter || {};
        const normalized = {};
        for (const cap of CAPS) normalized[cap.key] = normalizeCapEntry(raw[cap.key]);
        setCaps(normalized);
      }
      if (c.status === "rejected" && c.reason?.status === 401) setAuthNeeded(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {}
  };

  const remove = async (id) => {
    try {
      await deleteCombo(id);
      setCombos((prev) => prev.filter((c) => c.id !== id));
    } catch {} finally {
      setConfirmId(null);
    }
  };

  const hasCapModels = useMemo(() => Object.values(caps).some((cap) => cap.enabled && cap.models.length > 0), [caps]);

  const toggleCap = async (cap) => {
    const next = { ...caps, [cap.key]: { ...caps[cap.key], enabled: !caps[cap.key].enabled } };
    setCaps(next);
    setCapsLoading(true);
    try {
      await setCapacityAdapter(next);
    } catch {
      setCaps(caps);
    } finally {
      setCapsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {authNeeded ? <AuthNeeded /> : null}

      <SectionTitle right={<span className="text-xs font-mono text-text-muted">{combos.length} combos</span>}>
        Routing combos
      </SectionTitle>

      {loading ? (
        <LoadingState>Loading combos</LoadingState>
      ) : !combos.length ? (
        <EmptyState icon="layers">No LLM combos defined</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {combos.map((combo) => {
            const models = combo.models || [];
            return (
              <div key={combo.id} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 truncate font-mono text-xs font-bold text-text">{combo.name}</code>
                  <button
                    type="button"
                    onClick={() => copy(combo.name, combo.id)}
                    aria-label={`Copy ${combo.name}`}
                    className="m-touch-target w-11 h-9 flex items-center justify-center text-text-muted"
                  >
                    <span className="material-symbols-outlined text-[18px]">{copied === combo.id ? "check" : "content_copy"}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {models.length === 0 ? (
                    <span className="text-[11px] text-text-muted">No models attached</span>
                  ) : (
                    <>
                      {models.slice(0, 6).map((m) => (
                        <span
                          key={m}
                          className="px-2 py-1 rounded-md bg-bg-subtle border border-border/60 font-mono text-[10px] text-text max-w-[92%] truncate"
                        >
                          {m}
                        </span>
                      ))}
                      {models.length > 6 ? (
                        <span className="text-[10px] text-text-muted self-center">+{models.length - 6} more</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="border-t border-border/50 pt-2">
                  {confirmId === combo.id ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => remove(combo.id)} className="m-touch-target flex-1 text-[11px] font-bold text-error">
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="m-touch-target flex-1 text-[11px] font-bold text-text-muted">
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(combo.id)} className="m-touch-target w-full text-[11px] font-bold text-error">
                      Delete combo
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <SectionTitle>Vision & Audio Adapter</SectionTitle>
        {!hasCapModels ? (
          <EmptyState icon="visibility">No fallback models mapped. Configure on desktop.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {CAPS.map((cap) => {
              const entry = caps[cap.key];
              if (!entry || !entry.enabled || entry.models.length === 0) return null;
              return (
                <div key={cap.key} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${entry.enabled ? "bg-primary/15 text-primary" : "bg-bg-subtle text-text-muted"}`}>
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{cap.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-text">{cap.label}</p>
                      <p className="text-[11px] text-text-muted truncate">{cap.desc}</p>
                    </div>
                    <Toggle checked={entry.enabled} disabled={capsLoading} label={`${cap.label} adapter`} onChange={() => toggleCap(cap)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                    {entry.models.slice(0, 3).map((m) => (
                      <span key={m} className="px-2 py-1 rounded-md bg-bg-subtle border border-border/60 font-mono text-[10px] text-text max-w-[92%] truncate">
                        {m}
                      </span>
                    ))}
                    {entry.roundRobin ? <span className="text-[10px] font-bold text-text-muted self-center uppercase">Round robin</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-text-muted px-1">Create and edit combos in the desktop view.</p>
      </div>
    </div>
  );
}