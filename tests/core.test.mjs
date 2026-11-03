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
test("worker serves real API and rejects invalid requests", async () => {
  if (
    !(await fs
      .stat(new URL("../.cache/sites-worker.js", import.meta.url))
      .catch(() => false))
  )
    return;
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
