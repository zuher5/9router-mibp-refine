// /api/bridge/* — authenticated gateway for 9sync (phone ↔ PC tooling).
//
// The mobile side of 9sync calls `/api/bridge/<rest>` — an internal gateway that
// proxies to `/api/<rest>` on the dashboard itself. This colo brings the bridge
// into the repo (it used to be an out-of-repo patch on the phone that npm
// updates silently overwrote, leaving every 9sync route a 404).
//
// Contract 9sync already speaks:
//   - `x-9r-bridge-key: <64 hex>` → checked with crypto.timingSafeEqual (401 on
//     wrong/missing key). Never forwarded to the target route.
//   - `ngrok-skip-browser-warning: true` accepted as an additional hint.
// After auth the request is re-issued to `http://127.0.0.1:<PORT>/api/<rest>`
// with a freshly injected `x-9r-cli-token`, which src/dashboardGuard.js accepts
// for all /api/* routes — exactly how the CLI already talks to the dashboard.
import { NextResponse } from "next/server";
import { verifyBridgeKey } from "@/lib/bridge/bridgeKey.js";
import { getConsistentMachineId } from "@/shared/utils/machineId.js";

export const dynamic = "force-dynamic";

const CLI_TOKEN_SALT = "9r-cli-auth";
const BRIDGE_KEY_HEADER = "x-9r-bridge-key";

// Never expose these through the bridge — auth/credentials mutation, process
// control, and the LLM API namespaces (the bridge is config sync only).
const DENIED_SEGMENTS = new Set([
  "", "settings", "version", "auth", "oauth", "shutdown",
  "v1", "v1beta", "codex", "responses", "headroom", "pxpipe", "mcp",
]);

// Config-sync namespaces the 9sync receiver actually consumes.
const ALLOWED_SEGMENTS = new Set([
  "cli-tools", "keys", "providers", "provider-nodes", "models", "combos",
  "usage", "pricing", "tunnel",
]);

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

async function handle(request, { params }) {
  const { path: segments } = await params;

  const keyHeader = request.headers.get(BRIDGE_KEY_HEADER) || request.headers.get("x-bridge-key");
  if (verifyBridgeKey(keyHeader) === false) {
    return NextResponse.json({ error: "Invalid bridge key" }, { status: 401 });
  }

  const root = segments?.[0] || "";
  if (DENIED_SEGMENTS.has(root)) {
    return NextResponse.json({ error: "Forbidden bridge path" }, { status: 403 });
  }
  if (!ALLOWED_SEGMENTS.has(root)) {
    return NextResponse.json({ error: "Path not available over the bridge" }, { status: 403 });
  }

  const port = process.env.PORT || "20127";
  const search = new URL(request.url).search;
  const target = `http://127.0.0.1:${port}/api/${(segments || []).join("/")}${search}`;

  const cliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  const headers = new Headers();
  // Forward content-type only; header lists / cookies / auth / bridge key stay out.
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-9r-cli-token", cliToken);
  headers.set("accept", request.headers.get("accept") || "application/json");

  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    });

    // Pass the upstream payload through verbatim — the target route owns the
    // shape (some cli-tools routes write files, models returns SSE-capable JSON).
    const passthrough = new Headers();
    for (const [k, v] of response.headers.entries()) {
      if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k.toLowerCase())) continue;
      passthrough.set(k, v);
    }
    return new Response(response.body, { status: response.status, headers: passthrough });
  } catch (error) {
    console.log("[bridge] proxy failure:", error?.message || error);
    return NextResponse.json({ error: "Bridge proxy failure" }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
