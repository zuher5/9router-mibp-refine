// Bridge key for the /api/bridge/* gateway and the 9sync tooling.
//
// The key is a 64-hex shared secret resolved exactly like the mobile-side
// remoteBridge contract 9sync expects:
//   1. Env `REMOTE_9ROUTER_BRIDGE_KEY` / `NINEROUTER_BRIDGE_KEY` overrides.
//   2. File `$DATA_DIR/auth/bridge-key` (mode 600) persists across restarts.
//   3. Neither exists → generate `crypto.randomBytes(32)` hex and store it.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir.js";

const BRIDGE_KEY_FILE = path.join(DATA_DIR, "auth", "bridge-key");
const BRIDGE_KEY_RE = /^[0-9a-f]{64}$/i;

let cachedKey = null;

export function bridgeKeyFilePath() {
  return BRIDGE_KEY_FILE;
}

// Resolve (and, when missing, create) the bridge key. Returns the raw hex key.
export function getBridgeKey() {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.REMOTE_9ROUTER_BRIDGE_KEY || process.env.NINEROUTER_BRIDGE_KEY;
  if (fromEnv && BRIDGE_KEY_RE.test(fromEnv.trim())) {
    cachedKey = fromEnv.trim().toLowerCase();
    return cachedKey;
  }

  try {
    const stored = fs.readFileSync(BRIDGE_KEY_FILE, "utf8").trim();
    if (stored && BRIDGE_KEY_RE.test(stored)) {
      cachedKey = stored.toLowerCase();
      return cachedKey;
    }
  } catch {}

  // First run: mint 32 bytes of entropy and persist. timingSafeEqual consumers
  // require a constant length, so anything malformed on disk is replaced.
  cachedKey = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(path.dirname(BRIDGE_KEY_FILE), { recursive: true });
    fs.writeFileSync(BRIDGE_KEY_FILE, cachedKey, { mode: 0o600 });
  } catch (err) {
    console.log("Failed to persist bridge key onto disk; it will not survive restarts:", err?.message || err);
  }
  return cachedKey;
}

// Force a fresh key on next resolve (key rotation support).
export function resetBridgeKeyCache() {
  cachedKey = null;
}

// timingSafeEqual rejects mismatched lengths, so pad to keep the call constant-
// length for both wrong-shaped and right-shaped inputs.
export function verifyBridgeKey(presented) {
  const provided = String(presented || "").trim().toLowerCase();
  const expected = getBridgeKey();
  const len = Math.max(provided.length, expected.length);
  const a = Buffer.alloc(len);
  const b = Buffer.alloc(len);
  a.write(provided);
  b.write(expected);
  const valid = provided.length === expected.length && crypto.timingSafeEqual(a, b);
  return valid;
}
