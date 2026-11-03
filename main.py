from contextlib import asynccontextmanager
import asyncio, logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings
from app.retrieval import Retriever
from app.provider import Provider
from app.api import router, Budget

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app):
    app.state.retriever = Retriever(settings.data_dir)
    app.state.provider = Provider(settings)
    app.state.budget = Budget(settings.daily_limit)
    app.state.semaphore = asyncio.Semaphore(2)
    yield
    await app.state.provider.close()


app = FastAPI(title="KubeGuide API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def boundaries(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > 48000):
        return JSONResponse({"detail": "Request body too large"}, 413)
    if request.method == "POST":
        parts = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 48000:
                return JSONResponse({"detail": "Request body too large"}, 413)
            parts.append(chunk)
        request._body = b"".join(parts)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


app.include_router(router)
