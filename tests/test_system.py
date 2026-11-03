import asyncio, hashlib, json
from pathlib import Path
from dataclasses import replace
import httpx, pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException
from app.config import settings
from app.retrieval import Retriever
from app.validation import validate_manifest
from app.provider import Provider, ProviderError
from app.api import Budget
from main import app

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_ready_does_not_ingest(client):
    data = client.get("/health/ready").json()
    assert data["status"] == "ready"
    assert data["corpus"]["documents"] >= 50


def test_keyword_exact_error():
    r = Retriever(ROOT / "data")
    sources, mode = r.search("ImagePullBackOff imagePullPolicy")
    assert mode == "keyword"
    assert "concepts/containers/images" in [s["document_id"] for s in sources]


def test_abstention(client):
    r = client.post("/api/chat", json={"query": "quuxxyzzy wibbleflorp"})
    assert r.status_code == 200
    assert r.json()["mode"] == "insufficient_evidence"
    assert not r.json()["sources"]


def test_evidence_citations(client):
    data = client.post(
        "/api/chat",
        json={"query": "How do I debug CrashLoopBackOff?", "strategy": "keyword"},
    ).json()
    assert data["mode"] == "evidence_search"
    assert data["sources"]
    assert data["sources"][0]["citation"] == "S1"
    assert "not an AI-generated diagnosis" in data["answer"]


def test_rejects_client_model_and_large_inputs(client):
    assert (
        client.post(
            "/api/chat", json={"query": "Pod logs", "model_name": "arbitrary"}
        ).status_code
        == 422
    )
    assert client.post("/api/chat", json={"query": "x" * 2001}).status_code == 422
    assert client.post("/api/chat", content="x" * 48001).status_code == 413
    assert client.delete("/models/foo").status_code == 404


def test_stream_final_event(client):
    r = client.post(
        "/api/chat/stream", json={"query": "What is a Pod?", "strategy": "keyword"}
    )
    assert r.status_code == 200
    assert "event: status" in r.text
    assert "event: result" in r.text


def test_selector_mismatch():
    yaml = """apiVersion: apps/v1
kind: Deployment
metadata: {name: demo}
spec:
  selector: {matchLabels: {app: demo}}
  template:
    metadata: {labels: {app: demo}}
    spec:
      containers: [{name: app, image: nginx}]
---
apiVersion: v1
kind: Service
metadata: {name: demo}
spec: {selector: {app: wrong}}
"""
    findings = validate_manifest(yaml)
    assert any("matches no supplied" in f["message"] for f in findings)
    assert any("readiness" in f["message"] for f in findings)


def test_no_cross_namespace_match():
    yaml = """apiVersion: v1
kind: Pod
metadata: {name: app, namespace: other, labels: {app: demo}}
spec: {containers: [{name: app, image: nginx}]}
---
apiVersion: v1
kind: Service
metadata: {name: demo}
spec: {selector: {app: wrong}}
"""
    assert not any(
        "matches no supplied" in f["message"] for f in validate_manifest(yaml)
    )


@pytest.mark.parametrize(
    "yaml",
    [
        "a: [",
        "!!python/object:os.system {}",
        "a: &a [*a]",
        "[]",
        "spec: 3",
        "apiVersion: v1\nkind: Pod\nmetadata: {}\nspec: {containers: [3]}",
    ],
)
def test_hostile_or_malformed_yaml_does_not_crash(yaml):
    assert validate_manifest(yaml)


def test_checksum_rejection(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps({"sha256": "bad"}))
    (tmp_path / "corpus.json").write_text("{}")
    with pytest.raises(ValueError):
        Retriever(tmp_path)


def test_rate_and_generation_budget():
    async def run():
        b = Budget(1)
        for _ in range(8):
            await b.admit("client")
        with pytest.raises(HTTPException):
            await b.admit("client")
        assert await b.reserve()
        assert not await b.reserve()

    asyncio.run(run())


def test_provider_citation_validation():
    async def run():
        p = Provider(replace(settings, account_id="test", api_token="test"))

        async def fake(*args):
            return {"response": "Unfounded answer [S99]"}

        p.cloudflare = fake
        with pytest.raises(ProviderError):
            await p.generate(
                "Pod?",
                [
                    {
                        "citation": "S1",
                        "title": "Pod",
                        "heading": "Overview",
                        "text": "Evidence",
                    }
                ],
                [],
            )
        await p.close()

    asyncio.run(run())


def test_provider_failure_falls_back(client):
    async def fail(*args):
        raise ProviderError("unavailable")

    client.app.state.provider.s = replace(settings, account_id="test", api_token="test")
    client.app.state.provider.generate = fail
    d = client.post(
        "/api/chat", json={"query": "What is a Pod?", "strategy": "keyword"}
    ).json()
    assert d["mode"] == "evidence_search"
    assert any("unavailable" in w for w in d["warnings"])


def test_all_benchmark_expected_documents_exist():
    r = Retriever(ROOT / "data")
    docs = {c["document_id"] for c in r.chunks}
    for c in json.loads((ROOT / "evaluation/cases.json").read_text()):
        assert set(c["expected"]) <= docs


def test_duplicate_yaml_keys_rejected():
    assert validate_manifest("kind: Pod\nkind: Service")[0]["level"] == "error"


def test_live_provider_success_with_mock(client):
    async def generate(query, sources, findings):
        return "Inspect the Pod events and logs [S1].", {"total_tokens": 42}

    client.app.state.provider.s = replace(settings, account_id="test", api_token="test")
    client.app.state.provider.generate = generate
    response = client.post(
        "/api/chat", json={"query": "How do I debug a Pod?", "strategy": "keyword"}
    )
    assert response.status_code == 200
    assert response.json()["mode"] == "live_ai"
    assert response.json()["usage"]["total_tokens"] == 42


def test_provider_structured_response_validation():
    async def run():
        p = Provider(replace(settings, account_id="test", api_token="test"))

        async def good(*args):
            return {
                "response": {
                    "answer": "Inspect `kubectl get pods`.",
                    "citations": ["S1"],
                },
                "usage": {"total_tokens": 10},
            }

        p.cloudflare = good
        sources = [
            {
                "citation": "S1",
                "title": "Pod",
                "heading": "Overview",
                "text": "Evidence",
            }
        ]
        answer, usage = await p.generate("Pods?", sources, [])
        assert "[S1]" in answer and usage["total_tokens"] == 10

        async def unknown(*args):
            return {
                "response": {
                    "answer": "Inspect Pods.",
                    "citations": ["S1", "not-a-source"],
                }
            }

        p.cloudflare = unknown
        with pytest.raises(ProviderError):
            await p.generate("Pods?", sources, [])

        async def mutating(*args):
            return {
                "response": {
                    "answer": "Run `kubectl delete pod demo`.",
                    "citations": ["S1"],
                }
            }

        p.cloudflare = mutating
        with pytest.raises(ProviderError):
            await p.generate("Pods?", sources, [])
        await p.close()

    asyncio.run(run())
