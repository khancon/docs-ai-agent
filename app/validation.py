"""Bounded static manifest checks. Never executes YAML or kubectl."""

import yaml


class UniqueSafeLoader(yaml.SafeLoader):
    pass


def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            if key in result:
                raise yaml.YAMLError("Duplicate mapping key")
            result[key] = loader.construct_object(value_node, deep=deep)
        except TypeError as exc:
            raise yaml.YAMLError("Mapping keys must be scalar") from exc
    return result


UniqueSafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping
)


def validate_manifest(text):
    if not text.strip():
        return []
    if len(text) > 16000:
        return [{"level": "error", "message": "Manifest exceeds 16,000 characters."}]
    # Aliases and tags are unnecessary for the supported manifest subset.
    try:
        for token in yaml.scan(text):
            if isinstance(
                token,
                (yaml.tokens.AliasToken, yaml.tokens.AnchorToken, yaml.tokens.TagToken),
            ):
                return [
                    {
                        "level": "error",
                        "message": "YAML aliases, anchors, and custom tags are not supported.",
                    }
                ]
        docs = list(yaml.load_all(text, Loader=UniqueSafeLoader))
        if len(docs) > 20:
            raise yaml.YAMLError("Too many documents")
    except (yaml.YAMLError, RecursionError):
        return [
            {
                "level": "error",
                "message": "Invalid YAML. Check indentation, colons, and document separators.",
            }
        ]
    findings = []
    workloads = []
    services = []
    for d in docs:
        if not isinstance(d, dict):
            findings.append(
                {"level": "error", "message": "Each YAML document must be an object."}
            )
            continue
        if not isinstance(d.get("spec", {}), dict) or not isinstance(
            d.get("metadata", {}), dict
        ):
            findings.append(
                {"level": "error", "message": "metadata and spec must be objects."}
            )
            continue
        name = d.get("metadata", {}).get("name", "unnamed")
        kind = d.get("kind", "")
        for field in ("apiVersion", "kind", "metadata"):
            if not d.get(field):
                findings.append(
                    {"level": "error", "message": f"{name}: missing {field}."}
                )
        spec = d.get("spec", {})
        if kind in ("Deployment", "StatefulSet", "DaemonSet", "Pod"):
            template = d if kind == "Pod" else spec.get("template", {})
            if not isinstance(template, dict):
                findings.append(
                    {
                        "level": "error",
                        "message": f"{name}: template must be an object.",
                    }
                )
                continue
            meta = template.get("metadata") or {}
            ps = template.get("spec") or {}
            if not isinstance(meta, dict) or not isinstance(ps, dict):
                findings.append(
                    {
                        "level": "error",
                        "message": f"{name}: template metadata and spec must be objects.",
                    }
                )
                continue
            labels = meta.get("labels", {}) or {}
            workloads.append(
                (name, labels, d.get("metadata", {}).get("namespace", "default"))
            )
            selector = spec.get("selector") or {}
            if not isinstance(selector, dict):
                selector = {}
            match = selector.get("matchLabels") or {}
            if (
                isinstance(match, dict)
                and isinstance(labels, dict)
                and any(labels.get(k) != v for k, v in match.items())
            ):
                findings.append(
                    {
                        "level": "error",
                        "message": f"{name}: workload selector does not match Pod template labels.",
                    }
                )
            containers = ps.get("containers", [])
            if not isinstance(containers, list):
                containers = []
            if not containers:
                findings.append(
                    {"level": "error", "message": f"{name}: no containers defined."}
                )
            for c in containers:
                if not isinstance(c, dict):
                    findings.append(
                        {
                            "level": "error",
                            "message": f"{name}: container entry must be an object.",
                        }
                    )
                    continue
                cn = c.get("name", "container")
                if not c.get("image"):
                    findings.append(
                        {
                            "level": "error",
                            "message": f"{name}/{cn}: missing container image.",
                        }
                    )
                if not c.get("readinessProbe"):
                    findings.append(
                        {
                            "level": "warning",
                            "message": f"{name}/{cn}: no readiness probe; review traffic readiness behavior.",
                        }
                    )
                resources = c.get("resources") or {}
                if not isinstance(resources, dict) or not resources.get("requests"):
                    findings.append(
                        {
                            "level": "warning",
                            "message": f"{name}/{cn}: no resource requests; scheduling requirements are unspecified.",
                        }
                    )
        if kind == "Service":
            services.append(
                (
                    name,
                    spec.get("selector"),
                    d.get("metadata", {}).get("namespace", "default"),
                )
            )
    for name, selector, namespace in services:
        candidates = [w for w in workloads if w[2] == namespace]
        if not isinstance(selector, dict) or not selector:
            findings.append(
                {
                    "level": "info",
                    "message": f"{name}: selectorless Service; endpoints must be managed separately.",
                }
            )
        elif candidates and not any(
            isinstance(labels, dict)
            and all(labels.get(k) == v for k, v in selector.items())
            for _, labels, _ in candidates
        ):
            findings.append(
                {
                    "level": "error",
                    "message": f"{name}: Service selector matches no supplied Pod template in namespace {namespace}.",
                }
            )
    return findings or [
        {
            "level": "info",
            "message": "No issues found by the supported static checks. Cluster behavior has not been verified.",
        }
    ]
