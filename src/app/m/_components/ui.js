"use client";

import { useEffect } from "react";
import PropTypes from "prop-types";

// Bottom sheet: purpose is thumb-reachable detail/actions on phones.
// Replaces desktop modals and popovers (no hover on touch).
export function Sheet({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-fade-in" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg max-h-[85dvh] overflow-y-auto bg-bg rounded-t-2xl border-t border-border p-5 shadow-2xl z-10 flex flex-col gap-4 animate-slide-up">
        <div className="w-10 h-1 rounded-full bg-border mx-auto -mt-1" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-text leading-snug truncate">{title}</h3>
            {subtitle ? <p className="text-xs font-mono text-text-muted truncate">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="m-touch-target p-2 rounded-full text-text-muted hover:text-text hover:bg-bg-subtle shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

Sheet.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node,
};

// Segmented control: purpose is one-tap switching between 2-4 views
// without leaving the page (periods, tabs, chart modes).
export function SegControl({ options, value, onChange, label, disabled }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 p-1 rounded-xl bg-bg-subtle border border-border overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          disabled={disabled}
          className={`m-touch-target px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 ${
            value === o.value ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

SegControl.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string.isRequired, label: PropTypes.string.isRequired })).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};

export function SectionTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs font-bold text-text-muted uppercase tracking-wider">{children}</span>
      {right}
    </div>
  );
}

SectionTitle.propTypes = {
  children: PropTypes.node.isRequired,
  right: PropTypes.node,
};

export function EmptyState({ icon = "inbox", children }) {
  return (
    <div className="py-10 px-4 text-center text-xs text-text-muted rounded-xl border border-border bg-bg-subtle/50 flex flex-col items-center gap-2">
      <span className="material-symbols-outlined text-[24px] text-text-subtle" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

EmptyState.propTypes = {
  icon: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export function LoadingState({ children = "Loading" }) {
  return (
    <div className="py-10 text-center text-xs text-text-muted rounded-xl border border-border bg-bg-subtle/50">
      {children}…
    </div>
  );
}

LoadingState.propTypes = {
  children: PropTypes.node,
};

export function AuthNeeded() {
  return (
    <div className="p-3.5 rounded-xl border border-warning/40 bg-warning/10 text-xs text-text">
      Session required. <a className="font-bold text-primary underline" href="/login?next=/m/tools">Login</a> to load data.
    </div>
  );
}

// Toggle switch: enable/disable with a 48px hit area.
// The button is the hit area; the inner span is the actual pill so the
// 48px minimum size never distorts the track into a circle.
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className="m-touch-target flex items-center justify-center shrink-0 disabled:opacity-50"
    >
      <span
        className={`relative block w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-success" : "bg-border"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

Toggle.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.string.isRequired,
  disabled: PropTypes.bool,
};
