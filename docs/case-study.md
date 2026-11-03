# KubeGuide engineering case study

## Problem

A documentation chatbot is difficult to trust when users cannot inspect the evidence and the service rebuilds its index during startup. The original project indexed five pages, exposed local model management, and provided no frontend or evaluation.

## Change

A static Next.js workbench makes investigations accessible without sign-in. A pinned 52-document corpus with content-derived chunk IDs replaces opportunistic startup crawling. Backend retrieval is explicit BM25/vector/fusion rather than an opaque request-time chain. The UI exposes supporting passages, static findings, request activity and corpus revision. Inference is optional and failure degrades to labeled document search.

## Measurements

Read `evaluation/report.json` for actual results, environment, methodology and timestamp. The benchmark contains 48 authored development cases. It is not a human-reviewed held-out assessment. Semantic retrieval and fusion improve document recall on this set; vector-only retrieval has higher MRR than fusion, so fusion is not universally superior. No diagnosis accuracy or production latency claim is made.

## Tradeoffs

The immutable index simplifies a small free deployment at the expense of online updates. Browser search avoids backend availability for the evidence experience. Optional hosted inference avoids running a large model in a small container. Process-local budgets are insufficient for distributed abuse prevention, and provider account limits remain necessary.

## Live integration finding

The initial small model produced answers without required source IDs. The application rejected those answers and showed evidence instead. Schema-constrained citation selection and Llama 3.3 70B resolved that integration failure in the three featured smoke cases. The response validator still rejects unknown source IDs and unsupported kubectl verbs; this does not establish citation entailment or production diagnosis accuracy.

## Next evidence needed

Independent review of source support and scenario success; held-out troubleshooting questions; hosted concurrency/cold-start measurements; a comparison of deterministic workflows against bounded model-directed tool selection. Add complexity only when those measurements justify it.

## Resume wording

Built a public Kubernetes troubleshooting workbench with inspectable citations, static manifest checks, immutable ingestion artifacts, and evaluated keyword/semantic retrieval over 52 official documents.

Add measured retrieval numbers only with the benchmark size and scope. Do not describe evidence-only mode as live AI generation, or local retrieval timings as end-to-end hosted latency.
