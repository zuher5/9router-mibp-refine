"use client";

import { useState, useEffect } from "react";
import { SectionTitle, LoadingState, Toggle } from "../_components/ui";
import { fetchAppVersion, fetchRequireLogin, setRequireLogin, logout } from "../_lib/api";

export default function MobileProfilePage() {
  const [version, setVersion] = useState("");
  const [requireLogin, setRequireLoginState] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchAppVersion(), fetchRequireLogin()]).then(([v, r]) => {
      if (cancelled) return;
      if (v.status === "fulfilled") setVersion(v.value);
      if (r.status === "fulfilled") setRequireLoginState(r.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLogin = async (next) => {
    setRequireLoginState(next);
    setSaving(true);
    try {
      await setRequireLogin(next);
    } catch {
      setRequireLoginState(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <SectionTitle>Access</SectionTitle>
        <div className="rounded-xl border border-border bg-bg/90 divide-y divide-border/60 overflow-hidden">
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-text">Require login</p>
              <p className="text-[11px] text-text-muted">Protect dashboard with password</p>
            </div>
            <Toggle checked={requireLogin} label="Require login" disabled={loading || saving} onChange={toggleLogin} />
          </div>
          <div className="flex items-center gap-3 px-3.5 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-text">App version</p>
              <p className="text-[11px] font-mono text-text-muted">{loading ? "…" : version}</p>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={logout}
        className="m-touch-target w-full py-2.5 rounded-xl border border-error/40 bg-error/10 text-error font-bold text-sm active:opacity-80"
      >
        Logout
      </button>

      {loading ? <LoadingState>Loading profile</LoadingState> : null}
      <p className="text-[11px] text-text-muted px-1">Full SSO, password, and tunnel settings stay in the desktop profile page.</p>
    </div>
  );
}
