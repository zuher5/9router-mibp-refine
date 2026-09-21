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
const PROVIDER_PACKAGE = "aisdk:@ai-sdk/openai-compatible";
const CLOUD_PROVIDER_ID = CLI_TOOLS_CONFIG.cloudProviderId;

const getConfigDir = () => path.join(os.homedir(), ".config", "opencode");
const getConfigPath = () => path.join(getConfigDir(), "opencode.json");
const getBackupPath = () => path.join(getConfigDir(), "opencode.json.9router-bak");

// Check if opencode CLI is installed (via which/where or config file exists)
const checkOpenCodeInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where opencode" : "which opencode";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

// opencode config files may use JSONC format (trailing commas, comments).
// Strip trailing commas before parsing to avoid SyntaxError on valid JSONC.
const parseJsonC = (content) => {
  const stripped = content.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
};

const readConfig = async () => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    return parseJsonC(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    // If the config file exists but is unparseable (corrupted, exotic JSONC),
    // treat it as "no config" rather than throwing a 500 that the UI
    // misinterprets as "opencode not installed".
    return null;
  }
};

// Normalize the 9router provider entry regardless of V1 (`provider`) or V2 (`providers`) shape.
const getProviderEntry = (config) => {
  if (!config) return { entry: null, format: null };
  const v2 = config.providers?.[PROVIDER_ID];
  if (v2) return { entry: v2, format: "v2" };
  const v1 = config.provider?.[PROVIDER_ID];
  if (v1) return { entry: v1, format: "v1" };
  return { entry: null, format: null };
};

const getProviderBaseURL = (entry) => entry?.settings?.baseURL || entry?.options?.baseURL || null;

const getProviderModels = (entry) => Object.keys(entry?.models || {});

const getActiveModel = (config) => {
  if (typeof config?.model === "string" && config.model.startsWith(`${PROVIDER_ID}/`)) {
    return config.model.slice(PROVIDER_ID.length + 1);
  }
  const agentModel = config?.agents?.explorer?.model;
  if (agentModel && typeof agentModel === "object" && agentModel.providerID === PROVIDER_ID) {
    return agentModel.model;
  }
  return null;
};

const getSubAgentModel = (config) => {
  const agentModel = config?.agents?.explorer?.model;
  if (agentModel && typeof agentModel === "object" && agentModel.providerID === PROVIDER_ID) {
    return agentModel.model;
  }
  if (typeof agentModel === "string" && agentModel.startsWith(`${PROVIDER_ID}/`)) {
    return agentModel.slice(PROVIDER_ID.length + 1);
  }
  return null;
};

// Convert a model entry to V2 shape, preserving capabilities when already V2.
const toV2Model = (name, previous) => {
  if (previous?.capabilities) {
    return { name: previous.name || name, capabilities: previous.capabilities };
  }
  const input = Array.isArray(previous?.modalities?.input) && previous.modalities.input.length > 0
    ? previous.modalities.input
    : ["text", "image"];
  const output = Array.isArray(previous?.modalities?.output) && previous.modalities.output.length > 0
    ? previous.modalities.output
    : ["text"];
  return { name, capabilities: { tools: true, input, output } };
};

const has9RouterConfig = (config) => getProviderEntry(config).entry !== null;

// Snapshot current config file before any overwrite (one-slot rollback safety).
const backupConfig = async () => {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    await fs.writeFile(getBackupPath(), content, "utf-8");
  } catch { /* nothing to back up yet */ }
};

// GET - Check opencode CLI and read current settings (supports V1 + V2 config)
export async function GET() {
  try {
    const isInstalled = await checkOpenCodeInstalled();

    if (!isInstalled) {
      return NextResponse.json({
        installed: false,
        config: null,
        message: "OpenCode CLI is not installed",
      });
    }

    const config = await readConfig();
    const { entry, format } = getProviderEntry(config);

    return NextResponse.json({
      installed: true,
      config,
      has9Router: has9RouterConfig(config),
      configPath: getConfigPath(),
        opencode: {
          models: getProviderModels(entry),
          activeModel: getActiveModel(config),
          subagentModel: getSubAgentModel(config),
          baseURL: getProviderBaseURL(entry),
          format,
          dualConfigured: !!config?.providers?.[CLOUD_PROVIDER_ID],
        },
    });
  } catch (error) {
    console.log("Error checking opencode settings:", error);
    return NextResponse.json({ error: "Failed to check opencode settings" }, { status: 500 });
  }
}

