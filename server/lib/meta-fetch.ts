const retryDelays = [1_000, 2_000, 4_000, 8_000, 12_000, 16_000, 16_000];

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Provider transport only. Successful SSE responses pass through unbuffered. */
export function createMetaFetch(
  transport: typeof fetch = fetch,
  wait: typeof delay = delay,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, { ...init, redirect: "manual" });
    const url = new URL(request.url);
    if (
      url.origin !== "https://api.meta.ai" ||
      url.pathname !== "/v1/chat/completions"
    ) {
      throw new Error("Unsupported Meta model endpoint.");
    }
    for (let attempt = 0; ; attempt++) {
      request.signal.throwIfAborted();
      const response = await transport(request.clone());
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error("Meta model endpoint redirects are disabled.");
      }
      if (response.status !== 404 || attempt >= retryDelays.length)
        return response;
      const body = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        error?: { code?: string; type?: string; message?: string };
      } | null;
      if (
        body?.error?.code !== "model_not_found" &&
        body?.error?.type !== "model_not_found" &&
        !body?.error?.message?.includes("model_not_found")
      )
        return response;
      await response.body?.cancel();
      await wait(retryDelays[attempt]!, request.signal);
    }
  };
}

export const metaFetch = createMetaFetch();
