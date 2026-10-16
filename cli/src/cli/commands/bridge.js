// `9router bridge` — print (and create) the x-9r-bridge-key the /api/bridge/*
// gateway accepts, plus how PC-side tools consume it.
//
// mirrors src/lib/bridge/bridgeKey.js resolution:
//   1. Env REMOTE_9ROUTER_BRIDGE_KEY / NINEROUTER_BRIDGE_KEY.
//   2. File <DATA_DIR>/auth/bridge-key (created on first run, mode 600).
//      DATA_DIR follows src/lib/dataDir.js: DATA_DIR env, else
//      %APPDATA%/9router (win) or ~/.9router.
//
// This command never talks to the network — it only reports the machine's own
// config, so it is safe to run while the server is starting up or offline.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const KEY_RE = /^[0-9a-f]{64}$/;
const BRIDGE_KEY_HEADER = "x-9r-bridge-key";

function dataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "9router");
  }
  return path.join(os.homedir(), ".9router");
}

function resolveKey() {
  const envKey = process.env.REMOTE_9ROUTER_BRIDGE_KEY || process.env.NINEROUTER_BRIDGE_KEY;
  if (envKey && KEY_RE.test(envKey.trim())) {
    return { key: envKey.trim().toLowerCase(), source: "environment variable" };
  }
  const file = path.join(dataDir(), "auth", "bridge-key");
  try {
    const stored = fs.readFileSync(file, "utf8").trim();
    if (stored && KEY_RE.test(stored)) return { key: stored.toLowerCase(), source: file };
  } catch {}
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generated, { mode: 0o600 });
    return { key: generated, source: `${file} (created)` };
  } catch {
    return { key: generated, source: "ephemeral (not persisted — check file permissions)" };
  }
}

function printEndpoint() {
  if (process.platform === "win32") return "%APPDATA%\\9router\\auth\\bridge-key";
  return "~/.9router/auth/bridge-key";
}

function run() {
  const { key, source } = resolveKey();
  console.log("🌉 9router bridge");
  console.log("");
  console.log(`  Bridge key  : ${key}`);
  console.log(`  Key source  : ${source}`);
  console.log(`  Key location: ${printEndpoint()}`);
  console.log("");
  console.log("  Gateway      : /api/bridge/*  (built into this server — no extra patch needed)");
  console.log(`  Auth header  : ${BRIDGE_KEY_HEADER}: <bridge key>`);
  console.log("");
  console.log("  Consume from a PC (9sync / scripts):");
  console.log(`    curl -H "${BRIDGE_KEY_HEADER}: $KEY" http://<server-url>/api/bridge/keys`);
  console.log("");
  console.log("  Allowlisted namespaces: cli-tools, keys, providers, provider-nodes,");
  console.log("  models, combos, usage, pricing, tunnel. Everything else is denied, so");
  console.log("  leaking the key exposes tool config sync, not model-proxy access.");
  console.log("");
  console.log("  Rotate: delete the key file above and rerun this command.");
}

module.exports = { run };
