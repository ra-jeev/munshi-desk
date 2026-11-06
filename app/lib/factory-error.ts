import { actionErrorCode, actionErrorMessage } from "@agent-native/core/client/hooks";

import enUS from "../i18n/en-US";
import hiIN from "../i18n/hi-IN";

type ErrorCatalog = typeof enUS.errors;

/** Current UI language from the locale init script (html lang). Server messages stay English; screens lookup by errorCode. */
function errorCatalog(): ErrorCatalog {
  if (typeof document !== "undefined" && document.documentElement.lang === "hi-IN") {
    return (hiIN as unknown as { errors: ErrorCatalog }).errors;
  }
  return enUS.errors;
}

function errorCodeFrom(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = actionErrorCode(error);
  if (direct) return direct;
  const obj = error as Record<string, unknown>;
  const message = typeof obj.message === "string" ? obj.message : "";
  const candidates: unknown[] = [
    obj.errorCode,
    obj.code,
    (obj.data as Record<string, unknown> | undefined)?.errorCode,
    (obj.error as Record<string, unknown> | undefined)?.errorCode,
    (obj.cause as Record<string, unknown> | undefined)?.errorCode,
    Array.isArray(obj.errors) ? (obj.errors[0] as Record<string, unknown>)?.errorCode : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate in errorCatalog()) return candidate;
  }
  const match =
    /\(errorCode:\s*([a-z0-9_]+)\)/.exec(message) ??
    /errorCode[:\s]+([a-z0-9_]+)/.exec(message);
  const code = match?.[1];
  if (code && code in errorCatalog()) return code;
  return undefined;
}

/** Keep schema diagnostics useful without showing the full submitted payload. */
export function factoryError(error: unknown): string {
  const catalog = errorCatalog();
  const code = errorCodeFrom(error);
  if (code && code in catalog) return catalog[code as keyof ErrorCatalog];
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
