import asyncio, hashlib, json, logging, time, uuid
from collections import OrderedDict, deque
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict
from .validation import validate_manifest
from .provider import ProviderError

logger = logging.getLogger("kubeguide")
router = APIRouter()


class Query(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=3, max_length=2000)
    manifest: str = Field(default="", max_length=16000)
    strategy: str = Field(default="hybrid", pattern="^(hybrid|keyword|vector)$")
    history: list[str] = Field(default_factory=list, max_length=4)

    def context(self):
        return " ".join(h[:500] for h in self.history) + " " + self.query


class Budget:
    def __init__(self, limit):
        self.clients = OrderedDict()
        self.day = ""
        self.used = 0
        self.limit = limit
        self.lock = asyncio.Lock()

    async def admit(self, client):
        async with self.lock:
            now = time.monotonic()
            key = hashlib.sha256(client.encode()).hexdigest()[:20]
            q = self.clients.pop(key, deque())
            q = deque(t for t in q if now - t < 60)
            self.clients[key] = q
            while len(self.clients) > 2000:
                self.clients.popitem(last=False)
            if len(q) >= 8:
                raise HTTPException(429, "Too many requests. Try again in a minute.")
            q.append(now)

    async def reserve(self):
        async with self.lock:
            day = datetime.now(timezone.utc).date().isoformat()
            if day != self.day:
                self.day = day
                self.used = 0
            if self.used >= self.limit:
                return False
            self.used += 1
            return True


@router.get("/health/live")
async def live():
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(request: Request):
    state = request.app.state
    return {
        "status": "ready",
        "generation_available": state.provider.configured,
        "corpus": state.retriever.manifest,
        "mode": "live_ai" if state.provider.configured else "evidence_search",
    }


@router.get("/api/corpus")
async def corpus(request: Request):
    return request.app.state.retriever.manifest


@router.post("/api/validate")
async def validate(body: Query, request: Request):
    await request.app.state.budget.admit(
        request.client.host if request.client else "unknown"
    )
    return {"findings": await asyncio.to_thread(validate_manifest, body.manifest)}


async def answer(body, request):
    start = time.perf_counter()
    state = request.app.state
    trace = []
    warnings = []
    rid = uuid.uuid4().hex[:12]
    findings = await asyncio.to_thread(validate_manifest, body.manifest)
    if findings:
        trace.append(
            {"tool": "validate_manifest", "detail": f"{len(findings)} static findings"}
        )
    query = body.context().strip()
    # Include only deterministic finding text in retrieval; never put arbitrary YAML into tool instructions.
    if findings:
        query += (
            " "
            + " ".join(f["message"] for f in findings if f["level"] == "error")[:600]
        )
    vector = None
    if body.strategy != "keyword":
        try:
            async with asyncio.timeout(12):
                vector = await state.provider.embed(query)
        except (ProviderError, TimeoutError, KeyError, ValueError):
            warnings.append("Semantic retrieval unavailable; using keyword search.")
    sources, strategy = await asyncio.to_thread(
        state.retriever.search, query, vector, body.strategy
    )
    trace.append(
        {
            "tool": "search_docs",
            "detail": f"{strategy} retrieval · {len(sources)} passages",
        }
    )
    if vector is None and body.strategy != "keyword":
        warnings.append(
            "This request used keyword retrieval; semantic embeddings are not configured."
        )
    mode = "evidence_search"
    usage = {}
    text = ""
    # Require lexical evidence for public abstention even when vector search always returns neighbors.
    lexical, _ = state.retriever.search(query, strategy="keyword", k=1)
    if not sources or not lexical:
        text = "I could not find supporting evidence in this Kubernetes documentation snapshot. Please describe the Kubernetes resource, error message, and expected behavior."
        sources = []
        mode = "insufficient_evidence"
    elif state.provider.configured:
        if await state.budget.reserve():
            try:
                async with state.semaphore:
                    async with asyncio.timeout(40):
                        text, usage = await state.provider.generate(
                            body.query, sources, findings
                        )
                mode = "live_ai"
                trace.append(
                    {
                        "tool": "generate_answer",
                        "detail": "Source IDs validated; semantic support still requires review",
                    }
                )
            except (ProviderError, TimeoutError):
                warnings.append(
                    "Live generation is unavailable or failed validation. Showing retrieved evidence instead."
                )
        else:
            warnings.append(
                "Daily generation budget reached. Evidence search remains available."
            )
    if not text:
        text = "### Documentation evidence\n\nThese passages were retrieved for your question. **This is evidence search, not an AI-generated diagnosis.**\n\n"
        text += "\n\n".join(
            f"**{s['title']} — {s['heading']}** [{s['citation']}]\n\n{s['text'][:650]}"
            for s in sources[:3]
        )
        text += "\n\n### Next step\nShare the relevant Pod events, container logs, or resource configuration to narrow the investigation. No cluster commands were executed."
    elapsed = round((time.perf_counter() - start) * 1000)
    trace.append({"tool": "complete", "detail": f"{elapsed} ms · {mode}"})
    result = {
        "answer": text,
        "sources": sources,
        "findings": findings,
        "trace": trace,
        "warnings": list(dict.fromkeys(warnings)),
        "mode": mode,
        "strategy": strategy,
        "usage": usage,
        "request_id": rid,
        "duration_ms": elapsed,
        "corpus_revision": state.retriever.manifest["revision"],
    }
    logger.info(
        json.dumps(
            {
                "request_id": rid,
                "mode": mode,
                "duration_ms": elapsed,
                "sources": len(sources),
            }
        )
    )
    return result


@router.post("/chat")
@router.post("/api/chat")
async def chat(body: Query, request: Request):
    await request.app.state.budget.admit(
        request.client.host if request.client else "unknown"
    )
    try:
        async with asyncio.timeout(55):
            return await answer(body, request)
    except TimeoutError:
        raise HTTPException(504, "Request timed out. Please retry.")


@router.post("/api/chat/stream")
async def stream(body: Query, request: Request):
    await request.app.state.budget.admit(
        request.client.host if request.client else "unknown"
    )

    async def events():
        def event(kind, data):
            return f"event: {kind}\ndata: {json.dumps(data)}\n\n"

        yield event(
            "status", {"message": "Searching the pinned Kubernetes documentation…"}
        )
        try:
            async with asyncio.timeout(55):
                result = await answer(body, request)
            # Progress is streamed immediately; completed answers are chunked after citation validation.
            for i in range(0, len(result["answer"]), 180):
                if await request.is_disconnected():
                    return
                yield event("delta", {"text": result["answer"][i : i + 180]})
                await asyncio.sleep(0)
            yield event("result", result)
        except TimeoutError:
            yield event("error", {"message": "Request timed out. Please retry."})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
