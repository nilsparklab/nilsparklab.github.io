# DC Nodal Solver — Architecture Scaffold (Documentation Only, Not Wired In)

Status: **documentation-only scaffold.** This file is not referenced by
`index.html` or by any other file in the project. No `<script>` tag points to
it, it loads nothing, and it has zero effect on the running application.

## Why this exists

The v11 audit confirmed that NIL SparkLab's current "simulation" system is a
hybrid of verified/predefined circuit netlists, calculators, and scripted
animations — not a general-purpose circuit solver. This document records the
planned architecture for a future, real DC nodal solver so that future work
has a starting point, without implementing or wiring in any of it yet.

## Planned future module boundaries (not yet created)

None of the files below exist yet. They are documented here only as the
intended shape of the future solver.

1. **`topology.js`**
   - Parse Circuit Builder wires/components into nodes and branches.
   - Detect open circuits, shorts, invalid topology, and
     disconnected/floating conditions before any solving is attempted.

2. **`sources.js`**
   - Future voltage-source and current-source models.

3. **`resistive-network.js`**
   - Future resistor modeling and conductance-matrix stamping.

4. **`nodal-analysis.js`**
   - Future Modified Nodal Analysis / nodal solving.
   - KCL (Kirchhoff's Current Law) at each non-reference node.
   - Deterministic numerical results.

5. **`explain.js`**
   - Convert solved equations/matrix/results into human-readable,
     educational calculation steps.
   - The goal is explainable results, not just numbers.

6. **`errors.js`**
   - Shared, consistent error types/messages for:
     - invalid topology
     - floating/disconnected nodes
     - singular matrix
     - invalid component/source data
     - other solver-specific validation failures

## Explicit non-goals for this scaffold

- No diode support.
- No LED support.
- No capacitor support.
- No inductor support.
- No transistor support.
- No AC analysis.
- No transient analysis.
- None of the above should be claimed as implemented anywhere in the project
  until they actually exist.
- The actual DC solver is **not** implemented by this scaffold.
- `topology.js`, `sources.js`, `resistive-network.js`, `nodal-analysis.js`,
  `explain.js`, and `errors.js` do **not** exist yet — this README is the only
  file this phase creates.

## Future validation requirements

Before any future solver implementation is wired into `index.html`, it must:

- Have unit tests from day one.
- Be tested against known series networks.
- Be tested against known parallel networks.
- Be tested against known bridge networks.
- Be cross-validated against the existing Ohm's-law calculator.
- Be cross-validated against the existing series/parallel calculator wherever
  the same circuit can be computed by both systems.
- Produce deterministic results.
- Handle invalid topology and singular/floating-node cases explicitly.
- Only after the above testing and validation should it be connected to any UI.

## Integration rule

This README must not be referenced from `index.html`. No `<script>` tag, no
UI, no change to existing simulation behavior, and no changes to any
predefined-netlist simulation or the current simulation engine are part of
this scaffold.
