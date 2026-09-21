"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { CLI_TOOLS_CONFIG } from "@/shared/constants/config";

const execAsync = promisify(exec);

const PROVIDER_ID = "9router";
const API_KEY_ENV = "OPENAI_API_KEY";
const CLOUD_PROVIDER_ID = CLI_TOOLS_CONFIG.cloudProviderId;

// Hermes home resolution mirrors hermes_constants.get_hermes_home():
// context override → HERMES_HOME env var → platform default
//   (Windows: %LOCALAPPDATA%\hermes, Linux/macOS: ~/.hermes).
// Writing anywhere else produces a config file Hermes never reads — the original
// "settings applied but nothing changed" bug.
const getHermesDir = () => {
  const envHome = process.env.HERMES_HOME;
  if (envHome && envHome.trim()) return path.resolve(envHome.trim());
  if (os.platform() === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData && localAppData.trim()) return path.join(localAppData.trim(), "hermes");
    return path.join(os.homedir(), "AppData", "Local", "hermes");
  }
  return path.join(os.homedir(), ".hermes");
};

// Legacy location the first dashboard integration used on Windows (wrong home). Kept as a
// read-once migration source when the real Hermes home has no config yet; never a write target.
const getLegacyHermesDir = () => path.join(os.homedir(), ".hermes");

const getHermesConfigPath = () => path.join(getHermesDir(), "config.yaml");
const getHermesEnvPath = () => path.join(getHermesDir(), ".env");
const getBackupPath = () => path.join(getHermesDir(), "config.yaml.9router-bak");

// Match top-level "model:" block (until next non-indented, non-empty line)
const MODEL_BLOCK_RE = /^model:[ \t]*\r?\n((?:[ \t]+.*\r?\n?|[ \t]*\r?\n)*)/m;

// Match top-level "providers:" block (until next non-indented, non-empty line)
const PROVIDERS_BLOCK_RE = /^providers:[ \t]*\r?\n((?:[ \t]+.*\r?\n?|[ \t]*\r?\n)*)/m;

