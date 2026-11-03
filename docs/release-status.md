# Release verification status

- Production Next.js static build: verified locally.
- Backend regression tests: 21 passing.
- Browser/Worker checks: 11 passing.
- UI QA: desktop, 390px mobile (no horizontal overflow), featured YAML mismatch, source provenance drawer, evaluation table.
- Corpus: 52 official documents, 1,103 chunks; fixed source revision and checked corpus/embedding hashes.
- Retrieval evaluation: 48 authored development cases; keyword, vector, hybrid measured. See report for scope and limitations.
- Live inference: REST and native AI-binding implementations and mocked success/failure verified. Direct Cloudflare deployment awaits owner OAuth authorization; native binding needs no application API key.
- Sites publication: blocked by automatic approval review on the required temporary-credential stdin handoff, despite a filesystem/network permission grant. No live Sites deployment is claimed.
- GitHub Pages: deployed successfully at https://khancon.github.io/docs-ai-agent/; public YAML investigation verified.
- Vercel/Render: configuration supplied; accounts are not created and those hosts are not deployed.
- Walkthrough: screenshots and a 90-second recording script supplied; no recorded video is claimed.
- Model-directed multi-tool agent, independent human answer review, and production SLA: not shipped/claimed.
