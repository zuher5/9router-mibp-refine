"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

const PROVIDER_ID = "9router";
const API_KEY_ENV = "OPENAI_API_KEY";

const getHermesDir = () => path.join(os.homedir(), ".hermes");
const getHermesConfigPath = () => path.join(getHermesDir(), "config.yaml");
const getHermesEnvPath = () => path.join(getHermesDir(), ".env");
const getBackupPath = () => path.join(getHermesDir(), "config.yaml.9router-bak");

// Match top-level "model:" block (until next non-indented, non-empty line)
const MODEL_BLOCK_RE = /^model:[ \t]*\r?\n((?:[ \t]+.*\r?\n?|[ \t]*\r?\n)*)/m;

// Match top-level "providers:" block (until next non-indented, non-empty line)
const PROVIDERS_BLOCK_RE = /^providers:[ \t]*\r?\n((?:[ \t]+.*\r?\n?|[ \t]*\r?\n)*)/m;

// Match a 2-space-indented provider entry inside a "providers:" block (children 4+ spaces)
const PROVIDER_ENTRY_RE = /^[ \t]{2}([^\s:#][^:]*?):[ \t]*\r?\n((?:[ \t]{4,}.*\r?\n?|[ \t]*\r?\n)*)/gm;

// Build the model block in Hermes' native format. provider "9router" resolves the named
// providers.9router entry (key_env -> OPENAI_API_KEY) at runtime.
const buildModelBlock = (model, baseUrl) =>
  `model:\n  default: "${model}"\n  provider: "${PROVIDER_ID}"\n  base_url: "${baseUrl}"\n  api_key: \${${API_KEY_ENV}}\n`;

// Build the providers.9router entry (hermes v12 providers shape; `api` is the canonical URL key).
const buildProviderEntryYaml = (baseUrl, activeModel, models) =>
  `  ${PROVIDER_ID}:\n` +
  `    name: "${PROVIDER_ID}"\n` +
  `    api: "${baseUrl}"\n` +
  `    key_env: ${API_KEY_ENV}\n` +
  `    default_model: "${activeModel}"\n` +
  `    models:\n` +
  models.map((m) => `      - "${m}"\n`).join("");

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
  };
};

