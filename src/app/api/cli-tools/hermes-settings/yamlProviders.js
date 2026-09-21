// Pure YAML helpers for the Hermes "providers:" block. Kept out of the route file so the
// "use server" route exports only async functions (Next.js requirement) while these stay
// directly unit-testable (see tests/unit/hermes-dual-endpoint.test.js).

export const PROVIDER_ID = "9router";
export const API_KEY_ENV = "OPENAI_API_KEY";

// Match top-level "providers:" block (until next non-indented, non-empty line)
const PROVIDERS_BLOCK_RE = /^providers:[ \t]*\r?\n((?:[ \t]+.*\r?\n?|[ \t]*\r?\n)*)/m;

// Match a 2-space-indented provider entry inside a "providers:" block (children 4+ spaces)
const PROVIDER_ENTRY_RE = /^[ \t]{2}([^\s:#][^:]*?):[ \t]*\r?\n((?:[ \t]{4,}.*\r?\n?|[ \t]*\r?\n)*)/gm;

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

// Build the native-format model block. `provider` names the providers.<id> entry that resolves
// key_env at runtime. Dual endpoint (includeCloud) targets 9router-cloud + its base_url so the
// default model keeps working when the local server is off.
export const buildModelBlock = (model, baseUrl, existingModel = null, providerId = PROVIDER_ID) => {
  const apiMode = existingModel?.api_mode ? `  api_mode: ${existingModel.api_mode}\n` : "";
  return (
    `model:\n` +
    `  default: "${model}"\n` +
    `  provider: "${providerId}"\n` +
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
export const buildProviderEntryYaml = (baseUrl, activeModel, models, existingEntry = null, providerId = PROVIDER_ID) => {
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

// Parse a provider entry back to fields: name, base_url/api/url, key_env, model,
// default_model, api_mode/transport, models (array of ids).
export const parseProviderEntry = (yaml, providerId = PROVIDER_ID) => {
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

// Insert/update a provider entry inside the "providers:" block, preserving other entries.
// Entries not yet present are prepended, so the route upserts the cloud entry FIRST and the
// local entry second — a freshly inserted local provider then stays above the cloud mirror.
export const upsertProviderEntry = (yaml, entryYaml, providerId = PROVIDER_ID) => {
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
export const removeProviderEntry = (yaml, providerId = PROVIDER_ID) => {
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