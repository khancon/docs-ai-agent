# Release verification status

- Production Next.js static build: verified locally.
- Backend regression tests: 22 passing.
- Browser/Worker checks: 12 passing.
- UI QA: desktop, 390px mobile (no horizontal overflow), featured YAML mismatch, source provenance drawer, evaluation table.
- Corpus: 52 official documents, 1,103 chunks; fixed source revision and checked corpus/embedding hashes.
- Retrieval evaluation: 48 authored development cases; keyword, vector, hybrid measured. See report for scope and limitations.
- Live inference: native Workers AI binding deployed and all three live scenarios passed with valid citations. BGE hybrid retrieval + Llama 3.3 70B JSON-mode generation. Observed requests took 4.3–5.9 seconds; these three cases are smoke checks, not a hosted latency benchmark. See evaluation/live-smoke.json.
- Sites publication: blocked by automatic approval review on the required temporary-credential stdin handoff, despite a filesystem/network permission grant. No live Sites deployment is claimed.
- GitHub Pages: deployed successfully at https://khancon.github.io/docs-ai-agent/; public YAML investigation verified.
- Vercel/Render: configuration supplied; accounts are not created and those hosts are not deployed.
- Walkthrough: screenshots and a 90-second recording script supplied; no recorded video is claimed.
- Model-directed multi-tool agent, independent human answer review, and production SLA: not shipped/claimed.
- Primary public URL: https://kubeguide-khancon.ahnaf-khan1.workers.dev/
