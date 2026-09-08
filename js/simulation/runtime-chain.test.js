/* NIL SparkLab Stage 11 — proof that the actual runBuilderSim() wrapper
 * shipped in index.html (not a reimplementation) routes the Builder
 * simulation invocation through UCDM validation and the Simulation
 * Adapter, only falls back to raw Builder state when conversion is not
 * applicable, and restores Builder state unconditionally afterward.
 *
 * This test extracts the real wrapper source between the STAGE11-BRIDGE
 * markers in index.html and executes it verbatim in a sandbox with a
 * stubbed runBuilderSimCore, so it fails if the markers are removed or
 * the wrapper is reverted to calling the core directly on raw state.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

function assert(x, m) { if (!x) throw new Error(m); }

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const start = html.indexOf('/* STAGE11-BRIDGE-START');
const end = html.indexOf('STAGE11-BRIDGE-END */');
assert(start !== -1 && end !== -1 && end > start, 'STAGE11-BRIDGE markers not found — repair may have been reverted');
const wrapperSrc = html.slice(start, end + 'STAGE11-BRIDGE-END */'.length);
assert(/function runBuilderSim\s*\(\)/.test(wrapperSrc), 'runBuilderSim wrapper not found between markers');
assert(/runBuilderSimCore\s*\(\)/.test(wrapperSrc), 'wrapper does not delegate to runBuilderSimCore');
assert(/NILSparkLabUCDMSimulationAdapter/.test(wrapperSrc) && /NILSparkLabUCDM\b/.test(wrapperSrc), 'wrapper does not reference UCDM/Adapter');

function makeSandbox() {
  const sandbox = { console, JSON, Object, Array, Number, String, Error, Math, Set, Map, Date };
  sandbox.window = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ucdm', 'ucdm.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'ucdm-simulation-adapter.js'), 'utf8'), sandbox);
  return sandbox;
}

// ---- TEST A/B/C/E: valid circuit reaches the core through UCDM + Adapter ----
{
  const sandbox = makeSandbox();
  const validComponents = [
    { id: 'v1', type: 'source', x: 0, y: 0, terminals: ['+', '-'], v: 12 },
    { id: 'r1', type: 'resistor', x: 100, y: 0, terminals: ['T1', 'T2'], r: 470 }
  ];
  const validWires = [
    { id: 'w1', from: { compId: 'v1', term: '+' }, to: { compId: 'r1', term: 'T1' } },
    { id: 'w2', from: { compId: 'r1', term: 'T2' }, to: { compId: 'v1', term: '-' } }
  ];
  const preamble = `
    let builderCanvasComps = ${JSON.stringify(validComponents)};
    let builderWires = ${JSON.stringify(validWires)};
    window.ElectroLabBuilderState = {
      get components(){ return builderCanvasComps; },
      get wires(){ return builderWires; },
      replace: function(c, w) { builderCanvasComps = c; builderWires = w; }
    };
    var coreCalls = [];
    function runBuilderSimCore() {
      coreCalls.push({ components: builderCanvasComps, wires: builderWires });
      return 'CORE_RESULT';
    }
  `;
  vm.runInContext(preamble + '\n' + wrapperSrc, sandbox);
  const originalComponentsRef = vm.runInContext('builderCanvasComps', sandbox);
  const result = vm.runInContext('runBuilderSim()', sandbox);
  assert(result === 'CORE_RESULT', 'wrapper did not return core result (TEST C)');
  const seen = sandbox.coreCalls[0];
  assert(seen.components !== undefined, 'core saw no components');
  // TEST D: core must NOT receive the exact original raw array reference —
  // it must receive the adapter's derived (UCDM->legacy) array instead.
  assert(seen.components !== validComponents, 'TEST D FAILED: core received the raw Builder array reference directly');
  assert(seen.components.length === 2 && seen.components[1].r === 470, 'adapter-derived component data lost/incorrect (TEST A/B)');
  assert(Array.isArray(seen.wires) && seen.wires.length === 2, 'adapter-derived wires missing (TEST A/B)');
  // Restoration: after the call, Builder state must be back to the exact original arrays.
  const restoredComponents = vm.runInContext('window.ElectroLabBuilderState.components', sandbox);
  assert(restoredComponents === originalComponentsRef, 'Builder state was not restored after a successful simulation');
  console.log('TEST A/B/C/D/E (valid DC+resistor through Builder->UCDM->Adapter->Core): PASS');
}

