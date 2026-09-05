# Explicit-grant lazy tools for workflow agents

This image overlay changes Twenty v2.32.0 workflow AI steps to load tool schemas on demand. It reuses Twenty's existing tool catalog, learning and execution code.

The workflow-only strategy preserves explicit object grants and carries them through catalog, schema and tool execution. Existing ordinary lazy callers and the default preloaded strategy retain their behavior. Text and structured result shapes are unchanged.

The Dockerfile pins the upstream image digest. Before modifying three compiled modules, the build checks their SHA-256 hashes, validates the proposed JavaScript and runs eight isolated regression tests. A changed upstream source stops the build for review.

The tests use mocked providers and do not prove live provider availability, production permissions, successful CRM writes or end-to-end workflow completion. Deployments still require those checks. This patch does not add credits, alter provider accounts or automatically resume paused workflows.

For a Compose deployment, use this directory as a Git build context pinned to a reviewed commit. Use the resulting same image for server and worker, retain their original commands, environment and storage, and preserve the previous image for rollback. Do not configure an upstream pull policy that replaces the locally built overlay.

This directory does not contain deployment credentials, workspace configuration or customer records.
