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
      ]
    ]
  },
  {
    "path": "engine/metadata-modules/ai/ai-agent-execution/services/agent-async-executor.service.js",
    "sha256": "25b462859a1a7ce9c250abcc3395bb140143db8bbc41940037f35736d2e442c1",
    "changes": [
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
      "getReasoningProviderOptions(model) {\n        // Groq GPT-OSS rejects reasoning_content in subsequent tool rounds.\n        // The compatible SDK otherwise serializes returned reasoning into that field.\n        if (model.sdkPackage === '@ai-sdk/openai-compatible' &&\n            model.modelsDevName === 'groq' &&\n            model.model?.provider === 'groq.chat' &&\n            /^openai\\/gpt-oss-(20b|120b)$/.test(model.model?.modelId ?? '')) {\n            return { groq: { include_reasoning: false } };\n        }"
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
    new vm.Script(patched, { filename: spec.path });
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
