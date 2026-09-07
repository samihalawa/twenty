# Workflow runtime repairs for Twenty

This image overlay repairs shared workflow execution in Twenty v2.32.0 while retaining the existing tool catalog, permission model and workflow engine.

Workflow AI steps load tool schemas on demand. Explicit object grants are preserved through catalog, schema and tool execution. Ordinary lazy callers and the default preloaded strategy retain their behavior.

Conditional mutations rewrite every matching qualified table alias, including both bounds of DateTime equality comparisons. SQL literals, comments, millisecond-bucket comparisons and recursive conditions are preserved.

Both agent generation calls use the resolved model's configured output-token limit. The final formatter receives the exact response schema and validates its result using pinned Ajv 8.20.0: once through the AI SDK validation callback and again before returning the workflow result. Schemas compile before model or tool execution. Invalid schemas, unresolved references and unrecognized validation keywords fail closed; values are not coerced, defaulted or silently removed. This repairs acceptance of arbitrary JSON as a successful structured result.

Large tool-result previews serialize Date values consistently with the full JSON result, including null for invalid dates. Nested provider failures retain HTTP status and safe provider error codes without copying raw response bodies into workflow errors.

For Groq GPT-OSS 20B and 120B through the OpenAI-compatible SDK, both generation paths set `include_reasoning: false` under the SDK's `groq` namespace. This prevents incompatible `reasoning_content` from entering subsequent tool requests. Unrelated providers and existing Anthropic/Bedrock options are unchanged.

The Dockerfile pins both image digests and installs only the validator's lockfile-resolved production dependencies in a build stage. Before modifying twenty-four compiled modules, it checks upstream SHA-256 hashes, validates JavaScript and runs 71 runtime regression tests plus 10 SQL alias tests. Tests cover permission propagation, output limits, schema enforcement, the ten structured-agent schema shapes captured by the regression fixtures, provider options, date serialization, large tool-result previews and bounded error diagnostics. A changed upstream source stops the build for review.

These isolated tests do not prove live provider availability, production permissions, successful CRM writes or end-to-end workflow completion. Deployment still requires native read-back and task-specific verification. This patch does not add credits, change provider accounts, resume paused schedules or make a partially completed business task complete.

For Compose deployment, pin this directory's Git build context to the reviewed commit and use the same resulting image for server and worker. Retain their original commands, environment and storage, preserve the previous image for rollback, and do not let an upstream pull policy replace the built overlay.

This directory contains no deployment credentials or customer records.

The workflow-run detail query alone uses cache-and-network and a 3-second refresh while a run is pending, running or stopping. Refresh stops at the native COMPLETED, FAILED or STOPPED state; on observing a terminal run, the detail hook also refreshes active core queries once for that run so the open dashboard can show persisted changes, including partial writes from failed runs. It does not continuously poll other objects. AI tool-call log sanitization preserves Date objects so JSON persistence retains ISO timestamps; this fixes the log representation, not an alleged ORM or in-flight model data defect. Existing saved logs are not rewritten.

Both CODE and LOGIC_FUNCTION workflow actions use the existing source-aware execution service. That service builds an out-of-date function before executing it once, preserving exact workspace, function and payload bindings. A build failure stops execution instead of silently running the previous compiled source. The LOGIC_FUNCTION exposure check and CODE step logging remain intact.

Explicit workflow agents can access `app_crm_runtime_clock` and `app_linkedin_conversations` only when the administrator includes each name in that agent's `modelConfiguration.workflowReadOnlyToolNames`. Other custom logic tools and recursive/output-navigation tools remain excluded. This is a narrow configured capability, not a grant to every application function. Existing explicit CRUD permissions remain enforced.

Explicit workflow tools no longer spill inaccessible output. Results exceeding 49,152 bytes return `WORKFLOW_TOOL_OUTPUT_TOO_LARGE`, which distinguishes oversized evidence from an empty result and warns that a mutation may already have applied. Read calls can reduce selection and paginate; mutations require exact read-back before retry. Ordinary lazy callers retain their existing output contract.

Metadata execution forwards authenticated user and user-workspace identity through the source-aware executor into its existing server-minted application token. Caller payload fields cannot supply that identity. API-key and scheduled executions retain absent human identity.

Draft email results retain native provider receipts separately from the input envelope. Gmail creation retrieves that exact draft, MIME payload, and attachment bytes, returning SHA-256 and length per named attachment. A failed verification preserves the created draft ID with `readBackConfirmed: false`; it never repeats creation. Microsoft and IMAP creation receipts explicitly remain unverified. Send permissions and the default send path are unchanged; the optional exact-draft path is described below.

Native `DRAFT_EMAIL` accepts `draftOperation` (`CREATE` by default, `READ`, or `UPSERT`) and `draftId`. READ and UPSERT require an exact existing Gmail draft ID and explicit connected account. READ performs no provider writes. UPSERT updates the exact draft without a create fallback, then returns the same independent provider evidence. Missing drafts fail. Other providers reject the new operations. The SEND_EMAIL schema separately accepts `providerDraftId`; this consumes that exact Gmail draft only after parsing its fresh raw MIME and comparing sender, To/CC/BCC, subject, plain/HTML body, reply/thread and actual attachment bytes against the reviewed input. Unknown or changed drafts are not sent; no fallback message is created. Sender tests are mocked and do not constitute a live send.

Sent receipts now include independently fetched Gmail full MIME with the SENT label and downloaded attachment SHA-256 hashes. Failed read-back preserves the provider message ID and never retries sending. Draft and Sent proof share one byte-inspection helper. The explicit workflow tool allowlist additionally supports the administrator-configured read-only `app_crm_case_context` tool.