// Parse providers.9router entry back to fields: name, api/base_url, key_env,
// default_model, models (list of ids).
const parseProviderEntry = (yaml) => {
  const block = yaml.match(PROVIDERS_BLOCK_RE);
  if (!block) return null;
  const body = block[1] || "";
  let entryBody = null;
  for (const m of body.matchAll(PROVIDER_ENTRY_RE)) {
    if (m[1].trim() === PROVIDER_ID) {
      entryBody = m[2] || "";
      break;
    }
  }
  if (entryBody === null) return null;

  const result = {};
  const models = [];
  let inModels = false;
  for (const line of entryBody.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (inModels && /^[ \t]{6,}/.test(line)) {
      const item = line.match(/^[ \t]*-[ \t]*["']?([^"'\r\n]+?)["']?[ \t]*$/);
      if (item) models.push(item[1].trim());
      continue;
    }
    const m = line.match(/^[ \t]{4}([^:\s][^:]*?):[ \t]*["']?([^"'\r\n]*?)["']?[ \t]*$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    inModels = key === "models";
    if (!inModels) result[key === "api" ? "api" : key] = value;
  }
  if (models.length > 0) result.models = models;
  return result;
};

const upsertModelBlock = (yaml, newBlock) => {
  if (MODEL_BLOCK_RE.test(yaml)) return yaml.replace(MODEL_BLOCK_RE, newBlock);
  return yaml.length > 0 ? `${yaml.replace(/\s*$/, "")}\n\n${newBlock}` : newBlock;
};

const removeModelBlock = (yaml) => yaml.replace(MODEL_BLOCK_RE, "").replace(/^\n+/, "");

// Insert/update providers.9router inside the "providers:" block, preserving other entries.
const upsertProviderEntry = (yaml, entryYaml) => {
  const block = yaml.match(PROVIDERS_BLOCK_RE);
  if (!block) {
    return `${yaml.replace(/\s*$/, "")}\n\nproviders:\n${entryYaml}`;
  }
  const body = block[1] || "";
  const entryRe = new RegExp(`^[ \\t]{2}${PROVIDER_ID}:[ \\t]*\\r?\\n((?:[ \\t]{4,}.*\\r?\\n?|[ \\t]*\\r?\\n)*)`, "m");
  const newBlock = entryRe.test(body)
    ? `providers:\n${body.replace(entryRe, entryYaml)}`
    : `providers:\n${entryYaml}${body}`;
  return yaml.replace(PROVIDERS_BLOCK_RE, newBlock);
};

// Remove providers.9router; drops the whole "providers:" block when it becomes empty.
const removeProviderEntry = (yaml) => {
  const block = yaml.match(PROVIDERS_BLOCK_RE);
  if (!block) return yaml;
  const body = block[1] || "";
  const entryRe = new RegExp(`^[ \\t]{2}${PROVIDER_ID}:[ \\t]*\\r?\\n((?:[ \\t]{4,}.*\\r?\\n?|[ \\t]*\\r?\\n)*)`, "m");
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
  providerCfg?.api || providerCfg?.base_url || modelCfg?.base_url || null;

export async function GET() {
  try {
    const installed = await checkHermesInstalled();
    if (!installed) {
      return NextResponse.json({ installed: false, settings: null, message: "Hermes Agent is not installed" });
    }
    const yaml = await readConfigYaml();
    const model = parseModelBlock(yaml);
    const provider = parseProviderEntry(yaml);
    const models = provider?.models?.length
      ? provider.models
      : (model?.default ? [model.default] : []);
    const activeModel = provider?.default_model || model?.default || models[0] || "";
    const baseURL = providerUrl(provider, model);
    return NextResponse.json({
      installed: true,
      settings: { model, provider },
      has9Router: !!(has9RouterConfig(model, provider) && (providerUrl(provider, model) || model?.base_url)),
      configPath: getHermesConfigPath(),
      hermes: {
        models,
        activeModel,
        baseURL,
        defaultModel: provider?.default_model || "",
        format: provider ? "native" : "legacy",
      },
    });
  } catch (error) {
    console.log("Error checking hermes settings:", error);
    return NextResponse.json({ error: "Failed to check hermes settings" }, { status: 500 });
  }
}

// POST - Apply 9Router as the Hermes inference provider (multi-model support).
// Writes the native hermes config: model block (provider "9router") + providers.9router entry.
export async function POST(request) {
  try {
    const { baseUrl, apiKey, model, models, activeModel } = await request.json();

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
    let newYaml = upsertModelBlock(existingYaml, buildModelBlock(finalActive, normalizedBaseUrl));
    newYaml = upsertProviderEntry(newYaml, buildProviderEntryYaml(normalizedBaseUrl, finalActive, modelsArray));
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
        // Last model removed — reset the whole 9router integration.
        yaml = removeProviderEntry(yaml);
        yaml = removeModelBlock(yaml);
        await fs.writeFile(configPath, yaml);
        return NextResponse.json({ success: true, message: `${PROVIDER_ID} settings removed (no models left)` });
      }
      const url = providerUrl(provider, model) || "";
      const finalActive = model?.default === modelToRemove ? remaining[0] : (model?.default || remaining[0]);
      let newYaml = removeProviderEntry(yaml);
      newYaml = upsertProviderEntry(newYaml, buildProviderEntryYaml(url, finalActive, remaining));
      newYaml = upsertModelBlock(newYaml, buildModelBlock(finalActive, url));
      await fs.writeFile(configPath, newYaml);
      return NextResponse.json({ success: true, message: `Model "${modelToRemove}" removed` });
    }

    yaml = removeProviderEntry(yaml);
    yaml = removeModelBlock(yaml);
    await fs.writeFile(configPath, yaml);
    return NextResponse.json({ success: true, message: `${PROVIDER_ID} settings removed from Hermes` });
  } catch (error) {
    console.log("Error resetting hermes settings:", error);
    return NextResponse.json({ error: "Failed to reset hermes settings" }, { status: 500 });
  }
}