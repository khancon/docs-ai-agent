"""Bundle the exact static export and optional API into the Sites ESM entrypoint."""

import base64, json, mimetypes, subprocess
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[1]
cache = root / ".cache"
cache.mkdir(exist_ok=True)
assets = {}
for p in (root / "frontend/out").rglob("*"):
    if p.is_file() and p.relative_to(root / "frontend/out").as_posix() not in (
        "data/corpus.json",
        "data/manifest.json",
    ):
        suffix = p.suffix
        mime = {
            ".js": "application/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".txt": "text/plain",
            ".json": "application/json",
        }.get(suffix, mimetypes.guess_type(p.name)[0] or "application/octet-stream")
        assets["/" + p.relative_to(root / "frontend/out").as_posix()] = {
            "type": mime,
            "body": base64.b64encode(p.read_bytes()).decode(),
        }
(cache / "sites-assets.ts").write_text(
    "export default " + json.dumps(assets, separators=(",", ":")) + ";\n"
)
v = np.load(root / "data/embeddings.npy")
q = np.rint(v * 127).astype(np.int8).tolist()
(cache / "quantized-vectors.json").write_text(json.dumps(q, separators=(",", ":")))
subprocess.run(
    [
        str(root / "frontend/node_modules/esbuild/bin/esbuild"),
        "hosting/worker.ts",
        "--bundle",
        "--format=esm",
        "--platform=browser",
        "--target=es2022",
        "--minify",
        "--outfile=.cache/sites-worker.js",
    ],
    cwd=root,
    check=True,
)
print("Sites Worker bundle created")
