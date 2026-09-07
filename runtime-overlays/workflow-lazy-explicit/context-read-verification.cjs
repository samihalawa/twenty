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

// ../careerops-twenty-app/src/server/context-read-verification.ts
var context_read_verification_exports = {};
__export(context_read_verification_exports, {
  nativeAdditionalReadSources: () => nativeAdditionalReadSources,
  verifyAdditionalCaseReadCoverage: () => verifyAdditionalCaseReadCoverage,
  verifyContextReadCoverage: () => verifyContextReadCoverage,
  verifySelectedCandidateReads: () => verifySelectedCandidateReads
});
module.exports = __toCommonJS(context_read_verification_exports);
var import_node_crypto = require("node:crypto");
var text = (v) => typeof v === "string" ? v : "";
var resultOf = (output) => {
  const value = output?.result ?? output?.data ?? output;
  return value?.data ?? value;
};
var recordOf = (output) => {
  const value = resultOf(output);
  return Array.isArray(value?.records) && value.records.length === 1 ? value.records[0] : value;
};
var canonicalPersonId = "4deb3ea0-2672-43da-81ee-7a3f2f4a468c";
function verifySelectedCandidateReads(sections, calls, decisions) {
  const chunks = /* @__PURE__ */ new Map();
  for (const section of sections) if (section.sourceType === "DETACHED_THREAD_CANDIDATE_CONTENT_NOT_READ") chunks.set(section.sourceId, [...chunks.get(section.sourceId) || [], section]);
  if (!chunks.size) return;
  if (!Array.isArray(decisions)) throw Error('CANDIDATE_CONTEXT_DECISIONS_MISSING: return candidateDecisions as an array of {threadId,decision:"READ"|"EXCLUDE",reason}; include each exact thread: ' + [...chunks.keys()].join(", "));
  const byId = /* @__PURE__ */ new Map();
  for (const decision of decisions) {
    if (!decision || typeof decision !== "object" || !chunks.has(decision.threadId) || byId.has(decision.threadId) || !["READ", "EXCLUDE"].includes(decision.decision) || !text(decision.reason).trim()) throw Error("CANDIDATE_CONTEXT_DECISION_INVALID: thread " + String(decision?.threadId ?? "(missing)") + " must occur exactly once with decision READ or EXCLUDE and a nonempty source-based reason; allowed IDs: " + [...chunks.keys()].join(", "));
    byId.set(decision.threadId, decision);
  }
  if (byId.size !== chunks.size) throw Error("CANDIDATE_CONTEXT_DECISIONS_INCOMPLETE: missing exact thread decisions: " + [...chunks.keys()].filter((id) => !byId.has(id)).join(", "));
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
    if (!initial || !terminal || observed.size !== expected.size) throw Error("SELECTED_CONTEXT_READ_INCOMPLETE: thread " + threadId + " requires full native find_many_messages pagination from offset 0 through hasNextPage false; unread exact message IDs: " + [...expected.keys()].filter((id) => !observed.has(id)).join(", "));
  }
}
function verifyContextReadCoverage(run, stepId, opportunityId, fingerprint, requireCanonical = true) {
  const calls = (run.stepLogs?.[stepId]?.details?.toolCalls || []).map((c) => ({ name: c.toolName === "execute_tool" ? c.input?.toolName : c.toolName, args: c.toolName === "execute_tool" ? c.input?.arguments : c.input, output: c.output, ok: c.state === "success" && c.output?.success !== false && !c.output?.error }));
  if (calls.some((c) => c.ok && /^(create|update|upsert|delete)_/.test(c.name || ""))) throw Error("CONTEXT_READER_CHANGED_RECORDS");
  if (requireCanonical && !calls.some((c) => c.ok && c.name === "find_one_person" && c.args?.id === canonicalPersonId && recordOf(c.output)?.id === canonicalPersonId && text(recordOf(c.output)?.canonicalCareerEvidence).trim())) throw Error("CANONICAL_CAREER_SOURCE_NOT_READ");
  const pages = calls.filter((c) => c.ok && c.name === "app_crm_case_context" && c.args?.opportunityId === opportunityId).map((c) => {
    const r = c.output?.result ?? c.output?.data ?? c.output;
    return r?.data ?? r;
  }).filter((p) => p.opportunityId === opportunityId && p.fingerprint === fingerprint);
  const covered = /* @__PURE__ */ new Map();
  let total;
  let terminal = false;
  for (const p of pages) {
    if (p.providerPaginationComplete !== true || !Array.isArray(p.sections) || !Number.isInteger(p.cursor) || p.cursor < 0 || !Number.isInteger(p.totalSections) || p.totalSections < 1) continue;
    const end = p.cursor + p.sections.length;
    if (end > p.totalSections || !p.sections.length) continue;
    if (p.hasNextPage === false) {
      if (end !== p.totalSections || p.nextCursor !== null && p.nextCursor !== void 0) continue;
      terminal = true;
    } else if (p.hasNextPage !== true || p.nextCursor !== end) continue;
    if (total !== void 0 && total !== p.totalSections) throw Error("CONTEXT_SNAPSHOT_INCONSISTENT");
    total = p.totalSections;
    p.sections.forEach((section, index) => {
      const at = p.cursor + index, value = JSON.stringify(section);
      if (covered.has(at) && covered.get(at) !== value) throw Error("CONTEXT_SNAPSHOT_INCONSISTENT");
      covered.set(at, value);
    });
  }
  if (terminal && total !== void 0 && covered.size === total && covered.has(0)) {
    verifySelectedCandidateReads([...covered.entries()].sort((a, b) => a[0] - b[0]).map(([, section]) => JSON.parse(section)), calls, run.state?.stepInfos?.[stepId]?.result?.candidateDecisions);
    return;
  }
  throw Error("CONTEXT_READ_INCOMPLETE");
}
function nativeAdditionalReadSources(run, stepId) {
  const calls = (run.stepLogs?.[stepId]?.details?.toolCalls || []).filter((c) => c.state === "success" && c.output?.success !== false && !c.output?.error);
  const knownThreads = /* @__PURE__ */ new Set(), knownEvents = /* @__PURE__ */ new Set(), knownInteractions = /* @__PURE__ */ new Set();
  for (const c of calls) {
    const name = c.toolName === "execute_tool" ? c.input?.toolName : c.toolName;
    if (name !== "app_crm_case_context") continue;
    const page = resultOf(c.output);
    for (const s of page?.sections || []) {
      if (["EXACT_LINKED_THREAD", "DETACHED_THREAD_CANDIDATE_CONTENT_NOT_READ"].includes(s.sourceType)) knownThreads.add(s.sourceId);
      if (["NATIVE_CALENDAR_EVENT", "DETACHED_CALENDAR_CANDIDATE_DO_NOT_MERGE_BY_NAME"].includes(s.sourceType)) knownEvents.add(s.sourceId);
      if (s.sourceType === "EXTERNAL_SOURCE") knownInteractions.add(s.sourceId);
    }
  }
  const threads = /* @__PURE__ */ new Set(), events = /* @__PURE__ */ new Set(), interactions = /* @__PURE__ */ new Set();
  for (const c of calls) {
    const name = c.toolName === "execute_tool" ? c.input?.toolName : c.toolName;
    const value = resultOf(c.output), records = Array.isArray(value?.records) ? value.records : value?.id ? [value] : [];
    for (const record of records) {
      if (["find_one_message", "find_many_messages"].includes(name) && typeof record.text === "string") {
        const id = record.messageThreadId;
        if (id && !knownThreads.has(id)) threads.add(id);
      }
      if (["find_one_calendar_event", "find_many_calendar_events"].includes(name) && record.id && !knownEvents.has(record.id)) events.add(record.id);
      if (["find_one_interaction", "find_many_interactions"].includes(name) && record.id && !knownInteractions.has(record.id)) interactions.add(record.id);
    }
  }
  return { messageThreadIds: [...threads].sort(), calendarEventIds: [...events].sort(), interactionIds: [...interactions].sort() };
}
function verifyAdditionalCaseReadCoverage(run, stepId, sources) {
  const calls = (run.stepLogs?.[stepId]?.details?.toolCalls || []).map((c) => ({ name: c.toolName === "execute_tool" ? c.input?.toolName : c.toolName, args: c.toolName === "execute_tool" ? c.input?.arguments : c.input, output: c.output, ok: c.state === "success" && c.output?.success !== false && !c.output?.error }));
  if (Object.values(sources?.missing || {}).some((ids) => Array.isArray(ids) && ids.length)) throw Error("ADDITIONAL_CONTEXT_SOURCE_MISSING");
  const sections = [], decisions = [];
  for (const thread of sources?.messageThreads || []) {
    const serialized = JSON.stringify({ id: thread.id, messages: (thread.messages || []).map((m) => ({ id: m.id, bodySha256: m.bodySha256, bodyCharacters: m.bodyCharacters })) });
    sections.push({ sourceType: "DETACHED_THREAD_CANDIDATE_CONTENT_NOT_READ", sourceId: thread.id, offset: 0, totalCharacters: serialized.length, text: serialized });
    decisions.push({ threadId: thread.id, decision: "READ", reason: "Exact additional source requires independent native read" });
  }
  verifySelectedCandidateReads(sections, calls, decisions);
  const records = (names) => calls.filter((c) => c.ok && names.includes(c.name)).flatMap((c) => {
    const value = resultOf(c.output);
    return Array.isArray(value?.records) ? value.records : value?.id ? [value] : [];
  });
  const sameFields = (actual, expected, fields) => fields.every((field) => JSON.stringify(actual?.[field] ?? null) === JSON.stringify(expected?.[field] ?? null));
  const readMessageParticipants = records(["find_one_message_participant", "find_many_message_participants"]);
  for (const thread of sources?.messageThreads || []) for (const message of thread.messages || []) for (const participant of message.participants || []) if (!readMessageParticipants.some((r) => r.id === participant.id && sameFields(r, participant, ["messageId", "personId", "handle", "role"]))) throw Error("ADDITIONAL_MESSAGE_PARTICIPANTS_NOT_READ");
  const readEvents = records(["find_one_calendar_event", "find_many_calendar_events"]), readEventParticipants = records(["find_one_calendar_event_participant", "find_many_calendar_event_participants"]);
  for (const event of sources?.calendarEvents || []) {
    if (!readEvents.some((r) => r.id === event.id && sameFields(r, event, ["title", "opportunityId", "startsAt", "endsAt", "isCanceled", "description", "location"]))) throw Error("ADDITIONAL_CALENDAR_CONTEXT_NOT_READ");
    for (const p of event.participants || []) if (!readEventParticipants.some((r) => r.id === p.id && sameFields(r, p, ["calendarEventId", "personId", "handle", "responseStatus", "isOrganizer"]))) throw Error("ADDITIONAL_CALENDAR_PARTICIPANTS_NOT_READ");
  }
  const readInteractions = records(["find_one_interaction", "find_many_interactions"]);
  for (const interaction of sources?.interactions || []) if (!readInteractions.some((r) => r.id === interaction.id && sameFields(r, interaction, ["name", "sourceId", "occurredAt", "opportunityId", "personId", "calendarEventId"]) && r.summary?.markdown === interaction.summary?.markdown)) throw Error("ADDITIONAL_INTERACTION_CONTEXT_NOT_READ");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  nativeAdditionalReadSources,
  verifyAdditionalCaseReadCoverage,
  verifyContextReadCoverage,
  verifySelectedCandidateReads
});
