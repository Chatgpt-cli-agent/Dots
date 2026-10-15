# CurseForge file fingerprints

Use for CurseForge file identification and fingerprint implementation questions.
Local checkout: `/home/windenburg/Projects/All About The Sims4/References/curseforge-fingerprint/`.
Upstream: https://github.com/meza/curseforge-fingerprint
Snapshot cloned 2026-09-07: `81939ff523a5c9bb6616798922a12fa5d33054f6`.
License: GPL-3.0; retain provenance and review terms when adapting code.

## Read the relevant evidence

- `src/addon/fingerprint.cpp`: file reading and normalized 32-bit hash.
- `src/addon/fingerprint.h`: buffer/function declarations.
- `src/addon/binding.cc`: Node API boundary and error handling.
- `src/esm/index.ts` and `src/cjs/index.ts`: public TypeScript interface.
- `src/index.test.ts` and `src/__fixtures__/`: two expected fingerprint examples.

The checked source excludes byte values 9, 10, 13, and 32, initializes the hash
with normalized length XOR 1, and uses multiplier 1540483477 and 32-bit arithmetic.
Consult the actual function for ordering, shifts, tail handling, and overflow;
ordinary file hashes or broader Unicode whitespace stripping are not substitutes.
The README claims the C++ originated with CurseForge; this is the maintainer's
provenance claim, not an independent verification of the current service.

This is file-matching implementation evidence, not a DBPF/resource layout source.
A fingerprint is not a cryptographic integrity check, proof of safety, or game
compatibility. Service lookup is a separate integration; this checkout supplies
no API credentials or live catalog access. Verify current CurseForge API behavior
and the exact file artifact being fingerprinted before implementing matching.

Use as source reference without installing the native Node addon. Before adopting
its I/O code, inspect read failures and size handling. Validate any adaptation
against the included fixtures and real known file/API pairs. Keep upstream
checkouts clean; inspect status before a deliberate fast-forward refresh and
record the updated commit here.
