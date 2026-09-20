"use client";

import { useState, useEffect } from "react";
import { SectionTitle, EmptyState, LoadingState, AuthNeeded } from "../_components/ui";
import { fetchCombos, deleteCombo } from "../_lib/api";

export default function MobileCombosPage() {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCombos()
      .then((list) => {
        if (!cancelled) setCombos(list);
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

  return (
    <div className="flex flex-col gap-3">
      {authNeeded ? <AuthNeeded /> : null}
      <SectionTitle right={<span className="text-xs font-mono text-text-muted">{combos.length} combos</span>}>
        Combos
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
                    className="m-touch-target p-1.5 text-text-muted"
                  >
                    <span className="material-symbols-outlined text-[18px]">{copied === combo.id ? "check" : "content_copy"}</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {models.length === 0 ? (
                    <span className="text-[11px] text-text-muted">No models attached</span>
                  ) : (
                    <>
                      {models.slice(0, 4).map((m) => (
                        <span key={m} className="px-2 py-0.5 rounded-md bg-bg-subtle border border-border/60 font-mono text-[10px] text-text max-w-full truncate">
                          {m}
                        </span>
                      ))}
                      {models.length > 4 ? (
                        <span className="text-[10px] text-text-muted self-center">+{models.length - 4} more</span>
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
      <p className="text-[11px] text-text-muted px-1">Create and edit combos in the desktop view.</p>
    </div>
  );
}