// POST - Apply 9Router as openai-compatible provider (multi-model support).
// Writes the native opencode V2 config format (providers/settings/agents).
export async function POST(request) {
  try {
    const { baseUrl, apiKey, model, models, activeModel, subagentModel, includeCloud, cloudBaseUrl } = await request.json();

    // Accept either `model` (string, legacy) or `models` (array of strings)
    const modelsArray = Array.isArray(models) ? models.slice() : (typeof model === "string" ? [model] : []);

    if (!baseUrl || modelsArray.length === 0) {
      return NextResponse.json({ error: "baseUrl and at least one model are required" }, { status: 400 });
    }

    const configDir = getConfigDir();
    const configPath = getConfigPath();

    await fs.mkdir(configDir, { recursive: true });
    await backupConfig();

    // Read existing config or start fresh
    let config = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = parseJsonC(existing);
      if (!config || typeof config !== "object") config = {};
    } catch { /* No existing config */ }

    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const keyToUse = apiKey || "sk_9router";
    const effectiveSubagentModel = subagentModel || modelsArray[0];

    // Drop legacy V1 keys if present (config.provider / config.agent)
    if (config.provider) {
      delete config.provider[PROVIDER_ID];
      if (Object.keys(config.provider).length === 0) delete config.provider;
    }
    if (config.agent) delete config.agent;

    // Ensure V2 provider shape
    if (!config.providers) config.providers = {};
    const provider = config.providers[PROVIDER_ID] || {
      package: PROVIDER_PACKAGE,
      settings: { baseURL: normalizedBaseUrl, apiKey: keyToUse },
      models: {},
    };

    provider.package = PROVIDER_PACKAGE;
    provider.settings = { ...(provider.settings || {}), baseURL: normalizedBaseUrl, apiKey: keyToUse };
    provider.models = provider.models || {};

    // Add or update entries for all requested models (preserve capabilities when present)
    for (const m of modelsArray) {
      if (!m || typeof m !== "string") continue;
      provider.models[m] = toV2Model(m, provider.models[m]);
    }

    config.providers[PROVIDER_ID] = provider;

    // Dual-endpoint mirror: write a cloud provider with the same models/key when asked.
    if (includeCloud) {
      const cloudUrl = (cloudBaseUrl || CLI_TOOLS_CONFIG.cloudBaseUrl).endsWith("/v1")
        ? (cloudBaseUrl || CLI_TOOLS_CONFIG.cloudBaseUrl)
        : `${cloudBaseUrl || CLI_TOOLS_CONFIG.cloudBaseUrl}/v1`;
      config.providers[CLOUD_PROVIDER_ID] = {
        package: PROVIDER_PACKAGE,
        settings: { baseURL: cloudUrl, apiKey: keyToUse },
        models: { ...provider.models },
      };
    } else {
      delete config.providers[CLOUD_PROVIDER_ID];
    }

    // Set the active model (V2 shorthand "9router/<model>").
    // If activeModel is explicitly empty string, clear the model.
    if (activeModel === "") {
      delete config.model;
    } else {
      const finalActive = activeModel || modelsArray[0];
      if (finalActive) {
        config.model = `${PROVIDER_ID}/${finalActive}`;
      }
    }

    // Subagent configuration (V2 `agents`)
    if (!config.agents) config.agents = {};
    const previousExplorer = config.agents.explorer || {};
    config.agents.explorer = {
      description: previousExplorer.description || "Fast explorer subagent for codebase exploration",
      mode: "subagent",
      model: { providerID: PROVIDER_ID, model: effectiveSubagentModel },
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "OpenCode settings applied successfully!",
      configPath,
      format: "v2",
    });
  } catch (error) {
    console.log("Error applying opencode settings:", error);
    return NextResponse.json({ error: "Failed to apply settings" }, { status: 500 });
  }
}

