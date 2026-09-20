"use client";

import { useState, useEffect, useMemo } from "react";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { Sheet, SegControl, SectionTitle, EmptyState, LoadingState, AuthNeeded, Toggle } from "../_components/ui";
import {
  fetchAllConnections,
  setConnectionActive,
  testProviders,
  fetchProviderNodes,
  createProviderNode,
  updateProviderNode,
  deleteProviderNode,
} from "../_lib/api";
import { timeAgo } from "../_lib/format";

function connStatus(c) {
  const inCooldown = Object.entries(c).some(
    ([k, v]) => k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now()
  );
  if (c.isActive === false) return { key: "disabled", label: "Disabled", cls: "bg-border text-text-muted" };
  if (inCooldown) return { key: "cooldown", label: "Cooldown", cls: "bg-warning/10 text-warning border border-warning/30" };
  if (c.testStatus === "error" || c.testStatus === "expired" || c.testStatus === "unavailable")
    return { key: "error", label: c.testStatus, cls: "bg-error/10 text-error border border-error/30" };
  return { key: "active", label: "Active", cls: "bg-success/10 text-success border border-success/30" };
}

function nodeMeta(node) {
  if (node.type === "anthropic-compatible")
    return { textIcon: "AC", color: "#D97757", label: "Anthropic Compatible", cls: "bg-warning/10 text-warning border border-warning/30" };
  if (node.type === "custom-embedding")
    return { textIcon: "EM", color: "#0ea5e9", label: "Embedding", cls: "bg-info/10 text-info border border-info/30" };
  return {
    textIcon: "OC",
    color: "#10A37F",
    label: node.apiType === "responses" ? "OpenAI · Responses" : "OpenAI · Chat",
    cls: "bg-primary/10 text-primary border border-primary/30",
  };
}

