from dataclasses import dataclass
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    data_dir: Path = ROOT / "data"
    account_id: str = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
    api_token: str = os.getenv("CLOUDFLARE_API_TOKEN", "")
    model: str = os.getenv(
        "GENERATION_MODEL", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
    )
    embedding_model: str = "@cf/baai/bge-small-en-v1.5"
    local_embeddings: bool = os.getenv("LOCAL_EMBEDDINGS", "false").lower() == "true"
    ollama_url: str = os.getenv("OLLAMA_URL", "")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "qwen3:4b")
    allowed_origins: tuple = tuple(
        os.getenv(
            "ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
        ).split(",")
    )
    daily_limit: int = int(os.getenv("DAILY_GENERATIONS", "60"))
    model_cache: str = os.getenv("FASTEMBED_CACHE_PATH", str(ROOT / ".cache/models"))


settings = Settings()