// Match a 2-space-indented provider entry inside a "providers:" block (children 4+ spaces)
const PROVIDER_ENTRY_RE = /^[ \t]{2}([^\s:#][^:]*?):[ \t]*\r?\n((?:[ \t]{4,}.*\r?\n?|[ \t]*\r?\n)*)/gm;

// Model block in Hermes' native format. `provider: 9router` resolves the named
// providers.9router entry (key_env -> OPENAI_API_KEY) at runtime. api_mode is preserved
// when the user's config already carries it (hermes writes api_mode into the model block).
const buildModelBlock = (model, baseUrl, existingModel) => {
  const apiMode = existingModel?.api_mode ? `  api_mode: ${existingModel.api_mode}\n` : "";
  return (
    `model:\n` +
    `  default: "${model}"\n` +
    `  provider: "${PROVIDER_ID}"\n` +
    `  base_url: "${baseUrl}"\n` +
    `  api_key: \${${API_KEY_ENV}}\n` +
    apiMode
  );
};

// Write the providers.9router entry the way Hermes itself persists it (base_url + models dict),
// so a Hermes update / config migration never surprises us. `discover_models: false` is written
// explicitly: Hermes defaults discovery to true and would otherwise repopulate the models dict
// with the gateway's full catalog every start, drowning the models the dashboard manages
// (verified: model_setup_flows_custom.py / model_switch.py honor discover_models=false and use
// the configured models verbatim). per-entry api_mode / transport are preserved (entries may
// use "transport" as the v12 spelling).
const buildProviderEntryYaml = (baseUrl, activeModel, models, existingEntry = null, providerId = PROVIDER_ID) => {
  const preserved = existingEntry || {};
  const extras = ["api_mode", "transport"]
    .filter((k) => preserved[k])
    .map((k) => `    ${k}: ${preserved[k]}\n`)
    .join("");
  return (
    `  ${providerId}:\n` +
    `    name: ${providerId}\n` +
    `    base_url: "${baseUrl}"\n` +
    `    key_env: ${API_KEY_ENV}\n` +
    `    model: "${activeModel}"\n` +
    `    default_model: "${activeModel}"\n` +
    `    discover_models: false\n` +
    extras +
    `    models:\n` +
    models.map((m) => `      ${m}: {}\n`).join("")
  );
};

// Parse current model block back to fields (best-effort, simple key:value)
const parseModelBlock = (yaml) => {
  const match = yaml.match(MODEL_BLOCK_RE);
  if (!match) return null;
  const body = match[1] || "";
  const get = (key) => {
    const m = body.match(new RegExp(`^[ \\t]+${key}:[ \\t]*["']?([^"'\\r\\n]+)["']?`, "m"));
    return m ? m[1].trim() : null;
  };
  return {
    default: get("default"),
    provider: get("provider"),
    base_url: get("base_url"),
    api_key: get("api_key"),
    api_mode: get("api_mode"),
  };
};

// Extract a model id from a line inside a `models:` block. Handles the shapes Hermes writes
// (`id: {}` dict) and the earlier dashboard writes (`- "id"` list), including ids that
// themselves contain a colon (e.g. ollama/gpt-oss:120b):
//   - "cl/deepseek/deepseek-v4-flash"
//   GratisanCok: {}
//   ollama/gpt-oss:120b: {}
const parseModelsItem = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const dashed = /^[-*][ \t]*/.test(trimmed);
  const rest = dashed ? trimmed.replace(/^[-*][ \t]*/, "").trim() : trimmed;
  // Quoted plain id (`- "id"`) — unquote wholesale; colons inside belong to the id.
  const quoted = rest.match(/^(["'])(.*)\1$/);
  if (quoted) return quoted[2].trim() || null;
  // `- id:` / `- id: {}` / `id:` / `id: {}` — split at the LAST colon whose value is `{}` or empty.
  const pair = rest.match(/^(.+?)[ \t]*:[ \t]*(\{\}|)[ \t]*$/);
  if (pair) return pair[1].trim() || null;
  // Bare dashed id without a colon (`- GratisanCok`)
  return dashed ? (rest || null) : null;
};

// Parse a provider entry back to fields: name, base_url/api/url, key_env, model,
// default_model, api_mode/transport, models (array of ids).
const parseProviderEntry = (yaml, providerId = PROVIDER_ID) => {
  const block = yaml.match(PROVIDERS_BLOCK_RE);
  if (!block) return null;
  const body = block[1] || "";
  let entryBody = null;
  for (const m of body.matchAll(PROVIDER_ENTRY_RE)) {
    if (m[1].trim() === providerId) {
      entryBody = m[2] || "";
      break;
    }
  }
  if (entryBody === null) return null;

  const result = {};
  const models = [];
  for (const line of entryBody.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const indent = line.match(/^[ \t]*/)[0].length;
    if (indent >= 6) {
      const id = parseModelsItem(line);
      if (id) models.push(id);
      continue;
    }
    const m = line.match(/^[ \t]{4}([^:\s][^:]*?):[ \t]*["']?([^"'\r\n]*?)["']?[ \t]*$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (key !== "models") result[key] = value;
  }
  if (models.length > 0) result.models = models;
  return result;
};

const upsertModelBlock = (yaml, newBlock) => {
  if (MODEL_BLOCK_RE.test(yaml)) return yaml.replace(MODEL_BLOCK_RE, newBlock);
  return yaml.length > 0 ? `${yaml.replace(/\s*$/, "")}\n\n${newBlock}` : newBlock;
};

const removeModelBlock = (yaml) => yaml.replace(MODEL_BLOCK_RE, "").replace(/^\n+/, "");

// Insert/update a provider entry inside the "providers:" block, preserving other entries.
// Entries not yet present are prepended, so upserting cloud LAST keeps local FIRST.
const upsertProviderEntry = (yaml, entryYaml, providerId = PROVIDER_ID) => {
  const block = yaml.match(PROVIDERS_BLOCK_RE);
  if (!block) {
    return `${yaml.replace(/\s*$/, "")}\n\nproviders:\n${entryYaml}`;
  }
  const body = block[1] || "";
  const entryRe = new RegExp(`^[ \\t]{2}${providerId}:[ \\t]*\\r?\\n((?:[ \\t]{4,}.*\\r?\\n?|[ \\t]*\\r?\\n)*)`, "m");
  const newBlock = entryRe.test(body)
    ? `providers:\n${body.replace(entryRe, entryYaml)}`
    : `providers:\n${entryYaml}${body}`;
  return yaml.replace(PROVIDERS_BLOCK_RE, newBlock);
};

// Remove a provider entry; drops the whole "providers:" block when it becomes empty.
const removeProviderEntry = (yaml, providerId = PROVIDER_ID) => {
  const block = yaml.match(PROVIDERS_BLOCK_RE);
  if (!block) return yaml;
  const body = block[1] || "";
  const entryRe = new RegExp(`^[ \\t]{2}${providerId}:[ \\t]*\\r?\\n((?:[ \\t]{4,}.*\\r?\\n?|[ \\t]*\\r?\\n)*)`, "m");
  if (!entryRe.test(body)) return yaml;
  const newBody = body.replace(entryRe, "");
  if (!newBody.replace(/[ \t\r\n]+/g, "")) {
    // Nobody left in providers: — remove the entire block.
    return yaml.replace(PROVIDERS_BLOCK_RE, "").replace(/^\n+/, "");
  }
  return yaml.replace(PROVIDERS_BLOCK_RE, `providers:\n${newBody}`);
};

// .env helpers — upsert/remove single KEY=VALUE line
const upsertEnvVar = (envText, key, value) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  if (re.test(envText)) return envText.replace(re, line);
  return envText.length > 0 && !envText.endsWith("\n") ? `${envText}\n${line}\n` : `${envText}${line}\n`;
};

const checkHermesInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where hermes" : "which hermes";
    await execAsync(command, { windowsHide: true });
    return true;
  } catch {
    try {
      await fs.access(getHermesConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

const readConfigYaml = async () => {
  try {
    return await fs.readFile(getHermesConfigPath(), "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
};

const readEnvFile = async () => {
  try {
    return await fs.readFile(getHermesEnvPath(), "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
};

const readDedupedModels = (models) => [...new Set((models || []).filter((m) => m && typeof m === "string"))];

// Snapshot current config before any overwrite (one-slot rollback safety).
const backupConfig = async () => {
  try {
    const content = await fs.readFile(getHermesConfigPath(), "utf-8");
    await fs.writeFile(getBackupPath(), content, "utf-8");
  } catch { /* nothing to back up yet */ }
};

const isLocalOrTunnel = (url) => !!url && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url);

// Native = providers.9router entry present; legacy = model.provider "custom" + loopback URL.
const has9RouterConfig = (modelCfg, providerCfg) => {
  if (providerCfg) {
    const url = providerCfg.api || providerCfg.base_url || modelCfg?.base_url || "";
    return isLocalOrTunnel(url);
  }
  return !!modelCfg && modelCfg.provider === "custom" && isLocalOrTunnel(modelCfg.base_url);
};

const providerUrl = (providerCfg, modelCfg) =>
  providerCfg?.api || providerCfg?.url || providerCfg?.base_url || modelCfg?.base_url || null;

export const __test__ = {
  buildProviderEntryYaml,
  parseProviderEntry,
  upsertProviderEntry,
  removeProviderEntry,
  upsertEnvVar,
};

export async function GET() {
  try {
    const installed = await checkHermesInstalled();
    if (!installed) {
      return NextResponse.json({ installed: false, settings: null, message: "Hermes Agent is not installed" });
    }
    const yaml = await readConfigYaml();
    const dir = getHermesDir();
    const legacyDir = getLegacyHermesDir();
    let legacyDetected = false;
    let sourceYaml = yaml;
    // Real Hermes home is empty (e.g. first run after the home-resolution fix): fall back to
    // the legacy ~/.hermes config as a read-once migration source so nothing is lost.
    if (!yaml.trim() && dir !== legacyDir) {
      try {
        const legacyConfig = await fs.readFile(path.join(legacyDir, "config.yaml"), "utf-8");
        if (legacyConfig.trim()) {
          sourceYaml = legacyConfig;
          legacyDetected = true;
        }
      } catch { /* no legacy config */ }
    }
    const model = parseModelBlock(sourceYaml);
    const provider = parseProviderEntry(sourceYaml);
    const models = provider?.models?.length ? provider.models : (model?.default ? [model.default] : []);
    const activeModel = provider?.default_model || model?.default || models[0] || "";
    const baseURL = providerUrl(provider, model);
    return NextResponse.json({
      installed: true,
      settings: { model, provider },
      has9Router: !!(has9RouterConfig(model, provider) && baseURL),
      configPath: getHermesConfigPath(),
      legacyDetected,
      hermes: {
        models,
        activeModel,
        baseURL,
        defaultModel: provider?.default_model || "",
        format: provider ? "native" : "legacy",
        dualConfigured: !!parseProviderEntry(sourceYaml, CLOUD_PROVIDER_ID),
      },
    });
  } catch (error) {
    console.log("Error checking hermes settings:", error);
    return NextResponse.json({ error: "Failed to check hermes settings" }, { status: 500 });
  }
}

// POST - Apply 9Router as the Hermes inference provider (multi-model support).
// Writes only the two managed blocks (model + providers.9router) into the user's real
// Hermes config; everything else in the file is left untouched.
export async function POST(request) {
  try {
    const { baseUrl, apiKey, model, models, activeModel, includeCloud, cloudBaseUrl } = await request.json();

    // Accept either `model` (string, legacy) or `models` (array of strings)
    const requested = Array.isArray(models) ? models : (typeof model === "string" ? [model] : []);
    const modelsArray = readDedupedModels(requested);

    if (!baseUrl || modelsArray.length === 0) {
      return NextResponse.json({ error: "baseUrl and at least one model are required" }, { status: 400 });
    }

    const dir = getHermesDir();
    await fs.mkdir(dir, { recursive: true });
    await backupConfig();

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const finalActive = activeModel && modelsArray.includes(activeModel) ? activeModel : modelsArray[0];

    const existingYaml = await readConfigYaml();
    const existingModel = parseModelBlock(existingYaml);
    const existingProvider = parseProviderEntry(existingYaml);

    let newYaml = upsertModelBlock(existingYaml, buildModelBlock(finalActive, normalizedBaseUrl, existingModel));

    // Dual-endpoint mirror: write a cloud provider with the same models when asked.
    // Upsert cloud FIRST so a freshly inserted local entry stays above it.
    if (includeCloud) {
      const cloudUrl = (cloudBaseUrl || CLI_TOOLS_CONFIG.cloudBaseUrl).endsWith("/v1")
        ? (cloudBaseUrl || CLI_TOOLS_CONFIG.cloudBaseUrl)
        : `${cloudBaseUrl || CLI_TOOLS_CONFIG.cloudBaseUrl}/v1`;
      const existingCloud = parseProviderEntry(existingYaml, CLOUD_PROVIDER_ID);
      newYaml = upsertProviderEntry(newYaml, buildProviderEntryYaml(cloudUrl, finalActive, modelsArray, existingCloud, CLOUD_PROVIDER_ID));
    } else if (parseProviderEntry(existingYaml, CLOUD_PROVIDER_ID)) {
      newYaml = removeProviderEntry(newYaml, CLOUD_PROVIDER_ID);
    }
    newYaml = upsertProviderEntry(newYaml, buildProviderEntryYaml(normalizedBaseUrl, finalActive, modelsArray, existingProvider));
    await fs.writeFile(getHermesConfigPath(), newYaml);

    // Update .env — upsert OPENAI_API_KEY only when caller provides one
    if (apiKey) {
      const existingEnv = await readEnvFile();
      const newEnv = upsertEnvVar(existingEnv, API_KEY_ENV, apiKey);
      await fs.writeFile(getHermesEnvPath(), newEnv);
    }

    return NextResponse.json({
      success: true,
      message: "Hermes settings applied successfully!",
      configPath: getHermesConfigPath(),
      format: "native",
    });
  } catch (error) {
    console.log("Error updating hermes settings:", error);
    return NextResponse.json({ error: "Failed to update hermes settings" }, { status: 500 });
  }
}

// DELETE - Remove the whole 9router integration, or a single model when ?model=<id> is given.
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelToRemove = searchParams.get("model");
    const configPath = getHermesConfigPath();

    let yaml = "";
    try {
      yaml = await fs.readFile(configPath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    await backupConfig();

    if (modelToRemove) {
      const provider = parseProviderEntry(yaml);
      const model = parseModelBlock(yaml);
      const models = readDedupedModels(provider?.models || []);
      if (!provider || !models.includes(modelToRemove)) {
        return NextResponse.json({ success: true, message: `Model "${modelToRemove}" not configured` });
      }
      const remaining = models.filter((m) => m !== modelToRemove);
      if (remaining.length === 0) {
        // Last model removed — reset the whole 9router integration (+ cloud mirror).
        yaml = removeProviderEntry(yaml);
        yaml = removeProviderEntry(yaml, CLOUD_PROVIDER_ID);
        yaml = removeModelBlock(yaml);
        await fs.writeFile(configPath, yaml);
        return NextResponse.json({ success: true, message: `${PROVIDER_ID} settings removed (no models left)` });
      }
      const url = providerUrl(provider, model) || "";
      const finalActive = model?.default === modelToRemove ? remaining[0] : (model?.default || remaining[0]);
      let newYaml = removeProviderEntry(yaml);
      newYaml = upsertProviderEntry(newYaml, buildProviderEntryYaml(url, finalActive, remaining, provider));
      const cloudEntry = parseProviderEntry(yaml, CLOUD_PROVIDER_ID);
      if (cloudEntry) {
        newYaml = removeProviderEntry(newYaml, CLOUD_PROVIDER_ID);
        const cloudUrl = providerUrl(cloudEntry, null) || "";
        newYaml = upsertProviderEntry(newYaml, buildProviderEntryYaml(cloudUrl, finalActive, remaining, cloudEntry, CLOUD_PROVIDER_ID));
      }
      newYaml = upsertModelBlock(newYaml, buildModelBlock(finalActive, url, model));
      await fs.writeFile(configPath, newYaml);
      return NextResponse.json({ success: true, message: `Model "${modelToRemove}" removed` });
    }

    yaml = removeProviderEntry(yaml);
    yaml = removeProviderEntry(yaml, CLOUD_PROVIDER_ID);
    yaml = removeModelBlock(yaml);
    await fs.writeFile(configPath, yaml);
    return NextResponse.json({ success: true, message: `${PROVIDER_ID} settings removed from Hermes` });
  } catch (error) {
    console.log("Error resetting hermes settings:", error);
    return NextResponse.json({ error: "Failed to reset hermes settings" }, { status: 500 });
  }
}