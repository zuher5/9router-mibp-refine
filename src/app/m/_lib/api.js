export async function fetchUsageStats(period = "today") {
  const res = await fetch(`/api/usage/stats?period=${encodeURIComponent(period)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`usage stats ${res.status}`);
  return res.json();
}

export async function fetchMobileProviders() {
  const [resConn, resNodes] = await Promise.all([
    fetch("/api/providers", { cache: "no-store" }),
    fetch("/api/provider-nodes", { cache: "no-store" }),
  ]);
  const connData = resConn.ok ? await resConn.json() : { connections: [] };
  const nodesData = resNodes.ok ? await resNodes.json() : { nodes: [] };

  const nodeMap = (nodesData.nodes || []).reduce((acc, n) => {
    acc[n.id] = n.name;
    return acc;
  }, {});

  const activeList = (connData.connections || [])
    .filter((c) => c.isActive !== false)
    .map((c) => ({
      provider: c.provider,
      name: c.name,
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
