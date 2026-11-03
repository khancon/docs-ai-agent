"""BM25 + BGE with reciprocal-rank fusion. Immutable index, initialized once."""

import hashlib, json, math, re
from collections import Counter
from pathlib import Path
import numpy as np

STOP = set(
    "a an the is are of for to in on and or with my why how what does do can i it this that from be as not has have".split()
)


def tokens(text):
    return [
        t
        for t in re.findall(r"[a-z0-9]+", text.lower())
        if t not in STOP and len(t) > 1
    ]


class Retriever:
    def __init__(self, data_dir: Path):
        self.manifest = json.loads((data_dir / "manifest.json").read_text())
        raw = (data_dir / "corpus.json").read_bytes()
        if hashlib.sha256(raw).hexdigest() != self.manifest["sha256"]:
            raise ValueError("Corpus checksum mismatch")
        self.chunks = json.loads(raw)["chunks"]
        self.counts = [
            Counter(tokens(f"{c['title']} {c['heading']} {c['text']}"))
            for c in self.chunks
        ]
        self.lengths = [sum(c.values()) for c in self.counts]
        self.avg = sum(self.lengths) / len(self.lengths)
        self.df = Counter(t for c in self.counts for t in c)
        self.vectors = None
        p = data_dir / "embeddings.npy"
        if p.exists():
            if hashlib.sha256(p.read_bytes()).hexdigest() != self.manifest.get(
                "embeddings_sha256"
            ):
                raise ValueError("Embedding checksum mismatch")
            self.vectors = np.load(p, allow_pickle=False)
            if self.vectors.shape != (len(self.chunks), 384):
                raise ValueError("Embedding shape mismatch")

    def search(self, query, vector=None, strategy="hybrid", k=5):
        terms = tokens(query)
        n = len(self.chunks)
        scores = []
        for index, counts in enumerate(self.counts):
            score = 0.0
            for t in terms:
                freq = counts.get(t, 0)
                if freq:
                    score += (
                        math.log(1 + (n - self.df[t] + 0.5) / (self.df[t] + 0.5))
                        * freq
                        * 2.5
                        / (freq + 1.5 * (0.25 + 0.75 * self.lengths[index] / self.avg))
                    )
            if score:
                scores.append((index, score))
        lexical = sorted(scores, key=lambda x: (-x[1], x[0]))
        semantic = []
        if vector is not None and self.vectors is not None:
            v = np.array(vector, dtype=np.float32)
            norm = np.linalg.norm(v)
            if (
                v.shape != (384,)
                or not np.isfinite(v).all()
                or not np.isfinite(norm)
                or not norm
            ):
                raise ValueError("Invalid query embedding")
            sims = np.einsum("ij,j->i", self.vectors, v / norm)
            semantic = sorted(enumerate(sims), key=lambda x: (-float(x[1]), x[0]))[:30]
        actual = (
            "hybrid"
            if semantic and strategy == "hybrid"
            else "vector"
            if semantic and strategy == "vector"
            else "keyword"
        )
        if actual == "hybrid":
            ranks = Counter()
            for ranking in (lexical[:30], semantic):
                for r, (idx, _) in enumerate(ranking):
                    ranks[idx] += 1 / (60 + r + 1)
            ranking = sorted(ranks.items(), key=lambda x: (-x[1], x[0]))
        else:
            ranking = semantic if actual == "vector" else lexical
        selected = []
        per_doc = Counter()
        for idx, score in ranking:
            c = self.chunks[idx]
            if per_doc[c["document_id"]] >= 2:
                continue
            selected.append(
                {
                    **c,
                    "score": round(float(score), 5),
                    "citation": f"S{len(selected) + 1}",
                }
            )
            per_doc[c["document_id"]] += 1
            if len(selected) >= k:
                break
        return selected, actual
