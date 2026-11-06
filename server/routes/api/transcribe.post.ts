import { getOrgContext } from "@agent-native/core/org";
import {
  getSession,
  resolveSecretDetailed,
  runWithRequestContext,
} from "@agent-native/core/server";
import { defineEventHandler, getHeader, readFormData, createError } from "h3";
export default defineEventHandler(async (event) => {
  const session = await getSession(event);
  if (!session?.email)
    throw createError({
      statusCode: 401,
      statusMessage: "Sign in to use voice input.",
    });
  const origin = getHeader(event, "origin");
  if (!origin || new URL(origin).host !== getHeader(event, "host"))
    throw createError({
      statusCode: 403,
      statusMessage: "Voice upload must come from this app.",
    });
  if (Number(getHeader(event, "content-length") ?? 0) > 12 * 1024 * 1024)
    throw createError({
      statusCode: 413,
      statusMessage: "Record a shorter message.",
    });
  const org = await getOrgContext(event);
  return runWithRequestContext(
    { userEmail: session.email, ...(org.orgId ? { orgId: org.orgId } : {}) },
    async () => {
      const secret = await resolveSecretDetailed("META_API_KEY");
      if (secret.lookupFailed)
        throw createError({
          statusCode: 503,
          statusMessage:
            "Voice credentials are temporarily unavailable. Try again.",
        });
      if (!secret.value)
        throw createError({
          statusCode: 503,
          statusMessage:
            "Add your Meta API key in Settings to enable voice input.",
        });
      const input = await readFormData(event);
      const audio = input.get("audio");
      if (
        !(audio instanceof File) ||
        audio.size === 0 ||
        audio.size > 10 * 1024 * 1024
      )
        throw createError({
          statusCode: 422,
          statusMessage: "Provide a WAV recording smaller than 10 MB.",
        });
      const bytes = new Uint8Array(await audio.arrayBuffer());
      if (
        new TextDecoder().decode(bytes.slice(0, 4)) !== "RIFF" ||
        new TextDecoder().decode(bytes.slice(8, 12)) !== "WAVE"
      )
        throw createError({
          statusCode: 422,
          statusMessage: "Provide a WAV recording.",
        });
      const body = new FormData();
      body.set(
        "request",
        new Blob(
          [
            JSON.stringify({
              model: "muse-voice-transcribe-1.0",
              audioEncoding: "WAV",
              mode: "PUSH_TO_TALK",
              languageBias: ["Hindi"],
            }),
          ],
          { type: "application/json" },
        ),
      );
      body.set("audio", audio, "recording.wav");
      let response: Response;
      try {
        response = await fetch("https://api.meta.ai/v1/asr/transcribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret.value}` },
          body,
          signal: AbortSignal.timeout(60000),
        });
      } catch {
        throw createError({
          statusCode: 502,
          statusMessage: "Transcription could not connect. Try again.",
        });
      }
      if (!response.ok)
        throw createError({
          statusCode: 502,
          statusMessage:
            "Transcription failed. Try again or type your message.",
        });
      const result = (await response.json()) as {
        text?: string;
        transcript?: string;
        results?: { text?: string }[];
      };
      const text =
        result.text ??
        result.transcript ??
        result.results?.map((r) => r.text ?? "").join(" ");
      if (!text?.trim())
        throw createError({
          statusCode: 422,
          statusMessage: "No speech was recognized. Try again.",
        });
      return { text: text.trim() };
    },
  );
});
