'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = '/app/packages/twenty-server/dist';
const specs = [
  {
    "path": "modules/workflow/workflow-executor/workflow-actions/ai-agent/ai-agent.workflow-action.js",
    "sha256": "39d946e929283ec9209666b1bb189f17456511019f2a0347ecc8a3b72bb63856",
    "changes": [
      [
        "operationType: _usageoperationtypeenum.UsageOperationType.AI_WORKFLOW_TOKEN\n",
        "operationType: _usageoperationtypeenum.UsageOperationType.AI_WORKFLOW_TOKEN,\n            toolLoadingStrategy: 'lazy-workflow-explicit'\n"
      ],
      ["        return {\n            result: executionResult.result\n        };","        if (executionResult.result?.runStatus === 'BLOCKED') {\n            return { error: 'AI task blocked: ' + String(executionResult.result.reasons ?? 'No verified task result').slice(0,1000) };\n        }\n        return {\n            result: executionResult.result\n        };"]
    ]
  },
  {
    "path": "engine/metadata-modules/ai/ai-agent-execution/services/agent-async-executor.service.js",
    "sha256": "25b462859a1a7ce9c250abcc3395bb140143db8bbc41940037f35736d2e442c1",
    "changes": [
      [
        "const registeredModel = await this.aiModelRegistryService.resolveModelForAgent(agent);",
        "const registeredModel = await this.aiModelRegistryService.resolveModelForAgent(agent);\n            const configuredMaxOutputTokens = agent?.modelConfiguration?.maxOutputTokens;\n            const maxOutputTokens = Number.isInteger(configuredMaxOutputTokens) && configuredMaxOutputTokens > 0 ? configuredMaxOutputTokens : this.aiModelRegistryService.getEffectiveModelConfig(registeredModel.modelId).maxOutputTokens;"
      ],
      [
        "model: registeredModel.model,\n                messages:",
        "model: registeredModel.model,\n                maxOutputTokens,\n                messages:"
      ],
      [
        "model: registeredModel.model,\n                    prompt:",
        "model: registeredModel.model,\n                    maxOutputTokens,\n                    prompt:"
      ],
      [
        "async buildLazyRegistryTools({ agent, agentRoleId, runAsRoleId, authContext, actorContext })",
        "async buildLazyRegistryTools({ agent, agentRoleId, runAsRoleId, authContext, actorContext, requireExplicitObjectGrants = false })"
      ],
      [
        "const rolePermissionConfig = (0, _utils.isDefined)(runAsRoleId) ?",
        "const rolePermissionConfig = requireExplicitObjectGrants || (0, _utils.isDefined)(runAsRoleId) ?"
      ],
      [
        "            rolePermissionConfig,\n            authContext,",
        "            rolePermissionConfig,\n            requireExplicitObjectGrants,\n            authContext,"
      ],
      [
        "            userWorkspaceId,\n            rolePermissionConfig\n        });",
        "            userWorkspaceId,\n            rolePermissionConfig,\n            requireExplicitObjectGrants\n        });"
      ],
      [
        "if (toolLoadingStrategy === 'lazy')",
        "if (toolLoadingStrategy === 'lazy' || toolLoadingStrategy === 'lazy-workflow-explicit')"
      ],
      [
        "const lazyToolset = await this.buildLazyRegistryTools({\n                            agent,",
        "const lazyToolset = await this.buildLazyRegistryTools({\n                            requireExplicitObjectGrants: toolLoadingStrategy === 'lazy-workflow-explicit',\n                            agent,"
      ],
      [
        "const agentSchema = agent?.responseFormat?.type === 'json' ? agent.responseFormat.schema : undefined;",
        ""
      ],
      [
        "try {\n            if (agent) {",
        "try {\n            const agentSchema = agent?.responseFormat?.type === 'json' ? agent.responseFormat.schema : undefined;\n            const validateResponse = agentSchema === undefined ? undefined : require('/opt/workflow-lazy-tools/schema-validation.cjs').compileResponseSchema(agentSchema);\n            if (agent) {"
      ],
      [
        "if (agentSchema) {",
        "const directResponse = textResponse.nativeExecutionError ? {value:{runStatus:'BLOCKED',reasons:textResponse.nativeExecutionError}} : validateResponse ? require('/opt/workflow-lazy-tools/schema-validation.cjs').parseValidatedResponse(textResponse.text, validateResponse) : undefined;\n            if (directResponse !== undefined) result = directResponse.value;\n            if (validateResponse && directResponse === undefined) {"
      ],
      [
        "system: `${baseSystemPrompt}\\n\\n${agent ? (0, _utils.tipTapDocumentToMarkdown)(agent.prompt) : ''}${toolCatalogSection}`,",
        "system: `${baseSystemPrompt}\\n\\n${agent ? (0, _utils.tipTapDocumentToMarkdown)(agent.prompt) : ''}${toolCatalogSection}` + (agentSchema ? '\\nAfter completing the task and any necessary tools, return only a complete JSON value conforming exactly to this schema. Do not omit required fields, use alternative keys, or invent missing facts.\\n' + JSON.stringify(agentSchema) : ''),"
      ],
      [
        "system: _structuredoutputsystempromptconst.STRUCTURED_OUTPUT_SYSTEM_PROMPT,",
        "system: _structuredoutputsystempromptconst.STRUCTURED_OUTPUT_SYSTEM_PROMPT + '\\nReturn JSON conforming exactly to this JSON Schema. Use its field names, required fields, and types; do not invent a different response structure.\\n' + JSON.stringify(agentSchema),"
      ],
      [
        "schema: (0, _ai.jsonSchema)(agentSchema)",
        "schema: (0, _ai.jsonSchema)(agentSchema, { validate: validateResponse })"
      ],
      [
        "providerOptions: undefined,\n                        promptCacheKey: agent?.id",
        "providerOptions: this.aiModelConfigService.getReasoningProviderOptions(registeredModel),\n                        promptCacheKey: agent?.id"
      ],
      [
        "result = structuredResult.output;",
        "const checkedResponse = validateResponse(structuredResult.output);\n                if (!checkedResponse.success) throw checkedResponse.error;\n                result = checkedResponse.value;"
      ],
      [
        "error instanceof Error ? error.message : 'Agent execution failed'",
        "require('/opt/workflow-lazy-tools/schema-validation.cjs').describeExecutionError(error)"
      ],
      [
        "                tools,\n                model: registeredModel.model,",
        "                tools,\n                output: agentSchema ? _ai.Output.object({ schema: (0, _ai.jsonSchema)(agentSchema, { validate: validateResponse }) }) : undefined,\n                model: registeredModel.model,"
      ],
      ["            const textResponse = await (0, _ai.generateText)({","            const completedTaskSteps = [];\n            const textResponse = await (0, _ai.generateText)({"],
      ["                onStepFinish: async (step)=>{\n                    const { hasNoMoreAvailableCredits: stepHasNoMoreAvailableCredits }","                onStepFinish: async (step)=>{\n                    completedTaskSteps.push(step);\n                    const { hasNoMoreAvailableCredits: stepHasNoMoreAvailableCredits }"],
      ["            });\n            accumulatedUsage = textResponse.usage;","            }).catch(error => {\n                if (error?.usage) accumulatedUsage = error.usage;\n                return require('/opt/workflow-lazy-tools/schema-validation.cjs').recoverStructuredParse(error, validateResponse, _ai.NoObjectGeneratedError?.isInstance(error) === true, completedTaskSteps);\n            });\n            accumulatedUsage = textResponse.usage;"],
      [
        "            accumulatedUsage = textResponse.usage;",
        "            if (textResponse.finishReason === 'length') throw new Error('Agent output budget exhausted before a complete final response');\n            if (typeof textResponse.text !== 'string' || !textResponse.text.trim()) throw new Error('Agent produced no final response (finish=' + textResponse.finishReason + ', steps=' + (textResponse.steps?.length ?? 0) + ', toolCalls=' + (textResponse.toolCalls?.length ?? 0) + ', creditsExhausted=' + hasNoMoreAvailableCredits + ')');\n            accumulatedUsage = textResponse.usage;"
      ]
    ]
  },
  {
    "path": "engine/core-modules/tool-provider/services/tool-registry.service.js",
    "sha256": "4a246dc1e42ef17bd96fb79531738c26fb7558024de5c5d8d0ff6b47bb5adff3",
    "changes": [
      [
        "rolePermissionConfig: options?.rolePermissionConfig,\n",
        "rolePermissionConfig: options?.rolePermissionConfig,\n            requireExplicitObjectGrants: options?.requireExplicitObjectGrants,\n"
      ],
      [
        "            rolePermissionConfig,\n            authContext: context.authContext,",
        "            rolePermissionConfig,\n            requireExplicitObjectGrants: context.requireExplicitObjectGrants,\n            authContext: context.authContext,"
      ]
    ]
  },
  {
    "path": "engine/twenty-orm/utils/apply-table-alias-on-where-condition.js",
    "sha256": "de3fdfc9e949f4d464f0df4f0cfe35e46901aa5f3f2098eec5be47374d2361a5",
    "changes": [
      [
        "        const conditionParts = condition.split('.');\n        if (conditionParts.length === 1) {\n            return condition;\n        }\n        const [tableNamePart, ...rest] = conditionParts;\n        return `${tableNamePart.replace(aliasName, tableName)}.${rest.join('.')}`;",
        "        // Rewrite every qualified alias, without touching SQL literals or comments.\n        const quotedAlias = '\"' + aliasName.replace(/\"/g, '\"\"') + '\"';\n        const quotedTable = '\"' + tableName.replace(/\"/g, '\"\"') + '\"';\n        const tokens = /'(?:''|[^'])*'|--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|(\\$(?:[A-Za-z_][A-Za-z0-9_]*)?\\$)[\\s\\S]*?\\1|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z0-9_$]*/g;\n        return condition.replace(tokens, (token, dollarTag, offset) => {\n            if (!/^\\s*\\./.test(condition.slice(offset + token.length))) return token;\n            if (token === quotedAlias) return quotedTable;\n            if (token === aliasName) return tableName;\n            return token;\n        });"
      ]
    ]
  },
  {
    "path": "engine/metadata-modules/ai/ai-models/services/ai-model-config.service.js",
    "sha256": "2df3355b645603acff30f4735c52ddac8651cdd7281efecf695f9a1568719fa0",
    "changes": [
      [
        "getReasoningProviderOptions(model) {",
        "getReasoningProviderOptions(model) {\n        // Keep paid OpenRouter GPT-OSS tool rounds within a modest output budget.\n        if (model.sdkPackage === '@ai-sdk/openai-compatible' &&\n            model.model?.provider === 'openrouter.chat' &&\n            /^openai\\/gpt-oss-(20b|120b)$/.test(model.model?.modelId ?? '')) {\n            return { openaiCompatible: { reasoningEffort: 'low' }, openrouter: { provider: { only: ['CoreWeave', 'DeepInfra'], order: ['CoreWeave', 'DeepInfra'], require_parameters: true, max_price: { prompt: 0.05, completion: 0.20 } } } };\n        }\n        // Groq GPT-OSS rejects reasoning_content in subsequent tool rounds.\n        // The compatible SDK otherwise serializes returned reasoning into that field.\n        if (model.sdkPackage === '@ai-sdk/openai-compatible' &&\n            model.modelsDevName === 'groq' &&\n            model.model?.provider === 'groq.chat' &&\n            /^openai\\/gpt-oss-(20b|120b)$/.test(model.model?.modelId ?? '')) {\n            return { groq: { include_reasoning: false } };\n        }"
      ]
    ]
  },
  {
    "path": "engine/core-modules/tool/utils/json-preview.util.js",
    "sha256": "2ea4ac20d07c238e7693ad0deed543d26746d022bcfb63ce0d3b48a7da5ab1f9",
    "changes": [
      [
        "const buildPreview = (value, maxDepth, depth)=>{",
        "const buildPreview = (value, maxDepth, depth)=>{\n    // Match JSON serialization for both valid and invalid Date instances.\n    if ((0, _guards.isDate)(value)) {\n        return value.toJSON();\n    }"
      ]
    ]
  },
{
  "path": "engine/core-modules/tool-provider/utils/build-tool-catalog-section.util.js",
  "sha256": "3bd38c3f617ef51b78017d710fbf4602f467b97ee6d50ec5ca3b8d7f8a4c9e9b",
  "changes": [
    [
      "const buildDatabaseCrudCatalogSection = (tools, preloadedSet, categoryLabel)=>{\n    const operationOrder = [];\n    const seenOps = new Set();\n    const objectToolsMap = new Map();\n    const standaloneTools = [];\n    for (const tool of tools){\n        if (tool.objectName && tool.operation) {\n            const ops = objectToolsMap.get(tool.objectName) ?? [];\n            ops.push(tool.operation);\n            objectToolsMap.set(tool.objectName, ops);\n            if (!seenOps.has(tool.operation)) {\n                seenOps.add(tool.operation);\n                operationOrder.push(tool.operation);\n            }\n        } else {\n            standaloneTools.push(tool);\n        }\n    }\n    const lines = [\n        `\\n#### ${categoryLabel} (${tools.length} tools)`\n    ];\n    if (objectToolsMap.size > 0) {\n        const objectNames = [\n            ...objectToolsMap.keys()\n        ].sort();\n        lines.push(`Operations per object:`);\n        lines.push(...operationOrder.map((op)=>`- \\`${op}_{object}\\``));\n        lines.push(`\\nObjects (${objectNames.length}):`);\n        lines.push(...objectNames.map((name)=>`- \\`${name}\\``));\n        const findManyExample = tools.find((t)=>t.operation === 'find_many');\n        const findOneExample = tools.find((t)=>t.operation === 'find_one' && t.objectName === findManyExample?.objectName);\n        const examplePart = findManyExample && findOneExample ? ` e.g. \\`${findManyExample.name}\\` / \\`${findOneExample.name}\\`` : '';\n        lines.push(`\\nTool name = operation + object name. *_many_* operations use the plural form, *_one_* use the singular form.${examplePart}`);\n    }\n    for (const tool of standaloneTools){\n        const status = preloadedSet.has(tool.name) ? ' ✓' : '';\n        lines.push(`- \\`${tool.name}\\`${status}`);\n    }\n    return lines.join('\\n');\n};\n",
      "const buildDatabaseCrudCatalogSection = (tools, preloadedSet, categoryLabel)=>{\n    const lines = ['\\n#### ' + categoryLabel + ' (' + tools.length + ' tools)'];\n    lines.push('Exact permitted tool names (copy these verbatim; do not infer singular/plural forms or other operations):');\n    for (const tool of tools) {\n        lines.push('- `' + tool.name + '`' + (preloadedSet.has(tool.name) ? ' ✓' : ''));\n    }\n    return lines.join('\\n');\n};\n"
    ]
  ]
},
{
  "path": "engine/metadata-modules/ai/ai-models/services/sdk-provider-factory.service.js",
  "sha256": "6051c945228a9089abaa31579555364141a0561d2e4cd7eb3f6d4ff8257e538f",
  "changes": [
    [
      "name: config.name ?? 'openai-compatible',\n            baseURL: config.baseUrl,",
      "name: config.name ?? 'openai-compatible',\n            baseURL: config.baseUrl,\n            // OpenRouter supports schema-constrained response_format; other compatible providers keep their existing default.\n            supportsStructuredOutputs: /^https:\\/\\/openrouter\\.ai\\/api\\/v1\\/?$/.test(config.baseUrl),"
    ]
  ]
},
{
  "path": "engine/metadata-modules/ai/ai-agent-execution/utils/map-ai-steps-to-tool-call-logs.util.js",
  "sha256": "8427c2d5e647e3bb2adbd96b5296743178ba8d3e7da5dc6b55366cad4dff3dfd",
  "changes": [
    [
      "const stripNoisyKeysDeep = (value)=>{",
      "const stripNoisyKeysDeep = (value)=>{\n    if (value instanceof Date) return value;"
    ],
    ["entry.state = 'success';", "const nativeOutcome = require('/opt/workflow-lazy-tools/workflow-continuation.cjs').nativeOutput(part.output);\n                    entry.state = nativeOutcome.ok ? 'success' : 'error';\n                    if (entry.state === 'error') entry.errorMessage = String(nativeOutcome.error ?? part.output.message ?? 'Native tool returned an unsuccessful operation').slice(0, MAX_ERROR_MESSAGE_LENGTH);"]
  ]
},
{
  "path": "front/assets/useFindOneRecord-Cg_N4T_t.js",
  "sha256": "ceb4b9360e1292817da8f015a198d2175ac4656770db5f76b9fef5d30dc7ee95",
  "format": "esm",
  "changes": [
    [
      "})=>{const{objectMetadataItem:o}=i({objectNameSingular:e}),",
      "})=>{const runStatusRef=(0,m.useRef)(null),refreshedRunRef=(0,m.useRef)(null);const{objectMetadataItem:o}=i({objectNameSingular:e}),"
    ],
    [
      "variables:{objectRecordId:r},client:n});return{record:",
      "variables:{objectRecordId:r},client:n,...(e===\"workflowRun\"?{fetchPolicy:\"cache-and-network\",pollInterval:3000,skipPollAttempt:()=>[\"COMPLETED\",\"FAILED\",\"STOPPED\"].includes(runStatusRef.current)}:{})});runStatusRef.current=d?.[e]?.status??null;(0,m.useEffect)(()=>{if(e!==\"workflowRun\"||!r||t||!f||d?.[e]?.id!==r||![\"COMPLETED\",\"FAILED\",\"STOPPED\"].includes(runStatusRef.current)||refreshedRunRef.current===r)return;refreshedRunRef.current=r;Promise.resolve(n.refetchQueries({include:\"active\"})).catch(()=>{});},[e,r,t,f,d?.[e]?.status,n]);return{record:"
    ]
  ]
},
{
  "path": "modules/workflow/workflow-executor/workflow-actions/logic-function/logic-function.workflow-action.js",
  "sha256": "1b9d6f76103a54ba85d9d8040f04b5e607506dc1f0115de3306bba4540193b94",
  "changes": [
    [
      "const _logicfunctionexecutorservice = require(\"../../../../../engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service\");",
      "const _logicfunctionexecutorservice = require(\"../../../../../engine/metadata-modules/logic-function/services/logic-function-from-source.service\");"
    ],
    [
      "this.logicFunctionExecutorService.execute({\n            logicFunctionId:",
      "this.logicFunctionExecutorService.executeOneFromSource({\n            id:"
    ],
    [
      "typeof _logicfunctionexecutorservice.LogicFunctionExecutorService === \"undefined\" ? Object : _logicfunctionexecutorservice.LogicFunctionExecutorService",
      "typeof _logicfunctionexecutorservice.LogicFunctionFromSourceService === \"undefined\" ? Object : _logicfunctionexecutorservice.LogicFunctionFromSourceService"
    ]
  ]
},
{
  "path": "modules/workflow/workflow-executor/workflow-actions/code/code.workflow-action.js",
  "sha256": "124a1157c19c8b33e89efefef21188f7de3d0386c8e18baa472483aeb0de6a13",
  "changes": [
    [
      "const _logicfunctionexecutorservice = require(\"../../../../../engine/core-modules/logic-function/logic-function-executor/logic-function-executor.service\");",
      "const _logicfunctionexecutorservice = require(\"../../../../../engine/metadata-modules/logic-function/services/logic-function-from-source.service\");"
    ],
    [
      "this.logicFunctionExecutorService.execute({\n            logicFunctionId:",
      "this.logicFunctionExecutorService.executeOneFromSource({\n            id:"
    ],
    [
      "typeof _logicfunctionexecutorservice.LogicFunctionExecutorService === \"undefined\" ? Object : _logicfunctionexecutorservice.LogicFunctionExecutorService",
      "typeof _logicfunctionexecutorservice.LogicFunctionFromSourceService === \"undefined\" ? Object : _logicfunctionexecutorservice.LogicFunctionFromSourceService"
    ]
  ]
},
{
  "path": "modules/workflow/workflow-executor/workflow-actions/logic-function/logic-function-action.module.js",
  "sha256": "1202bb69da8acff319bd3c98e97dd2200f125337d613da10dc1160c5ae9f6626",
  "changes": [
    [
      "const _common = require(\"@nestjs/common\");",
      "const _common = require(\"@nestjs/common\");\nconst _sourceFunctionModule = require(\"../../../../../engine/metadata-modules/logic-function/logic-function.module\");"
    ],
    [
      "imports: [\n            _workspacemanyorallflatentitymapscachemodule.",
      "imports: [\n            _sourceFunctionModule.LogicFunctionModule,\n            _workspacemanyorallflatentitymapscachemodule."
    ]
  ]
},
{
  "path": "modules/workflow/workflow-executor/workflow-actions/code/code-action.module.js",
  "sha256": "543bb98b6f035e911131ddad882a8d1ec8546aed234146b64dd3a9d51ccaa7fb",
  "changes": [
    [
      "../../../../../engine/core-modules/logic-function/logic-function.module",
      "../../../../../engine/metadata-modules/logic-function/logic-function.module"
    ]
  ]
}
];

