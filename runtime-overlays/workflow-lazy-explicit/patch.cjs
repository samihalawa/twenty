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
  console.log('Applied and read back workflow-only lazy tools patch to ' + patches.length + ' files.');
}
module.exports = { preparePatches };
