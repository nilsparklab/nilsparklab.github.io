(function () {
  'use strict';

  const MAX_STEPS = 8;
  const MAX_GOAL = 300;

  const TASKS = Object.freeze({
    'explain-and-viva': Object.freeze({
      label: 'Explain + Viva',
      intent: 'Teach the concept, then prepare viva questions.',
      tools: ['practical_viva']
    }),
    'check-circuit-and-troubleshoot': Object.freeze({
      label: 'Check Circuit + Troubleshoot',
      intent: 'Inspect the current circuit and rank likely faults.',
      tools: ['circuit_analyze', 'fault_finder']
    }),
    'research-topic': Object.freeze({
      label: 'Research Topic',
      intent: 'Collect external research sources for a topic.',
      tools: ['web_search', 'research_search', 'literature_search', 'books_search']
    })
  });

  function clean(value, max = MAX_GOAL) {
    const s = typeof value === 'string' ? value.trim() : '';
    return s.length > max ? s.slice(0, max) : s;
  }

  function getTask(id) {
    return TASKS[id] || null;
  }

  function plan(id, goal) {
    const task = getTask(id);
    if (!task) return { ok: false, code: 'TASK_NOT_ALLOWED', message: 'This task is not available.' };
    const steps = task.tools.slice(0, MAX_STEPS).map((tool, i) => ({
      number: i + 1,
      tool,
      purpose: i === 0 ? task.intent : 'Refine the result using the previous step.'
    }));
    return {
      ok: true,
      taskId: id,
      label: task.label,
      goal: clean(goal),
      requiresApproval: task.tools.some(tool => {
        const defs = window.NIL_ASSISTANT_TOOLS && window.NIL_ASSISTANT_TOOLS.definitions;
        return defs && defs[tool] && defs[tool].requiresApproval === true;
      }),
      steps
    };
  }

  function renderPlan(result) {
    const host = document.getElementById('elab-smart-content');
    if (!host || !result) return;
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    if (result.ok !== true) {
      host.innerHTML = '<div class="sa-answer"><b>Agentic Task Mode</b><br>' + esc(result.message) + '</div>';
      return;
    }
    const steps = result.steps.map(s => '<div class="nil-agent-step"><span>' + s.number + '</span><div><b>' + esc(s.tool) + '</b><small>' + esc(s.purpose) + '</small></div></div>').join('');
    const approval = result.requiresApproval
      ? '<div class="nil-agent-approval">External tools in this plan require explicit user approval before execution.</div>'
      : '<div class="nil-agent-safe">This plan uses local/read-only tools only.</div>';
    host.innerHTML = '<div class="nil-agent-card"><div class="nil-agent-head"><b>🧠 Agentic Task Mode</b><span>Plan first</span></div>' +
      '<div class="nil-agent-goal"><b>Goal:</b> ' + esc(result.goal || 'Not specified') + '</div>' +
      '<div class="nil-agent-steps">' + steps + '</div>' + approval +
      '<button type="button" class="nil-agent-cancel" data-agent-cancel="1">Cancel</button></div>';
    const cancel = host.querySelector('[data-agent-cancel]');
    if (cancel) cancel.addEventListener('click', () => host.innerHTML = '');
  }

  async function executePlan(result, options = {}) {
    if (!result || result.ok !== true) return result;
    const router = window.NIL_ASSISTANT_TOOLS;
    if (!router || typeof router.invoke !== 'function') {
      return { ok: false, code: 'TOOL_ROUTER_UNAVAILABLE', message: 'Tool router is not available.' };
    }
    const outputs = [];
    for (const step of result.steps.slice(0, MAX_STEPS)) {
      if (options.cancelled && options.cancelled()) return { ok: false, code: 'TASK_CANCELLED', outputs };
      const needsApproval = router.definitions && router.definitions[step.tool] && router.definitions[step.tool].requiresApproval === true;
      if (needsApproval && options.approved !== true) {
        return { ok: false, code: 'APPROVAL_REQUIRED', message: 'Approval is required before external tools can execute.', outputs, pendingStep: step };
      }
      let input = {};
      if (step.tool === 'fault_finder' || step.tool === 'circuit_analyze') input = { symptom: result.goal };
      else if (step.tool === 'practical_viva') input = { query: result.goal };
      else input = { query: result.goal };
      const output = await router.invoke(step.tool, input, { approved: options.approved === true });
      outputs.push({ step: step.number, tool: step.tool, output });
      if (!output || output.ok !== true) {
        return { ok: false, code: output && output.code || 'TASK_STEP_FAILED', message: output && output.message || 'A task step failed safely.', outputs, failedStep: step };
      }
    }
    return { ok: true, taskId: result.taskId, goal: result.goal, outputs };
  }

  window.NIL_AGENTIC_TASKS = Object.freeze({
    tasks: TASKS,
    getTask,
    plan,
    renderPlan,
    executePlan,
    version: 'v93'
  });
})();
