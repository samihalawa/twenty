// Generated from Career Ops src/server/context-read-verification.ts; native execution evidence only.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySelectedCandidateReads = verifySelectedCandidateReads;
exports.verifyContextReadCoverage = verifyContextReadCoverage;
/// <reference types="node" />
const node_crypto_1 = require("node:crypto");
const text = (v) => typeof v === 'string' ? v : '';
const resultOf = (output) => { const value = output?.result ?? output?.data ?? output; return value?.data ?? value; };
const recordOf = (output) => { const value = resultOf(output); return Array.isArray(value?.records) && value.records.length === 1 ? value.records[0] : value; };
const canonicalPersonId = '4deb3ea0-2672-43da-81ee-7a3f2f4a468c';
function verifySelectedCandidateReads(sections, calls, decisions) {
    const chunks = new Map();
    for (const section of sections)
        if (section.sourceType === 'DETACHED_THREAD_CANDIDATE_CONTENT_NOT_READ')
            chunks.set(section.sourceId, [...(chunks.get(section.sourceId) || []), section]);
    if (!chunks.size)
        return;
    if (!Array.isArray(decisions))
        throw Error('CANDIDATE_CONTEXT_DECISIONS_MISSING');
    const byId = new Map();
    for (const decision of decisions) {
        if (!decision || typeof decision !== 'object' || !chunks.has(decision.threadId) || byId.has(decision.threadId) || !['READ', 'EXCLUDE'].includes(decision.decision) || !text(decision.reason).trim())
            throw Error('CANDIDATE_CONTEXT_DECISION_INVALID');
        byId.set(decision.threadId, decision);
    }
    if (byId.size !== chunks.size)
        throw Error('CANDIDATE_CONTEXT_DECISIONS_INCOMPLETE');
    for (const [threadId, parts] of chunks) {
        let serialized = '';
        for (const part of parts.sort((a, b) => a.offset - b.offset)) {
            if (part.offset !== serialized.length)
                throw Error('CANDIDATE_INDEX_INCOMPLETE');
            serialized += part.text;
        }
        if (serialized.length !== parts[0].totalCharacters)
            throw Error('CANDIDATE_INDEX_INCOMPLETE');
        const manifest = JSON.parse(serialized);
        if (manifest.id !== threadId || !Array.isArray(manifest.messages))
            throw Error('CANDIDATE_INDEX_INVALID');
        if (byId.get(threadId)?.decision === 'EXCLUDE')
            continue;
        const expected = new Map(manifest.messages.map((m) => [m.id, m]));
        const observed = new Set();
        let initial = false, terminal = false;
        for (const call of calls) {
            if (!call.ok || call.name !== 'find_many_messages' || call.args?.messageThreadId?.eq !== threadId || !Array.isArray(call.args.select) || !call.args.select.some((s) => s === 'text' || s === '*'))
                continue;
            const result = resultOf(call.output);
            if (!Array.isArray(result.records))
                continue;
            if ((call.args.offset ?? 0) === 0)
                initial = true;
            if (result.hasNextPage === false)
                terminal = true;
            for (const record of result.records) {
                const source = expected.get(record.id);
                if (!source || record.messageThreadId !== threadId)
                    throw Error('SELECTED_CONTEXT_SOURCE_CHANGED');
                const body = typeof record.text === 'string' ? record.text : source.bodyCharacters === 0 ? '' : null;
                if (body === null || (0, node_crypto_1.createHash)('sha256').update(body).digest('hex') !== source.bodySha256)
                    throw Error('SELECTED_CONTEXT_BODY_INCOMPLETE_OR_CHANGED');
                observed.add(record.id);
            }
        }
        if (!initial || !terminal || observed.size !== expected.size)
            throw Error('SELECTED_CONTEXT_READ_INCOMPLETE');
    }
}
function verifyContextReadCoverage(run, stepId, opportunityId, fingerprint, requireCanonical = true) {
    const calls = (run.stepLogs?.[stepId]?.details?.toolCalls || []).map((c) => ({ name: c.toolName === 'execute_tool' ? c.input?.toolName : c.toolName, args: c.toolName === 'execute_tool' ? c.input?.arguments : c.input, output: c.output, ok: c.state === 'success' && c.output?.success !== false && !c.output?.error }));
    if (calls.some((c) => c.ok && /^(create|update|upsert|delete)_/.test(c.name || '')))
        throw Error('CONTEXT_READER_CHANGED_RECORDS');
    if (requireCanonical && !calls.some((c) => c.ok && c.name === 'find_one_person' && c.args?.id === canonicalPersonId && recordOf(c.output)?.id === canonicalPersonId && text(recordOf(c.output)?.canonicalCareerEvidence).trim()))
        throw Error('CANONICAL_CAREER_SOURCE_NOT_READ');
    const pages = calls.filter((c) => c.ok && c.name === 'app_crm_case_context' && c.args?.opportunityId === opportunityId).map((c) => { const r = c.output?.result ?? c.output?.data ?? c.output; return r?.data ?? r; }).filter((p) => p.opportunityId === opportunityId && p.fingerprint === fingerprint);
    const covered = new Map();
    let total;
    let terminal = false;
    for (const p of pages) {
        if (p.providerPaginationComplete !== true || !Array.isArray(p.sections) || !Number.isInteger(p.cursor) || p.cursor < 0 || !Number.isInteger(p.totalSections) || p.totalSections < 1)
            continue;
        const end = p.cursor + p.sections.length;
        if (end > p.totalSections || !p.sections.length)
            continue;
        if (p.hasNextPage === false) {
            if (end !== p.totalSections || (p.nextCursor !== null && p.nextCursor !== undefined))
                continue;
            terminal = true;
        }
        else if (p.hasNextPage !== true || p.nextCursor !== end)
            continue;
        if (total !== undefined && total !== p.totalSections)
            throw Error('CONTEXT_SNAPSHOT_INCONSISTENT');
        total = p.totalSections;
        p.sections.forEach((section, index) => { const at = p.cursor + index, value = JSON.stringify(section); if (covered.has(at) && covered.get(at) !== value)
            throw Error('CONTEXT_SNAPSHOT_INCONSISTENT'); covered.set(at, value); });
    }
    // Re-reading a page does not erase pages already read from this exact snapshot.
    if (terminal && total !== undefined && covered.size === total && covered.has(0)) {
        verifySelectedCandidateReads([...covered.entries()].sort((a, b) => a[0] - b[0]).map(([, section]) => JSON.parse(section)), calls, run.state?.stepInfos?.[stepId]?.result?.candidateDecisions);
        return;
    }
    throw Error('CONTEXT_READ_INCOMPLETE');
}