// Additional repairs for explicit native workflow tools; ordinary lazy callers stay unchanged.
specs[1].changes.push(...[
  [
    "const catalog = fullCatalog.filter((entry)=>allowedCategories.has(entry.category) && !excludedToolNames.has(entry.name));",
    "const configuredReadTools = new Set(Array.isArray(agent.modelConfiguration?.workflowReadOnlyToolNames) ? agent.modelConfiguration.workflowReadOnlyToolNames : []);\n        const safeReadTools = new Set(['app_linkedin_conversations', 'app_crm_runtime_clock', 'app_crm_case_context']);\n        const catalog = fullCatalog.filter((entry)=>(allowedCategories.has(entry.category) || (requireExplicitObjectGrants && configuredReadTools.has(entry.name) && safeReadTools.has(entry.name))) && !excludedToolNames.has(entry.name));"
  ],
  [
    "spillLargeOutput: true\n            }),",
    "spillLargeOutput: !requireExplicitObjectGrants\n            }),"
  ],
  [
    "compactOutput: true,\n                spillLargeOutput: true",
    "compactOutput: true,\n                spillLargeOutput: !requireExplicitObjectGrants"
  ],
  [
    "        return {\n            tools,\n            catalogSection:",
    "        // Workflow agents cannot navigate stored output blobs. Give an explicit,\n        // bounded failure instead of an incomplete preview that looks like evidence.\n        if (requireExplicitObjectGrants) {\n            for (const [name, tool] of Object.entries(tools)) {\n                const execute = tool.execute;\n                tool.execute = async (...args) => {\n                    const output = await execute(...args);\n                    const serialized = JSON.stringify(output);\n                    if (serialized !== undefined && Buffer.byteLength(serialized, 'utf8') > 49152) {\n                        return {\n                            success: false,\n                            errorCode: 'WORKFLOW_TOOL_OUTPUT_TOO_LARGE',\n                            operationMayHaveApplied: name === _tools.EXECUTE_TOOL_TOOL_NAME,\n                            error: 'The tool completed but its full output exceeds 49152 bytes. This is not an empty result and no partial evidence is supplied. For reads, select fewer fields and paginate with a smaller limit; read an exact record separately. For learn_tools, request one tool and one aspect at a time. A mutation may already have applied: independently read back the exact record before considering any retry.'\n                        };\n                    }\n                    return output;\n                };\n            }\n        }\n        return {\n            tools,\n            catalogSection:"
  ]
]);

