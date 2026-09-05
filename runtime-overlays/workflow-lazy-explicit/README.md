# Workflow runtime repairs for Twenty

This image overlay changes Twenty v2.32.0 workflow AI steps to load tool schemas on demand. It reuses Twenty's existing tool catalog, learning and execution code.

The workflow-only strategy preserves explicit object grants and carries them through catalog, schema and tool execution. Existing ordinary lazy callers and the default preloaded strategy retain their behavior. Text and structured result shapes are unchanged.

The overlay also repairs qualified table-alias rewriting in conditional mutations. Every matching qualified identifier is rewritten, including every bound used to implement a DateTime equality comparison. SQL literals and comments are preserved. The existing millisecond-bucket comparison and recursive condition handling remain unchanged.

The Dockerfile pins the upstream image digest. Before modifying four compiled modules, the build checks their SHA-256 hashes, validates the proposed JavaScript and runs eight tool-loading regression tests plus ten alias-rewriting regression tests. A changed upstream source stops the build for review.

The tests use isolated dependencies and do not prove live provider availability, production permissions, successful CRM writes or end-to-end workflow completion. Deployments still require those checks, including a native conditional update that changes one matching row and a stale-timestamp retry that changes none. This patch does not add credits, alter provider accounts or automatically resume paused workflows.

For a Compose deployment, use this directory as a Git build context pinned to a reviewed commit. Use the same resulting image for both server and worker, retain their original commands, environment and storage, and preserve the previous image for rollback. Do not configure an upstream pull policy that replaces the locally built overlay.

This directory does not contain deployment credentials, workspace configuration or customer records.
