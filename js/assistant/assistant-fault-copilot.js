(function () {
  'use strict';

  const MAX_SYMPTOM = 300;
  const MAX_FINDINGS = 6;

  function str(value, max = MAX_SYMPTOM) {
    const s = typeof value === 'string' ? value.trim() : '';
    return s.length > max ? s.slice(0, max) : s;
  }
  function lower(value) { return str(value).toLowerCase(); }
  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function getState() {
    try {
      if (window.ElectroLabBuilderState && typeof window.ElectroLabBuilderState === 'object') return window.ElectroLabBuilderState;
    } catch (_) {}
    return { components: [], wires: [] };
  }
  function components() {
    const s = getState();
    return Array.isArray(s.components) ? s.components.slice(0, 200) : [];
  }
  function wires() {
    const s = getState();
    return Array.isArray(s.wires) ? s.wires.slice(0, 400) : [];
  }
  function typeOf(c) {
    return str(c && (c.type || c.kind || c.componentType), 80).toLowerCase().replace(/[\s-]+/g, '_');
  }
  function valueOf(c, keys) {
    for (const key of keys) {
      const raw = c && c[key] !== undefined ? c[key] : (c && c.properties ? c.properties[key] : undefined);
      const n = num(raw);
      if (n !== null) return n;
    }
    return null;
  }
  function nameOf(c) { return str(c && (c.name || c.type || c.id), 80) || 'component'; }
  function endpointId(p) {
    return p && p.compId != null ? String(p.compId) : '';
  }
  function endpointTerm(p) {
    return p && p.term != null ? String(p.term) : '';
  }
  function connectedPairs() {
    return wires().map(w => ({
      a: endpointId(w && w.from),
      at: endpointTerm(w && w.from),
      b: endpointId(w && w.to),
      bt: endpointTerm(w && w.to)
    })).filter(x => x.a && x.at && x.b && x.bt);
  }
  function sim() {
    try {
      const s = window.NILSparkLabLastSimulation || window.ElectroLabSimulationState;
      if (!s || typeof s !== 'object') return null;
      return {
        voltage: num(s.voltage),
        current: num(s.current),
        power: num(s.power),
        health: str(s.health, 60),
        note: str(s.note, 220)
      };
    } catch (_) { return null; }
  }
  function circuit() {
    try {
      return window.NILCircuitAwareAssistant && typeof window.NILCircuitAwareAssistant.analyze === 'function'
        ? window.NILCircuitAwareAssistant.analyze()
        : null;
    } catch (_) { return null; }
  }
  function hasType(cs, types) { return cs.some(c => types.has(typeOf(c))); }
  function connectedTerm(pairs, id, term) {
    return pairs.some(x => (x.a === String(id) && x.at === term) || (x.b === String(id) && x.bt === term));
  }
  function issueScore(base, evidence) {
    return Math.min(100, base + Math.min(30, evidence * 10));
  }
  function add(list, key, title, level, confidence, evidence, detail, checks) {
    if (list.some(x => x.key === key)) return;
    list.push({
      key, title, level,
      confidence: Math.max(1, Math.min(100, confidence)),
      evidence,
      detail,
      checks: checks || []
    });
  }

  function diagnose(symptom) {
    const q = lower(symptom);
    const cs = components();
    const ws = wires();
    const pairs = connectedPairs();
    const a = circuit();
    const s = sim();
    const findings = [];
    const safety = [
      'This is a virtual/evidence-based diagnosis, not a certification of a real electrical installation.',
      'Before physical troubleshooting, isolate power and follow the applicable electrical safety procedure.'
    ];

    if (!cs.length) {
      add(findings, 'empty-circuit', 'No circuit is present', 'high', 98, 3,
        'The Builder currently has no components, so a component-level fault diagnosis cannot be performed.',
        ['Add the intended circuit first.', 'Then run the diagnosis again.']);
      return { ok: true, symptom: str(symptom), findings, safety, evidence: { componentCount: 0, wireCount: ws.length, simulation: s } };
    }

    const sourceTypes = new Set(['battery','source','dc_source','ac_source','generator']);
    const loadTypes = new Set(['led','lamp','motor','resistor','heater','buzzer','relay','solenoid']);
    const sources = cs.filter(c => sourceTypes.has(typeOf(c)));
    const loads = cs.filter(c => loadTypes.has(typeOf(c)));
    const leds = cs.filter(c => typeOf(c) === 'led');
    const motors = cs.filter(c => typeOf(c) === 'motor');
    const resistors = cs.filter(c => ['resistor','potentiometer'].includes(typeOf(c)));
    const switches = cs.filter(c => ['switch','push_button','two_way_switch'].includes(typeOf(c)));

    if (!sources.length) {
      add(findings, 'no-source', 'Power source missing', 'high', issueScore(70, 2), 2,
        'No recognized source is present in the live Builder state.',
        ['Add/select the intended low-voltage source.', 'Confirm the source is enabled in the simulation.']);
    }

    if (a && a.issues && a.issues.length) {
      a.issues.slice(0, 4).forEach((issue, i) => {
        add(findings, 'struct-' + i, 'Structural circuit issue', 'high', issueScore(64, 2), 2,
          String(issue), ['Inspect the referenced component or wire.', 'Re-run the circuit analysis after correction.']);
      });
    }

    const sourceIds = new Set(sources.map(c => c && c.id != null ? String(c.id) : '').filter(Boolean));
    const adjacency = new Map();
    pairs.forEach(p => {
      if (!adjacency.has(p.a)) adjacency.set(p.a, new Set());
      if (!adjacency.has(p.b)) adjacency.set(p.b, new Set());
      adjacency.get(p.a).add(p.b);
      adjacency.get(p.b).add(p.a);
    });
    const reachable = new Set(sourceIds);
    const queue = [...sourceIds];
    while (queue.length) {
      const id = queue.shift();
      const next = adjacency.get(id);
      if (!next) continue;
      next.forEach(n => { if (!reachable.has(n)) { reachable.add(n); queue.push(n); } });
    }
    const locallyDisconnected = loads.filter(c => c && c.id != null && !reachable.has(String(c.id)));
    const incompletelyWired = loads.filter(c => {
      if (!c || c.id == null) return false;
      const id = String(c.id);
      const terminalCount = new Set();
      pairs.forEach(p => {
        if (p.a === id && p.at) terminalCount.add(p.at);
        if (p.b === id && p.bt) terminalCount.add(p.bt);
      });
      return terminalCount.size === 1;
    });
    if ((a && a.disconnectedLoads && a.disconnectedLoads.length) || locallyDisconnected.length || incompletelyWired.length) {
      const flagged = new Map();
      [...locallyDisconnected, ...incompletelyWired].forEach(c => flagged.set(String(c.id), c));
      const names = [...flagged.values()].map(nameOf);
      add(findings, 'disconnected-load', 'Load path is disconnected', 'high', 93, 3,
        names.length
          ? names.join(', ') + ' has an incomplete or unreachable connection path in the live wire graph.'
          : 'At least one detected load is not reachable from the first detected source through the current wiring graph.',
        ['Trace source → protection/control → load.', 'Check both terminals of the affected load.']);
    }

    if (a && a.floating && a.floating.length) {
      add(findings, 'floating-terminal', 'One or more expected terminals are floating', 'medium', 84, 2,
        'The current terminal map shows unconnected terminals on one or more components.',
        ['Inspect the listed component terminals.', 'Reconnect only the intended nodes.']);
    }

    if (leds.length) {
      const hasResistor = resistors.length > 0;
      if (!hasResistor) {
        add(findings, 'led-no-resistor', 'LED current-limiting resistor missing', 'high', 97, 3,
          'An LED is present but no resistor/potentiometer is detected in the circuit metadata.',
          ['Add a suitable series current-limiting resistor in the educational model.', 'Re-simulate and check LED current.']);
      }
      leds.forEach((led) => {
        const id = led && led.id != null ? String(led.id) : '';
        const anode = connectedTerm(pairs, id, 'A');
        const cathode = connectedTerm(pairs, id, 'K');
        if (!anode || !cathode) {
          add(findings, 'led-open-' + id, 'LED terminal not fully connected', 'high', 92, 3,
            'The LED does not have both A and K terminals represented in the live wire graph.',
            ['Check LED anode (A) and cathode (K) connections.']);
        }
      });
    }

    if (q && /(motor|motor|मोटर)/i.test(q) && motors.length) {
      const disconnected = a && a.disconnectedLoads && a.disconnectedLoads.some(x => /motor/i.test(x));
      if (disconnected || !sources.length) {
        add(findings, 'motor-path', 'Motor supply path is interrupted', 'high', 91, 3,
          'The motor is present, but the source path is missing or disconnected according to the live topology.',
          ['Check source → control device → motor path.', 'Check the simulated switch/contactor state before re-running.']);
      } else {
        add(findings, 'motor-control', 'Motor control state needs verification', 'medium', 70, 1,
          'The topology alone cannot prove motor start conditions such as interlocks, overload state, or control-device state.',
          ['Check control-device state and interlocks in the dedicated motor/industrial lab.', 'Re-run simulation and compare current.']);
      }
    }

    if (switches.length && q && /(not\s*working|doesn.?t work|start|on|off|switch|button|स्टार्ट|नहीं चल|नहीं हो)/i.test(q)) {
      const openish = switches.filter(c => {
        const raw = c && (c.state ?? c.closed ?? c.isClosed);
        return raw === false || String(raw).toLowerCase() === 'open';
      });
      if (openish.length) {
        add(findings, 'switch-open', 'Control switch appears open', 'medium', 88, 2,
          openish.map(nameOf).join(', ') + ' has an open/false state in component metadata.',
          ['Close/activate the intended switch in the simulation.', 'Then re-run the diagnosis.']);
      }
    }

    if (s) {
      if (s.health && /(fail|error|fault)/i.test(s.health)) {
        add(findings, 'sim-health', 'Latest simulation reports a fault state', 'high', 95, 3,
          'Simulation health is "' + s.health + '". ' + (s.note || ''),
          ['Inspect the simulation message first.', 'Correct the cited circuit condition and simulate again.']);
      }
      if (s.current !== null && s.current > 1) {
        add(findings, 'high-current', 'High simulated current', 'high', 94, 3,
          'Latest telemetry shows approximately ' + s.current.toFixed(3) + ' A.',
          ['Check for unintended short/low-resistance paths.', 'Verify source/current limits and component ratings before any real-hardware comparison.']);
      }
      if (s.power !== null && s.power > 0.25) {
        add(findings, 'power', 'Elevated simulated power', 'medium', 78, 2,
          'Latest telemetry shows approximately ' + s.power.toFixed(3) + ' W. This is a diagnostic flag, not a universal component-rating limit.',
          ['Check component-level power ratings where model data exists.', 'Re-simulate after correcting values or topology.']);
      }
    }

    if (q && /(overheat|hot|burn|smoke|जल|गरम|heat|फ्यूज|fuse|blow|short|overcurrent|ओवरकरंट)/i.test(q)) {
      const lowR = resistors.filter(c => {
        const r = valueOf(c, ['resistance','r','ohms','value']);
        return r !== null && r > 0 && r < 10;
      });
      if (lowR.length) {
        add(findings, 'low-resistance', 'Very low resistance detected', 'medium', 82, 2,
          lowR.map(nameOf).join(', ') + ' has a resistance below 10 Ω.',
          ['Check whether the low value is intentional.', 'Compare simulated current and power with the component model.']);
      }
    }

    if (!findings.length) {
      add(findings, 'no-obvious-fault', 'No obvious rule-based fault found', 'info', 58, 0,
        'The available topology, component metadata, symptom text, and latest telemetry do not identify a strong candidate fault.',
        ['Run the full simulation.', 'Inspect actual component-level values and states.', 'Use the dedicated lab fault trainer when applicable.']);
    }

    findings.sort((x, y) => {
      const rank = { high: 3, medium: 2, info: 1 };
      return (rank[y.level] - rank[x.level]) || (y.confidence - x.confidence) || (y.evidence - x.evidence);
    });

    return {
      ok: true,
      symptom: str(symptom),
      findings: findings.slice(0, MAX_FINDINGS),
      safety,
      evidence: {
        componentCount: cs.length,
        wireCount: ws.length,
        sources: sources.map(nameOf),
        loads: loads.map(nameOf),
        simulation: s
      }
    };
  }

  function render(result) {
    const host = document.getElementById('elab-smart-content');
    if (!host) return;
    const hi = typeof currentLang !== 'undefined' && currentLang === 'hi';
    const title = hi ? '🔍 Fault Finder Copilot' : '🔍 Fault Finder Copilot';
    const sub = hi ? 'Evidence-based diagnosis' : 'Evidence-based diagnosis';
    if (!result || result.ok !== true) {
      host.innerHTML = '<div class="sa-answer"><b>' + title + '</b><br>Unable to analyze the current circuit.</div>';
      return;
    }
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    const levelLabel = hi ? {high:'High', medium:'Medium', info:'Info'} : {high:'High', medium:'Medium', info:'Info'};
    let body = '<div class="nil-fault-card"><div class="nil-fault-head"><b>' + title + '</b><span>' + sub + '</span></div>';
    if (result.symptom) body += '<div class="nil-fault-symptom"><b>Symptom:</b> ' + esc(result.symptom) + '</div>';
    body += '<div class="nil-fault-findings">';
    result.findings.forEach((f, i) => {
      body += '<div class="nil-fault-item ' + esc(f.level) + '"><div><b>' + (i + 1) + '. ' + esc(f.title) + '</b><span class="nil-fault-level">' + levelLabel[f.level] + ' · ' + f.confidence + '% confidence</span></div>';
      body += '<div class="nil-fault-detail">' + esc(f.detail) + '</div>';
      if (Array.isArray(f.checks) && f.checks.length) body += '<div class="nil-fault-check"><b>Check:</b> ' + f.checks.map(esc).join(' • ') + '</div>';
      body += '</div>';
    });
    body += '</div>';
    if (result.evidence) {
      body += '<div class="nil-fault-evidence"><b>Evidence:</b> ' + result.evidence.componentCount + ' components · ' + result.evidence.wireCount + ' wires';
      if (result.evidence.simulation) {
        const s = result.evidence.simulation;
        body += ' · Simulation ' + (s.voltage !== null ? esc(s.voltage.toFixed(3)) + ' V' : '—') + ' / ' +
          (s.current !== null ? esc(s.current.toFixed(3)) + ' A' : '—') + ' / ' +
          (s.power !== null ? esc(s.power.toFixed(3)) + ' W' : '—');
      }
      body += '</div>';
    }
    body += '<div class="nil-fault-safety"><b>Safety:</b> ' + result.safety.map(esc).join(' ') + '</div></div>';
    host.innerHTML = body;
  }

  function run(symptom) {
    const q = str(symptom);
    const result = diagnose(q);
    render(result);
    try {
      window.dispatchEvent(new CustomEvent('electrolab:fault-copilot-complete', { detail: result }));
    } catch (_) {}
    return result;
  }

  window.NIL_FAULT_COPILOT = Object.freeze({ diagnose, render, run, version: 'v89' });
})();
