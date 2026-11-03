import { parseAllDocuments } from "yaml";
export type Chunk = {
  id: string;
  document_id: string;
  title: string;
  heading: string;
  text: string;
  url: string;
  snapshot_url: string;
  revision: string;
};
export type Source = Chunk & { citation: string; score: number };
export type Finding = { level: "error" | "warning" | "info"; message: string };
export type Result = {
  answer: string;
  sources: Source[];
  findings: Finding[];
  warnings: string[];
  trace: { tool: string; detail: string }[];
  mode: string;
  strategy: string;
  duration_ms: number;
  request_id: string;
  usage?: Record<string, number>;
  corpus_revision: string;
};
const stop = new Set(
  "a an the is are of for to in on and or with my why how what does do can i it this that from be as not has have".split(
    " ",
  ),
);
export const tokenize = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (t) => t.length > 1 && !stop.has(t),
  );
export class SearchIndex {
  chunks: Chunk[];
  counts: Map<string, number>[];
  lengths: number[];
  df = new Map<string, number>();
  average: number;
  constructor(chunks: Chunk[]) {
    this.chunks = chunks;
    this.counts = chunks.map((c) => {
      const m = new Map<string, number>();
      for (const t of tokenize(`${c.title} ${c.heading} ${c.text}`))
        m.set(t, (m.get(t) || 0) + 1);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      return m;
    });
    this.lengths = this.counts.map((m) =>
      [...m.values()].reduce((a, b) => a + b, 0),
    );
    this.average = this.lengths.reduce((a, b) => a + b, 0) / chunks.length;
  }
  search(query: string, k = 5): Source[] {
    const terms = tokenize(query),
      n = this.chunks.length;
    const ranking = this.counts
      .map((m, i) => ({
        i,
        score: terms.reduce((s, t) => {
          const f = m.get(t) || 0,
            d = this.df.get(t) || 0;
          return (
            s +
            (f
              ? (Math.log(1 + (n - d + 0.5) / (d + 0.5)) * f * 2.5) /
                (f + 1.5 * (0.25 + (0.75 * this.lengths[i]) / this.average))
              : 0)
          );
        }, 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const docs = new Map<string, number>(),
      results: Source[] = [];
    for (const { i, score } of ranking) {
      const c = this.chunks[i];
      if ((docs.get(c.document_id) || 0) >= 2) continue;
      docs.set(c.document_id, (docs.get(c.document_id) || 0) + 1);
      results.push({ ...c, score, citation: `S${results.length + 1}` });
      if (results.length >= k) break;
    }
    return results;
  }
}
const obj = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function validateManifest(text: string): Finding[] {
  if (!text.trim()) return [];
  if (text.length > 16000)
    return [{ level: "error", message: "Manifest exceeds 16,000 characters." }];
  const out: Finding[] = [];
  let docs;
  try {
    const parsed = parseAllDocuments(text, { uniqueKeys: true });
    if (parsed.length > 20) throw Error();
    docs = parsed.map((d) => {
      if (d.errors.length || d.warnings.length) throw Error();
      return d.toJS({ maxAliasCount: 0 });
    });
  } catch {
    return [
      {
        level: "error",
        message:
          "Invalid or unsupported YAML. Check indentation and remove aliases or custom tags.",
      },
    ];
  }
  const workloads: {
    name: string;
    labels: Record<string, unknown>;
    namespace: string;
  }[] = [];
  const services: { name: string; selector: unknown; namespace: string }[] = [];
  for (const d of docs) {
    if (!obj(d)) {
      out.push({
        level: "error",
        message: "Each YAML document must be an object.",
      });
      continue;
    }
    const name = d.metadata?.name || "unnamed";
    for (const f of ["apiVersion", "kind", "metadata"])
      if (!d[f])
        out.push({ level: "error", message: `${name}: missing ${f}.` });
    if (!obj(d.spec || {}) || !obj(d.metadata || {})) {
      out.push({
        level: "error",
        message: "metadata and spec must be objects.",
      });
      continue;
    }
    const spec = d.spec || {},
      namespace = d.metadata?.namespace || "default";
    if (["Deployment", "StatefulSet", "DaemonSet", "Pod"].includes(d.kind)) {
      const template = d.kind === "Pod" ? d : spec.template;
      if (!obj(template) || !obj(template.spec)) {
        out.push({
          level: "error",
          message: `${name}: Pod template/spec must be an object.`,
        });
        continue;
      }
      const labels = obj(template.metadata?.labels)
        ? template.metadata.labels
        : {};
      workloads.push({ name, labels, namespace });
      const match = spec.selector?.matchLabels;
      if (obj(match) && Object.entries(match).some(([k, v]) => labels[k] !== v))
        out.push({
          level: "error",
          message: `${name}: workload selector does not match Pod template labels.`,
        });
      const cs = Array.isArray(template.spec.containers)
        ? template.spec.containers
        : [];
      if (!cs.length)
        out.push({
          level: "error",
          message: `${name}: no containers defined.`,
        });
      for (const c of cs) {
        if (!obj(c)) {
          out.push({
            level: "error",
            message: `${name}: container entry must be an object.`,
          });
          continue;
        }
        const cn = c.name || "container";
        if (!c.image)
          out.push({
            level: "error",
            message: `${name}/${cn}: missing container image.`,
          });
        if (!c.readinessProbe)
          out.push({
            level: "warning",
            message: `${name}/${cn}: no readiness probe; review traffic readiness behavior.`,
          });
        if (!c.resources?.requests)
          out.push({
            level: "warning",
            message: `${name}/${cn}: no resource requests; scheduling requirements are unspecified.`,
          });
      }
    }
    if (d.kind === "Service")
      services.push({ name, selector: spec.selector, namespace });
  }
  for (const { name, selector, namespace } of services) {
    const candidates = workloads.filter((w) => w.namespace === namespace);
    if (!obj(selector) || !Object.keys(selector).length)
      out.push({
        level: "info",
        message: `${name}: selectorless Service; endpoints must be managed separately.`,
      });
    else if (
      candidates.length &&
      !candidates.some((w) =>
        Object.entries(selector).every(([k, v]) => w.labels[k] === v),
      )
    )
      out.push({
        level: "error",
        message: `${name}: Service selector matches no supplied Pod template in namespace ${namespace}.`,
      });
  }
  return out.length
    ? out
    : [
        {
          level: "info",
          message:
            "No issues found by the supported static checks. Cluster behavior has not been verified.",
        },
      ];
}
export function excerpt(text: string, limit = 650): string {
  let value = text.slice(0, limit);
  if ((value.match(/```/g) || []).length % 2) value += "\n```";
  return value;
}

export function evidenceResult(
  index: SearchIndex,
  query: string,
  manifest = "",
  history: string[] = [],
): Result {
  const start = performance.now(),
    findings = validateManifest(manifest);
  const sources = index.search(
    [
      ...history.slice(-4),
      query,
      ...findings
        .filter((f) => f.level === "error")
        .slice(0, 2)
        .map((f) => f.message),
    ].join(" "),
  );
  const answer = sources.length
    ? "### Documentation evidence\n\nThese passages were retrieved for your question. **This is evidence search, not an AI-generated diagnosis.**\n\n" +
      sources
        .slice(0, 3)
        .map(
          (s) =>
            `**${s.title} — ${s.heading}** [${s.citation}]\n\n${excerpt(s.text)}`,
        )
        .join("\n\n") +
      "\n\n### Next step\nShare the relevant Pod events, container logs, or resource configuration to narrow the investigation. No cluster commands were executed."
    : "I could not find supporting evidence in this Kubernetes documentation snapshot. Describe the Kubernetes resource, error message, and expected behavior.";
  return {
    answer,
    sources,
    findings,
    warnings: [
      "No inference credential is configured. Documentation search and static YAML checks are available.",
    ],
    trace: [
      ...(manifest
        ? [
            {
              tool: "validate_manifest",
              detail: `${findings.length} static findings`,
            },
          ]
        : []),
      {
        tool: "search_docs",
        detail: `BM25 keyword retrieval · ${sources.length} passages`,
      },
      { tool: "complete", detail: "Evidence returned without a model call" },
    ],
    mode: sources.length ? "evidence_search" : "insufficient_evidence",
    strategy: "keyword",
    duration_ms: Math.round(performance.now() - start),
    request_id: crypto.randomUUID().slice(0, 12),
    corpus_revision: sources[0]?.revision || "",
  };
}
