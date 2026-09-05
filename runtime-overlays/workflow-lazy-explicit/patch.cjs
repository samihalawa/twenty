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
        "const registeredModel = await this.aiModelRegistryService.resolveModelForAgent(agent);\n            const maxOutputTokens = this.aiModelRegistryService.getEffectiveModelConfig(registeredModel.modelId).maxOutputTokens;"
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
        "const directResponse = validateResponse ? require('/opt/workflow-lazy-tools/schema-validation.cjs').parseValidatedResponse(textResponse.text, validateResponse) : undefined;\n            if (directResponse !== undefined) result = directResponse.value;\n            if (validateResponse && directResponse === undefined) {"
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
        "getReasoningProviderOptions(model) {\n        // Keep paid OpenRouter GPT-OSS tool rounds within a modest output budget.\n        if (model.sdkPackage === '@ai-sdk/openai-compatible' &&\n            model.model?.provider === 'openrouter.chat' &&\n            /^openai\\/gpt-oss-(20b|120b)$/.test(model.model?.modelId ?? '')) {\n            return { openaiCompatible: { reasoningEffort: 'low' }, openrouter: { provider: { only: ['CoreWeave', 'DeepInfra'], order: ['CoreWeave', 'DeepInfra'], require_parameters: true } } };\n        }\n        // Groq GPT-OSS rejects reasoning_content in subsequent tool rounds.\n        // The compatible SDK otherwise serializes returned reasoning into that field.\n        if (model.sdkPackage === '@ai-sdk/openai-compatible' &&\n            model.modelsDevName === 'groq' &&\n            model.model?.provider === 'groq.chat' &&\n            /^openai\\/gpt-oss-(20b|120b)$/.test(model.model?.modelId ?? '')) {\n            return { groq: { include_reasoning: false } };\n        }"
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
    ]
  ]
},
{
  "path": "front/assets/useFindOneRecord-Cg_N4T_t.js",
  "sha256": "ceb4b9360e1292817da8f015a198d2175ac4656770db5f76b9fef5d30dc7ee95",
  "format": "esm",
  "changes": [
    [
      "})=>{const{objectMetadataItem:o}=i({objectNameSingular:e}),",
      "})=>{const runStatusRef=(0,m.useRef)(null);const{objectMetadataItem:o}=i({objectNameSingular:e}),"
    ],
    [
      "variables:{objectRecordId:r},client:n});return{record:",
      "variables:{objectRecordId:r},client:n,...(e===\"workflowRun\"?{fetchPolicy:\"cache-and-network\",pollInterval:3000,skipPollAttempt:()=>[\"COMPLETED\",\"FAILED\",\"STOPPED\"].includes(runStatusRef.current)}:{})});runStatusRef.current=d?.[e]?.status??null;return{record:"
    ]
  ]
}
];

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
    new vm.Script(spec.format === 'esm' ? patched.replace(/import[^;]+;/g, '').replace(/export\{[^;]+;/g, '') : patched, { filename: spec.path });
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