// Preserve server-authenticated user identity through the existing application-token contract.
specs.push(...[
  {
    "path": "engine/metadata-modules/logic-function/logic-function.resolver.js",
    "sha256": "0836020c11dabf37d249fe1bd30288f900824514a51271cb72fd9005f14dda7e",
    "changes": [
      [
        "async executeOneLogicFunction({ id, payload }, { id: workspaceId }) {",
        "async executeOneLogicFunction({ id, payload }, { id: workspaceId }, user, userWorkspaceId) {"
      ],
      [
        "                id,\n                payload,\n                workspaceId\n            });",
        "                id,\n                payload,\n                workspaceId,\n                userId: user?.id,\n                userWorkspaceId: user?.id ? userWorkspaceId : undefined\n            });"
      ],
      [
        "    (0, _graphql.Mutation)(()=>_logicfunctionexecutionresultdto.LogicFunctionExecutionResultDTO),",
        "    _ts_param(2, require('../../decorators/auth/auth-user.decorator').AuthUser({allowUndefined: true})),\n    _ts_param(3, require('../../decorators/auth/auth-user-workspace-id.decorator').AuthUserWorkspaceId({allowUndefined: true})),\n    (0, _graphql.Mutation)(()=>_logicfunctionexecutionresultdto.LogicFunctionExecutionResultDTO),"
      ]
    ]
  },
  {
    "path": "engine/metadata-modules/logic-function/services/logic-function-from-source.service.js",
    "sha256": "16f3e824f85211dd0b0f02419d87ef05a8ed528e6c7c51e9c0c27f2205f1a817",
    "changes": [
      [
        "async executeOneFromSource({ id, payload, workspaceId }) {",
        "async executeOneFromSource({ id, payload, workspaceId, userId, userWorkspaceId }) {"
      ],
      [
        "            payload,\n            executionMode: _logicfunctionentity.LogicFunctionExecutionMode.LIVE",
        "            payload,\n            userId,\n            userWorkspaceId,\n            executionMode: _logicfunctionentity.LogicFunctionExecutionMode.LIVE"
      ]
    ]
  }
]);

