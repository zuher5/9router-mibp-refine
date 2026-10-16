import { beforeEach, describe, expect, it, vi } from "vitest";

// Resolution order contract (matches the mobile remoteBridge 9sync talks to):
//   env var → $DATA_DIR/auth/bridge-key file → generate + persist (mode 600).
const { readSpy, writeSpy, mkdirSpy } = vi.hoisted(() => ({
  readSpy: vi.fn(),
  writeSpy: vi.fn(),
  mkdirSpy: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      readFileSync: readSpy,
      writeFileSync: writeSpy,
      mkdirSync: mkdirSpy,
    },
    readFileSync: readSpy,
    writeFileSync: writeSpy,
    mkdirSync: mkdirSpy,
  };
});

const KEY_RE = /^[0-9a-f]{64}$/;
// DATA_DIR is redirected to a throwaway temp dir by tests/setup/isolateDataDir.js,
// so key every assertion on the file name, not a fixed path.
const isKeyFile = (p) => /[\\/]auth[\\/]bridge-key$/.test(String(p));

describe("bridge key", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete process.env.REMOTE_9ROUTER_BRIDGE_KEY;
    delete process.env.NINEROUTER_BRIDGE_KEY;
    vi.clearAllMocks();
    readSpy.mockImplementation((p) => {
      if (isKeyFile(p)) throw new Error("ENOENT");
      return "";
    });
    writeSpy.mockReturnValue(undefined);
    mkdirSpy.mockReturnValue(undefined);
  });

  it("generates and persists a 64-hex key when nothing is set", async () => {
    const { getBridgeKey } = await import("../../src/lib/bridge/bridgeKey.js");
    const key = getBridgeKey();
    expect(KEY_RE.test(key)).toBe(true);
    const [pathArg, valueArg, optsArg] = writeSpy.mock.calls[0];
    expect(isKeyFile(pathArg)).toBe(true);
    expect(valueArg).toBe(key);
    expect(optsArg).toEqual({ mode: 0o600 });
  });

  it("prefers a stored file key over generating", async () => {
    readSpy.mockImplementation((p) => (isKeyFile(p) ? "ab".repeat(32) : ""));
    const { getBridgeKey } = await import("../../src/lib/bridge/bridgeKey.js");
    expect(getBridgeKey()).toBe("ab".repeat(32));
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("env override wins over the file", async () => {
    readSpy.mockImplementation((p) => (isKeyFile(p) ? "ab".repeat(32) : ""));
    vi.stubEnv("REMOTE_9ROUTER_BRIDGE_KEY", "cd".repeat(32));
    const { getBridgeKey, verifyBridgeKey } = await import("../../src/lib/bridge/bridgeKey.js");
    expect(getBridgeKey()).toBe("cd".repeat(32));
    expect(verifyBridgeKey("cd".repeat(32))).toBe(true);
    expect(verifyBridgeKey("ab".repeat(32))).toBe(false);
  });

  it("malformed stored keys are regenerated, not trusted", async () => {
    readSpy.mockImplementation((p) => (isKeyFile(p) ? "not-a-key" : ""));
    const { getBridgeKey } = await import("../../src/lib/bridge/bridgeKey.js");
    const key = getBridgeKey();
    expect(KEY_RE.test(key)).toBe(true);
    expect(writeSpy).toHaveBeenCalled();
  });

  it("verifyBridgeKey is timing-safe shape-wise: wrong key invalid, valid ok, empty invalid", async () => {
    readSpy.mockImplementation((p) => (isKeyFile(p) ? "ab".repeat(32) : ""));
    const { verifyBridgeKey } = await import("../../src/lib/bridge/bridgeKey.js");
    expect(verifyBridgeKey("ab".repeat(32))).toBe(true);
    expect(verifyBridgeKey("cd".repeat(32))).toBe(false);
    expect(verifyBridgeKey("short")).toBe(false);
    expect(verifyBridgeKey("")).toBe(false);
    expect(verifyBridgeKey(undefined)).toBe(false);
  });
});
