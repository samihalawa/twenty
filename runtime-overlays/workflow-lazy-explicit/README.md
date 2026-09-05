# Workflow runtime repairs for Twenty

This image overlay repairs shared workflow execution in Twenty v2.32.0 while retaining the existing tool catalog, permission model and workflow engine.

Workflow AI steps load tool schemas on demand. Explicit object grants are preserved through catalog, schema and tool execution. Ordinary lazy callers and the default preloaded strategy retain their behavior.

Conditional mutations rewrite every matching qualified table alias, including both bounds of DateTime equality comparisons. SQL literals, comments, millisecond-bucket comparisons and recursive conditions are preserved.

Both agent generation calls use the resolved model's configured output-token limit. The final formatter receives the exact response schema and validates its result using pinned Ajv 8.20.0: once through the AI SDK validation callback and again before returning the workflow result. Schemas compile before model or tool execution. Invalid schemas, unresolved references and unrecognized validation keywords fail closed; values are not coerced, defaulted or silently removed. This repairs acceptance of arbitrary JSON as a successful structured result.

Large tool-result previews serialize Date values consistently with the full JSON result, including null for invalid dates. Nested provider failures retain HTTP status and safe provider error codes without copying raw response bodies into workflow errors.

For Groq GPT-OSS 20B and 120B through the OpenAI-compatible SDK, both generation paths set `include_reasoning: false` under the SDK's `groq` namespace. This prevents incompatible `reasoning_content` from entering subsequent tool requests. Unrelated providers and existing Anthropic/Bedrock options are unchanged.

The Dockerfile pins both image digests and installs only the validator's lockfile-resolved production dependencies in a build stage. Before modifying six compiled modules, it checks upstream SHA-256 hashes, validates JavaScript and runs 31 runtime regression tests plus 10 SQL alias tests. Tests cover permission propagation, output limits, schema enforcement, all ten current structured-agent schema shapes, provider options, date serialization, large tool-result previews and bounded error diagnostics. A changed upstream source stops the build for review.

These isolated tests do not prove live provider availability, production permissions, successful CRM writes or end-to-end workflow completion. Deployment still requires native read-back and task-specific verification. This patch does not add credits, change provider accounts, resume paused schedules or make a partially completed business task complete.

For Compose deployment, pin this directory's Git build context to the reviewed commit and use the same resulting image for server and worker. Retain their original commands, environment and storage, preserve the previous image for rollback, and do not let an upstream pull policy replace the built overlay.

This directory contains no deployment credentials or customer records.