// Preserve native provider receipts; Gmail evidence is independently retrieved by exact ID.
specs.push(...[
  {
    "path": "engine/core-modules/tool/tools/email-tool/draft-email-tool.js",
    "sha256": "fd35326a6a15ea692595c772164e97b79dc577fcf3da5e5ac5f5b4fe500d1874",
    "changes": [
      [
        "            await this.createDraft(data);",
        "            const nativeDraft = await this.createDraft(data);"
      ],
      [
        "                    attachmentCount: data.attachments.length",
        "                    attachmentCount: data.attachments.length,\n                    nativeDraft: nativeDraft ?? {readBackConfirmed: false, error: 'Provider returned no native draft receipt'}"
      ],
      [
        "        await this.messageOutboundService.createDraft({",
        "        return this.messageOutboundService.createDraft({"
      ]
    ]
  },
  {
    "path": "modules/messaging/message-outbound-manager/drivers/gmail/services/gmail-message-outbound.service.js",
    "sha256": "86d19a31ae4a12fdffc7c43966a421123a4265547580cc061637b27e85e43c9b",
    "changes": [
      [
        "        await gmailClient.users.drafts.create({\n            userId: 'me',\n            requestBody: {\n                message: {\n                    raw: encodedMessage,\n                    ...(0, _guards.isNonEmptyString)(sendMessageInput.threadExternalId) ? {\n                        threadId: sendMessageInput.threadExternalId\n                    } : {}\n                }\n            }\n        });",
        "        const created = await gmailClient.users.drafts.create({\n            userId: 'me',\n            requestBody: {\n                message: {\n                    raw: encodedMessage,\n                    ...(0, _guards.isNonEmptyString)(sendMessageInput.threadExternalId) ? {\n                        threadId: sendMessageInput.threadExternalId\n                    } : {}\n                }\n            }\n        });\n        const receipt = {provider: 'GOOGLE', draftId: created.data?.id ?? null, messageId: created.data?.message?.id ?? null, threadId: created.data?.message?.threadId ?? null, readBackConfirmed: false};\n        if (!receipt.draftId) return {...receipt, error: 'Provider draft creation returned no draft ID; reconcile before retrying'};\n        try {\n            const fetched = await gmailClient.users.drafts.get({userId: 'me', id: receipt.draftId, format: 'full'});\n            if (fetched.data?.id !== receipt.draftId || !fetched.data?.message?.id || (receipt.messageId && fetched.data.message.id !== receipt.messageId)) throw new Error('Provider draft identity changed during read-back');\n            const nativeMessage = fetched.data.message;\n            if (!nativeMessage.payload) throw new Error('Provider draft MIME payload missing during read-back');\n            const attachmentManifest = [];\n            const visit = async (part) => {\n                if (part.filename) {\n                    let data = part.body?.data;\n                    if (part.body?.attachmentId) {\n                        const downloaded = await gmailClient.users.messages.attachments.get({userId: 'me', messageId: nativeMessage.id, id: part.body.attachmentId});\n                        data = downloaded.data?.data;\n                    }\n                    if (typeof data !== 'string') throw new Error('Provider attachment bytes missing during read-back');\n                    const bytes = Buffer.from(data, 'base64url');\n                    attachmentManifest.push({filename: part.filename, mimeType: part.mimeType, size: bytes.length, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'), attachmentId: part.body?.attachmentId ?? null});\n                }\n                for (const child of part.parts ?? []) await visit(child);\n            };\n            if (nativeMessage.payload) await visit(nativeMessage.payload);\n            return {...receipt, messageId: nativeMessage.id, threadId: nativeMessage.threadId ?? null, readBackConfirmed: true, nativeMessage, attachmentManifest};\n        } catch (error) {\n            return {...receipt, error: error instanceof Error ? error.message : 'Draft read-back failed; reconcile exact draft before retrying'};\n        }"
      ]
    ]
  },
  {
    "path": "modules/messaging/message-outbound-manager/drivers/microsoft/services/microsoft-message-outbound.service.js",
    "sha256": "82cc916cedfdc1857ed7e57aa777f7b6ef332e456362bb7d03cb6daa8f3dfb47",
    "changes": [
      [
        "        await this.createDraftMessage(microsoftClient, sendMessageInput);",
        "        const created = await this.createDraftMessage(microsoftClient, sendMessageInput);\n        return {provider: 'MICROSOFT', draftId: created.id, messageId: created.id, threadId: created.conversationId, internetMessageId: created.internetMessageId, readBackConfirmed: false};"
      ]
    ]
  },
  {
    "path": "modules/messaging/message-outbound-manager/drivers/imap/services/imap-smtp-message-outbound.service.js",
    "sha256": "ab658482c9686fa0507b1061b87f1ca08c79bb2acfb36b4be373147535883df3",
    "changes": [
      [
        "            await imapClient.append(draftsFolder.path, messageBuffer, [\n                DRAFT_FLAG\n            ]);",
        "            const created = await imapClient.append(draftsFolder.path, messageBuffer, [\n                DRAFT_FLAG\n            ]);\n            return {provider: 'IMAP_SMTP_CALDAV', folder: draftsFolder.path, uid: created?.uid == null ? null : String(created.uid), uidValidity: created?.uidValidity == null ? null : String(created.uidValidity), readBackConfirmed: false};"
      ]
    ]
  }
]);

