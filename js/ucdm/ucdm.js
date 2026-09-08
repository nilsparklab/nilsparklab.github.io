/* NIL SparkLab Unified Circuit Data Model (UCDM) v1.0
 * Foundation only: canonical model, validation, serialization, migration/adapter.
 * Existing Builder/Simulation formats remain unchanged.
 */
(() => {
  "use strict";

  const VERSION = "1.0";
  const SUPPORTED_TYPES = new Set([
    "source","resistor","potentiometer","capacitor","inductor","led","diode","motor","buzzer","relay","switch","ac_source","bridge_rectifier","lamp","fuse","ground","logic_gate","logic_input",
    "bjt_npn","p_mosfet","scr","triac","diac","ic_741","reg_7805","schmitt_trigger","ir_sensor","thermocouple","bjt_pnp","contactor","dpdt_switch","hall_sensor","ldr","mcb","microcontroller","mosfet_n","mov_varistor","op_amp","olr","pt100","push_button","reed_switch","thermistor","thermistor_ptc","timer_555","transformer"
  ]);
  const BLOCKED_KEYS = new Set(["__proto__","prototype","constructor"]);
  const LIMITS = Object.freeze({ components: 500, connections: 2000, nodes: 2000, id: 128, type: 80, value: 256 });

  const clone = value => {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  };

  function makeId(prefix, index) {
    return `${prefix}_${index}`;
  }

  function terminalList(component) {
    if (!component || typeof component !== "object") return [];
    if (Array.isArray(component.terminals)) return component.terminals.map(String);
    const known = {
      source:["+","-"], ac_source:["T1","T2"], resistor:["T1","T2"], potentiometer:["T1","T2","W"], capacitor:["T1","T2"],
      inductor:["T1","T2"], led:["A","K"], diode:["A","K"], motor:["T1","T2"], buzzer:["T1","T2"], relay:["T1","T2"], switch:["T1","T2"],
      bridge_rectifier:["AC1","AC2","DC+","DC-"], lamp:["T1","T2"], fuse:["T1","T2"], ground:["GND"], logic_gate:["A","B","OUT"], logic_input:["OUT"]
    };
    return known[component.type] ? known[component.type].slice() : [];
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Circuit must be an object");
    const source = raw.circuit && typeof raw.circuit === "object" ? raw.circuit : raw;
    const components = Array.isArray(source.components) ? source.components : [];
    const wires = Array.isArray(source.wires) ? source.wires : (Array.isArray(source.connections) ? source.connections : []);
    if (components.length > LIMITS.components) throw new Error("component limit exceeded");
    if (wires.length > LIMITS.connections) throw new Error("connection limit exceeded");

    const seen = new Set();
    const outComponents = components.map((c, i) => {
      if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error(`component[${i}] invalid`);
      const id = String(c.id || makeId("c", i));
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(`component[${i}] invalid id`);
      if (seen.has(id)) throw new Error(`duplicate component id: ${id}`);
      seen.add(id);
      const type = String(c.type || "");
      if (!type || type.length > LIMITS.type) throw new Error(`component[${i}] invalid type`);
      if (BLOCKED_KEYS.has(type)) throw new Error(`component[${i}] unsafe type`);
      const pins = terminalList(c).map((name, index) => ({ pinId:`${id}:${name}`, componentId:id, name, index, role:index === 0 ? "terminal" : "terminal" }));
      const copy = clone(c) || {};
      delete copy.wires;
      return {
        id, type,
        value: copy.value === undefined ? null : clone(copy.value),
        unit: copy.unit === undefined ? null : String(copy.unit),
        position: { x:Number.isFinite(Number(copy.x)) ? Number(copy.x) : 0, y:Number.isFinite(Number(copy.y)) ? Number(copy.y) : 0 },
        rotation: Number.isFinite(Number(copy.rotation)) ? Number(copy.rotation) : 0,
        pins,
        properties: (() => { const p = copy.properties && typeof copy.properties === "object" && !Array.isArray(copy.properties) ? clone(copy.properties) : {}; Object.keys(copy).forEach(k => { if (!["id","type","value","unit","x","y","rotation","terminals","properties","state","metadata","wires"].includes(k) && !BLOCKED_KEYS.has(k)) p[k] = clone(copy[k]); }); return p; })(),
        state: copy.state && typeof copy.state === "object" && !Array.isArray(copy.state) ? clone(copy.state) : {},
        metadata: { sourceType:type }
      };
    });

    const pinExists = new Set(outComponents.flatMap(c => c.pins.map(p => p.pinId)));
    const compPins = new Map(outComponents.map(c => [c.id, new Set(c.pins.map(p => p.name))]));
    const outConnections = wires.map((w, i) => {
      if (!w || typeof w !== "object" || !w.from || !w.to) throw new Error(`connection[${i}] invalid`);
      const fromComp = String(w.from.compId || ""), toComp = String(w.to.compId || "");
      const fromPin = String(w.from.term || ""), toPin = String(w.to.term || "");
      if (!seen.has(fromComp) || !seen.has(toComp)) throw new Error(`connection[${i}] references missing component`);
      if (!compPins.get(fromComp)?.has(fromPin) || !compPins.get(toComp)?.has(toPin)) throw new Error(`connection[${i}] references invalid pin`);
      if (fromComp === toComp && fromPin === toPin) throw new Error(`connection[${i}] connects a pin to itself`);
      const id = String(w.id || makeId("w", i));
      const from = `${fromComp}:${fromPin}`, to = `${toComp}:${toPin}`;
      if (!pinExists.has(from) || !pinExists.has(to)) throw new Error(`connection[${i}] pin missing`);
      return { id, source:{pinId:from, componentId:fromComp, name:fromPin}, destination:{pinId:to, componentId:toComp, name:toPin} };
    });

    const duplicateConnections = new Set();
    for (const c of outConnections) {
      const key = [c.source.pinId, c.destination.pinId].sort().join("|");
      if (duplicateConnections.has(key)) throw new Error(`duplicate connection: ${key}`);
      duplicateConnections.add(key);
    }

    // Union-find creates explicit electrical nodes independently of screen position.
    const parent = new Map([...pinExists].map(p => [p,p]));
    const find = p => { let r=p; while(parent.get(r)!==r) r=parent.get(r); while(parent.get(p)!==p){const n=parent.get(p);parent.set(p,r);p=n;} return r; };
    const union = (a,b) => { a=find(a); b=find(b); if(a!==b) parent.set(b,a); };
    outConnections.forEach(c => union(c.source.pinId,c.destination.pinId));
    const groups = new Map();
    pinExists.forEach(pin => { const root=find(pin); if(!groups.has(root)) groups.set(root,[]); groups.get(root).push(pin); });
    const nodes = [...groups.values()].map((pins,i) => ({ nodeId:makeId("n",i), pinIds:pins.slice().sort(), reference:pins.includes("ground:GND") || pins.some(p=>p.endsWith(":GND")) }));

    return { schema:"NIL-SparkLab-UCDM", version:VERSION, circuitId:String(raw.circuitId || raw.id || `circuit_${Date.now()}`), metadata: clone(raw.metadata) || {}, components:outComponents, connections:outConnections, nodes, settings:clone(raw.settings)||{}, simulationState:clone(raw.simulationState)||null, measurementState:clone(raw.measurementState)||null, faultState:clone(raw.faultState)||null };
  }

  function validate(model) {
    const errors=[];
    const add=(code,path,message,severity="error")=>errors.push({code,path,message,severity});
    if(!model || typeof model!=="object" || Array.isArray(model)) return {valid:false,errors:[{code:"MODEL_TYPE",path:"$",message:"Model must be an object",severity:"error"}]};
    if(model.schema!=="NIL-SparkLab-UCDM") add("SCHEMA","schema","Unsupported schema","error");
    if(model.version!==VERSION) add("VERSION","version","Unsupported schema version","error");
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(String(model.circuitId||""))) add("CIRCUIT_ID","circuitId","Missing or invalid circuit ID");
    if(!Array.isArray(model.components)) add("COMPONENTS","components","Components must be an array");
    if(!Array.isArray(model.connections)) add("CONNECTIONS","connections","Connections must be an array");
    if(!Array.isArray(model.nodes)) add("NODES","nodes","Nodes must be an array");
    if(errors.length) return {valid:false,errors};
    if(model.components.length>LIMITS.components) add("LIMIT_COMPONENTS","components","Component limit exceeded");
    const ids=new Set(), pins=new Set();
    model.components.forEach((c,i)=>{
      if(!c?.id) add("COMPONENT_ID",`components[${i}].id`,`Missing component ID`);
      else if(ids.has(c.id)) add("DUP_COMPONENT_ID",`components[${i}].id`,`Duplicate component ID: ${c.id}`); else ids.add(c.id);
      if(!c?.type) add("COMPONENT_TYPE",`components[${i}].type`,`Missing component type`);
      else if(!SUPPORTED_TYPES.has(c.type)) add("UNSUPPORTED_TYPE",`components[${i}].type`,`Unsupported component type: ${c.type}`);
      (Array.isArray(c?.pins)?c.pins:[]).forEach((p,j)=>{ if(!p?.pinId) add("PIN_ID",`components[${i}].pins[${j}]`,`Missing pin ID`); else if(pins.has(p.pinId)) add("DUP_PIN_ID",`components[${i}].pins[${j}]`,`Duplicate pin ID: ${p.pinId}`); else pins.add(p.pinId); });
    });
    const conIds=new Set(); const conPairs=new Set();
    model.connections.forEach((c,i)=>{
      if(!c?.id) add("CONNECTION_ID",`connections[${i}].id`,`Missing connection ID`); else if(conIds.has(c.id)) add("DUP_CONNECTION_ID",`connections[${i}].id`,`Duplicate connection ID: ${c.id}`); else conIds.add(c.id);
      if(!c?.source?.pinId || !c?.destination?.pinId) add("BROKEN_CONNECTION",`connections[${i}]`,`Connection endpoint missing`);
      else { if(!pins.has(c.source.pinId)) add("BAD_SOURCE_PIN",`connections[${i}].source.pinId`,`Invalid source pin reference`); if(!pins.has(c.destination.pinId)) add("BAD_DEST_PIN",`connections[${i}].destination.pinId`,`Invalid destination pin reference`); const key=[c.source.pinId,c.destination.pinId].sort().join("|"); if(conPairs.has(key)) add("DUP_CONNECTION",`connections[${i}]`,`Duplicate connection`); else conPairs.add(key); }
    });
    model.nodes.forEach((n,i)=>{ if(!n?.nodeId) add("NODE_ID",`nodes[${i}].nodeId`,`Missing node ID`); if(!Array.isArray(n?.pinIds)) add("NODE_PINS",`nodes[${i}].pinIds`,`Node pinIds must be an array`); else n.pinIds.forEach((p,j)=>{if(!pins.has(p)) add("BAD_NODE_PIN",`nodes[${i}].pinIds[${j}]`,`Node references unknown pin`);}); });
    return {valid:errors.filter(e=>e.severity!=="warning").length===0,errors};
  }

  function serialize(model) {
    const result=validate(model); if(!result.valid) throw new Error(result.errors[0].message); return JSON.stringify(model);
  }
  function deserialize(text) {
    if(typeof text!=="string") throw new Error("Serialized model must be text");
    const parsed=JSON.parse(text); const result=validate(parsed); if(!result.valid) throw new Error(result.errors[0].message); return clone(parsed);
  }
  function fromLegacy(raw) { return normalize(raw); }
  function migrate(raw) {
    if (raw && raw.schema === "NIL-SparkLab-UCDM") {
      if (raw.version !== VERSION) throw new Error(`Unsupported UCDM version: ${raw.version}`);
      const checked = validate(raw);
      if (!checked.valid) throw new Error(checked.errors[0].message);
      return clone(raw);
    }
    const legacy = clone(raw) || {};
    const metadata = (legacy.metadata && typeof legacy.metadata === "object" && !Array.isArray(legacy.metadata))
      ? legacy.metadata : {};
    if (legacy.name !== undefined && metadata.name === undefined) metadata.name = String(legacy.name);
    if (legacy.savedAt !== undefined && metadata.savedAt === undefined) metadata.savedAt = String(legacy.savedAt);
    legacy.metadata = metadata;
    return normalize(legacy);
  }

  function fromBuilder() {
    const state=window.ElectroLabBuilderState;
    if(!state) throw new Error("Builder state unavailable");
    return normalize({circuitId:"builder-current",components:state.components,wires:state.wires});
  }

  function toLegacy(model) {
    const checked = validate(model);
    if (!checked.valid) throw new Error(checked.errors[0].message);
    const components = model.components.map(c => {
      const props = (c.properties && typeof c.properties === "object" && !Array.isArray(c.properties)) ? clone(c.properties) : {};
      const out = Object.assign({}, props, { id:c.id, type:c.type, x:c.position.x, y:c.position.y, terminals:c.pins.map(p=>p.name) });
      if (c.value !== null && c.value !== undefined && out.value === undefined) out.value = clone(c.value);
      return out;
    });
    const wires = model.connections.map(c => ({
      id:c.id,
      from:{compId:c.source.componentId,term:c.source.name},
      to:{compId:c.destination.componentId,term:c.destination.name}
    }));
    return { components, wires };
  }

  function selfTest() {
    const base={version:VERSION,circuitId:"test",components:[{id:"v1",type:"source",x:0,y:0,terminals:["+","-"],value:12},{id:"r1",type:"resistor",x:100,y:0,terminals:["T1","T2"],value:1000}],connections:[{id:"w1",from:{compId:"v1",term:"+"},to:{compId:"r1",term:"T1"}},{id:"w2",from:{compId:"r1",term:"T2"},to:{compId:"v1",term:"-"}}]};
    const m=normalize(base), v=validate(m), round=deserialize(serialize(m));
    return Object.freeze({creation:true,validation:v.valid,serialization:true,deserialization:true,roundTrip:JSON.stringify(m)===JSON.stringify(round),migration:validate(m).valid});
  }

  window.NILSparkLabUCDM=Object.freeze({version:VERSION,limits:LIMITS,normalize,fromLegacy,migrate,validate,serialize,deserialize,toLegacy,fromBuilder,selfTest});
})();
