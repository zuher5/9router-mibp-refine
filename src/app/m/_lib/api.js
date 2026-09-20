async function getJson(url, options) {
  const res = await fetch(url, { cache: "no-store", ...options });
  if (res.status === 401) {
    const err = new Error(`401 for ${url}`);
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.json();
}

export async function fetchUsageStats(period = "today") {
  return getJson(`/api/usage/stats?period=${encodeURIComponent(period)}`);
}

export async function fetchUsageChart(period = "7d") {
  const data = await getJson(`/api/usage/chart?period=${encodeURIComponent(period)}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchRequestDetails({ page = 1, pageSize = 20, provider = "", status = "" } = {}) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (provider) params.set("provider", provider);
  if (status) params.set("status", status);
  const data = await getJson(`/api/usage/request-details?${params.toString()}`);
  return { details: data.details || [], total: data.total ?? data.details?.length ?? 0 };
}

export async function fetchMobileProviders() {
  const [connData, nodesData] = await Promise.all([
    getJson("/api/providers").catch(() => ({ connections: [] })),
    getJson("/api/provider-nodes").catch(() => ({ nodes: [] })),
  ]);

  const nodeMap = (nodesData.nodes || []).reduce((acc, n) => {
    acc[n.id] = n.name;
    return acc;
  }, {});

  const activeList = (connData.connections || [])
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      id: c.id,
      provider: c.provider,
      name: c.name,
      authType: c.authType,
      isActive: c.isActive !== false,
      testStatus: c.testStatus,
      lastErrorAt: c.lastErrorAt,
      nodeName: nodeMap[c.provider],
    }));

  const seen = new Set();
  const deduped = [];
  for (const p of activeList) {
    const key = p.provider?.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }
  if (!seen.has("opencode")) {
    deduped.push({ provider: "opencode", name: "OpenCode Free" });
  }
  return deduped;
}

export async function fetchAllConnections() {
  const data = await getJson("/api/providers").catch(() => ({ connections: [] }));
  return data.connections || [];
}

export async function setConnectionActive(id, isActive) {
  const res = await fetch(`/api/providers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error(`toggle ${res.status}`);
}

export async function testProviders(mode, providerId) {
  const res = await fetch("/api/providers/test-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(providerId ? { mode, providerId } : { mode }),
  });
  if (!res.ok) throw new Error(`test ${res.status}`);
  return res.json();
}

export async function fetchProviderModels(connectionId) {
  const data = await getJson(`/api/providers/${encodeURIComponent(connectionId)}/models`).catch(() => ({}));
  return data.models || data || [];
}

export async function sendChatCompletion({ model, messages, signal }) {
  const res = await fetch("/api/dashboard/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }
  return res;
}

export async function fetchKeys() {
  const data = await getJson("/api/keys").catch(() => ({ keys: [] }));
  return data.keys || [];
}

export async function createKey(name) {
  const res = await fetch("/api/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`create ${res.status}`);
  return res.json();
}

export async function deleteKey(id) {
  const res = await fetch(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

export async function setKeyActive(id, isActive) {
  const res = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error(`toggle ${res.status}`);
}

export async function fetchCombos() {
  const data = await getJson("/api/combos").catch(() => ({ combos: [] }));
  return (data.combos || []).filter((c) => !c.kind || c.kind === "llm");
}

export async function deleteCombo(id) {
  const res = await fetch(`/api/combos/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`delete ${res.status}`);
}

export async function fetchPools() {
  const data = await getJson("/api/proxy-pools?includeUsage=true").catch(() => ({}));
  return data.pools || data.proxyPools || [];
}

export async function setPoolActive(id, isActive) {
  const res = await fetch(`/api/proxy-pools/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error(`toggle ${res.status}`);
}

export async function testPool(id) {
  const res = await fetch(`/api/proxy-pools/${encodeURIComponent(id)}/test`, { method: "POST" });
  if (!res.ok) throw new Error(`test ${res.status}`);
  return res.json();
}

export async function fetchAppVersion() {
  const data = await getJson("/api/version").catch(() => ({}));
  return data.currentVersion || data.version || "unknown";
}

export async function fetchRequireLogin() {
  const data = await getJson("/api/settings/require-login").catch(() => ({}));
  return data.requireLogin !== false;
}

export async function setRequireLogin(requireLogin) {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requireLogin }),
  });
  if (!res.ok) throw new Error(`save ${res.status}`);
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.assign("/login");
}
