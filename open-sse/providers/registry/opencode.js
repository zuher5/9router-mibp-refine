export default {
  id: "opencode",
  priority: 40,
  hasFree: true,
  alias: "oc",
  uiAlias: "oc",
  display: {
    name: "OpenCode Free",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
  },
  category: "free",
  noAuth: true,
  transport: {
    baseUrl: "https://opencode.ai",
    headers: {
      "x-opencode-client": "desktop",
    },
    forceStream: true,
    noAuth: true,
    quirks: {
      forceAutoToolChoiceModels: ["muse-spark-1.3-contributor-free"],
    },
  },
  models: [
    // Endpoint formats differ per model, so declare non-chat models explicitly.
    // Free tier synced 2026-10-17 to live GET https://opencode.ai/zen/v1/models
    // (13 free ids; the dashboard merges that feed live via modelsFetcher, this
    // static list is the fallback catalog). Dead ids removed this round after
    // live 400 "Model is unavailable": ling-3.1-flash-free, cat-jam-free,
    // step-5-preview-free.
    { id: "muse-spark-1.2-contributor-free", name: "Muse Spark 1.2 Contributor Free", targetFormat: "openai-responses" },
    { id: "muse-spark-1.3-contributor-free", name: "Muse Spark 1.3 Contributor Free", targetFormat: "openai-responses" },
    // union-alpha is retired upstream (absent from the live feed) but kept:
    // executor MESSAGES_MODELS + opencode-muse-spark-thinking tests pin it.
    { id: "union-alpha", name: "Union Alpha Free", targetFormat: "claude" },
    { id: "jev-1.13-free", name: "Jev 1.13 Free", kind: "systemone" },
    { id: "big-pickle", name: "Big Pickle Free" },
    { id: "beam-free", name: "Beam Free" },
    { id: "mimo-v2.6-flash-free", name: "MiMo V2.6 Flash Free" },
    { id: "deepseek-v4.1-flash-free", name: "DeepSeek V4.1 Flash Free" },
    { id: "glm-5.3-flash-free", name: "GLM 5.3 Flash Free" },
    { id: "nemotron-3.5-lightning-free", name: "Nemotron 3.5 Lightning Free" },
    { id: "nemotron-3.5-super-vl-free", name: "Nemotron 3.5 Super VL Free" },
    { id: "longcat-2.5-preview-free", name: "LongCat 2.5 Preview Free" },
    { id: "space-bunny-free", name: "Space Bunny Free" },
  ],
  serviceKinds: ["llm", "systemone"],
  systemoneConfig: {
    baseUrl: "https://opencode.ai/zen/v1/systemone",
    headers: {
      "x-opencode-client": "desktop",
      "User-Agent": "opencode/1.18.31",
    },
  },
  modelsFetcher: { url: "https://opencode.ai/zen/v1/models", type: "opencode-free" },
  passthroughModels: true,
};