// Existing native draft operation supports exact-ID read and update without a create fallback.
specs.find(x=>x.path.endsWith('/draft-email-tool.js')).changes.push(...[
  [
    "        try {\n            const result = await this.emailComposerService.composeEmail(parameters, context);",
    "        try {\n            const draftOperation = parameters.draftOperation ?? 'CREATE';\n            if (!['CREATE', 'READ', 'UPSERT'].includes(draftOperation)) throw new Error('Unsupported draft operation');\n            if (draftOperation !== 'CREATE' && (!parameters.draftId || !parameters.connectedAccountId)) throw new Error('Exact draftId and connectedAccountId are required');\n            if (draftOperation === 'CREATE' && parameters.draftId) throw new Error('Use UPSERT to revise an existing draft');\n            if (draftOperation === 'READ') {\n                const connectedAccount = await this.emailComposerService.getConnectedAccountOrThrow({connectedAccountId: parameters.connectedAccountId, workspaceId: context.workspaceId});\n                if (connectedAccount.provider !== 'GOOGLE') throw new Error('Draft READ is supported only for GOOGLE');\n                const nativeDraft = await this.messageOutboundService.createDraft({draftOperation, draftId: parameters.draftId}, connectedAccount);\n                return {success: nativeDraft.readBackConfirmed === true, message: nativeDraft.readBackConfirmed ? 'Exact provider draft read back' : 'Provider draft read-back failed', result: {connectedAccountId: connectedAccount.id, nativeDraft}};\n            }\n            const result = await this.emailComposerService.composeEmail(parameters, context);"
  ],
  [
    "            const { data } = result;",
    "            const { data } = result;\n            if (draftOperation === 'UPSERT' && data.connectedAccount.provider !== 'GOOGLE') throw new Error('Draft UPSERT is supported only for GOOGLE');\n            data.draftOperation = draftOperation;\n            data.draftId = parameters.draftId;"
  ],
  [
    "        return this.messageOutboundService.createDraft({",
    "        return this.messageOutboundService.createDraft({\n            draftOperation: data.draftOperation,\n            draftId: data.draftId,"
  ],
  [
    "        this.inputSchema = _emailtoolschema.EmailToolInputZodSchema;",
    "        this.inputSchema = _emailtoolschema.EmailToolInputZodSchema.extend({\n            draftId: require('zod').z.string().min(1).optional(),\n            draftOperation: require('zod').z.enum(['CREATE', 'READ', 'UPSERT']).optional()\n        });"
  ]
]);
specs.find(x=>x.path.endsWith('gmail-message-outbound.service.js')).changes.push(...[
  [
    "    async createDraft(sendMessageInput, connectedAccount) {\n        const { gmailClient, encodedMessage }",
    "    async createDraft(sendMessageInput, connectedAccount) {\n        const operation = sendMessageInput.draftOperation ?? 'CREATE';\n        if (!['CREATE', 'READ', 'UPSERT'].includes(operation)) throw new Error('Unsupported draft operation');\n        if (operation !== 'CREATE' && !sendMessageInput.draftId) throw new Error('Exact draftId is required');\n        if (operation === 'CREATE' && sendMessageInput.draftId) throw new Error('Use UPSERT to revise an existing draft');\n        if (operation === 'READ') {\n            const auth = await this.googleOAuth2ClientProvider.getClient(connectedAccount.id);\n            const gmailClient = _googleapis.google.gmail({version: 'v1', auth});\n            return this.readDraftEvidence(gmailClient, {provider: 'GOOGLE', draftId: sendMessageInput.draftId, readBackConfirmed: false});\n        }\n        const { gmailClient, encodedMessage }"
  ],
  [
    "        const created = await gmailClient.users.drafts.create({",
    "        if (operation === 'UPSERT') {\n            const exact = await gmailClient.users.drafts.get({userId: 'me', id: sendMessageInput.draftId, format: 'minimal'});\n            if (exact.data?.id !== sendMessageInput.draftId) throw new Error('Exact provider draft not found');\n            const receipt = {provider: 'GOOGLE', draftId: sendMessageInput.draftId, messageId: null, readBackConfirmed: false};\n            try {\n                const updated = await gmailClient.users.drafts.update({userId: 'me', id: sendMessageInput.draftId, requestBody: {id: sendMessageInput.draftId, message: {raw: encodedMessage, ...(sendMessageInput.threadExternalId ? {threadId: sendMessageInput.threadExternalId} : {})}}});\n                return this.readDraftEvidence(gmailClient, {...receipt, messageId: updated.data?.message?.id ?? null});\n            } catch (error) {\n                return {...receipt, operationMayHaveApplied: true, error: error instanceof Error ? error.message : 'Draft update uncertain; read exact draft before retry'};\n            }\n        }\n        const created = await gmailClient.users.drafts.create({"
  ],
  [
    "        try {\n            const fetched = await gmailClient.users.drafts.get({userId: 'me', id: receipt.draftId, format: 'full'});",
    "        return this.readDraftEvidence(gmailClient, receipt);\n    }\n    async readDraftEvidence(gmailClient, receipt) {\n        try {\n            const fetched = await gmailClient.users.drafts.get({userId: 'me', id: receipt.draftId, format: 'full'});"
  ]
]);
specs.push(...[
  {
    "path": "../../twenty-shared/dist/workflow.cjs",
    "sha256": "37f83de363abbe93dc8c20ccb43c3961a75e10bd422447ca315892680c6f3497",
    "changes": [
      [
        "Te=m.extend({type:o.z.literal(`DRAFT_EMAIL`),settings:x})",
        "Te=m.extend({type:o.z.literal(`DRAFT_EMAIL`),settings:x.extend({input:x.shape.input.extend({draftId:o.z.string().optional(),draftOperation:o.z.union([o.z.enum([`CREATE`,`READ`,`UPSERT`]),b]).optional()})})})"
      ]
    ]
  },
  {
    "path": "../../twenty-shared/dist/workflow.mjs",
    "sha256": "2c6b2b61d7f89292bff4d7bc5d3ee15c0107e32234299191081578ba26ee5de3",
    "format": "esm",
    "changes": [
      [
        "type: d.literal(\"DRAFT_EMAIL\"),\n\tsettings: w",
        "type: d.literal(\"DRAFT_EMAIL\"),\n\tsettings: w.extend({input: w.shape.input.extend({draftId: d.string().optional(), draftOperation: d.union([d.enum([\"CREATE\", \"READ\", \"UPSERT\"]), d.string().regex(/^{{[^{}]+}}$/)]).optional()})})"
      ]
    ]
  }
]);

