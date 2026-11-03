export const EXAMPLES = [
  {
    title: "A Pod keeps crashing",
    description: "Investigate a CrashLoopBackOff",
    tag: "Troubleshoot",
    query:
      "My Pod is in CrashLoopBackOff. How do I investigate the container logs, termination reason, and probes?",
    manifest: "",
    icon: "pod",
  },
  {
    title: "A Service has no endpoints",
    description: "Trace traffic from Service to Pod",
    tag: "Networking",
    query:
      "My Service has no endpoints. How do I check its selector against Pod labels and verify readiness?",
    manifest: "",
    icon: "network",
  },
  {
    title: "Review a deployment",
    description: "Find a selector mismatch in YAML",
    tag: "Manifest review",
    query:
      "Review this Deployment and Service. Why might traffic not reach the Pods?",
    manifest: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout
  template:
    metadata:
      labels:
        app: checkout
    spec:
      containers:
        - name: api
          image: nginx:1.27
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: checkout
spec:
  selector:
    app: payments
  ports:
    - port: 80
      targetPort: 80`,
    icon: "code",
  },
];
