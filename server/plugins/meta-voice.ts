import { registerRequiredSecret } from "@agent-native/core/secrets";
registerRequiredSecret({
  key: "META_API_KEY",
  label: "Meta API key",
  description:
    "Runs Muse Spark, Wonder and Hindi/Hinglish dictation through Meta.",
  docsUrl: "https://dev.meta.ai",
  scope: "user",
  kind: "api-key",
  required: false,
});
export default function metaVoicePlugin() {}
