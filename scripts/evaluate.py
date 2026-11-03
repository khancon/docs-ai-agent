"""Deterministic retrieval benchmark. No generated-answer accuracy claims."""

import argparse, json, platform, sys, time
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.retrieval import Retriever


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--semantic", action="store_true")
    args = p.parse_args()
    cases = json.loads((ROOT / "evaluation/cases.json").read_text())
    retriever = Retriever(ROOT / "data")
    vectors = [None] * len(cases)
    if args.semantic:
        from fastembed import TextEmbedding

        model = TextEmbedding(
            "BAAI/bge-small-en-v1.5", cache_dir=str(ROOT / ".cache/models"), threads=1
        )
        vectors = list(model.query_embed([c["query"] for c in cases]))
    results = []
    details = []
    for strategy in ["keyword", "vector", "hybrid"] if args.semantic else ["keyword"]:
        recalls = []
        rrs = []
        durations = []
        for i, case in enumerate(cases):
            started = time.perf_counter()
            sources, actual = retriever.search(case["query"], vectors[i], strategy)
            durations.append((time.perf_counter() - started) * 1000)
            found = [s["document_id"] for s in sources]
            expected = set(case["expected"])
            recall = len(expected & set(found)) / len(expected)
            rank = next((j + 1 for j, v in enumerate(found) if v in expected), None)
            recalls.append(recall)
            rrs.append(1 / rank if rank else 0)
            details.append(
                {
                    "case": i + 1,
                    "strategy": actual,
                    "query": case["query"],
                    "expected": list(expected),
                    "retrieved": found,
                    "recall_at_5": recall,
                    "reciprocal_rank": rrs[-1],
                    "duration_ms": durations[-1],
                }
            )
        results.append(
            {
                "strategy": strategy,
                "recall_at_5": float(np.mean(recalls)),
                "mrr": float(np.mean(rrs)),
                "p50_ms": float(np.percentile(durations, 50)),
                "p95_ms": float(np.percentile(durations, 95)),
            }
        )
    report = {
        "cases": len(cases),
        "corpus_revision": retriever.manifest["revision"],
        "corpus_sha256": retriever.manifest["sha256"],
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "environment": platform.platform(),
        "results": results,
        "methodology": "Document-level recall@5 measures the fraction of expected pages present among five retrieved passages (at most two passages per page). MRR is reciprocal rank of the first expected page. These 48 authored development cases have not received independent human review; no held-out result or answer-quality claim is made.",
    }
    (ROOT / "evaluation/report.json").write_text(json.dumps(report, indent=2) + "\n")
    (ROOT / "evaluation/details.json").write_text(json.dumps(details, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
