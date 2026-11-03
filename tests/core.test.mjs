import test from "node:test";
import assert from "node:assert/strict";
import { build } from "../frontend/node_modules/esbuild/lib/main.js";
import fs from "node:fs/promises";
await fs.mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL("../frontend/lib/core.ts", import.meta.url).pathname],
  outfile: new URL("../.cache/test-core.mjs", import.meta.url).pathname,
  bundle: true,
  platform: "browser",
  format: "esm",
});
const { SearchIndex, validateManifest, evidenceResult } = await import(
  "../.cache/test-core.mjs"
);
const corpus = JSON.parse(
  await fs.readFile(new URL("../data/corpus.json", import.meta.url)),
);
const index = new SearchIndex(corpus.chunks);
test("exact error retrieves images documentation", () => {
  assert.ok(
    index
      .search("ImagePullBackOff imagePullPolicy")
      .some((s) => s.document_id === "concepts/containers/images"),
  );
});
test("no evidence does not fabricate answer", () => {
  const r = evidenceResult(index, "quuxxyzzy wibbleflorp");
  assert.equal(r.mode, "insufficient_evidence");
  assert.equal(r.sources.length, 0);
});
test("unique citation IDs and document diversity", () => {
  const r = index.search("Pod debugging container");
  assert.equal(new Set(r.map((s) => s.citation)).size, r.length);
  for (const id of new Set(r.map((s) => s.document_id)))
    assert.ok(r.filter((s) => s.document_id === id).length <= 2);
});
test("malformed YAML produces findings", () => {
  assert.equal(validateManifest("x: [")[0].level, "error");
});
test("YAML aliases do not expand", () => {
  assert.equal(validateManifest("a: &a [*a]")[0].level, "error");
});
test("duplicate keys rejected", () => {
  assert.equal(validateManifest("kind: Pod\nkind: Service")[0].level, "error");
});
test("invalid container type does not crash", () => {
  assert.ok(
    validateManifest(
      "apiVersion: v1\nkind: Pod\nmetadata: {}\nspec: {containers: [3]}",
    ).length,
  );
});
test("evidence mode explicitly reports no generation", () => {
  const r = evidenceResult(index, "What is a Pod?");
  assert.equal(r.mode, "evidence_search");
  assert.ok(r.answer.includes("not an AI-generated diagnosis"));
});
test("worker serves real API and rejects invalid requests", async (t) => {
  if (
    !(await fs
      .stat(new URL("../.cache/sites-worker.js", import.meta.url))
      .catch(() => false))
  ) {
    t.skip(
      "Worker bundle not built; run scripts/build_sites.py to include adapter checks",
    );
    return;
  }
  const w = (await import("../.cache/sites-worker.js")).default;
  let r = await w.fetch(new Request("https://test.local/health/ready"), {});
  assert.equal((await r.json()).generation_available, false);
  r = await w.fetch(
    new Request("https://test.local/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "What is a Pod?" }),
    }),
    {},
  );
  assert.equal((await r.json()).mode, "evidence_search");
  r = await w.fetch(
    new Request("https://test.local/api/chat", {
      method: "POST",
      body: "{invalid",
    }),
    {},
  );
  assert.equal(r.status, 400);
});

test("truncated evidence closes code fences", async () => {
  const { excerpt } = await import("../.cache/test-core.mjs");
  const text = excerpt("```yaml\n" + "abc ".repeat(300));
  assert.equal((text.match(/```/g) || []).length % 2, 0);
});
test("native AI binding can generate a validated answer without an API key", async (t) => {
  if (
    !(await fs
      .stat(new URL("../.cache/sites-worker.js", import.meta.url))
      .catch(() => false))
  ) {
    t.skip("Worker bundle not built");
    return;
  }
  const worker = (await import("../.cache/sites-worker.js")).default;
  const env = {
    AI: {
      run: async (model) =>
        model.includes("bge")
          ? { data: [new Array(384).fill(0)] }
          : {
              response: "Inspect the Pod events and logs [S1].",
              usage: { total_tokens: 42 },
            },
    },
  };
  let r = await worker.fetch(
    new Request("https://binding.local/health/ready"),
    env,
  );
  assert.equal((await r.json()).generation_available, true);
  r = await worker.fetch(
    new Request("https://binding.local/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "How do I debug a Pod?",
        strategy: "keyword",
      }),
    }),
    env,
  );
  const result = await r.json();
  assert.equal(result.mode, "live_ai");
  assert.equal(result.usage.total_tokens, 42);
});
