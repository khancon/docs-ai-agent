"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowRight,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  FileCode2,
  GitBranch,
  Github,
  Layers3,
  LoaderCircle,
  Network,
  Plus,
  Search,
  ShieldCheck,
  Square,
  Terminal,
  Workflow,
  X,
  AlertTriangle,
  Menu,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  SearchIndex,
  evidenceResult,
  type Chunk,
  type Result,
  type Source,
} from "../lib/core";
import { EXAMPLES } from "../lib/examples";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
type Manifest = {
  documents: number;
  chunks: number;
  revision: string;
  indexed_at: string;
  sha256: string;
};
type EvalReport = {
  cases: number;
  corpus_revision: string;
  results: {
    strategy: string;
    recall_at_5: number;
    mrr: number;
    p50_ms: number;
    p95_ms: number;
  }[];
  methodology: string;
  generated_at: string;
};
function Logo() {
  return (
    <span className="logo-mark">
      <Layers3 size={21} strokeWidth={1.8} />
    </span>
  );
}
function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a
            href={
              href?.startsWith("https://") || href?.startsWith("#source-")
                ? href
                : undefined
            }
            target="_blank"
            rel="noreferrer"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => (
          <code className={className}>{children}</code>
        ),
        p: ({ children }) => <p>{children}</p>,
      }}
    >
      {text.replace(/\[(S\d+)\]/g, "[$1](#source-$1)")}
    </ReactMarkdown>
  );
}
export default function Home() {
  const [page, setPage] = useState("demo"),
    [query, setQuery] = useState(""),
    [yaml, setYaml] = useState(""),
    [showYaml, setShowYaml] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [question, setQuestion] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [selected, setSelected] = useState<Source | null>(null),
    [status, setStatus] = useState("Loading documentation"),
    [manifest, setManifest] = useState<Manifest | null>(null),
    [index, setIndex] = useState<SearchIndex | null>(null),
    [error, setError] = useState(""),
    [trace, setTrace] = useState(false),
    [copied, setCopied] = useState(false),
    [mobile, setMobile] = useState(false),
    [report, setReport] = useState<EvalReport | null>(null),
    [generation, setGeneration] = useState(false),
    [streamText, setStreamText] = useState("");
  const abort = useRef<AbortController | null>(null),
    input = useRef<HTMLTextAreaElement | null>(null),
    resultsRef = useRef<HTMLDivElement | null>(null),
    requestVersion = useRef(0);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${BASE}/data/corpus.json`).then((r) => {
        if (!r.ok) throw Error("Corpus unavailable");
        return r.json();
      }),
      fetch(`${BASE}/data/manifest.json`).then((r) => r.json()),
    ])
      .then(([c, m]) => {
        if (alive) {
          setIndex(new SearchIndex(c.chunks as Chunk[]));
          setManifest(m);
          setStatus("Evidence search ready");
        }
      })
      .catch(() => setStatus("Documentation unavailable — reload to retry"));
    fetch(`${BASE}/data/evaluation.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch(() => {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    fetch(`${API || BASE}/health/ready`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (r && alive) {
          setGeneration(r.generation_available);
          if (r.generation_available) setStatus("Live AI ready");
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPage("demo");
        input.current?.focus();
      }
      if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  function navigate(p: string) {
    setPage(p);
    setMobile(false);
  }
  function clear() {
    requestVersion.current++;
    abort.current?.abort();
    setBusy(false);
    setResult(null);
    setQuestion("");
    setQuery("");
    setYaml("");
    setShowYaml(false);
    setHistory([]);
    setError("");
    setStreamText("");
    setPage("demo");
  }
  async function run(q = query, y = yaml) {
    if (!q.trim() || busy || !index) return;
    const version = ++requestVersion.current;
    setBusy(true);
    setError("");
    setQuestion(q);
    setQuery("");
    setResult(null);
    setStreamText("");
    setSelected(null);
    abort.current = new AbortController();
    const timer = setTimeout(() => abort.current?.abort(), 70000);
    try {
      let out: Result | null = null;
      if (API || generation) {
        try {
          const response = await fetch(`${API}/api/chat/stream`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: q,
              manifest: y,
              history: history.slice(-4).map((item) => item.slice(0, 500)),
              strategy: "hybrid",
            }),
            signal: abort.current.signal,
          });
          if (!response.ok)
            throw Error(
              response.status === 429
                ? "Usage limit reached."
                : "Backend unavailable.",
            );
          const reader = response.body?.getReader();
          if (!reader) throw Error("Stream unavailable");
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";
            for (const event of events) {
              const kind = event.match(/^event: (.+)$/m)?.[1];
              const raw = event.match(/^data: (.+)$/m)?.[1];
              if (!raw) continue;
              const d = JSON.parse(raw);
              if (kind === "delta" && version === requestVersion.current)
                setStreamText((t) => t + d.text);
              if (kind === "result") out = d;
              if (kind === "error") throw Error(d.message);
            }
          }
          if (!out) throw Error("Response interrupted");
        } catch (e) {
          if (abort.current.signal.aborted) throw e;
          out = evidenceResult(index, q, y, history);
          out.warnings.unshift(
            "The hosted API could not complete this request. Showing local documentation search.",
          );
        }
      } else out = evidenceResult(index, q, y, history);
      if (version === requestVersion.current) {
        setResult(out);
        setHistory((h) => [...h, q].slice(-4));
        setTimeout(
          () =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          50,
        );
      }
    } catch (e) {
      if (version === requestVersion.current)
        setError(
          abort.current?.signal.aborted
            ? "Request stopped. You can retry."
            : "Something went wrong. Please retry.",
        );
    } finally {
      clearTimeout(timer);
      if (version === requestVersion.current) setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(result?.answer || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(
        "Clipboard unavailable in this browser. Select the answer text to copy.",
      );
    }
  }
  useEffect(() => {
    if (!selected) return;
    const prior = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = document.querySelector(".source-drawer");
    const elements = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>("button, a[href]") || []);
    elements()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const controls = elements(),
        first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = previousOverflow;
      prior?.focus();
    };
  }, [selected]);
  const nav = [
    { id: "demo", label: "Workbench", icon: Terminal },
    { id: "architecture", label: "How it works", icon: Workflow },
    { id: "evaluation", label: "Evaluation", icon: GitBranch },
    { id: "about", label: "About the project", icon: BookOpen },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("demo");
          }}
        >
          <Logo />
          <span>
            KubeGuide<span className="brand-dot">.</span>
          </span>
        </a>
        <button className="new-session" onClick={clear}>
          <Plus size={16} /> New investigation <span>⌘ K</span>
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={17} />
              {n.label}
              {page === n.id && <span className="active-pip" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="mini-orbit">
            <Database size={18} />
            <span className="orbit-dot" />
          </div>
          <h4>Built on the source.</h4>
          <p>
            Official Kubernetes docs.
            <br />
            Every answer has a paper trail.
          </p>
          <div className="snapshot-pill">
            <span />
            Pinned documentation snapshot
          </div>
        </div>
        <div className="sidebar-bottom">
          <a
            href="https://github.com/khancon/docs-ai-agent"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={17} /> View source <ArrowUpRight size={14} />
          </a>
          <div className="author">
            <span className="avatar">AK</span>
            <div>
              Ahnaf Khan<small>Backend & platform engineering</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Toggle menu"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="top-status">
            <span className={index ? "status-dot" : "status-dot pending"} />
            {generation ? "Live AI connected" : "Evidence-first demo"}
            <span className="version">v1.0</span>
          </div>
        </header>
        <main>
          {page === "demo" && (
            <>
              <div className="workspace-heading">
                <div>
                  <span className="eyebrow">
                    <span /> KUBERNETES TROUBLESHOOTING
                  </span>
                  <h1>
                    Less guessing.
                    <br />
                    <span>More evidence.</span>
                  </h1>
                  <p>
                    Understand what’s happening in your cluster.
                    <br className="desktop-break" /> Ask a question, inspect a
                    manifest, and follow the sources.
                  </p>
                </div>
                <div className="hero-graphic" aria-hidden="true">
                  <div className="grid-bg" />
                  <div className="graphic-line one" />
                  <div className="graphic-line two" />
                  <div className="graphic-node node-a">
                    <Terminal size={22} />
                  </div>
                  <div className="graphic-node center-node">
                    <Layers3 size={38} />
                  </div>
                  <div className="graphic-node node-b">
                    <BookOpen size={22} />
                  </div>
                  <div className="graphic-label">
                    QUESTION <span>→</span> EVIDENCE
                  </div>
                </div>
              </div>
              <section className="composer" aria-label="Ask KubeGuide">
                <div className="composer-tabs">
                  <button
                    className={!showYaml ? "selected" : ""}
                    onClick={() => setShowYaml(false)}
                  >
                    <Search size={15} />
                    Ask a question
                  </button>
                  <button
                    className={showYaml ? "selected" : ""}
                    onClick={() => setShowYaml(true)}
                  >
                    <FileCode2 size={15} />
                    Inspect YAML {yaml && <span className="tiny-dot" />}
                  </button>
                  <span className="composer-hint">
                    Your cluster stays yours
                  </span>
                </div>
                <textarea
                  ref={input}
                  aria-label="Your Kubernetes question"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={2000}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void run();
                    }
                  }}
                  placeholder="Why is my Pod stuck in CrashLoopBackOff?"
                  rows={3}
                />
                {showYaml && (
                  <div className="yaml-input">
                    <label htmlFor="yaml">
                      MANIFEST <span>Optional · up to 16,000 characters</span>
                    </label>
                    <textarea
                      id="yaml"
                      aria-label="Kubernetes manifest"
                      spellCheck={false}
                      value={yaml}
                      onChange={(e) => setYaml(e.target.value)}
                      maxLength={16000}
                      placeholder={"apiVersion: apps/v1\nkind: Deployment\n..."}
                      rows={9}
                    />
                  </div>
                )}
                <div className="composer-bottom">
                  <span>
                    <ShieldCheck size={14} />
                    {generation
                      ? "Prompts go to the configured inference provider."
                      : "Runs in your browser. No cluster connection."}
                  </span>
                  <button
                    className="ask-button"
                    onClick={() => (busy ? abort.current?.abort() : void run())}
                    disabled={!busy && (!index || query.trim().length < 3)}
                  >
                    {busy ? (
                      <>
                        <Square size={13} />
                        Stop
                      </>
                    ) : (
                      <>
                        Investigate <ArrowUp size={16} />
                      </>
                    )}
                  </button>
                </div>
              </section>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              {!result && !busy && !question && (
                <>
                  <div className="section-label">
                    A GOOD PLACE TO START{" "}
                    <span>
                      Try an investigation <ArrowRight size={13} />
                    </span>
                  </div>
                  <div className="example-grid">
                    {EXAMPLES.map((e, i) => (
                      <button
                        className="example-card"
                        key={e.title}
                        onClick={() => {
                          setYaml(e.manifest);
                          setShowYaml(!!e.manifest);
                          void run(e.query, e.manifest);
                        }}
                      >
                        <div className={`example-icon icon-${i}`}>
                          {i === 0 ? (
                            <Layers3 size={20} />
                          ) : i === 1 ? (
                            <Network size={20} />
                          ) : (
                            <Braces size={20} />
                          )}
                        </div>
                        <span className="example-tag">{e.tag}</span>
                        <h3>{e.title}</h3>
                        <p>{e.description}</p>
                        <ArrowUpRight className="example-arrow" size={17} />
                      </button>
                    ))}
                  </div>
                  <div className="trust-row">
                    <span>
                      <BookOpen size={15} />
                      {manifest?.documents || "…"} official docs
                    </span>
                    <span>
                      <GitBranch size={15} />
                      Traceable sources
                    </span>
                    <span>
                      <Terminal size={15} />
                      Read-only by design
                    </span>
                  </div>
                </>
              )}
              {(result || busy || question) && (
                <section className="investigation" ref={resultsRef}>
                  <div className="question-label">
                    <span className="question-avatar">YOU</span>
                    <h2>{question}</h2>
                  </div>
                  <div className="answer-heading">
                    <Logo />
                    <strong>KubeGuide</strong>
                    <span className="mode-label">
                      {busy
                        ? "Working…"
                        : result?.mode === "live_ai"
                          ? "Live AI · citations checked"
                          : "Documentation evidence"}
                    </span>
                    {result && (
                      <button
                        className="icon-button copy-answer"
                        title="Copy answer"
                        aria-label="Copy answer"
                        onClick={copy}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    )}
                  </div>
                  {result && (
                    <>
                      {result.findings.length > 0 && (
                        <div className="findings-panel">
                          <h3>
                            <FileCode2 size={16} />
                            Static manifest checks
                          </h3>
                          {result.findings.map((f, i) => (
                            <div className={`finding ${f.level}`} key={i}>
                              {f.level === "error" ? (
                                <AlertTriangle size={15} />
                              ) : (
                                <ShieldCheck size={15} />
                              )}
                              <span>{f.message}</span>
                            </div>
                          ))}
                          <small>
                            Limited static checks; actual cluster behavior has
                            not been verified.
                          </small>
                        </div>
                      )}
                    </>
                  )}
                  {busy && !streamText ? (
                    <div className="loading-state" role="status">
                      <LoaderCircle className="spin" size={17} />
                      Retrieving supporting documentation…
                    </div>
                  ) : (
                    <div
                      className="answer-markdown"
                      onClick={(e) => {
                        const el = (e.target as HTMLElement).closest("a");
                        if (el?.getAttribute("href")?.startsWith("#source-")) {
                          e.preventDefault();
                          setSelected(
                            result?.sources.find(
                              (s) =>
                                s.citation ===
                                el.getAttribute("href")?.slice(8),
                            ) || null,
                          );
                        }
                      }}
                    >
                      <Markdown text={result?.answer || streamText} />
                    </div>
                  )}
                  {result && (
                    <>
                      <div className="sources-heading">
                        SUPPORTING SOURCES{" "}
                        <span>{result.sources.length} passages</span>
                      </div>
                      <div className="source-grid">
                        {result.sources.map((s) => (
                          <button
                            className="source-card"
                            key={s.citation}
                            onClick={() => setSelected(s)}
                          >
                            <span className="source-id">{s.citation}</span>
                            <span>
                              <strong>{s.title}</strong>
                              <small>{s.heading}</small>
                            </span>
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                      <button
                        className="trace-toggle"
                        onClick={() => setTrace(!trace)}
                      >
                        <Workflow size={14} />
                        {trace ? "Hide" : "Inspect"} retrieval activity
                        <ChevronDown
                          size={14}
                          className={trace ? "rotated" : ""}
                        />
                        <span>
                          {result.duration_ms} ms · {result.strategy}
                        </span>
                      </button>
                      {trace && (
                        <div className="trace-panel">
                          {result.trace.map((t, i) => (
                            <div key={i}>
                              <span className="trace-step">{i + 1}</span>
                              <code>{t.tool}</code>
                              <span>{t.detail}</span>
                            </div>
                          ))}
                          <small>
                            Request {result.request_id} · snapshot{" "}
                            {result.corpus_revision.slice(0, 8)}
                            {result.usage &&
                            Object.keys(result.usage).length > 0
                              ? " · usage " + JSON.stringify(result.usage)
                              : ""}
                          </small>
                        </div>
                      )}
                      {result.warnings.length > 0 && (
                        <div className="answer-notice">
                          {result.warnings.map((w, i) => (
                            <p key={i}>{w}</p>
                          ))}
                        </div>
                      )}
                      <button
                        className="followup"
                        onClick={() => {
                          input.current?.focus();
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Ask a follow-up <ArrowUp size={14} />
                      </button>
                    </>
                  )}
                </section>
              )}
              <div className="bottom-note">
                <span className="status-dot" />
                {generation ? "Live AI ready" : status}
                <span>
                  Snapshot {manifest?.revision.slice(0, 8) || "…"} ·{" "}
                  {manifest?.indexed_at || "…"}
                </span>
              </div>
            </>
          )}
          {page === "architecture" && (
            <section className="content-page">
              <span className="eyebrow">UNDER THE HOOD</span>
              <h1>
                A small system.
                <br />
                <span>Explicit boundaries.</span>
              </h1>
              <p className="page-intro">
                A reproducible documentation pipeline and a bounded request
                path. Every result can be traced to the evidence that produced
                it.
              </p>
              <div className="architecture-flow">
                {[
                  {
                    icon: FileCode2,
                    title: "Pinned sources",
                    sub: "52 official documents",
                  },
                  {
                    icon: Database,
                    title: "Immutable index",
                    sub: "BM25 + BGE embeddings",
                  },
                  {
                    icon: Search,
                    title: "Retrieve",
                    sub: "Rank and diversify passages",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Respond",
                    sub: "Evidence or cited generation",
                  },
                ].map((x, i) => (
                  <div key={x.title}>
                    <span className="flow-number">0{i + 1}</span>
                    <x.icon size={24} />
                    <h3>{x.title}</h3>
                    <p>{x.sub}</p>
                    {i < 3 && <ArrowRight size={15} />}
                  </div>
                ))}
              </div>
              <div className="detail-grid">
                <article>
                  <h3>01 / Ingestion happens offline</h3>
                  <p>
                    Official Markdown is fetched at a fixed Git revision, split
                    into sections, and deduplicated with content-derived IDs.
                    Checksums bind the corpus and embeddings to a release. API
                    startup performs no crawl.
                  </p>
                </article>
                <article>
                  <h3>02 / Retrieval has a baseline</h3>
                  <p>
                    BM25 handles exact Kubernetes terms. The Python service adds
                    BGE semantic retrieval and reciprocal-rank fusion when query
                    embeddings are available. The browser fallback uses keyword
                    search and says so.
                  </p>
                </article>
                <article>
                  <h3>03 / Generation is optional</h3>
                  <p>
                    Cloudflare Workers AI or local Ollama can produce
                    source-cited answers. Unknown citation IDs are rejected.
                    Citation format validation does not prove factual support;
                    that requires evaluation.
                  </p>
                </article>
                <article>
                  <h3>04 / Tools have limits</h3>
                  <p>
                    YAML is parsed safely and checked statically. No cluster
                    credentials, shell execution, arbitrary crawling, or
                    infrastructure changes. Timeouts, concurrency caps, and
                    request budgets bound the API.
                  </p>
                </article>
              </div>
              <div className="tradeoff">
                <GitBranch size={20} />
                <div>
                  <h3>Designed for a free public demo</h3>
                  <p>
                    The browser evidence mode stays available without a running
                    backend. Render’s free API can sleep; local files are
                    ephemeral. The index ships with the build. A managed
                    datastore becomes useful when scaling beyond one replica.
                  </p>
                </div>
              </div>
              <a
                className="text-link"
                href="https://github.com/khancon/docs-ai-agent"
                target="_blank"
                rel="noreferrer"
              >
                Explore the implementation <ArrowUpRight size={16} />
              </a>
            </section>
          )}
          {page === "evaluation" && (
            <section className="content-page">
              <span className="eyebrow">MEASURE, THEN IMPROVE</span>
              <h1>
                Show the work.
                <br />
                <span>Measure the retrieval.</span>
              </h1>
              <p className="page-intro">
                A versioned benchmark compares retrieval strategies on explicit
                expected sources. These are retrieval measurements, not claims
                about generated-answer accuracy.
              </p>
              {report ? (
                <>
                  <div className="metric-grid">
                    <div>
                      <span>BENCHMARK CASES</span>
                      <strong>{report.cases}</strong>
                      <small>Versioned questions</small>
                    </div>
                    <div>
                      <span>DOCUMENTS</span>
                      <strong>{manifest?.documents}</strong>
                      <small>Official Kubernetes sources</small>
                    </div>
                    <div>
                      <span>SNAPSHOT</span>
                      <strong className="mono">
                        {report.corpus_revision.slice(0, 8)}
                      </strong>
                      <small>Fixed source revision</small>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Strategy</th>
                          <th>Recall @ 5</th>
                          <th>MRR</th>
                          <th>p50</th>
                          <th>p95</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.results.map((r) => (
                          <tr key={r.strategy}>
                            <td>
                              <span className="strategy-name">
                                {r.strategy}
                              </span>
                            </td>
                            <td>{(r.recall_at_5 * 100).toFixed(1)}%</td>
                            <td>{r.mrr.toFixed(3)}</td>
                            <td>{r.p50_ms.toFixed(1)} ms</td>
                            <td>{r.p95_ms.toFixed(1)} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="evaluation-note">
                    <h3>How to read these numbers</h3>
                    <p>{report.methodology}</p>
                    <p>
                      Measured locally on {report.generated_at}. Timings cover
                      retrieval after index/model initialization. They exclude
                      model generation, network time, and cold starts. The
                      benchmark is a development set authored for this corpus;
                      independent held-out human review is still needed.
                    </p>
                  </div>
                </>
              ) : (
                <div className="evaluation-note">
                  Benchmark results are not available in this build. Run the
                  evaluation script to generate them.
                </div>
              )}
              <div className="detail-grid">
                <article>
                  <h3>What is measured</h3>
                  <p>
                    Document-level recall and reciprocal rank against expected
                    source pages. Per-case results and the exact corpus revision
                    are included in the repository.
                  </p>
                </article>
                <article>
                  <h3>What is not established</h3>
                  <p>
                    Human-reviewed diagnosis success, citation entailment,
                    calibrated confidence, and hosted p95 latency. No LLM-judge
                    or production SLA claim is made.
                  </p>
                </article>
              </div>
              <a
                href={`${BASE}/data/evaluation.json`}
                className="text-link"
                target="_blank"
                rel="noreferrer"
              >
                Download benchmark summary <ArrowUpRight size={16} />
              </a>
            </section>
          )}
          {page === "about" && (
            <section className="content-page">
              <span className="eyebrow">BUILT BY AHNAF KHAN</span>
              <h1>
                From a RAG script
                <br />
                <span>to a usable workbench.</span>
              </h1>
              <p className="page-intro">
                KubeGuide explores the engineering behind useful AI
                applications: good evidence, clear boundaries, measurable
                retrieval, and graceful failure.
              </p>
              <div className="about-card">
                <span className="large-avatar">AK</span>
                <div>
                  <h2>Ahnaf Khan</h2>
                  <p>Backend & platform engineering</p>
                  <a
                    href="https://github.com/khancon"
                    target="_blank"
                    rel="noreferrer"
                  >
                    github.com/khancon <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
              <div className="detail-grid">
                <article>
                  <h3>The starting point</h3>
                  <p>
                    A FastAPI and Ollama chatbot indexing five Kubernetes pages.
                    The original project already had local embeddings, Chroma,
                    and Docker Compose.
                  </p>
                </article>
                <article>
                  <h3>The engineering focus</h3>
                  <p>
                    Separate indexing from serving. Make sources inspectable.
                    Measure retrieval against a baseline. Keep the public
                    experience useful when inference is unavailable.
                  </p>
                </article>
                <article>
                  <h3>Built with</h3>
                  <p>
                    Next.js, TypeScript, FastAPI, BGE embeddings, BM25, NumPy,
                    Docker, and GitHub Actions. Cloudflare Workers AI and Ollama
                    are optional generation providers.
                  </p>
                </article>
                <article>
                  <h3>Data & attribution</h3>
                  <p>
                    Kubernetes documentation from kubernetes/website,
                    distributed under CC BY 4.0. Excerpts are sectioned and
                    transformed for search; original pinned sources are linked.
                    KubeGuide is an independent project.
                  </p>
                </article>
              </div>
              <a
                className="text-link"
                href="https://github.com/khancon/docs-ai-agent"
                target="_blank"
                rel="noreferrer"
              >
                <Github size={17} /> View the repository{" "}
                <ArrowUpRight size={16} />
              </a>
            </section>
          )}
        </main>
        <footer>
          <span>
            KubeGuide <span className="footer-divider">/</span> Built by Ahnaf
            Khan
          </span>
          <span>
            Grounded in documentation. Open to inspection.{" "}
            <ArrowUpRight size={12} />
          </span>
        </footer>
      </div>
      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside
            className="source-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Source passage"
          >
            <div className="drawer-top">
              <span>
                <BookOpen size={16} /> SOURCE {selected.citation}
              </span>
              <button
                aria-label="Close source"
                className="icon-button"
                onClick={() => setSelected(null)}
                autoFocus
              >
                <X size={20} />
              </button>
            </div>
            <span className="eyebrow">OFFICIAL KUBERNETES DOCUMENTATION</span>
            <h2>{selected.title}</h2>
            <h3>{selected.heading}</h3>
            <div className="source-excerpt">
              <Markdown text={selected.text} />
            </div>
            <a
              className="source-link"
              href={selected.url}
              target="_blank"
              rel="noreferrer"
            >
              Open current documentation <ExternalLink size={15} />
            </a>
            <a
              className="source-link secondary"
              href={selected.snapshot_url}
              target="_blank"
              rel="noreferrer"
            >
              View pinned source <GitBranch size={15} />
            </a>
            <div className="source-provenance">
              Revision <code>{selected.revision.slice(0, 12)}</code>
              <br />
              Chunk <code>{selected.id}</code>
              <br />
              Kubernetes contributors · CC BY 4.0
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
