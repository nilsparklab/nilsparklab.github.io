(function () {
  'use strict';

  const MAX_EXPERIMENTS = 20;
  const EXPERIMENTS = Object.freeze({
    ohms_law: Object.freeze({
      title: "Ohm's Law",
      apparatus: ["DC supply", "Resistor", "Ammeter", "Voltmeter", "Connecting wires"],
      procedure: [
        "Build a simple source → resistor loop and place the ammeter in series.",
        "Place the voltmeter across the resistor.",
        "Apply a safe low-voltage value and record V and I.",
        "Repeat for a few supply/resistance values and calculate V/I."
      ],
      observation: "Record voltage (V), current (A), and calculated resistance V/I.",
      result: "For an approximately ohmic resistor, V/I remains approximately constant.",
      precautions: [
        "Use a low educational-lab voltage and a resistor value within the model rating.",
        "Never place an ideal ammeter directly across a voltage source."
      ],
      viva: [
        ["What is Ohm's Law?", "At constant physical conditions, V = I × R."],
        ["Unit of resistance?", "Ohm (Ω)."],
        ["Why is ammeter connected in series?", "To measure the current flowing through the branch."]
      ]
    }),
    series_parallel_resistors: Object.freeze({
      title: "Series and Parallel Resistors",
      apparatus: ["DC supply", "Resistors", "Ammeter", "Voltmeter", "Connecting wires"],
      procedure: [
        "Connect resistors in series and measure total voltage/current.",
        "Change to a parallel arrangement and repeat the measurements.",
        "Compare measured/equivalent resistance with the expected formulas."
      ],
      observation: "Record branch values, total current, total voltage, and equivalent resistance.",
      result: "Series resistance adds directly; parallel equivalent resistance is lower than the smallest branch resistance.",
      precautions: [
        "Verify the intended topology before energizing the simulated circuit.",
        "Keep source and resistor values within the educational model limits."
      ],
      viva: [
        ["Series current relationship?", "The same current flows through ideal series elements."],
        ["Parallel voltage relationship?", "Ideal parallel branches share the same node-to-node voltage."],
        ["Parallel equivalent resistance?", "1/R_eq = 1/R1 + 1/R2 + …"]
      ]
    }),
    dc_motor: Object.freeze({
      title: "DC Motor Basic Test",
      apparatus: ["DC source", "DC motor model", "Switch/control element", "Ammeter", "Connecting wires"],
      procedure: [
        "Connect the motor through the intended control path.",
        "Verify polarity and control state.",
        "Apply the permitted model supply and run the simulation.",
        "Observe start/current behavior and record the result."
      ],
      observation: "Record source voltage, simulated current, control state, and motor response.",
      result: "The motor should respond when the supply and control path satisfy the model conditions.",
      precautions: [
        "Use the model's rated/allowed supply range.",
        "Do not bypass overload/protection logic in a real installation."
      ],
      viva: [
        ["Why can a motor draw high starting current?", "Back EMF is initially low, so armature current can be relatively high."],
        ["What is the role of an overload relay?", "It protects against sustained overload current according to its setting."]
      ]
    })
  });

  function norm(value, max = 240) {
    const s = typeof value === 'string' ? value.trim() : '';
    return s.length > max ? s.slice(0, max) : s;
  }
  function detectExperiment(query, context) {
    const q = norm(query).toLowerCase();
    const c = norm(context).toLowerCase();
    if (/(ohm|ohm's|v\s*=\s*i|ओम|ओम का नियम)/i.test(q + ' ' + c)) return 'ohms_law';
    if (/(series|parallel|श्रृंखला|समानांतर|resistor)/i.test(q + ' ' + c)) return 'series_parallel_resistors';
    if (/(motor|मोटर|dc motor)/i.test(q + ' ' + c)) return 'dc_motor';
    return null;
  }
  function getExperiment(id) { return EXPERIMENTS[id] || null; }

  function viva(id, count) {
    const exp = getExperiment(id);
    if (!exp) return [];
    const n = Math.max(1, Math.min(Number(count) || 3, exp.viva.length));
    return exp.viva.slice(0, n).map((pair, i) => ({
      number: i + 1,
      question: pair[0],
      answer: pair[1]
    }));
  }

  function build(id) {
    const exp = getExperiment(id);
    if (!exp) return null;
    return {
      id,
      title: exp.title,
      apparatus: exp.apparatus.slice(0, MAX_EXPERIMENTS),
      procedure: exp.procedure,
      observation: exp.observation,
      result: exp.result,
      precautions: exp.precautions,
      viva: viva(id, 5)
    };
  }

  function render(id) {
    const exp = build(id);
    const host = document.getElementById('elab-smart-content');
    if (!host) return exp;
    if (!exp) {
      host.innerHTML = '<div class="sa-answer"><b>Practical Assistant</b><br>Experiment not found.</div>';
      return exp;
    }
    function esc(v) {
      return String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }
    const list = (items) => '<ul>' + items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const viva = exp.viva.map(v => '<div class="nil-practical-viva"><b>Q' + v.number + ':</b> ' + esc(v.question) + '<div><b>A:</b> ' + esc(v.answer) + '</div></div>').join('');
    host.innerHTML = '<div class="nil-practical-card">' +
      '<div class="nil-practical-head"><b>🧪 ' + esc(exp.title) + '</b><span>Practical + Viva</span></div>' +
      '<div class="nil-practical-section"><b>Apparatus</b>' + list(exp.apparatus) + '</div>' +
      '<div class="nil-practical-section"><b>Procedure</b>' + exp.procedure.map((x,i) => '<div>' + (i+1) + '. ' + esc(x) + '</div>').join('') + '</div>' +
      '<div class="nil-practical-section"><b>Observation</b><div>' + esc(exp.observation) + '</div></div>' +
      '<div class="nil-practical-section"><b>Result</b><div>' + esc(exp.result) + '</div></div>' +
      '<div class="nil-practical-section"><b>Precautions</b>' + list(exp.precautions) + '</div>' +
      '<div class="nil-practical-section"><b>Viva</b>' + viva + '</div>' +
      '</div>';
    return exp;
  }

  window.NIL_PRACTICAL_VIVA = Object.freeze({
    experiments: EXPERIMENTS,
    detectExperiment,
    getExperiment,
    viva,
    build,
    render,
    version: 'v91'
  });
})();
