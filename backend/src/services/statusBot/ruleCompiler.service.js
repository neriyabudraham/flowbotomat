// ─────────────────────────────────────────────────────────────────────
// Rule compiler — translates a JSON rule tree into a parameterized
// PostgreSQL WHERE clause.
//
// Rule shape:
//   Group:  { op: 'AND' | 'OR', children: [Node, Node, ...] }
//   Leaf:   { field, operator, value }
//
// Leaf operators:
//   contains, not_contains, starts_with, ends_with, equals, not_equals,
//   is_empty, is_not_empty, in, not_in, regex, not_regex
//
// Field types: we map each logical field to an SQL expression on a named
// row alias. The caller passes a fieldMap that the compiler consumes.
//
// Usage:
//   const { sql, params } = compileRule(rule, fieldMap, { startParamIndex: 3 });
//   → sql: "(...)"  params: [...]
// ─────────────────────────────────────────────────────────────────────

const TEXT_OPERATORS = new Set([
  'contains', 'not_contains', 'starts_with', 'ends_with',
  'equals', 'not_equals', 'is_empty', 'is_not_empty',
  'in', 'not_in', 'regex', 'not_regex',
]);

const ARRAY_OPERATORS = new Set([
  'any_of', 'all_of', 'none_of', 'is_empty', 'is_not_empty', 'contains_any', 'contains_all',
]);

const BOOL_OPERATORS = new Set([
  'is_true', 'is_false',
]);

const NUM_OPERATORS = new Set([
  'equals', 'not_equals', 'gt', 'lt', 'gte', 'lte', 'is_empty', 'is_not_empty',
]);

function escapeLike(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// Guard against catastrophic-backtracking regexes (ReDoS). Postgres' `~`
// operator runs user-supplied regex against every row; a crafted pattern like
// `(a+)+b` on a moderate string can hang a query. We reject obvious
// pathological patterns and impose a length cap. Callers should also run
// these queries with SET LOCAL statement_timeout as a second line of defense.
const REGEX_MAX_LEN = 256;
const DANGEROUS_REGEX_PATTERNS = [
  /(\([^)]*[+*][^)]*\))[+*]/,    // (...+)+ or (...*)+ — nested quantifiers
  /(\[[^\]]*\][+*]){2,}/,         // [x]+[y]+ chained quantifiers
];

function sanitizeRegexOrFallback(raw) {
  const s = String(raw ?? '');
  if (s.length === 0) return null;
  if (s.length > REGEX_MAX_LEN) return null;
  for (const bad of DANGEROUS_REGEX_PATTERNS) {
    if (bad.test(s)) return null;
  }
  return s;
}

function pushParam(state, value) {
  state.params.push(value);
  return `$${state.nextIndex++}`;
}

