"use client";

import { useState, useEffect } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";

export default function MobileProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/providers");
        if (res.ok) {
          const data = await res.json();
          setConnections(data.connections || []);
        }
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">CONNECTED PROVIDERS</h2>
        <span className="text-xs font-mono text-text-muted">{connections.length} total</span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-text-muted">Loading providers...</div>
      ) : !connections.length ? (
        <div className="py-12 text-center text-xs text-text-muted rounded-xl border border-border">
          No providers configured
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {connections.map((c, i) => {
            const config = AI_PROVIDERS[c.provider] || { color: "#6b7280", name: c.provider };
            return (
              <div
                key={c.id || i}
                className="flex items-center justify-between p-3 rounded-xl border border-border bg-bg/90"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                    style={{ backgroundColor: `${config.color}20`, color: config.color }}
                  >
                    {(config.textIcon || c.provider.slice(0, 2)).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-text truncate">{c.name || config.name || c.provider}</p>
                    <p className="text-[10px] font-mono text-text-muted truncate">{c.provider}</p>
                  </div>
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    c.isActive !== false ? "bg-success/10 text-success border border-success/20" : "bg-border text-text-muted"
                  }`}
                >
                  {c.isActive !== false ? "ACTIVE" : "DISABLED"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
