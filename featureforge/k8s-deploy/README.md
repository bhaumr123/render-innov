# k8s-deploy

This directory is intentionally empty (aside from this file).

It's the **output** of FeatureForge's `k8s` stream. Every manifest that
eventually appears here — Dockerfiles, Deployments, Services, ConfigMaps —
gets created by describing a deployment need to FeatureForge
(`POST /api/features/k8s/plan`, review the diff, then
`POST /api/features/k8s/apply`), the same way `tripcraft-app/` gets built by
the `fullstack` stream. Same tool, same plan/diff/apply loop, different
target and a different system prompt (Kubernetes conventions instead of
application code).