function compileLeaf(leaf, fieldMap, state) {
  const fd = fieldMap[leaf.field];
  if (!fd) {
    // Unknown field — skip safely (compile as TRUE so it doesn't kill the whole filter)
    return 'TRUE';
  }
  const op = leaf.operator;
  const expr = fd.expr; // SQL expression (e.g. "gc.display_name", "gc.label_resource_names")
  const type = fd.type || 'text';
  const val = leaf.value;

  // Text operators
  if (type === 'text') {
    if (!TEXT_OPERATORS.has(op)) return 'TRUE';
    switch (op) {
      case 'contains':      return `(${expr} ILIKE ${pushParam(state, `%${escapeLike(val)}%`)})`;
      case 'not_contains':  return `(${expr} IS NULL OR ${expr} NOT ILIKE ${pushParam(state, `%${escapeLike(val)}%`)})`;
      case 'starts_with':   return `(${expr} ILIKE ${pushParam(state, `${escapeLike(val)}%`)})`;
      case 'ends_with':     return `(${expr} ILIKE ${pushParam(state, `%${escapeLike(val)}`)})`;
      case 'equals':        return `(${expr} = ${pushParam(state, String(val ?? ''))})`;
      case 'not_equals':    return `(${expr} IS DISTINCT FROM ${pushParam(state, String(val ?? ''))})`;
      case 'is_empty':      return `(${expr} IS NULL OR ${expr} = '')`;
      case 'is_not_empty':  return `(${expr} IS NOT NULL AND ${expr} <> '')`;
      case 'in': {
        const arr = Array.isArray(val) ? val : String(val || '').split(',').map(s => s.trim()).filter(Boolean);
        if (arr.length === 0) return 'FALSE';
        return `(${expr} = ANY(${pushParam(state, arr)}::text[]))`;
      }
      case 'not_in': {
        const arr = Array.isArray(val) ? val : String(val || '').split(',').map(s => s.trim()).filter(Boolean);
        if (arr.length === 0) return 'TRUE';
        return `(${expr} IS NULL OR ${expr} <> ALL(${pushParam(state, arr)}::text[]))`;
      }
      case 'regex': {
        const safe = sanitizeRegexOrFallback(val);
        if (safe === null) return 'FALSE'; // reject pathological/overlong patterns
        return `(${expr} ~ ${pushParam(state, safe)})`;
      }
      case 'not_regex': {
        const safe = sanitizeRegexOrFallback(val);
        if (safe === null) return 'TRUE';
        return `(${expr} IS NULL OR ${expr} !~ ${pushParam(state, safe)})`;
      }
    }
  }

  // Array/JSONB operators — primarily for label_resource_names (jsonb array)
  if (type === 'array_jsonb') {
    const arr = Array.isArray(val) ? val : [];
    switch (op) {
      case 'any_of':
      case 'contains_any':
        if (arr.length === 0) return 'FALSE';
        return `(${expr} ?| ${pushParam(state, arr)}::text[])`;
      case 'all_of':
      case 'contains_all':
        if (arr.length === 0) return 'TRUE';
        return `(${expr} ?& ${pushParam(state, arr)}::text[])`;
      case 'none_of':
        if (arr.length === 0) return 'TRUE';
        return `NOT (${expr} ?| ${pushParam(state, arr)}::text[])`;
      case 'is_empty':
        return `(${expr} IS NULL OR jsonb_array_length(${expr}) = 0)`;
      case 'is_not_empty':
        return `(${expr} IS NOT NULL AND jsonb_array_length(${expr}) > 0)`;
    }
  }

  // Numeric operators (integer slot, counts, etc.)
  if (type === 'number') {
    const n = Number(val);
    switch (op) {
      case 'equals':       return `(${expr} = ${pushParam(state, n)})`;
      case 'not_equals':   return `(${expr} IS DISTINCT FROM ${pushParam(state, n)})`;
      case 'gt':           return `(${expr} > ${pushParam(state, n)})`;
      case 'lt':           return `(${expr} < ${pushParam(state, n)})`;
      case 'gte':          return `(${expr} >= ${pushParam(state, n)})`;
      case 'lte':          return `(${expr} <= ${pushParam(state, n)})`;
      case 'is_empty':     return `(${expr} IS NULL)`;
      case 'is_not_empty': return `(${expr} IS NOT NULL)`;
      case 'in': {
        const arr = Array.isArray(val) ? val.map(Number).filter(x => !isNaN(x)) : [];
        if (arr.length === 0) return 'FALSE';
        return `(${expr} = ANY(${pushParam(state, arr)}::int[]))`;
      }
    }
  }

  // Boolean operators
  if (type === 'boolean') {
    switch (op) {
      case 'is_true':  return `(${expr} = true)`;
      case 'is_false': return `(${expr} = false OR ${expr} IS NULL)`;
    }
  }

  return 'TRUE';
}

function compileNode(node, fieldMap, state) {
  if (!node || typeof node !== 'object') return 'TRUE';

  // Group
  if (Array.isArray(node.children)) {
    if (node.children.length === 0) return 'TRUE';
    const op = node.op === 'OR' ? 'OR' : 'AND';
    const parts = node.children
      .map(child => compileNode(child, fieldMap, state))
      .filter(s => s && s !== 'TRUE' && s !== '');
    if (parts.length === 0) return 'TRUE';
    if (parts.length === 1) return parts[0];
    return `(${parts.join(` ${op} `)})`;
  }

  // Leaf
  if (node.field && node.operator) {
    return compileLeaf(node, fieldMap, state);
  }

  return 'TRUE';
}

/**
 * @param {Object} rule        root rule tree
 * @param {Object} fieldMap    { [fieldName]: { expr: string, type: 'text'|'array_jsonb'|'number'|'boolean' } }
 * @param {Object} options     { startParamIndex: number, initialParams: [] }
 * @returns {{ sql: string, params: any[], nextIndex: number }}
 */
function compileRule(rule, fieldMap, { startParamIndex = 1, initialParams = [] } = {}) {
  const state = {
    params: [...initialParams],
    nextIndex: startParamIndex,
  };
  if (!rule || typeof rule !== 'object') {
    return { sql: 'TRUE', params: state.params, nextIndex: state.nextIndex };
  }
  const sql = compileNode(rule, fieldMap, state);
  return { sql, params: state.params, nextIndex: state.nextIndex };
}

module.exports = { compileRule };