// Add / edit sheet for OpenAI / Anthropic compatible custom provider nodes.
function NodeFormSheet({ form, setForm, onClose, onSave, saving, error }) {
  const isOpenai = form.variant === "openai";
  const openInEdit = form.mode === "edit" && !isOpenai;
  return (
    <Sheet title={form.mode === "edit" ? "Edit custom provider" : "Add custom provider"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Provider type</span>
          <SegControl
            label="Provider type"
            disabled={form.mode === "edit"}
            options={[
              { value: "openai", label: "OpenAI" },
              { value: "anthropic", label: "Anthropic" },
            ]}
            value={form.variant}
            onChange={(v) =>
              setForm({
                ...form,
                variant: v,
                apiType: v === "openai" ? form.apiType || "chat" : undefined,
                baseUrl: v === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1",
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cp-name" className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Name</label>
          <input
            id="cp-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={isOpenai ? "OpenAI Compatible (Prod)" : "Anthropic Compatible (Prod)"}
            className="m-touch-target w-full px-3 rounded-xl border border-border bg-bg-subtle text-base text-text placeholder:text-text-subtle"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="cp-prefix" className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Prefix</label>
          <input
            id="cp-prefix"
            value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value })}
            placeholder={isOpenai ? "oc-prod" : "ac-prod"}
            className="m-touch-target w-full px-3 rounded-xl border border-border bg-bg-subtle text-base text-text placeholder:text-text-subtle"
          />
          <p className="text-[10px] text-text-muted">Model IDs use this prefix, e.g. oc-prod/gpt-4.</p>
        </div>

        {isOpenai ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="cp-apit" className="text-[10px] font-bold text-text-muted uppercase tracking-wider">API type</label>
            <select
              id="cp-apit"
              value={form.apiType}
              onChange={(e) => setForm({ ...form, apiType: e.target.value })}
              className="m-touch-target w-full px-3 rounded-xl border border-border bg-bg-subtle text-base text-text"
            >
              <option value="chat">Chat Completions</option>
              <option value="responses">Responses API</option>
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <label htmlFor="cp-baseurl" className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Base URL</label>
          <input
            id="cp-baseurl"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            placeholder={isOpenai ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1"}
            className="m-touch-target w-full px-3 rounded-xl border border-border bg-bg-subtle text-base text-text placeholder:text-text-subtle"
          />
          <p className="text-[10px] text-text-muted">
            {isOpenai
              ? "Base URL ending in /v1 for the OpenAI-compatible API."
              : "Base URL ending in /v1 — /messages is appended automatically."}
          </p>
        </div>

        {error ? <div className="px-3.5 py-2.5 rounded-xl border border-error/40 bg-error/10 text-xs text-text">{error}</div> : null}

        <button
          type="button"
          disabled={saving || !form.name.trim() || !form.prefix.trim() || !form.baseUrl.trim() || (isOpenai && !form.apiType)}
          onClick={onSave}
          className="m-touch-target w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm active:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : form.mode === "edit" ? "Save changes" : "Create provider"}
        </button>
        {openInEdit ? (
          <p className="text-[10px] text-text-muted">Type stays OpenAI compatible when editing — create a new provider to change it.</p>
        ) : null}
      </div>
    </Sheet>
  );
}

export default function MobileProvidersPage() {
  const [connections, setConnections] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [tab, setTab] = useState("ai");
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [nodeForm, setNodeForm] = useState(null);
  const [nodeSaving, setNodeSaving] = useState(false);
  const [nodeError, setNodeError] = useState("");
  const [confirmNodeId, setConfirmNodeId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllConnections()
      .then((list) => {
        if (!cancelled) setConnections(list);
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
    let cancelled = false;
    fetchProviderNodes()
      .then((list) => {
        if (!cancelled) setNodes(list);
      })
      .catch((err) => {
        if (!cancelled && err?.status === 401) setAuthNeeded(true);
      })
      .finally(() => {
        if (!cancelled) setNodesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const c of connections) {
      const key = c.provider?.toLowerCase() || "unknown";
      if (!map.has(key)) map.set(key, { provider: c.provider, connections: [] });
      map.get(key).connections.push(c);
    }
    return [...map.values()].map((g) => {
      const active = g.connections.filter((c) => c.isActive !== false).length;
      const errors = g.connections.filter((c) => connStatus(c).key === "error").length;
      return { ...g, active, errors, total: g.connections.length };
    });
  }, [connections]);

  const visible = groups.filter((g) => {
    if (filter === "active") return g.active > 0;
    if (filter === "errors") return g.errors > 0;
    return true;
  });

  const nodeConnections = (nodeId) => connections.filter((c) => c.provider === nodeId);

  const toggleGroup = async (g, next) => {
    const prev = g.active > 0;
    setConnections((prev) => prev.map((c) => (c.provider === g.provider ? { ...c, isActive: next } : c)));
    if (detail?.provider === g.provider) {
      setDetail({ ...detail, connections: detail.connections.map((c) => ({ ...c, isActive: next })) });
    }
    const results = await Promise.allSettled(
      g.connections.map((c) => (c.id ? setConnectionActive(c.id, next) : Promise.resolve()))
    );
    // Revert when the backend rejected the change so the switch never sticks.
    if (results.some((r) => r.status === "rejected")) {
      setConnections((p) => p.map((c) => (c.provider === g.provider ? { ...c, isActive: prev } : c)));
      if (detail?.provider === g.provider) {
        setDetail({ ...detail, connections: detail.connections.map((c) => ({ ...c, isActive: prev })) });
      }
    }
  };

  const toggleNode = async (node, next) => {
    const conns = nodeConnections(node.id);
    if (!conns.length) return;
    setConnections((prev) => prev.map((c) => (c.provider === node.id ? { ...c, isActive: next } : c)));
    const results = await Promise.allSettled(
      conns.map((c) => (c.id ? setConnectionActive(c.id, next) : Promise.resolve()))
    );
    if (results.some((r) => r.status === "rejected")) {
      setConnections((prev) => prev.map((c) => (c.provider === node.id ? { ...c, isActive: !next } : c)));
    }
  };

  const runTest = async (providerId) => {
    setTesting(true);
    setTestMsg("");
    try {
      const data = await testProviders(providerId ? "provider" : "all", providerId);
      const s = data.summary;
      setTestMsg(s ? `${s.passed}/${s.total} passed` : "Test finished");
    } catch {
      setTestMsg("Test request failed");
    } finally {
      setTesting(false);
    }
  };

  const openCreate = () =>
    setNodeForm({
      mode: "create",
      variant: "openai",
      name: "",
      prefix: "",
      apiType: "chat",
      baseUrl: "https://api.openai.com/v1",
    });

  const openEdit = (node) =>
    setNodeForm({
      mode: "edit",
      id: node.id,
      variant: node.type === "anthropic-compatible" ? "anthropic" : "openai",
      name: node.name || "",
      prefix: node.prefix || "",
      apiType: node.apiType || "chat",
      baseUrl: node.baseUrl || "",
    });

  const saveNode = async () => {
    if (!nodeForm || nodeSaving) return;
    setNodeSaving(true);
    setNodeError("");
    const isOpenai = nodeForm.variant === "openai";
    const payload = {
      name: nodeForm.name.trim(),
      prefix: nodeForm.prefix.trim(),
      baseUrl: nodeForm.baseUrl.trim(),
      type: isOpenai ? "openai-compatible" : "anthropic-compatible",
      ...(isOpenai ? { apiType: nodeForm.apiType } : {}),
    };
    try {
      if (nodeForm.mode === "edit") {
        const updated = await updateProviderNode(nodeForm.id, payload);
        setNodes((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
      } else {
        const created = await createProviderNode(payload);
        setNodes((prev) => [...prev, created]);
      }
      setNodeForm(null);
    } catch (err) {
      setNodeError(err.message || "Failed to save provider");
    } finally {
      setNodeSaving(false);
    }
  };

  const removeNode = async (id) => {
    try {
      await deleteProviderNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
    } catch {
    } finally {
      setConfirmNodeId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <SegControl
          label="Provider view"
          options={[
            { value: "ai", label: "AI" },
            { value: "custom", label: "Custom" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "ai" ? (
          <button
            type="button"
            disabled={testing}
            onClick={() => runTest(null)}
            className="m-touch-target shrink-0 px-3 py-1.5 rounded-xl border border-border bg-bg-subtle text-xs font-bold text-text active:opacity-80 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test all"}
          </button>
        ) : (
          <button
            type="button"
            onClick={openCreate}
            className="m-touch-target shrink-0 px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-bold active:opacity-90"
          >
            Add custom
          </button>
        )}
      </div>

      {testMsg ? (
        <div className="px-3.5 py-2.5 rounded-xl border border-border bg-bg-subtle text-xs text-text">{testMsg}</div>
      ) : null}

      {authNeeded ? <AuthNeeded /> : null}

      {tab === "ai" ? (
        <>
          <div className="flex items-center gap-2">
            <SegControl
              label="Provider filter"
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "errors", label: "Errors" },
              ]}
              value={filter}
              onChange={setFilter}
            />
          </div>
          <SectionTitle right={<span className="text-xs font-mono text-text-muted">{groups.length} providers</span>}>
            Providers
          </SectionTitle>

          {loading ? (
            <LoadingState>Loading providers</LoadingState>
          ) : !visible.length ? (
            <EmptyState icon="hub">No providers match this filter</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((g) => {
                const config = AI_PROVIDERS[g.provider] || { color: "#6b7280", name: g.provider };
                return (
                  <div key={g.provider} className="rounded-xl border border-border bg-bg/90 overflow-hidden">
                    <div className="flex items-center gap-1 p-1.5">
                      <button
                        type="button"
                        onClick={() => setDetail(g)}
                        className="m-touch-target flex items-center gap-3 p-1.5 text-left active:bg-bg-subtle rounded-lg flex-1 min-w-0"
                      >
                        <span
                          className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                          style={{ backgroundColor: `${config.color}20`, color: config.color }}
                        >
                          {(config.textIcon || g.provider.slice(0, 2)).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-text truncate">{config.name || g.provider}</span>
                          <span className="block text-[10px] font-mono text-text-muted truncate">
                            {g.active}/{g.total} active{g.errors > 0 ? ` · ${g.errors} error` : ""}
                          </span>
                        </span>
                      </button>
                      <Toggle
                        checked={g.active > 0}
                        label={`Toggle ${g.provider}`}
                        onChange={(next) => toggleGroup(g, next)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {detail ? (
            <Sheet
              title={AI_PROVIDERS[detail.provider]?.name || detail.provider}
              subtitle={`${detail.total} connections`}
              onClose={() => setDetail(null)}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => runTest(detail.provider)}
                  className="m-touch-target flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm active:opacity-90 disabled:opacity-50"
                >
                  {testing ? "Testing…" : "Run test"}
                </button>
                <Toggle
                  checked={detail.connections.some((c) => c.isActive !== false)}
                  label={`Toggle ${detail.provider}`}
                  onChange={(next) => toggleGroup(detail, next)}
                />
              </div>
              <div className="flex flex-col gap-2">
                {detail.connections.map((c) => {
                  const st = connStatus(c);
                  return (
                    <div key={c.id || c.name} className="p-3 rounded-xl border border-border bg-bg-subtle/40 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-text truncate">{c.name || c.id}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-text-muted">
                        <span className="font-mono">{c.authType || "key"}</span>
                        {c.lastErrorAt ? <span>err {timeAgo(c.lastErrorAt)}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Sheet>
          ) : null}
        </>
      ) : (
        <>
          <SectionTitle right={<span className="text-xs font-mono text-text-muted">{nodes.length} custom</span>}>
            Custom providers
          </SectionTitle>

          {nodesLoading ? (
            <LoadingState>Loading custom providers</LoadingState>
          ) : !nodes.length ? (
            <EmptyState icon="extension">No custom providers — tap “Add custom” above</EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {nodes.map((node) => {
                const meta = nodeMeta(node);
                const conns = nodeConnections(node.id);
                const active = conns.some((c) => c.isActive !== false);
                return (
                  <div key={node.id} className="p-3 rounded-xl border border-border bg-bg/90 flex flex-col gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0"
                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                      >
                        {meta.textIcon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-text truncate">{node.name}</p>
                        <p className="text-[10px] font-mono text-text-muted truncate">{node.prefix}</p>
                      </div>
                      {conns.length ? (
                        <Toggle
                          checked={active}
                          label={`Toggle ${node.name}`}
                          onChange={(next) => toggleNode(node, next)}
                        />
                      ) : (
                        <span className="px-2 py-1 rounded-full bg-border text-text-muted text-[10px] font-bold uppercase">
                          No key
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-text-muted truncate">{node.baseUrl}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </div>
                    {conns.length ? (
                      <p className={`text-[10px] font-mono ${active ? "text-success" : "text-text-muted"}`}>
                        {active ? "Active" : "Disabled"} · {conns.length} key connection{conns.length > 1 ? "s" : ""}
                      </p>
                    ) : (
                      <p className="text-[10px] text-text-muted">
                        Add an API key in the desktop Providers page to activate this endpoint.
                      </p>
                    )}
                    <div className="border-t border-border/50 pt-2">
                      {confirmNodeId === node.id ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => removeNode(node.id)}
                            className="m-touch-target flex-1 text-[11px] font-bold text-error"
                          >
                            Confirm delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmNodeId(null)}
                            className="m-touch-target flex-1 text-[11px] font-bold text-text-muted"
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(node)}
                            className="m-touch-target flex-1 text-[11px] font-bold text-primary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmNodeId(node.id)}
                            className="m-touch-target flex-1 text-[11px] font-bold text-error"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {nodeForm ? (
        <NodeFormSheet
          form={nodeForm}
          setForm={setNodeForm}
          onClose={() => setNodeForm(null)}
          onSave={saveNode}
          saving={nodeSaving}
          error={nodeError}
        />
      ) : null}
    </div>
  );
}