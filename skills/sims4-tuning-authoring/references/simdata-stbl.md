# SimData + STBL authoring

The two companion resource families every tuning mod touches eventually.

## SimData (numeric tuning tables)

- SimData resources carry the numeric/internal side of tuning that XML authors
  put in a separate table (e.g. career/statistic internals).
- **Key derivation (verified — `sims4toolkit/package-builder-template`
  `scripts/build.cjs`):**
  - SimData **instance == the instance of the tuning it configures**.
  - SimData **group = `SimDataGroup.getForTuning(tuningType)`** — derived from
    the tuning type, never hand-picked.
  - SimData **resource type** = `BinaryResourceType.SimData`
    (`0x545AC67A`).
- Authoring flow: write a `.SimData.xml` source (rows/cols), have the build
  turn it into the SimData binary resource
  (`SimDataResource.fromXml`, per the S4TK recipe).
- If you add SimData without its tuning, or instance-mismatch the two, the
  game won't wire them — a classic silent-failure bug.

## STBL (string tables) — visible text

- Every user-visible string in Sims 4 lives in a string table (STBL
  `0x220557DA`), keyed by an instance that is the hash of a human-readable
  string key.
- **Authoring:** build from a `key → text` map, hash each key with the
  game's string FNV flavor and register entries in a table. The exact hash
  variant and container layout live in the `sims-4` skill
  (`references/stbl.md`) — read it; never guess the hash or the format.
- New packages that add named content (objects, buffs, interactions that show
  UI text) must ship an STBL or the game shows placeholder/missing strings.
- The S4TK sister project *stbl-studio-web* edits TS4 string tables in a
  browser if a GUI is wanted: https://github.com/sims4toolkit/stbl-studio-web
  (community-observed).

## Where these get packaged

Tuning + SimData + STBL all become resources in one `.package` — see
`sims4-package-authoring`. The build merges XML/SimData sources and sets keys
per the rules above; the round-trip verification in that skill is what proves
the keys landed right.