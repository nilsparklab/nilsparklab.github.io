/* NIL SparkLab Stage 8 — read-only UCDM -> explicit simulation contract -> existing simulation boundary. */
(() => {
  "use strict";
  const U = window.NILSparkLabUCDM;
  const CONTRACT_VERSION = "1.0";
  const SUPPORTED = new Set([
    "source","resistor","potentiometer","ldr","thermistor","thermistor_ptc","capacitor","inductor","led","diode","motor","buzzer","fuse","relay","switch","push_button","reed_switch","dpdt_switch","ac_source","bridge_rectifier","lamp","ground","logic_gate","logic_input"
  ]);
  const UNSUPPORTED = new Set([
    "bjt_npn","p_mosfet","scr","triac","diac","ic_741","reg_7805","schmitt_trigger","ir_sensor","thermocouple"
  ]);

  function compatibility(model) {
    const errors = [], warnings = [], unsupported = [];
    if (!U || typeof U.validate !== "function") return {supported:false, errors:[{code:"UCDM_UNAVAILABLE", message:"UCDM validator unavailable"}], warnings, unsupportedComponents:unsupported};
    const checked = U.validate(model);
    if (!checked.valid) return {supported:false, errors:checked.errors.slice(), warnings, unsupportedComponents:unsupported};
    for (const c of model.components) {
      if (UNSUPPORTED.has(c.type) || !SUPPORTED.has(c.type)) unsupported.push({id:c.id,type:c.type});
    }
    if (unsupported.length) errors.push({code:"UNSUPPORTED_COMPONENT", message:"One or more components have no existing supported simulation model", components:unsupported.map(x=>x.id)});
    return {supported:errors.length===0, errors, warnings, unsupportedComponents:unsupported};
  }

  // Explicit, minimal contract consumed by the existing simulation boundary.
  // Components/wires retain the exact legacy simulation shape; nodes are carried
  // for topology provenance but are not required by the current solver.
  function validateSimulationInput(input) {
    const errors = [];
    if (!input || typeof input !== "object" || Array.isArray(input)) errors.push({code:"SIM_INPUT_TYPE", message:"Simulation input must be an object"});
    if (!Array.isArray(input?.components)) errors.push({code:"SIM_COMPONENTS", message:"Simulation input components must be an array"});
    if (!Array.isArray(input?.wires)) errors.push({code:"SIM_WIRES", message:"Simulation input wires must be an array"});
    if (!Array.isArray(input?.nodes)) errors.push({code:"SIM_NODES", message:"Simulation input nodes must be an array"});
    if (input?.contractVersion !== CONTRACT_VERSION) errors.push({code:"SIM_CONTRACT_VERSION", message:"Unsupported simulation contract version"});
    if (errors.length) return {valid:false, errors};

    const ids = new Set();
    for (const c of input.components) {
      if (!c || typeof c !== "object" || !c.id || !c.type) {
        errors.push({code:"SIM_COMPONENT_INVALID", message:"Simulation component is invalid"});
      } else if (ids.has(c.id)) {
        errors.push({code:"SIM_DUP_COMPONENT", message:`Duplicate simulation component ID: ${c.id}`});
      } else {
        ids.add(c.id);
        if (c.value !== undefined && c.value !== null) {
          const numericValue = typeof c.value === "number" ? c.value : (typeof c.value === "string" ? Number(c.value.trim()) : NaN);
          if (!Number.isFinite(numericValue)) errors.push({code:"SIM_VALUE_INVALID", message:`Invalid simulation value for component: ${c.id}`});
        }
      }
    }
    for (const w of input.wires) {
      if (!w || !w.from || !w.to || !ids.has(w.from.compId) || !ids.has(w.to.compId)) {
        errors.push({code:"SIM_WIRE_INVALID", message:"Simulation wire references invalid components"});
      }
    }
    return {valid:errors.length===0, errors};
  }

  function toSimulationInput(model) {
    const check = compatibility(model);
    if (!check.supported) throw new Error(check.errors[0].message);
    const legacy = U.toLegacy(model);
    const input = {
      contractVersion: CONTRACT_VERSION,
      components: legacy.components,
      wires: legacy.wires,
      nodes: model.nodes.map(n => ({
        nodeId: n.nodeId,
        pinIds: Array.isArray(n.pinIds) ? n.pinIds.slice() : [],
        reference: !!n.reference
      })),
      circuitId: model.circuitId,
      ucdmVersion: model.version
    };
    const checked = validateSimulationInput(input);
    if (!checked.valid) throw new Error(checked.errors[0].message);
    return Object.freeze(input);
  }

  function fromBuilder() {
    if (!U || typeof U.fromBuilder !== "function") throw new Error("UCDM unavailable");
    return U.fromBuilder();
  }

  function run(model) {
    const canonical = U && typeof U.deserialize === "function" ? U.deserialize(U.serialize(model)) : model;
    const input = toSimulationInput(canonical);
    if (typeof window.runBuilderSim !== "function") throw new Error("Existing simulation entry point unavailable");
    const state = window.ElectroLabBuilderState;
    if (!state || !Array.isArray(state.components) || !Array.isArray(state.wires) || typeof state.replace !== "function") {
      throw new Error("Existing Builder state bridge unavailable");
    }

    // Narrow compatibility bridge: the existing simulator reads its lexical
    // Builder arrays rather than accepting an explicit argument. Temporarily
    // expose the validated contract's legacy-compatible payload, invoke the
    // real simulation entry point, then restore the exact prior arrays.
    const previousComponents = state.components;
    const previousWires = state.wires;
    state.replace(input.components, input.wires);
    try {
      const result = window.runBuilderSim();
      return {input, result};
    } finally {
      // Restoration is unconditional so simulation exceptions cannot leak
      // temporary derived state into Builder.
      state.replace(previousComponents, previousWires);
    }
  }

  window.NILSparkLabUCDMSimulationAdapter = Object.freeze({
    version:"1.0",
    contractVersion:CONTRACT_VERSION,
    supportedTypes:Object.freeze([...SUPPORTED]),
    compatibility,
    validateSimulationInput,
    toSimulationInput,
    fromBuilder,
    run
  });
})();
