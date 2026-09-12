/* NIL SparkLab Stage 9 — deterministic runtime input guard for the existing simulation engine. */
(() => {
  "use strict";
  const MAX_COMPONENTS = 200;
  const MAX_WIRES = 400;
  const KNOWN_NUMERIC = ["value","v","r","vf","beta","vbe","coilR","ratedA","c","temperature"];
  const RESISTIVE = new Set(["resistor","ldr","thermistor","thermistor_ptc","pt100","motor","buzzer","relay","inductor","fuse","lamp"]);

  function finite(value, label) {
    if (value === undefined || value === null || value === "") return null;
    const n = typeof value === "number" ? value : (typeof value === "string" ? Number(value.trim()) : NaN);
    if (!Number.isFinite(n)) throw new Error(`Simulation input invalid: ${label} must be finite`);
    return n;
  }

  function validate(components, wires) {
    const errors = [];
    if (!Array.isArray(components)) errors.push({code:"SIM_COMPONENTS_TYPE", message:"Simulation components must be an array"});
    if (!Array.isArray(wires)) errors.push({code:"SIM_WIRES_TYPE", message:"Simulation wires must be an array"});
    if (errors.length) return {valid:false, errors};
    if (components.length > MAX_COMPONENTS) errors.push({code:"SIM_COMPONENT_LIMIT", message:`Simulation component limit exceeded (${MAX_COMPONENTS})`});
    if (wires.length > MAX_WIRES) errors.push({code:"SIM_WIRE_LIMIT", message:`Simulation wire limit exceeded (${MAX_WIRES})`});

    const ids = new Set();
    for (const c of components) {
      if (!c || typeof c !== "object" || Array.isArray(c) || typeof c.id !== "string" || !c.id.trim() || typeof c.type !== "string" || !c.type.trim()) {
        errors.push({code:"SIM_COMPONENT_INVALID", message:"Simulation component has invalid identity/type"});
        continue;
      }
      if (ids.has(c.id)) errors.push({code:"SIM_DUPLICATE_ID", message:`Duplicate simulation component ID: ${c.id}`});
      ids.add(c.id);
      if (!Array.isArray(c.terminals) || c.terminals.length < 1 || c.terminals.some(t => typeof t !== "string" || !t)) {
        errors.push({code:"SIM_TERMINALS_INVALID", message:`Invalid terminals for component: ${c.id}`});
      }
      for (const key of KNOWN_NUMERIC) {
        if (Object.prototype.hasOwnProperty.call(c, key)) {
          try { finite(c[key], `${c.id}.${key}`); } catch (e) { errors.push({code:"SIM_NUMBER_INVALID", message:e.message}); }
        }
      }
      if (RESISTIVE.has(c.type) && Object.prototype.hasOwnProperty.call(c, "r")) {
        try {
          const r = finite(c.r, `${c.id}.r`);
          if (r !== null && r <= 0) errors.push({code:"SIM_RESISTANCE_INVALID", message:`Resistance must be greater than zero: ${c.id}`});
        } catch (_) {}
      }
      if (c.type === "source" && Object.prototype.hasOwnProperty.call(c, "v")) {
        try { finite(c.v, `${c.id}.v`); } catch (_) {}
      }
    }
    for (const w of wires) {
      if (!w || typeof w !== "object" || !w.from || !w.to || !ids.has(w.from.compId) || !ids.has(w.to.compId) || typeof w.from.term !== "string" || typeof w.to.term !== "string") {
        errors.push({code:"SIM_WIRE_INVALID", message:"Simulation wire references invalid components or terminals"});
      }
    }
    return {valid:errors.length===0, errors};
  }

  window.NILSparkLabSimulationRuntimeGuard = Object.freeze({version:"1.0", validate});
})();
