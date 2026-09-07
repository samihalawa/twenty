// Generated from Career Ops src/server/operator-verification.ts.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../careerops-twenty-app/src/server/operator-verification.ts
var operator_verification_exports = {};
__export(operator_verification_exports, {
  inspectOperatorExecution: () => inspectOperatorExecution,
  verifyOperatorRun: () => verifyOperatorRun
});
module.exports = __toCommonJS(operator_verification_exports);

// ../careerops-twenty-app/src/server/context-read-verification.ts
var import_node_crypto = require("node:crypto");
var text = (v) => typeof v === "string" ? v : "";
var resultOf = (output) => {
  const value = output?.result ?? output?.data ?? output;
  return value?.data ?? value;
};
function verifySelectedCandidateReads(sections, calls, decisions) {
  const chunks = /* @__PURE__ */ new Map();
  for (const section of sections) if (section.sourceType === "DETACHED_THREAD_CANDIDATE_CONTENT_NOT_READ") chunks.set(section.sourceId, [...chunks.get(section.sourceId) || [], section]);
  if (!chunks.size) return;
  if (!Array.isArray(decisions)) throw Error("CANDIDATE_CONTEXT_DECISIONS_MISSING");
  const byId = /* @__PURE__ */ new Map();
  for (const decision of decisions) {
    if (!decision || typeof decision !== "object" || !chunks.has(decision.threadId) || byId.has(decision.threadId) || !["READ", "EXCLUDE"].includes(decision.decision) || !text(decision.reason).trim()) throw Error("CANDIDATE_CONTEXT_DECISION_INVALID");
    byId.set(decision.threadId, decision);
  }
  if (byId.size !== chunks.size) throw Error("CANDIDATE_CONTEXT_DECISIONS_INCOMPLETE");
  for (const [threadId, parts] of chunks) {
    let serialized = "";
    for (const part of parts.sort((a, b) => a.offset - b.offset)) {
      if (part.offset !== serialized.length) throw Error("CANDIDATE_INDEX_INCOMPLETE");
      serialized += part.text;
    }
    if (serialized.length !== parts[0].totalCharacters) throw Error("CANDIDATE_INDEX_INCOMPLETE");
    const manifest = JSON.parse(serialized);
    if (manifest.id !== threadId || !Array.isArray(manifest.messages)) throw Error("CANDIDATE_INDEX_INVALID");
    if (byId.get(threadId)?.decision === "EXCLUDE") continue;
    const expected = new Map(manifest.messages.map((m) => [m.id, m]));
    const observed = /* @__PURE__ */ new Set();
    let initial = false, terminal = false;
    for (const call of calls) {
      if (!call.ok || call.name !== "find_many_messages" || call.args?.messageThreadId?.eq !== threadId || !Array.isArray(call.args.select) || !call.args.select.some((s) => s === "text" || s === "*")) continue;
      const result = resultOf(call.output);
      if (!Array.isArray(result.records)) continue;
      if ((call.args.offset ?? 0) === 0) initial = true;
      if (result.hasNextPage === false) terminal = true;
      for (const record of result.records) {
        const source = expected.get(record.id);
        if (!source || record.messageThreadId !== threadId) throw Error("SELECTED_CONTEXT_SOURCE_CHANGED");
        const body = typeof record.text === "string" ? record.text : source.bodyCharacters === 0 ? "" : null;
        if (body === null || (0, import_node_crypto.createHash)("sha256").update(body).digest("hex") !== source.bodySha256) throw Error("SELECTED_CONTEXT_BODY_INCOMPLETE_OR_CHANGED");
        observed.add(record.id);
      }
    }
    if (!initial || !terminal || observed.size !== expected.size) throw Error("SELECTED_CONTEXT_READ_INCOMPLETE");
  }
}

