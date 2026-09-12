(function () {
  'use strict';

  const MAX_MESSAGES = 12;
  const MAX_TEXT = 800;

  function clip(value, max = MAX_TEXT) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length > max ? text.slice(0, max) : text;
  }

  const state = {
    conversation: [],
    selectedComponent: null,
    circuit: null,
    simulation: null
  };

  function pushConversation(role, text) {
    const cleanRole = role === 'assistant' ? 'assistant' : 'user';
    const cleanText = clip(text);
    if (!cleanText) return;
    state.conversation.push({ role: cleanRole, text: cleanText });
    if (state.conversation.length > MAX_MESSAGES) {
      state.conversation.splice(0, state.conversation.length - MAX_MESSAGES);
    }
  }

  function setSelectedComponent(component) {
    state.selectedComponent = component && typeof component === 'object'
      ? {
          id: clip(component.id, 120),
          name: clip(component.name, 160),
          type: clip(component.type, 120),
          value: clip(String(component.value ?? ''), 120)
        }
      : null;
  }

  function setCircuit(circuit) {
    state.circuit = circuit && typeof circuit === 'object'
      ? {
          componentCount: Number.isFinite(circuit.componentCount) ? circuit.componentCount : null,
          connectionCount: Number.isFinite(circuit.connectionCount) ? circuit.connectionCount : null,
          summary: clip(circuit.summary || '', 500)
        }
      : null;
  }

  function setSimulation(simulation) {
    state.simulation = simulation && typeof simulation === 'object'
      ? {
          status: clip(simulation.status || '', 80),
          voltage: simulation.voltage ?? null,
          current: simulation.current ?? null,
          power: simulation.power ?? null,
          summary: clip(simulation.summary || '', 500)
        }
      : null;
  }

  function captureLiveBuilderContext() {
    try {
      const state = window.NilSparkLabBuilderState;
      if (state && typeof state === 'object') {
        const components = Array.isArray(state.components) ? state.components : [];
        const wires = Array.isArray(state.wires) ? state.wires : [];
        state.circuit = state.circuit;
        setCircuit({
          componentCount: components.length,
          connectionCount: wires.length,
          summary: components.length ? 'Live Builder circuit' : 'Canvas empty'
        });
      }
      const sim = window.NILSparkLabLastSimulation || window.NilSparkLabSimulationState;
      if (sim && typeof sim === 'object') setSimulation(sim);
    } catch (_) {}
  }

  function getSnapshot() {
    captureLiveBuilderContext();
    return JSON.parse(JSON.stringify(state));
  }

  function buildPromptContext() {
    captureLiveBuilderContext();
    const lines = [];

    if (state.selectedComponent?.name) {
      lines.push(`Selected component: ${state.selectedComponent.name}${state.selectedComponent.value ? ` (${state.selectedComponent.value})` : ''}`);
    }
    if (state.circuit?.summary || state.circuit?.componentCount !== null) {
      lines.push(`Circuit: ${state.circuit.summary || `${state.circuit.componentCount} components, ${state.circuit.connectionCount ?? 0} connections`}`);
    }
    if (state.simulation?.status || state.simulation?.summary) {
      lines.push(`Simulation: ${state.simulation.summary || state.simulation.status}`);
    }
    if (state.conversation.length) {
      const history = state.conversation.map(item => `${item.role}: ${item.text}`).join(' | ');
      lines.push(`Recent conversation: ${history}`);
    }
    return lines.join('\n');
  }

  window.NIL_ASSISTANT_CONTEXT = Object.freeze({
    pushConversation,
    setSelectedComponent,
    setCircuit,
    setSimulation,
    captureLiveBuilderContext,
    getSnapshot,
    buildPromptContext
  });
})();