// Consume the exact reviewed Gmail draft through the existing sender transport.
specs.push(...[
  {
    "path": "engine/core-modules/tool/tools/email-tool/send-email-tool.js",
    "sha256": "9ab2154ea472c13e907f99aa7f9b3d7192892c23566485127b61258521b6f29c",
    "changes": [
      [
        "            const { data } = result;",
        "            const { data } = result;\n            if (parameters.providerDraftId && data.connectedAccount.provider !== 'GOOGLE') throw new Error('Sending exact provider draft is supported only for GOOGLE');\n            data.providerDraftId = parameters.providerDraftId;"
      ],
      [
        "                    headerMessageId: sendResult.headerMessageId,",
        "                    headerMessageId: sendResult.headerMessageId,\n                    messageExternalId: sendResult.messageExternalId,"
      ],
      [
        "        this.inputSchema = _emailtoolschema.EmailToolInputZodSchema;",
        "        this.inputSchema = _emailtoolschema.EmailToolInputZodSchema.extend({providerDraftId: require('zod').z.string().min(1).optional()});"
      ]
    ]
  },
  {
    "path": "modules/messaging/message-outbound-manager/services/send-email.service.js",
    "sha256": "1bf441dbdad84a8aff384f2dd8452edab7012eef35de4853e3c8e195122bac97",
    "changes": [
      [
        "    toSendMessageInput(data) {\n        return {",
        "    toSendMessageInput(data) {\n        return {\n            providerDraftId: data.providerDraftId,"
      ]
    ]
  }
]);
specs.find(x=>x.path.endsWith('gmail-message-outbound.service.js')).changes.push(...[["    async sendMessage(sendMessageInput, connectedAccount) {", "    async sendMessage(sendMessageInput, connectedAccount) {\n        if (sendMessageInput.providerDraftId) {\n            const auth = await this.googleOAuth2ClientProvider.getClient(connectedAccount.id);\n            const gmailClient = _googleapis.google.gmail({version: 'v1', auth});\n            const exact = await gmailClient.users.drafts.get({userId: 'me', id: sendMessageInput.providerDraftId, format: 'full'});\n            if (exact.data?.id !== sendMessageInput.providerDraftId || !exact.data?.message?.id) throw new Error('Exact provider draft not found; no message sent');\n            const headerMessageId = exact.data.message.payload?.headers?.find(h=>h.name?.toLowerCase() === 'message-id')?.value;\n            const sent = await gmailClient.users.drafts.send({userId: 'me', requestBody: {id: sendMessageInput.providerDraftId}});\n            return {headerMessageId, messageExternalId: sent.data?.id, threadExternalId: sent.data?.threadId};\n        }"]]);
specs.find(x=>x.path.endsWith('workflow.cjs')).changes.push(...[["Ie=m.extend({type:o.z.literal(`SEND_EMAIL`),settings:x})", "Ie=m.extend({type:o.z.literal(`SEND_EMAIL`),settings:x.extend({input:x.shape.input.extend({providerDraftId:o.z.string().optional()})})})"]]);
specs.find(x=>x.path.endsWith('workflow.mjs')).changes.push(...[["type: d.literal(\"SEND_EMAIL\"),\n\tsettings: w", "type: d.literal(\"SEND_EMAIL\"),\n\tsettings: w.extend({input: w.shape.input.extend({providerDraftId: d.string().optional()})})"]]);

// Re-read and compare the provider revision immediately before the one send attempt.
specs.find(x=>x.path.endsWith('gmail-message-outbound.service.js')).changes.push(...[["            const exact = await gmailClient.users.drafts.get({userId: 'me', id: sendMessageInput.providerDraftId, format: 'full'});\n            if (exact.data?.id !== sendMessageInput.providerDraftId || !exact.data?.message?.id) throw new Error('Exact provider draft not found; no message sent');\n            const headerMessageId = exact.data.message.payload?.headers?.find(h=>h.name?.toLowerCase() === 'message-id')?.value;", "            const exact = await gmailClient.users.drafts.get({userId: 'me', id: sendMessageInput.providerDraftId, format: 'raw'});\n            if (exact.data?.id !== sendMessageInput.providerDraftId || !exact.data?.message?.id || !exact.data?.message?.raw) throw new Error('Exact provider draft not found; no message sent');\n            const parsed = await require('postal-mime').parse(Buffer.from(exact.data.message.raw, 'base64url'));\n            const normalizeText = value => String(value ?? '').replace(/\\r\\n/g, '\\n').replace(/\\n+$/, '');\n            const addresses = values => (values ?? []).map(value => String(typeof value === 'string' ? value : value.address ?? '').trim().toLowerCase()).sort();\n            const digest = bytes => require('node:crypto').createHash('sha256').update(Buffer.from(bytes)).digest('hex');\n            const expectedAttachments = (sendMessageInput.attachments ?? []).map(a=>({filename:a.filename,mimeType:a.contentType,sha256:digest(a.content)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));\n            const actualAttachments = (parsed.attachments ?? []).map(a=>({filename:a.filename,mimeType:a.mimeType,sha256:digest(a.content)})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));\n            const matches = parsed.from?.address?.toLowerCase() === connectedAccount.handle?.toLowerCase()\n                && JSON.stringify(addresses(parsed.to)) === JSON.stringify(addresses(sendMessageInput.to))\n                && JSON.stringify(addresses(parsed.cc)) === JSON.stringify(addresses(sendMessageInput.cc))\n                && JSON.stringify(addresses(parsed.bcc)) === JSON.stringify(addresses(sendMessageInput.bcc))\n                && parsed.subject === sendMessageInput.subject\n                && normalizeText(parsed.text) === normalizeText(sendMessageInput.body)\n                && normalizeText(parsed.html) === normalizeText(sendMessageInput.html)\n                && String(parsed.inReplyTo ?? '') === String(sendMessageInput.inReplyTo ?? '')\n                && (!sendMessageInput.threadExternalId || exact.data.message.threadId === sendMessageInput.threadExternalId)\n                && JSON.stringify(actualAttachments) === JSON.stringify(expectedAttachments);\n            if (!matches) throw new Error('Provider draft differs from the reviewed sender, recipients, content, thread or attachment bytes; no message sent');\n            const headerMessageId = parsed.messageId;"]]);

