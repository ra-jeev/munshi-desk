import assert from "node:assert/strict";
import test from "node:test";

import { createMetaFetch } from "./meta-fetch.ts";

const endpoint = "https://api.meta.ai/v1/chat/completions";
test("Meta transport retries only transient model 404s and replays the request", async () => {
  const bodies: string[] = [];
  const waits: number[] = [];
  const success = new Response("data: streaming result\n\n");
  const transport: typeof fetch = async (input) => {
    bodies.push(await (input as Request).text());
    return bodies.length < 3
      ? Response.json({ error: { code: "model_not_found" } }, { status: 404 })
      : success;
  };
  const result = await createMetaFetch(transport, async (ms) => {
    waits.push(ms);
  })(endpoint, {
    method: "POST",
    body: JSON.stringify({ model: "muse-spark-1.3", stream: true }),
  });
  assert.equal(result, success);
  assert.equal(result.bodyUsed, false);
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(waits, [1000, 2000]);
});

test("Meta retries are bounded, respect cancellation and do not retry other failures", async () => {
  let calls = 0;
  const model404: typeof fetch = async () => {
    calls++;
    return Response.json(
      { error: { type: "model_not_found" } },
      { status: 404 },
    );
  };
  const result = await createMetaFetch(model404, async () => {})(endpoint);
  assert.equal(result.status, 404);
  assert.equal(calls, 8);
  calls = 0;
  const controller = new AbortController();
  await assert.rejects(
    createMetaFetch(model404, async () => controller.abort())(endpoint, {
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  for (const status of [400, 401, 404, 429, 500]) {
    let retries = 0;
    const response = await createMetaFetch(
      async () => new Response("other failure", { status }),
      async () => {
        retries++;
      },
    )(endpoint);
    assert.equal(response.status, status);
    assert.equal(retries, 0);
  }
  await assert.rejects(
    createMetaFetch(model404)("https://example.com/v1/chat/completions"),
  );
});
