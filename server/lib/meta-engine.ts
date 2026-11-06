import {
  createAISDKEngine,
  registerAgentEngine,
} from "@agent-native/core/agent/engine";
import { readDeployCredentialEnv } from "@agent-native/core/server";

import { metaFetch } from "./meta-fetch";

const capabilities = {
  thinking: false,
  promptCaching: false,
  vision: true,
  computerUse: false,
  parallelToolCalls: true,
};
const models = ["muse-spark-1.3", "muse-wonder-1.0"];

// Core 0.224.0 chat readiness recognizes built-in key names only. This app's
// Meta-compatible engine therefore retains OPENAI_API_KEY for model inference.
// Dictation uses META_API_KEY. Do not enable OpenAI realtime with this setup.
registerAgentEngine({
  name: "munshi-meta",
  label: "Meta Muse",
  description: "Meta Spark and Wonder with bounded transient-model retry.",
  defaultModel: models[0]!,
  supportedModels: models,
  acceptsCustomModels: false,
  requiredEnvVars: ["OPENAI_API_KEY"],
  capabilities,
  create(config) {
    const apiKey =
      typeof config.apiKey === "string"
        ? config.apiKey
        : config.allowEnvFallback !== false
          ? readDeployCredentialEnv("OPENAI_API_KEY")
          : undefined;
    return createAISDKEngine("openai", {
      ...config,
      name: "munshi-meta",
      label: "Meta Muse",
      model: models[0],
      supportedModels: models,
      acceptsCustomModels: false,
      capabilities,
      apiKey: apiKey ?? "",
      allowEnvFallback: false,
      baseUrl: "https://api.meta.ai/v1",
      requestFetch: metaFetch,
    });
  },
});