// PATCH - Update specific settings (e.g., clear active model)
export async function PATCH(request) {
  try {
    const { clearActiveModel } = await request.json();
    const configPath = getConfigPath();

    let config = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = parseJsonC(existing);
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file found" });
      }
      throw error;
    }

    await backupConfig();

    if (clearActiveModel === true) {
      // Clear active model but keep models in the list
      if (typeof config.model === "string" && config.model.startsWith(`${PROVIDER_ID}/`)) {
        delete config.model;
      }
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: "Settings updated",
    });
  } catch (error) {
    console.log("Error patching opencode settings:", error);
    return NextResponse.json({ error: "Failed to patch settings" }, { status: 500 });
  }
}

// DELETE - Remove 9Router provider or specific models from config
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelToRemove = searchParams.get("model");
    const configPath = getConfigPath();

    let config = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = parseJsonC(existing);
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    await backupConfig();

    // If specific model provided, remove just that model (local + cloud mirror)
    if (modelToRemove) {
      const { entry } = getProviderEntry(config);
      const models = entry?.models;
      if (models && typeof models === "object" && modelToRemove in models) {
        delete models[modelToRemove];

        // Mirror removal on the cloud provider, dropping it entirely when emptied.
        const cloudEntry = config.providers?.[CLOUD_PROVIDER_ID];
        if (cloudEntry?.models && modelToRemove in cloudEntry.models) {
          delete cloudEntry.models[modelToRemove];
          if (Object.keys(cloudEntry.models).length === 0) delete config.providers[CLOUD_PROVIDER_ID];
        }

        // If no models left, remove the provider (V2 + legacy V1)
        if (Object.keys(models).length === 0) {
          if (config.providers) delete config.providers[PROVIDER_ID];
          if (config.provider) delete config.provider[PROVIDER_ID];
        } else if (config.model === `${PROVIDER_ID}/${modelToRemove}`) {
          // If removed model was active, switch to first remaining model
          config.model = `${PROVIDER_ID}/${Object.keys(models)[0]}`;
        }
      }
    } else {
      // No specific model - remove entire 9router provider (V2 + legacy V1) + cloud mirror
      if (config.providers) delete config.providers[PROVIDER_ID];
      if (config.provider) delete config.provider[PROVIDER_ID];
      if (config.providers) delete config.providers[CLOUD_PROVIDER_ID];
    }

    if (config.provider && Object.keys(config.provider).length === 0) delete config.provider;

    // Remove active model if it referenced 9router
    if (typeof config.model === "string" && config.model.startsWith(`${PROVIDER_ID}/`)) {
      delete config.model;
    }

    // Remove subagent configuration (V2 agents + legacy V1 agent)
    const explorer = config.agents?.explorer;
    if (explorer) {
      const m = explorer.model;
      const is9Router = (m && typeof m === "object" && m.providerID === PROVIDER_ID) ||
        (typeof m === "string" && m.startsWith(`${PROVIDER_ID}/`));
      if (is9Router) delete config.agents.explorer;
      if (config.agents && Object.keys(config.agents).length === 0) delete config.agents;
    }
    if (config.agent?.explorer?.model?.startsWith(`${PROVIDER_ID}/`)) {
      delete config.agent.explorer;
      if (Object.keys(config.agent).length === 0) delete config.agent;
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));

    return NextResponse.json({
      success: true,
      message: modelToRemove ? `Model "${modelToRemove}" removed` : "9Router settings removed from OpenCode",
    });
  } catch (error) {
    console.log("Error resetting opencode settings:", error);
    return NextResponse.json({ error: "Failed to reset opencode settings" }, { status: 500 });
  }
}