// ../careerops-twenty-app/src/server/operator-verification.ts
function inspectOperatorExecution(run, agentStepId) {
  const result = run?.state?.stepInfos?.[agentStepId]?.result;
  const report = String(result?.response ?? "");
  const status = report.replace(/\*/g, "").match(/STATUS\s*:\s*([A-Z_]+)/)?.[1];
  const calls = (run?.stepLogs?.[agentStepId]?.details?.toolCalls ?? []).map((c, index) => ({
    index,
    name: c.toolName === "execute_tool" ? c.input?.toolName : c.toolName,
    args: c.toolName === "execute_tool" ? c.input?.arguments : c.input,
    output: c.output,
    ok: c.state === "success" && c.output?.success !== false && !c.output?.error
  }));
  const successful = calls.filter((c) => c.ok);
  const reads = successful.filter((c) => /^find_(one|many)_/.test(c.name));
  const contextPages = successful.filter((c) => c.name === "app_crm_case_context").map((c) => {
    const result2 = c.output?.result ?? c.output?.data ?? c.output;
    return { ...c, page: result2?.data ?? result2 };
  });
  const hasCompleteContext = (id, before) => {
    const pages = contextPages.filter((c) => c.index < before && c.args?.opportunityId === id && c.page?.opportunityId === id && c.page?.mode === "READ_CASE");
    for (const first of pages.filter((c) => c.page.cursor === 0)) {
      const covered = /* @__PURE__ */ new Map();
      let terminal = null, invalid = false;
      for (const c of pages.filter((c2) => c2.page.fingerprint === first.page.fingerprint && c2.index >= first.index)) {
        const p = c.page;
        if (!Array.isArray(p.sections)) {
          invalid = true;
          break;
        }
        const end = p.cursor + p.sections.length;
        if (!Number.isInteger(p.cursor) || p.cursor < 0 || !Number.isInteger(p.totalSections) || end > p.totalSections || p.providerPaginationComplete !== true || p.hasNextPage === true && p.nextCursor !== end || p.hasNextPage === false && (p.nextCursor != null || end !== p.totalSections)) {
          invalid = true;
          break;
        }
        for (let i = 0; i < p.sections.length; i++) {
          const key = p.cursor + i, text2 = JSON.stringify(p.sections[i]);
          if (covered.has(key) && covered.get(key) !== text2) {
            invalid = true;
            break;
          }
          covered.set(key, text2);
        }
        if (p.hasNextPage === false) terminal = p.totalSections;
      }
      if (!invalid && terminal !== null && Array.from({ length: terminal }, (_, i) => i).every((i) => covered.has(i))) return true;
    }
    return false;
  };
  const writes = successful.filter((c) => /^(update|create|upsert)_/.test(c.name));
  const problems = [];
  if (status === "NEEDS_EVIDENCE" && /MISSING_EVIDENCE\s*:\s*(?:none|nothing|no missing evidence)\b/i.test(report.replace(/\*\*/g, ""))) problems.push("NEEDS_EVIDENCE contradicts an explicitly empty missing-evidence list");
  if (!["COMPLETED", "NO_WORK", "NEEDS_EVIDENCE", "ENTITY_CONFLICT"].includes(status ?? "")) problems.push("Agent business status is " + (status ?? "missing"));
  const sources = ["messages", "calendar_events", "interactions"];
  const sourceReads = reads.filter((c) => sources.some((s) => c.name === "find_many_" + s));
  for (const id of new Set(contextPages.map((c) => c.args?.opportunityId))) if (!hasCompleteContext(String(id), Infinity)) problems.push("Incomplete context pages for " + id + "; available pages are not missing source evidence");
  if (status === "COMPLETED") {
    if (!sourceReads.length && !contextPages.length) problems.push("Missing actual source reads");
    if (!writes.length) problems.push("Claimed completed work has no persisted business write");
  }
  if (status === "NO_WORK") {
    const bounded = sourceReads.filter((c) => c.args?.receivedAt || c.args?.occurredAt || c.args?.startsAt || c.args?.and);
    if (!bounded.length) problems.push("NO_WORK has no bounded source search");
    if (bounded.some((c) => c.output?.result?.hasNextPage !== false)) problems.push("NO_WORK discovery pagination is incomplete");
    if (bounded.some((c) => Number(c.output?.result?.count ?? c.output?.result?.records?.length ?? 0) > 0)) problems.push("NO_WORK requires evidence that discovered candidates were assessed");
  }
  for (const write of writes) {
    if (write.name === "update_one_opportunity") {
      if (!hasCompleteContext(write.args?.id, write.index)) problems.push("Opportunity write preceded complete exact case context pages");
      const pagesBefore = contextPages.filter((c) => c.index < write.index && c.page?.opportunityId === write.args?.id);
      const fp = pagesBefore.at(-1)?.page?.fingerprint, sections = /* @__PURE__ */ new Map();
      for (const c of pagesBefore.filter((c2) => c2.page.fingerprint === fp)) c.page.sections?.forEach((section, i) => sections.set(c.page.cursor + i, section));
      let decisions = write.args?.evidenceJSON?.candidateDecisions;
      if (!decisions && typeof write.args?.stateEvidence?.markdown === "string") try {
        decisions = JSON.parse(write.args.stateEvidence.markdown).candidateDecisions;
      } catch {
      }
      try {
        verifySelectedCandidateReads([...sections.values()], calls.filter((c) => c.index < write.index), decisions);
      } catch (error) {
        problems.push("Selected candidate coverage failed before mutation: " + error.message);
      }
      if (Object.keys(write.args ?? {}).filter((k) => !["id", "lastReconciledAt", "expectedUpdatedAt"].includes(k)).length === 0) problems.push("Timestamp-only update is not business reconciliation");
    }
    const id = write.args?.id ?? write.output?.result?.id;
    const object = write.name.replace(/^(update|create|upsert)_one_/, "");
    if (!id || !reads.some((c) => c.index > write.index && c.name === "find_one_" + object && c.args?.id === id)) problems.push("Missing independent read-back for " + write.name + ":" + (id ?? "unknown"));
  }
  return { status, problems: [...new Set(problems)], calls, writes, sourceReadCount: sourceReads.length };
}
async function verifyOperatorRun(input) {
  const base = process.env.TWENTY_API_URL, token = process.env.TWENTY_APP_ACCESS_TOKEN;
  if (!base || !token || !input.runUtcIso || !input.workflowVersionId || !input.agentStepId) throw Error("Operator verification requires exact native run binding");
  const gql = async (query, variables) => {
    const response = await fetch(base.replace(/\/$/, "") + "/graphql", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ query, variables }) });
    const body = await response.json();
    if (!response.ok || body.errors) throw Error("Operator read-back failed: " + JSON.stringify(body.errors ?? response.status));
    return body.data;
  };
  const rows = await gql("query($v:UUID!){workflowRuns(filter:{workflowVersionId:{eq:$v}},first:20,orderBy:[{createdAt:DescNullsLast}]){edges{node{id state stepLogs}} pageInfo{hasNextPage}}}", { v: input.workflowVersionId });
  const matches = rows.workflowRuns.edges.map((e) => e.node).filter((r) => Object.values(r.state?.stepInfos ?? {}).some((s) => s.result?.runUtcIso === input.runUtcIso));
  if (matches.length !== 1) throw Error("Operator run binding is missing or ambiguous");
  const run = matches[0], checked = inspectOperatorExecution(run, input.agentStepId);
  if (checked.problems.length) throw Error("OPERATOR_UNVERIFIED [" + run.id + "]: " + checked.problems.join("; "));
  const records = [], preparationRequests = [];
  for (const write of checked.writes) {
    const object = write.name.replace(/^(update|create|upsert)_one_/, "");
    const id = write.args?.id ?? write.output?.result?.id;
    if (!["opportunity", "message_thread", "interaction", "calendar_event", "ai_artifact_generation", "interview_review"].includes(object)) throw Error("Unsupported operator write verification: " + object);
    const root = object.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const fields = Object.keys(write.args ?? {}).filter((k) => !["id", "expectedUpdatedAt", "evidenceJSON"].includes(k) && /^[a-zA-Z]+$/.test(k) && (typeof write.args[k] !== "object" || write.args[k] === null));
    const richFields = Object.keys(write.args ?? {}).filter((k) => /^[a-zA-Z]+$/.test(k) && typeof write.args[k]?.markdown === "string");
    const evidenceField = write.args?.evidenceJSON ? object === "opportunity" ? "stateEvidence" : object === "message_thread" ? "inboxEvidence" : null : null;
    const selection = ["updatedAt", ...fields, ...richFields.map((k) => k + "{markdown}"), ...evidenceField ? [evidenceField + "{markdown}"] : []];
    const data = await gql("query($id:UUID!){" + root + "(filter:{id:{eq:$id}}){id " + selection.join(" ") + "}}", { id });
    const actual = data[root];
    if (!actual || fields.some((k) => String(actual[k] ?? "") !== String(write.args[k] ?? ""))) throw Error("Operator persisted field mismatch for " + id);
    if (richFields.some((k) => actual[k]?.markdown !== write.args[k].markdown)) throw Error("Operator persisted evidence mismatch for " + id);
    if (evidenceField) {
      let saved;
      try {
        saved = JSON.parse(actual[evidenceField]?.markdown);
      } catch {
        throw Error("Operator structured evidence was not valid persisted JSON for " + id);
      }
      const equal = (a, b) => a === b || !!a && !!b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => equal(a[k], b[k]));
      if (Object.keys(write.args.evidenceJSON).some((k) => !equal(saved[k], write.args.evidenceJSON[k]))) throw Error("Operator structured evidence value mismatch for " + id);
      const action = saved.nextAction;
      if (object === "opportunity" && saved.sourceCoverage?.complete === true && ["DOCUMENT", "MEETING_PREPARATION"].includes(action?.kind) && ["PENDING", "READY"].includes(action?.status) && ["SAMI", "SHARED"].includes(action?.owner)) {
        const receipt = checked.calls.filter((c) => c.ok && c.name === "app_crm_case_context" && c.args?.opportunityId === id).at(-1)?.output;
        const page = receipt?.result?.data ?? receipt?.result ?? receipt?.data ?? receipt;
        preparationRequests.push({ opportunityId: id, expectedUpdatedAt: actual.updatedAt, sourceFingerprint: saved.sourceCoverage.fingerprint, providerSourceFingerprint: page?.providerSourceFingerprint ?? null, sourceIds: saved.sourceCoverage.sourceIds ?? [], kind: action.kind, upstreamWorkflowRunId: run.id, upstreamAgentStepId: input.agentStepId });
      }
    }
    records.push({ object, id, fields: [...fields, ...richFields] });
  }
  return { businessStatus: checked.status, workflowRunId: run.id, sourceReadCount: checked.sourceReadCount, records, preparationRequests, checkedAt: (/* @__PURE__ */ new Date()).toISOString(), executionVerified: true, readBackConfirmed: records.length > 0 };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  inspectOperatorExecution,
  verifyOperatorRun
});
