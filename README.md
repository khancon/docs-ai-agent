# KubeGuide

**Kubernetes troubleshooting, with inspectable evidence.**

[Live AI demo](https://kubeguide-khancon.ahnaf-khan1.workers.dev/) · [Static fallback](https://khancon.github.io/docs-ai-agent/) · [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Evaluation](evaluation/report.json)

KubeGuide evolves the original FastAPI/Ollama documentation chatbot into a public troubleshooting workbench. Ask questions, inspect Deployment/Service YAML, open the exact supporting passages, and inspect retrieval activity.

## What works

- Next.js/TypeScript interface with mobile layout, keyboard controls, source drawer, follow-ups, and three featured investigations.
- 52 official Kubernetes documents / 1,103 content-addressed passages at a fixed source revision.
- Browser BM25 evidence search with no account, inference key, or backend dependency.
- Safe, bounded YAML checks for selector mismatches, missing container images, readiness probes, and resource requests.
- FastAPI service with optional BGE semantic retrieval, reciprocal-rank fusion, Cloudflare Workers AI/Ollama generation, schema and citation-ID checks, SSE progress/answer delivery, health endpoints, budgets, deadlines, and concurrency caps.
- Portable Sites Worker hosting the static export and optional same-origin inference API.
- 48 versioned development benchmark cases with per-case results for keyword/vector/hybrid retrieval.
- Tests, CI, Docker, Render Blueprint, and Vercel configuration.

**Live Cloudflare mode:** BGE hybrid retrieval and Llama 3.3 generation through a native Workers AI binding, with schema-constrained responses and validated source IDs. The three featured scenarios were verified against the real provider; see `evaluation/live-smoke.json`.

**GitHub Pages fallback:** documentation evidence and static YAML checks without inference. Retrieved excerpts are explicitly labeled; they are not represented as generated diagnoses. Citation-ID validation checks references, not whether every claim follows from its citation. Generated kubectl suggestions are restricted to an allowlist; no commands are executed.

## Local quick start

Requirements: Python 3.12+, Node.js 24+, pnpm 11.25.0.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python scripts/sync_frontend.py
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open the printed localhost URL. The browser evidence demo works immediately.

### Optional Python API

In a second terminal at the repository root:

```sh
. .venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000
```

Build/run the frontend with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` to use it. Without a configured provider, the API returns evidence search. Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as server environment variables for hosted embeddings and generation. Never prefix credentials with `NEXT_PUBLIC_`.

For local-only semantic retrieval set `LOCAL_EMBEDDINGS=true` and install `requirements-dev.txt`. For local generation set `OLLAMA_URL=http://localhost:11434`, choose `OLLAMA_MODEL`, and pull that model explicitly. No public request can download/delete a model.

### Docker / Ollama

```sh
docker compose up --build -d
docker compose exec ollama ollama pull qwen3:4b
```

Ollama is bound only to loopback. The public Render configuration does not run Ollama.

## Verify

```sh
python -m pytest -q
python scripts/evaluate.py --semantic
python scripts/sync_frontend.py
cd frontend
corepack pnpm typecheck
corepack pnpm build
cd ..
node --test tests/core.test.mjs
```

The semantic benchmark downloads BGE on first use. Corpus/embedding checksums are verified when the backend starts. API startup never crawls or embeds documents.

## Rebuild the corpus

```sh
python scripts/build_corpus.py --refresh
python scripts/build_embeddings.py
python scripts/evaluate.py --semantic
python scripts/sync_frontend.py
```

Sources are pinned in `scripts/build_corpus.py`. Changing the revision or embedding model requires rebuilding artifacts and rerunning evaluation. The three unavailable candidate paths are recorded in the manifest; 52 successful documents form the actual corpus. Do not change the embedding model for queries without rebuilding passage vectors.

## Cloudflare Worker with native AI binding

`wrangler.jsonc` binds Workers AI as `AI`; no API key is required in the Worker or browser. Build the static export and Worker bundle, then deploy with owner-authorized Wrangler:

```sh
python scripts/sync_frontend.py
cd frontend && corepack pnpm build && cd ..
python scripts/build_sites.py
node frontend/node_modules/wrangler/bin/wrangler.js deploy
```

The same Worker serves the website and API. Use an empty `NEXT_PUBLIC_BASE_PATH` for this build. GitHub Pages uses `/docs-ai-agent` and remains a browser evidence fallback.

## API

- `GET /health/live` — process liveness.
- `GET /health/ready` — index metadata and generation configuration.
- `POST /api/chat` — structured answer/evidence, sources, static findings, activity and timing.
- `POST /api/chat/stream` — SSE status, validated-answer chunks, then final structured result.
- `POST /api/validate` — supported YAML checks (uses the same request shape).

Example:

```sh
curl http://localhost:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"query":"How do I diagnose CrashLoopBackOff?","strategy":"keyword"}'
```

Generation is completed and its citation IDs validated before answer chunks are sent. This is not token-by-token provider streaming. Progress is delivered immediately.

## Evaluation boundaries

See `evaluation/report.json` and `evaluation/details.json` for measured results. The authored development set tests document retrieval, not production diagnosis success. It has not received independent human review. Warm retrieval times exclude query embedding, inference, network time and cold starts. Float32 Python vectors are the measured implementation; the optional Worker uses quantized vectors and must be evaluated separately before transferring benchmark claims.

## Limitations

No live cluster access or command execution. Static validation supports a limited subset of manifests and does not validate against the complete Kubernetes API schema. The public evidence corpus is a snapshot, not a promise of current Kubernetes behavior. Rate limits/budgets are process-local and reset across restarts (or Worker isolates); provider account quotas are the final inference spending boundary. There is no production SLA, durable global limiter, calibrated confidence score, or autonomous cluster-remediation agent.

## License and attribution

Application: MIT. Kubernetes documentation: CC BY 4.0, The Kubernetes Authors. See [third-party notices](THIRD_PARTY_NOTICES.md). KubeGuide is independent of the Kubernetes project.
