'use strict';

function createGuard() {
  return { cases: new Map() };
}

function unwrap(output) {
  let value = output;
  const seen = new Set();
  for (let depth = 0; value && typeof value === 'object' && !Array.isArray(value) && depth < 8 && !seen.has(value); depth++) {
    seen.add(value);
    if (value.success === false || value.error) return null;
    const next = value.result ?? value.data;
    if (next === undefined) break;
    value = next;
  }
  return value;
}

function observe(guard, toolName, output) {
  if (!guard || toolName !== 'app_crm_case_context') return;
  const page = unwrap(output);
  if (!page || page.mode !== 'READ_CASE' || !page.opportunityId) return;
  const prior = guard.cases.get(page.opportunityId);
  const state = prior?.fingerprint === page.fingerprint
    ? prior
    : { fingerprint: page.fingerprint, ranges: [], terminalEnd: null };
  const start = Number(page.cursor ?? 0);
  const end = Number(page.nextCursor ?? page.totalSections ?? (start + (page.sections?.length ?? 0)));
  state.ranges.push([start, end]);
  if (page.hasNextPage === false) state.terminalEnd = end;
  let contiguousEnd = 0;
  for (const [rangeStart, rangeEnd] of state.ranges.slice().sort((a, b) => a[0] - b[0])) {
    if (rangeStart > contiguousEnd) break;
    if (rangeEnd > contiguousEnd) contiguousEnd = rangeEnd;
  }
  state.nextCursor = contiguousEnd;
  state.complete = state.terminalEnd !== null && contiguousEnd === state.terminalEnd;
  guard.cases.set(page.opportunityId, state);
}

function assertOpportunityWrite(guard, args) {
  const state = guard?.cases?.get(args?.id);
  if (state?.complete === true) return;
  const cursor = state?.nextCursor ?? 0;
  throw new Error(
    'CASE_CONTEXT_INCOMPLETE: mutation was not executed. Complete every immutable READ_CASE page for this exact opportunity before updating. ' +
    JSON.stringify({ toolName: 'app_crm_case_context', arguments: { mode: 'READ_CASE', opportunityId: args?.id, cursor } }),
  );
}

module.exports = { createGuard, observe, assertOpportunityWrite };
