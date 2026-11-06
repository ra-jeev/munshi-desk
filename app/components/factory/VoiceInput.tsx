import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { appPath } from "@agent-native/core/client/api-path";
import { IconMicrophone, IconPlayerStop } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

async function wav(blob: Blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * 16000),
      16000,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const audio = (await offline.startRendering()).getChannelData(0);
    const buffer = new ArrayBuffer(44 + audio.length * 2);
    const view = new DataView(buffer);
    const text = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + audio.length * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, audio.length * 2, true);
    audio.forEach((sample, i) => {
      const v = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + i * 2, v < 0 ? v * 32768 : v * 32767, true);
    });
    return new Blob([buffer], { type: "audio/wav" });
  } finally {
    await context.close();
  }
}
export function VoiceInput() {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">(
    "idle",
  );
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function start() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(
        "Voice recording needs a supported browser and HTTPS. You can still type to Munshi.",
      );
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const parts: BlobPart[] = [];
      const r = new MediaRecorder(stream.current);
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      r.onstop = async () => {
        if (timer.current) clearTimeout(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        setState("transcribing");
        try {
          const audio = await wav(new Blob(parts, { type: r.mimeType }));
          const form = new FormData();
          form.set("audio", audio, "recording.wav");
          // Upload transport only. Factory data uses action hooks.
          const response = await fetch(appPath("/api/transcribe"), {
            method: "POST",
            body: form,
            credentials: "same-origin",
            signal: AbortSignal.timeout(70000),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(
              result.statusMessage ??
                result.message ??
                "Transcription failed. Try again.",
            );
          sendToAgentChat({
            message: result.text,
            submit: false,
            openSidebar: true,
          });
          toast.success("Your words are ready in the chat. Review and send.");
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Could not transcribe. Try again.",
          );
        } finally {
          setState("idle");
        }
      };
      r.start();
      setState("recording");
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 60000);
    } catch {
      stream.current?.getTracks().forEach((t) => t.stop());
      setState("idle");
      toast.error("Microphone access was unavailable. You can type to Munshi.");
    }
  }
  return (
    <Button
      variant={state === "recording" ? "destructive" : "outline"}
      size="sm"
      disabled={state === "transcribing"}
      onClick={() => {
        if (state === "recording") recorder.current?.stop();
        else void start();
      }}
      aria-live="polite"
    >
      {state === "recording" ? (
        <IconPlayerStop className="size-4" />
      ) : (
        <IconMicrophone className="size-4" />
      )}
      {state === "recording"
        ? "Stop recording"
        : state === "transcribing"
          ? "Transcribing…"
          : "Speak to Munshi"}
    </Button>
  );
}
