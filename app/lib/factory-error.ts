import { actionErrorMessage } from "@agent-native/core/client/hooks";

/** Keep schema diagnostics useful without showing the full submitted payload. */
export function factoryError(error: unknown): string {
  const message =
    actionErrorMessage(error) ??
    (error instanceof Error
      ? error.message
      : "Could not complete the request. Try again.");
  if (!message.startsWith("Invalid action parameters")) return message;
  return message
    .split(". Received:")[0]!
    .replace(/^Invalid action parameters\s*[—:-]\s*/, "")
    .replace(/\boperation(?:\.[\w]+)+:\s*/g, "");
}