// Independently read actual Sent MIME and attachment bytes after the sole provider send.
specs.find(x=>x.path.endsWith('gmail-message-outbound.service.js')).changes.push(...[["            const attachmentManifest = [];\n            const visit = async (part) => {\n                if (part.filename) {\n                    let data = part.body?.data;\n                    if (part.body?.attachmentId) {\n                        const downloaded = await gmailClient.users.messages.attachments.get({userId: 'me', messageId: nativeMessage.id, id: part.body.attachmentId});\n                        data = downloaded.data?.data;\n                    }\n                    if (typeof data !== 'string') throw new Error('Provider attachment bytes missing during read-back');\n                    const bytes = Buffer.from(data, 'base64url');\n                    attachmentManifest.push({filename: part.filename, mimeType: part.mimeType, size: bytes.length, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'), attachmentId: part.body?.attachmentId ?? null});\n                }\n                for (const child of part.parts ?? []) await visit(child);\n            };\n            if (nativeMessage.payload) await visit(nativeMessage.payload);\n", "            const attachmentManifest = await this.readAttachmentManifest(gmailClient, nativeMessage);\n"], ["    async readDraftEvidence(gmailClient, receipt) {", "    async readAttachmentManifest(gmailClient, nativeMessage) {\n            const attachmentManifest = [];\n            const visit = async (part) => {\n                if (part.filename) {\n                    let data = part.body?.data;\n                    if (part.body?.attachmentId) {\n                        const downloaded = await gmailClient.users.messages.attachments.get({userId: 'me', messageId: nativeMessage.id, id: part.body.attachmentId});\n                        data = downloaded.data?.data;\n                    }\n                    if (typeof data !== 'string') throw new Error('Provider attachment bytes missing during read-back');\n                    const bytes = Buffer.from(data, 'base64url');\n                    attachmentManifest.push({filename: part.filename, mimeType: part.mimeType, size: bytes.length, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex'), attachmentId: part.body?.attachmentId ?? null});\n                }\n                for (const child of part.parts ?? []) await visit(child);\n            };\n            if (nativeMessage.payload) await visit(nativeMessage.payload);\n            return attachmentManifest;\n    }\n    async readSentEvidence(gmailClient, messageId, threadId) {\n        const receipt = {provider: 'GOOGLE', messageId: messageId ?? null, threadId: threadId ?? null, readBackConfirmed: false};\n        if (!messageId) return {...receipt, error: 'Provider send returned no message ID; reconcile Sent before any retry'};\n        try {\n            const fetched = await gmailClient.users.messages.get({userId: 'me', id: messageId, format: 'full'});\n            const nativeMessage = fetched.data;\n            if (nativeMessage?.id !== messageId || (threadId && nativeMessage.threadId !== threadId)) throw new Error('Sent message identity differs from provider send receipt');\n            if (!nativeMessage.payload || !nativeMessage.labelIds?.includes('SENT')) throw new Error('Provider message has no complete MIME payload or SENT label');\n            const attachmentManifest = await this.readAttachmentManifest(gmailClient, nativeMessage);\n            return {...receipt, threadId: nativeMessage.threadId ?? null, readBackConfirmed: true, nativeMessage, attachmentManifest};\n        } catch (error) {\n            return {...receipt, error: error instanceof Error ? error.message : 'Sent read-back failed; reconcile exact message before any retry'};\n        }\n    }\n    async readDraftEvidence(gmailClient, receipt) {"], ["            return {headerMessageId, messageExternalId: sent.data?.id, threadExternalId: sent.data?.threadId};", "            const nativeSent = await this.readSentEvidence(gmailClient, sent.data?.id, sent.data?.threadId);\n            return {headerMessageId, messageExternalId: sent.data?.id, threadExternalId: sent.data?.threadId, nativeSent};"], ["            threadExternalId: data.threadId ?? undefined\n", "            threadExternalId: data.threadId ?? undefined,\n            nativeSent: await this.readSentEvidence(gmailClient, data.id, data.threadId)\n"]]);
specs.find(x=>x.path.endsWith('/send-email-tool.js')).changes.push(["                    messageExternalId: sendResult.messageExternalId,", "                    messageExternalId: sendResult.messageExternalId,\n                    nativeSent: sendResult.nativeSent ?? {readBackConfirmed: false, error: 'Provider Sent read-back is unavailable'},"]);

// Enforce the read-only case capability before any legacy function dispatcher runs.
specs.find(x=>x.path.endsWith('tool-registry.service.js')).changes.push(["    async resolveAndExecute(toolName, args, context, options) {", "    async resolveAndExecute(toolName, args, context, options) {\n        if (toolName === 'app_crm_case_context') {\n            const allowedKeys = new Set(['mode', 'opportunityId', 'cursor', 'fingerprint']);\n            if (!args || typeof args !== 'object' || Array.isArray(args) || args.mode !== 'READ_CASE' || Object.keys(args).some(key => !allowedKeys.has(key))) {\n                return {success: false, error: 'CRM case context is read-only: mode READ_CASE and only opportunityId, cursor, fingerprint are accepted'};\n            }\n        }"]);

// Provider-native thread state prevents unsynced replies from bypassing CRM freshness.
specs.find(x=>x.path.endsWith('gmail-message-outbound.service.js')).changes.push(...[["    async readDraftEvidence(gmailClient, receipt) {", "    async readThreadContextFingerprint(gmailClient, threadId, currentDraftMessageId) {\n        if (!threadId || !currentDraftMessageId) throw new Error('Exact thread and draft message identity required for context freshness');\n        const fetched = await gmailClient.users.threads.get({userId: 'me', id: threadId, format: 'full'});\n        if (fetched.data?.id !== threadId || !Array.isArray(fetched.data.messages) || fetched.data.nextPageToken) throw new Error('Complete provider thread read-back unavailable');\n        const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value;\n        const messages = fetched.data.messages.filter(message => message.id !== currentDraftMessageId).map(message => {\n            if (!message.id || !message.payload) throw new Error('Provider thread message payload missing');\n            return {id: message.id, threadId: message.threadId, internalDate: message.internalDate, payload: message.payload};\n        }).sort((a,b)=>a.id.localeCompare(b.id));\n        return require('node:crypto').createHash('sha256').update(JSON.stringify(stable(messages))).digest('hex');\n    }\n    async readDraftEvidence(gmailClient, receipt) {"], ["            const nativeMessage = fetched.data.message;", "            const nativeMessage = fetched.data.message;\n            const threadContextFingerprint = await this.readThreadContextFingerprint(gmailClient, nativeMessage.threadId, nativeMessage.id);"], ["            return {...receipt, messageId: nativeMessage.id, threadId: nativeMessage.threadId ?? null, readBackConfirmed: true, nativeMessage, attachmentManifest};", "            return {...receipt, messageId: nativeMessage.id, threadId: nativeMessage.threadId ?? null, readBackConfirmed: true, nativeMessage, attachmentManifest, threadContextFingerprint};"], ["            const headerMessageId = parsed.messageId;", "            if (!sendMessageInput.approvedThreadContextFingerprint) throw new Error('Approved provider thread context fingerprint required; no message sent');\n            const threadContextFingerprint = await this.readThreadContextFingerprint(gmailClient, exact.data.message.threadId, exact.data.message.id);\n            if (threadContextFingerprint !== sendMessageInput.approvedThreadContextFingerprint) throw new Error('Provider thread changed since approval; review new replies, sent messages or other drafts before sending');\n            const headerMessageId = parsed.messageId;"]]);
specs.find(x=>x.path.endsWith('/send-email-tool.js')).changes.push(...[["            data.providerDraftId = parameters.providerDraftId;", "            data.providerDraftId = parameters.providerDraftId;\n            data.approvedThreadContextFingerprint = parameters.approvedThreadContextFingerprint;"], ["providerDraftId: require('zod').z.string().min(1).optional()", "providerDraftId: require('zod').z.string().min(1).optional(), approvedThreadContextFingerprint: require('zod').z.string().min(1).optional()"]]);
specs.find(x=>x.path.endsWith('/send-email.service.js')).changes.push(["            providerDraftId: data.providerDraftId,", "            providerDraftId: data.providerDraftId,\n            approvedThreadContextFingerprint: data.approvedThreadContextFingerprint,"]);
specs.find(x=>x.path.endsWith('workflow.cjs')).changes.push(["providerDraftId:o.z.string().optional()", "providerDraftId:o.z.string().optional(),approvedThreadContextFingerprint:o.z.string().optional()"]);
specs.find(x=>x.path.endsWith('workflow.mjs')).changes.push(["providerDraftId: d.string().optional()", "providerDraftId: d.string().optional(), approvedThreadContextFingerprint: d.string().optional()"]);

// Keep the native model conversation alive only for mechanically unfulfilled tool contracts.
specs.find(x=>x.path.endsWith('agent-async-executor.service.js')).changes.push(
  ["            const textResponse = await (0, _ai.generateText)({", "            const textResponse = await require('/opt/workflow-lazy-tools/workflow-continuation.cjs').generateWithContinuation(_ai.generateText, {"],
  ["            }).catch(error => {", "            }, {enabled: toolLoadingStrategy === 'lazy-workflow-explicit' && agent?.modelConfiguration?.workflowReadOnlyToolNames?.includes('app_crm_case_context'), maxToolCalls: 40, responseSchema: agentSchema, shouldContinue: () => !hasNoMoreAvailableCredits, recoverError: (error, steps) => require('/opt/workflow-lazy-tools/schema-validation.cjs').recoverStructuredParse(error, validateResponse, _ai.NoObjectGeneratedError?.isInstance(error) === true, steps, true)}).catch(error => {"]
);