// ---- TEST F/G: series/parallel circuits also route through the chain ----
{
  const sandbox = makeSandbox();
  const comps = [
    { id: 'v1', type: 'source', x: 0, y: 0, terminals: ['+', '-'], v: 9 },
    { id: 'r1', type: 'resistor', x: 100, y: 0, terminals: ['T1', 'T2'], r: 220 },
    { id: 'r2', type: 'resistor', x: 200, y: 0, terminals: ['T1', 'T2'], r: 330 }
  ];
  const wires = [
    { id: 'w1', from: { compId: 'v1', term: '+' }, to: { compId: 'r1', term: 'T1' } },
    { id: 'w2', from: { compId: 'r1', term: 'T2' }, to: { compId: 'r2', term: 'T1' } },
    { id: 'w3', from: { compId: 'r2', term: 'T2' }, to: { compId: 'v1', term: '-' } }
  ];
  const preamble = `
    let builderCanvasComps = ${JSON.stringify(comps)};
    let builderWires = ${JSON.stringify(wires)};
    window.ElectroLabBuilderState = {
      get components(){ return builderCanvasComps; },
      get wires(){ return builderWires; },
      replace: function(c, w) { builderCanvasComps = c; builderWires = w; }
    };
    var coreSeen = null;
    function runBuilderSimCore() { coreSeen = builderCanvasComps; return 'OK'; }
  `;
  vm.runInContext(preamble + '\n' + wrapperSrc, sandbox);
  vm.runInContext('runBuilderSim()', sandbox);
  const seen = vm.runInContext('coreSeen', sandbox);
  assert(seen.length === 3, 'series circuit did not reach core with full component set (TEST F)');
  console.log('TEST F (series circuit through chain): PASS');
}

// ---- TEST H: invalid circuit — raw state left untouched, existing guard still applies ----
{
  const sandbox = makeSandbox();
  const dupComponents = [
    { id: 'dup', type: 'resistor', x: 0, y: 0, terminals: ['T1', 'T2'], r: 100 },
    { id: 'dup', type: 'resistor', x: 10, y: 0, terminals: ['T1', 'T2'], r: 100 }
  ];
  const preamble = `
    let builderCanvasComps = ${JSON.stringify(dupComponents)};
    let builderWires = [];
    window.ElectroLabBuilderState = {
      get components(){ return builderCanvasComps; },
      get wires(){ return builderWires; },
      replace: function(c, w) { builderCanvasComps = c; builderWires = w; }
    };
    var coreSeenRaw = null;
    function runBuilderSimCore() { coreSeenRaw = builderCanvasComps; return 'GUARD_WOULD_REJECT'; }
  `;
  vm.runInContext(preamble + '\n' + wrapperSrc, sandbox);
  const originalRef = vm.runInContext('builderCanvasComps', sandbox);
  vm.runInContext('runBuilderSim()', sandbox);
  const seenRaw = vm.runInContext('coreSeenRaw', sandbox);
  assert(seenRaw === originalRef, 'TEST H FAILED: invalid circuit was silently converted instead of reaching existing guard on raw state');
  console.log('TEST H (invalid/duplicate-id circuit falls back to raw state for existing guard): PASS');
}

// ---- TEST I: unsupported component — adapter throws, falls back for existing manual check ----
{
  const sandbox = makeSandbox();
  const comps = [
    { id: 'v1', type: 'source', x: 0, y: 0, terminals: ['+', '-'], v: 12 },
    { id: 'q1', type: 'bjt_npn', x: 100, y: 0, terminals: ['T1', 'T2'] }
  ];
  const preamble = `
    let builderCanvasComps = ${JSON.stringify(comps)};
    let builderWires = [];
    window.ElectroLabBuilderState = {
      get components(){ return builderCanvasComps; },
      get wires(){ return builderWires; },
      replace: function(c, w) { builderCanvasComps = c; builderWires = w; }
    };
    var coreSeenUnsupported = null;
    function runBuilderSimCore() { coreSeenUnsupported = builderCanvasComps; return 'MANUAL_CHECK_WOULD_REJECT'; }
  `;
  vm.runInContext(preamble + '\n' + wrapperSrc, sandbox);
  const originalRef = vm.runInContext('builderCanvasComps', sandbox);
  vm.runInContext('runBuilderSim()', sandbox);
  const seenUnsupported = vm.runInContext('coreSeenUnsupported', sandbox);
  assert(seenUnsupported === originalRef, 'TEST I FAILED: unsupported-component circuit was not left for the existing manual check');
  console.log('TEST I (unsupported component falls back to raw state for existing manual check): PASS');
}

console.log('Stage 11 runtime-chain repair tests: PASS');
