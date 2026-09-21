import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock("child_process", () => ({ exec: mocks.exec }));
vi.mock("fs/promises", () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  mkdir: mocks.mkdir,
  access: mocks.access,
}));

const { __test__ } = await import(
  "../../src/app/api/cli-tools/hermes-settings/route.js"
);
const {
  buildProviderEntryYaml,
  parseProviderEntry,
  upsertProviderEntry,
  removeProviderEntry,
} = __test__;

const LOCAL = "http://127.0.0.1:20128/v1";
const CLOUD = "https://9router.example.cloud/v1";
const MODELS = ["ag/gemini-3.8-flash-high", "oc/big-pickle"];

describe("hermes dual-endpoint helpers", () => {
  it("builds a cloud provider entry mirroring the local one", () => {
    const yaml = buildProviderEntryYaml(CLOUD, "ag/gemini-3.8-flash-high", MODELS, null, "9router-cloud");
    expect(yaml).toContain("  9router-cloud:");
    expect(yaml).toContain(`    base_url: "${CLOUD}"`);
    expect(yaml).toContain("    default_model: \"ag/gemini-3.8-flash-high\"");
    expect(yaml).toContain("      oc/big-pickle: {}");
    expect(yaml).toContain("    discover_models: false");
  });

  it("keeps local provider first when cloud is inserted before it", () => {
    let yaml = `model:\n  default: "ag/gemini-3.8-flash-high"\n  provider: "9router"\nproviders:\n  atria:\n    name: Atria\n`;
    yaml = upsertProviderEntry(
      yaml,
      buildProviderEntryYaml(CLOUD, MODELS[0], MODELS, null, "9router-cloud")
    );
    yaml = upsertProviderEntry(yaml, buildProviderEntryYaml(LOCAL, MODELS[0], MODELS));
    const providers = yaml.match(/^providers:\r?\n([\s\S]*)$/m)[1];
    const localIdx = providers.indexOf("  9router:");
    const cloudIdx = providers.indexOf("  9router-cloud:");
    expect(localIdx).toBeGreaterThan(-1);
    expect(cloudIdx).toBeGreaterThan(-1);
    expect(localIdx).toBeLessThan(cloudIdx);
    expect(providers).toContain("  atria:");
  });

  it("parses a cloud provider entry back to fields", () => {
    const yaml = `providers:\n  9router:\n    name: "9router"\n    base_url: "http://127.0.0.1:20128/v1"\n    key_env: OPENAI_API_KEY\n    default_model: "m1"\n    models:\n      m1: {}\n      m2: {}\n  9router-cloud:\n    name: "9router-cloud"\n    base_url: "https://9router.example.cloud/v1"\n    key_env: OPENAI_API_KEY\n    default_model: "m1"\n    discover_models: false\n    models:\n      m1: {}\n      m2: {}\n`;
    const cloud = parseProviderEntry(yaml, "9router-cloud");
    expect(cloud.base_url).toBe("https://9router.example.cloud/v1");
    expect(cloud.models).toEqual(["m1", "m2"]);
    expect(cloud.default_model).toBe("m1");
  });

  it("removes only the cloud provider, keeping local intact", () => {
    const yaml = `providers:\n  9router:\n    name: "9router"\n    base_url: "http://127.0.0.1:20128/v1"\n    models:\n      m1: {}\n  9router-cloud:\n    name: "9router-cloud"\n    base_url: "https://c/v1"\n    models:\n      m1: {}\n`;
    const out = removeProviderEntry(yaml, "9router-cloud");
    expect(out).toContain("  9router:");
    expect(out).not.toContain("9router-cloud");
  });
});