// Native app tools must build edited source just like native code/workflow actions.
specs.push({
  path:'engine/core-modules/tool-provider/services/tool-executor.service.js',
  sha256:'4078b038e901e186fd94b90c82df6ba5b72e755110102a3370e953d9373bd0f6',
  changes:[
    ['const _logicfunctionexecutorservice = require("../../logic-function/logic-function-executor/logic-function-executor.service");','const _logicfunctionexecutorservice = require("../../../metadata-modules/logic-function/services/logic-function-from-source.service");'],
    ['this.logicFunctionExecutorService.execute({\n            logicFunctionId: ref.logicFunctionId,','this.logicFunctionExecutorService.executeOneFromSource({\n            id: ref.logicFunctionId,'],
    ['typeof _logicfunctionexecutorservice.LogicFunctionExecutorService === "undefined" ? Object : _logicfunctionexecutorservice.LogicFunctionExecutorService','typeof _logicfunctionexecutorservice.LogicFunctionFromSourceService === "undefined" ? Object : _logicfunctionexecutorservice.LogicFunctionFromSourceService']
  ]
});

// Structured internal evidence travels as JSON once; existing native CRUD remains the authority.
specs.push({path:'engine/core-modules/record-crud/utils/generate-update-record-input-schema.util.js',sha256:'ea0d6fd8c08015d899a1a922eb512ad1fd4190194a3dc878bdd745b8407efb3e',changes:[
 ['    return recordPropertiesSchema.partial().extend({','    const schema = recordPropertiesSchema.partial().extend({'],
 ['    });\n};','    });\n    return require("/opt/workflow-lazy-tools/structured-evidence.cjs").extendSchema(schema, objectMetadata.nameSingular, _zod.z);\n};']
]});
specs.find(x=>x.path.endsWith('tool-executor.service.js')).changes.push([
 "            case 'update_one':\n                {\n                    const { id, ...fields } = args;",
 "            case 'update_one':\n                {\n                    const structured = await require('/opt/workflow-lazy-tools/structured-evidence.cjs').update(this, ref, args, context, authContext);\n                    if (structured !== null) return structured;\n                    const { id, expectedUpdatedAt, evidenceJSON, ...fields } = args;"
]);

specs.push(...[{"path": "engine/core-modules/tool-provider/providers/database-tool.provider.js", "sha256": "01d53310329f3b8d97764c78042e5e4802819a7f9f23e2474d8c0ee78c08de2b", "changes": [["            if (canUpdateRecords && canBeManagedByAutomation) {", "            if (canUpdateRecords && (canBeManagedByAutomation || ['messageThread','calendarEvent'].includes(objectMetadata.nameSingular))) {"], ["        return descriptors;\n    }\n    hasMatchingTool", "        return descriptors.filter(d => !['messageThread','calendarEvent'].includes(d.objectName) || ['find_one','find_many','group_by','update_one'].includes(d.operation));\n    }\n    hasMatchingTool"]]}, {"path": "engine/core-modules/record-crud/services/update-many-records.service.js", "sha256": "56485b49823c9d789f81ddfda8febb82ef9790f8138f7c64aa6d7ce3592d7d62", "changes": [["            if (!(0, _workflow.canObjectBeManagedByAutomation)({\n                nameSingular: flatObjectMetadata.nameSingular\n            })) {", "            if (!(0, _workflow.canObjectBeManagedByAutomation)({\n                nameSingular: flatObjectMetadata.nameSingular\n            }) && !(params.customFieldsOnly === true && require('/opt/workflow-lazy-tools/structured-evidence.cjs').isCustomOnly(objectName, data))) {"]]}]);

specs.find(x=>x.path.endsWith('tool-executor.service.js')).changes.push([
 "        const result = await this.logicFunctionExecutorService.executeOneFromSource({\n            id: ref.logicFunctionId,\n            workspaceId: context.workspaceId,\n            payload: args\n        });",
 "        const invoke = payload => this.logicFunctionExecutorService.executeOneFromSource({id: ref.logicFunctionId, workspaceId: context.workspaceId, payload});\n        const result = ref.logicFunctionId === '6f156fd8-ec80-45d2-90e8-e6ba87c2f9c5' && args.mode === 'READ_CASE' ? await require('/opt/workflow-lazy-tools/case-pagination.cjs').executeCaseContext(invoke,args,context.workspaceId) : await invoke(args);"
]);

specs.find(x=>x.path.endsWith('logic-function/logic-function.workflow-action.js')).changes.push(
 ['const _common = require("@nestjs/common");','const _common = require("@nestjs/common");\nconst _core = require("@nestjs/core");\nconst _preparationRunner = require("../../../workflow-runner/workspace-services/workflow-runner.workspace-service");'],
 ['    constructor(logicFunctionExecutorService, flatEntityMapsCacheService){','    constructor(logicFunctionExecutorService, flatEntityMapsCacheService, moduleRef){\n        this.moduleRef = moduleRef;'],
 ['typeof _workspacemanyorallflatentitymapscacheservice.WorkspaceManyOrAllFlatEntityMapsCacheService === "undefined" ? Object : _workspacemanyorallflatentitymapscacheservice.WorkspaceManyOrAllFlatEntityMapsCacheService\n    ])','typeof _workspacemanyorallflatentitymapscacheservice.WorkspaceManyOrAllFlatEntityMapsCacheService === "undefined" ? Object : _workspacemanyorallflatentitymapscacheservice.WorkspaceManyOrAllFlatEntityMapsCacheService,\n        _core.ModuleRef\n    ])'],
 ['        return {\n            result: result.data || {}\n        };','        return {\n            result: await require("/opt/workflow-lazy-tools/native-preparation.cjs").enqueueVerifiedPreparation({input:workflowActionInput,data:result.data||{},runInfo,currentStepId,getRunner:()=>this.moduleRef.get(_preparationRunner.WorkflowRunnerWorkspaceService,{strict:false})})\n        };']
);

function preparePatches() {
  return specs.map(spec => {
    const absolutePath = path.join(root, spec.path);
    const source = fs.readFileSync(absolutePath, 'utf8');
    const sha256 = crypto.createHash('sha256').update(source).digest('hex');
    if (sha256 !== spec.sha256) {
      throw new Error('Unsupported upstream source: ' + spec.path + '. Review this overlay before upgrading.');
    }
    let patched = source;
    for (const [before, after] of spec.changes) {
      if (patched.split(before).length !== 2) throw new Error('Patch anchor mismatch: ' + spec.path);
      patched = patched.replace(before, after);
    }
    new vm.Script(spec.format === 'esm' ? patched.replace(/import[^;]+;/g, '').replace(/export\s*\{[^;]+;/g, '') : patched, { filename: spec.path });
    return { path: spec.path, absolutePath, source, patched };
  });
}

if (require.main === module) {
  const patches = preparePatches();
  for (const patch of patches) fs.writeFileSync(patch.absolutePath, patch.patched);
  for (const patch of patches) {
    if (fs.readFileSync(patch.absolutePath, 'utf8') !== patch.patched) throw new Error('Read-back failed: ' + patch.path);
  }
  console.log('Applied and read back workflow runtime repairs to ' + patches.length + ' files.');
}
module.exports = { preparePatches };
