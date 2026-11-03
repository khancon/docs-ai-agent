from pathlib import Path
import shutil

root = Path(__file__).resolve().parents[1]
out = root / "frontend/public/data"
out.mkdir(parents=True, exist_ok=True)
for name in ("corpus.json", "manifest.json"):
    shutil.copyfile(root / "data" / name, out / name)
if (root / "evaluation/report.json").exists():
    shutil.copyfile(root / "evaluation/report.json", out / "evaluation.json")
