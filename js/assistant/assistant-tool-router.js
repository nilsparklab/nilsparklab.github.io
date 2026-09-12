(function () {
  'use strict';

  const MAX_QUERY = 160;

  function text(value, max = MAX_QUERY) {
    const s = typeof value === 'string' ? value.trim() : '';
    return s.length > max ? s.slice(0, max) : s;
  }

  function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  const TOOL_DEFS = Object.freeze({
    calculator: Object.freeze({
      description: 'Evaluate a basic numeric expression.',
      requiresApproval: false
    }),
    circuit_analyze: Object.freeze({
      description: 'Read-only analysis of the current circuit.',
      requiresApproval: false
    }),
    fault_finder: Object.freeze({
      description: 'Evidence-ranked, read-only fault diagnosis for the current circuit.',
      requiresApproval: false
    }),
    practical_viva: Object.freeze({
      description: 'Generate a practical experiment guide and viva questions from the built-in educational experiment set.',
      requiresApproval: false
    }),
    agentic_task_plan: Object.freeze({
      description: 'Create a bounded multi-step plan from approved task templates; does not execute tools.',
      requiresApproval: false
    }),
    web_search: Object.freeze({
      description: 'Search Wikimedia through the NIL gateway.',
      requiresApproval: true
    }),
    research_search: Object.freeze({
      description: 'Search Crossref through the NIL gateway.',
      requiresApproval: true
    }),
    literature_search: Object.freeze({
      description: 'Search Europe PMC through the NIL gateway.',
      requiresApproval: true
    }),
    books_search: Object.freeze({
      description: 'Search Open Library through the NIL gateway.',
      requiresApproval: true
    })
  });

  function getTools() {
    return Object.keys(TOOL_DEFS);
  }

  function isAllowed(tool) {
    return Object.prototype.hasOwnProperty.call(TOOL_DEFS, tool);
  }

  // Safe recursive-descent evaluator for basic arithmetic. No eval(), no
  // Function(), no code execution of any kind — the input is only ever
  // interpreted as numbers and the operators below, so there is nothing
  // for a future regex gap or edge case to inject arbitrary JS through.
  function evaluateArithmetic(raw) {
    let i = 0;
    const n = raw.length;

    function peek() { return raw[i]; }
    function skipSpace() { while (i < n && raw[i] === ' ') i += 1; }

    function parseNumber() {
      skipSpace();
      const start = i;
      while (i < n && /[0-9.]/.test(raw[i])) i += 1;
      if (i === start) throw new Error('expected number');
      const str = raw.slice(start, i);
      if ((str.match(/\./g) || []).length > 1) throw new Error('bad number');
      const val = Number(str);
      if (!Number.isFinite(val)) throw new Error('bad number');
      return val;
    }

    function parseUnary() {
      skipSpace();
      if (peek() === '+') { i += 1; return parseUnary(); }
      if (peek() === '-') { i += 1; return -parseUnary(); }
      return parseAtom();
    }

    function parseAtom() {
      skipSpace();
      if (peek() === '(') {
        i += 1;
        const val = parseExpression();
        skipSpace();
        if (peek() !== ')') throw new Error('expected )');
        i += 1;
        return val;
      }
      return parseNumber();
    }

    // exponentiation: right-associative, binds tighter than * / %
    function parsePower() {
      const base = parseUnary();
      skipSpace();
      if (peek() === '^') {
        i += 1;
        const exp = parsePower();
        return Math.pow(base, exp);
      }
      return base;
    }

    function parseTerm() {
      let val = parsePower();
      for (;;) {
        skipSpace();
        const op = peek();
        if (op === '*' || op === '/' || op === '%') {
          i += 1;
          const rhs = parsePower();
          if (op === '*') val *= rhs;
          else if (op === '/') val /= rhs;
          else val %= rhs;
        } else {
          break;
        }
      }
      return val;
    }

    function parseExpression() {
      let val = parseTerm();
      for (;;) {
        skipSpace();
        const op = peek();
        if (op === '+' || op === '-') {
          i += 1;
          const rhs = parseTerm();
          val = op === '+' ? val + rhs : val - rhs;
        } else {
          break;
        }
      }
      return val;
    }

    const result = parseExpression();
    skipSpace();
    if (i !== n) throw new Error('unexpected trailing input');
    return result;
  }

  function calculator(expression) {
    const raw = text(expression, 120);
    if (!raw || !/^[0-9+\-*/().%\s^]+$/.test(raw)) {
      return { ok: false, code: 'INVALID_EXPRESSION', message: 'Only a basic numeric expression is allowed.' };
    }
    try {
      const result = evaluateArithmetic(raw);
      if (!Number.isFinite(result)) {
        return { ok: false, code: 'NON_FINITE_RESULT', message: 'The calculation did not produce a finite result.' };
      }
      return { ok: true, result: number(result) };
    } catch (_) {
      return { ok: false, code: 'CALCULATION_ERROR', message: 'The expression could not be evaluated.' };
    }
  }

  async function invoke(tool, input, options = {}) {
    if (!isAllowed(tool)) {
      return { ok: false, code: 'TOOL_NOT_ALLOWED', message: 'This tool is not available.' };
    }

    if (TOOL_DEFS[tool].requiresApproval && options.approved !== true) {
      return { ok: false, code: 'APPROVAL_REQUIRED', message: 'This external tool requires explicit user approval.' };
    }

    if (tool === 'calculator') {
      return calculator(input && input.expression);
    }

    if (tool === 'circuit_analyze') {
      const api = window.NILCircuitAwareAssistant;
      if (!api || typeof api.analyze !== 'function') {
        return { ok: false, code: 'TOOL_UNAVAILABLE', message: 'Circuit analysis is not available right now.' };
      }
      return { ok: true, data: api.analyze() };
    }

    if (tool === 'fault_finder') {
      const api = window.NIL_FAULT_COPILOT;
      if (!api || typeof api.diagnose !== 'function') {
        return { ok: false, code: 'TOOL_UNAVAILABLE', message: 'Fault Finder Copilot is not available right now.' };
      }
      return { ok: true, data: api.diagnose(input && input.symptom) };
    }

    if (tool === 'practical_viva') {
      const api = window.NIL_PRACTICAL_VIVA;
      if (!api || typeof api.build !== 'function') {
        return { ok: false, code: 'TOOL_UNAVAILABLE', message: 'Practical Assistant is not available right now.' };
      }
      const id = input && input.experimentId ? String(input.experimentId) : api.detectExperiment(input && input.query, '');
      if (!id) {
        return { ok: false, code: 'EXPERIMENT_NOT_FOUND', message: 'Choose or name a supported experiment.' };
      }
      return { ok: true, data: api.build(id) };
    }

    if (tool === 'agentic_task_plan') {
      const api = window.NIL_AGENTIC_TASKS;
      if (!api || typeof api.plan !== 'function') {
        return { ok: false, code: 'TOOL_UNAVAILABLE', message: 'Agentic task planner is not available right now.' };
      }
      return { ok: true, data: api.plan(input && input.taskId, input && input.goal) };
    }

    const client = window.NIL_API;
    if (!client) {
      return { ok: false, code: 'API_NOT_CONFIGURED', message: 'External search is not configured.' };
    }

    const query = text(input && input.query);
    if (!query) {
      return { ok: false, code: 'QUERY_REQUIRED', message: 'A search query is required.' };
    }

    try {
      let data;
      if (tool === 'web_search') data = await client.wikiSearch(query, 5);
      else if (tool === 'research_search' && typeof client.researchSearch === 'function') data = await client.researchSearch(query, 5);
      else if (tool === 'literature_search' && typeof client.literatureSearch === 'function') data = await client.literatureSearch(query, 5);
      else if (tool === 'books_search' && typeof client.bookSearch === 'function') data = await client.bookSearch(query, 5);
      else return { ok: false, code: 'TOOL_UNAVAILABLE', message: 'This provider is not available in the current build.' };
      if (window.NIL_ASSISTANT_CITATION_INTEGRATION && typeof window.NIL_ASSISTANT_CITATION_INTEGRATION.augment === 'function') {
        const providerName = tool === 'web_search' ? 'Wikimedia' :
          tool === 'research_search' ? 'Crossref' :
          tool === 'literature_search' ? 'Europe PMC' : 'Open Library';
        data = window.NIL_ASSISTANT_CITATION_INTEGRATION.augment(data, providerName);
      }
      return { ok: true, data };
    } catch (error) {
      return {
        ok: false,
        code: error && error.code || 'TOOL_ERROR',
        message: error && error.message || 'The tool request failed safely.'
      };
    }
  }

  window.NIL_ASSISTANT_TOOLS = Object.freeze({
    getTools,
    isAllowed,
    definitions: TOOL_DEFS,
    invoke
  });
})();
