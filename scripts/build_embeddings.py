import hashlib, json
from pathlib import Path
import numpy as np
from fastembed import TextEmbedding

ROOT = Path(__file__).resolve().parents[1]
corpus = json.loads((ROOT / "data/corpus.json").read_text())
model = TextEmbedding(
    "BAAI/bge-small-en-v1.5", cache_dir=str(ROOT / ".cache/models"), threads=2
)
texts = [f"{c['title']} / {c['heading']}\n{c['text']}" for c in corpus["chunks"]]
vectors = np.array(list(model.passage_embed(texts, batch_size=32)), dtype=np.float32)
vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-9)
path = ROOT / "data/embeddings.npy"
np.save(path, vectors, allow_pickle=False)
manifest = json.loads((ROOT / "data/manifest.json").read_text())
manifest["embeddings_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
(ROOT / "data/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Built {vectors.shape} embeddings")
