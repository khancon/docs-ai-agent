"""Build a pinned, section-aware corpus. No network access occurs at API startup."""

import argparse, concurrent.futures, hashlib, json, re, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = "177aebb48df75c35d179ae1fb0338afa15e4abd4"
PATHS = """concepts/workloads/pods
concepts/workloads/pods/pod-lifecycle
concepts/workloads/pods/init-containers
concepts/workloads/pods/sidecar-containers
concepts/workloads/pods/disruptions
concepts/workloads/pods/pod-qos
concepts/workloads/controllers/deployment
concepts/workloads/controllers/replicaset
concepts/workloads/controllers/statefulset
concepts/workloads/controllers/daemonset
concepts/workloads/controllers/job
concepts/workloads/controllers/cron-jobs
concepts/services-networking/service
concepts/services-networking/ingress
concepts/services-networking/network-policies
concepts/services-networking/dns-pod-service
concepts/services-networking/endpoint-slices
concepts/services-networking/cluster-ip-allocation
concepts/configuration/configmap
concepts/configuration/secret
concepts/configuration/manage-resources-containers
concepts/configuration/liveness-readiness-startup-probes
concepts/storage/volumes
concepts/storage/persistent-volumes
concepts/storage/storage-classes
concepts/security/rbac-good-practices
concepts/security/pod-security-standards
concepts/security/service-accounts
concepts/overview/working-with-objects/labels
concepts/overview/working-with-objects/namespaces
concepts/overview/working-with-objects/annotations
concepts/scheduling-eviction/assign-pod-node
concepts/scheduling-eviction/taint-and-toleration
concepts/scheduling-eviction/node-pressure-eviction
concepts/scheduling-eviction/pod-priority-preemption
concepts/cluster-administration/logging
concepts/cluster-administration/manage-deployment
concepts/architecture/nodes
concepts/architecture/garbage-collection
concepts/containers/images
concepts/containers/container-environment
concepts/containers/runtime-class
tasks/debug/debug-application/debug-pods
tasks/debug/debug-application/debug-running-pod
tasks/debug/debug-application/debug-service
tasks/debug/debug-application/debug-init-containers
tasks/debug/debug-application/determine-reason-pod-failure
tasks/debug/debug-application/get-shell-running-container
tasks/configure-pod-container/configure-liveness-readiness-startup-probes
tasks/configure-pod-container/assign-memory-resource
tasks/configure-pod-container/assign-cpu-resource
tasks/configure-pod-container/configure-pod-configmap
tasks/configure-pod-container/security-context
tasks/run-application/horizontal-pod-autoscale
tasks/access-application-cluster/port-forward-access-application-cluster""".splitlines()


def download(path):
    for suffix in (".md", "/_index.md"):
        url = f"https://raw.githubusercontent.com/kubernetes/website/{REVISION}/content/en/docs/{path}{suffix}"
        for attempt in range(3):
            try:
                req = urllib.request.Request(
                    url, headers={"User-Agent": "KubeGuide-corpus/1.0"}
                )
                with urllib.request.urlopen(req, timeout=30) as r:
                    text = r.read().decode()
                return path, text, url
            except Exception as e:
                if getattr(e, "code", 0) == 404:
                    break
                if attempt == 2:
                    break
                time.sleep(attempt + 1)
    return path, None, None


def chunks_for(path, raw, source):
    title_match = re.search(r'^title:\s*["\']?(.+?)["\']?\s*$', raw, re.M)
    title = (
        title_match.group(1)
        if title_match
        else path.split("/")[-1].replace("-", " ").title()
    )
    body = re.sub(r"^---\n.*?\n---\n", "", raw, count=1, flags=re.S)
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
    body = re.sub(r"{{[<%].*?[%>]}}", "", body, flags=re.S)
    parts = re.split(r"(?m)^(#{1,4})\s+(.+)$", body)
    sections = [("Overview", parts[0])]
    sections += [(parts[i + 1], parts[i + 2]) for i in range(1, len(parts), 3)]
    out = []
    for heading, text in sections:
        # Paragraph blocks preserve fenced examples whenever they fit the budget.
        blocks = (
            re.findall(r"```.*?```|(?:[^\n]+\n?)+", text, re.S)
            if False
            else re.split(r"\n\s*\n", text)
        )
        buf = ""
        for block in blocks + [""]:
            if len(buf) + len(block) > 2200 or not block:
                if len(buf.strip()) > 90:
                    clean = buf.strip()
                    key = hashlib.sha256(
                        f"{path}|{heading}|{clean}".encode()
                    ).hexdigest()[:16]
                    out.append(
                        {
                            "id": key,
                            "document_id": path,
                            "title": title,
                            "heading": heading,
                            "url": f"https://kubernetes.io/docs/{path}/",
                            "snapshot_url": source,
                            "text": clean,
                            "revision": REVISION,
                        }
                    )
                buf = ""
            # Bound pathological paragraphs and retain every character.
            if len(block) > 2200:
                for start in range(0, len(block), 2000):
                    piece = block[start : start + 2200]
                    if len(piece.strip()) > 90:
                        key = hashlib.sha256(
                            f"{path}|{heading}|{piece}".encode()
                        ).hexdigest()[:16]
                        out.append(
                            {
                                "id": key,
                                "document_id": path,
                                "title": title,
                                "heading": heading,
                                "url": f"https://kubernetes.io/docs/{path}/",
                                "snapshot_url": source,
                                "text": piece,
                                "revision": REVISION,
                            }
                        )
            else:
                buf += block + "\n\n"
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    destination = ROOT / "data/corpus.json"
    if destination.exists() and not args.refresh:
        print("Using checked-in corpus; pass --refresh to rebuild.")
        return
    all_chunks = []
    failed = []
    rawdir = ROOT / "data/sources"
    rawdir.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for path, raw, source in pool.map(download, PATHS):
            if raw is None:
                failed.append(path)
                continue
            (rawdir / (path.replace("/", "__") + ".md")).write_text(raw)
            all_chunks.extend(chunks_for(path, raw, source))
    unique = sorted({c["id"]: c for c in all_chunks}.values(), key=lambda c: c["id"])
    docs = len({c["document_id"] for c in unique})
    if docs < 50:
        raise RuntimeError(f"Only {docs} documents downloaded. Failures: {failed}")
    payload = {
        "revision": REVISION,
        "source": "kubernetes/website",
        "license": "CC-BY-4.0",
        "chunks": unique,
    }
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    destination.write_text(encoded)
    manifest = {
        "revision": REVISION,
        "documents": docs,
        "chunks": len(unique),
        "sha256": hashlib.sha256(encoded.encode()).hexdigest(),
        "failed_paths": failed,
        "indexed_at": "2026-11-02",
        "embedding_model": "BAAI/bge-small-en-v1.5",
        "embedding_dimensions": 384,
    }
    (ROOT / "data/manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
