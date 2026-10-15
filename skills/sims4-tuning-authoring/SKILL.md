---
name: sims4-tuning-authoring
description: Authoring Sims 4 gameplay data as tuning — Tuning Description (TDESC) XML, SimData, and STBL strings; creating or overriding buffs, interactions, careers, objects, statistics, loot, and scripts-driven content; tracing tuning references and deciding new-vs-override. Use when the task is to write, edit, create, clone, or override tuning XML, SimData, or string tables, build buffs/interactions/careers/objects, or work with TDESC/tuning instances. For packaging the result, use sims4-package-authoring; for Python behavior, sims4-ts4script-authoring; for inspecting files, the sims-4 skill.
---

# Sims 4 — Tuning Authoring

Tuning is the game's data layer: XML resources describing buffs, interactions,
careers, objects, statistics, loot. It is how most gameplay mods are made
without Python. It works alongside SimData (numeric/internal tuning tables)
and STBL (all user-visible strings). A script mod reads tuning through instance
managers; Python extends what tuning configures.

Evidence rules are inherited from the `sims-4` skill. Identity fields and
layouts come from the references — never guess the tuning grammar from
memory.

## How tuning is loaded

- Tuning XML files live in `.package` resources; at runtime the game maps them
  to Python classes via **instance managers** (see Lot 51 game-concepts docs,
  linked in `references/tuning-fundamentals.md`).
- Overriding EA tuning = shipping a resource with the **same TGI**; creating
  new content = a **new instance** key. Getting this backwards is the most
  common tuning bug (see `references/tuning-fundamentals.md`).

## Workflow

### 1. Decide: new content or override

- **Override**: pick the exact EA resource (TGI) you want changed and mirror
  its instance. Same key, different payload.
- **New**: give the new resource a unique instance (see
  `sims4-package-authoring` → `references/resource-keys.md` for collision
  care); reference other tuning by their existing TGI.

**Done when:** the target (or the new resource's identity) is pinned to a
specific TGI, and that TGI is known from a source, not guessed.

### 2. Get the tuning type + a reference

Use the TDESC builder or a cloned EA tuning as ground truth for the type's
fields:

- TDESC builder (type templates + per-field docs): https://tdesc.lot51.cc/
- Or extract an existing tuning of the same class from the game/Simulation
  packages (see `sims4-mod-reverse-engineering`).

**Done when:** you have a template showing the actual fields of the type and
their meanings, with a stable URL or resource key.

### 3. Write the TuningDescription XML

- Root element: `<I>` for individual tuning; `<M>` denotes a generic tuning
  module (from the S4TK build `.build.cjs` identity logic).
- Identity attributes authors must render correctly: `name`, instance `s`
  (decimal), and `i` (type selector). Group may come from a `.G########.xml`
  filename suffix.
- (Facts cross-confirmed: `sims4toolkit/package-builder-template`
  `scripts/build.cjs`.)

**Done when:** the XML is well-formed, carries correct identity, and parses
cleanly (e.g. through `XmlResource.from(...)`) with every field present that
the template requires.

### 4. Add SimData where the type needs it

Some tuning types require a paired SimData table (numeric internal fields).
The SimData resource shares its tuning's instance; its group derives from the
tuning type. See `references/simdata-stbl.md` and `sims4-package-authoring`.

**Done when:** every SimData-requiring tuning has its pair, instance-matched.

### 5. Add STBL strings for visible text

Every string a player can see (names, flavor text, descriptions) belongs in a
string table. See `sims4-package-authoring` (resource-keys) and the `sims-4`
`stbl.md` for hashing/layout.

**Done when:** every visible string has a key in an STBL with the correct hash
registration.

### 6. Reference other tuning correctly

Interactions reference their owning object; careers reference levels and
skills; loot references effect types. References resolve by tuning instance —
look each one up rather than assuming an ID exists. See
`references/tuning-fundamentals.md`.

**Done when:** every cross-tune reference in your XML points at an existing
resource (verified against game/Simulation extraction), or is deliberately
left undefined and labeled as such.

### 7. Build the package

Turn the tuning + SimData + STBL into a `.package` using
`sims4-package-authoring`. Script-behavior needs a `.ts4script` partner
(`sims4-ts4script-authoring`).

**Done when:** the merged `.package` round-trips through an independent reader
and its tuning keys match the manifest.

### 8. Test in game

Load the mod; confirm the behavior; check the exception log. For overrides,
confirm you actually changed the target (a wrong instance that "fell silent"
means your override and the base no longer share a key).

**Done when:** the intended tuning change is observable in game and no
tuning-related exceptions appear.

## Progressive reference loading

| Task | Reference |
| --- | --- |
| TDESC model, instance managers, tuning references, new-vs-override | `references/tuning-fundamentals.md` |
| SimData + STBL authoring | `references/simdata-stbl.md` |
| Packaging tuning into .package | `sims4-package-authoring` |
| TGI assignment + collision care | `sims4-package-authoring`: `references/resource-keys.md` |
| STBL byte layout + hash | `sims-4`: `references/stbl.md` |
| CAS/SimData parsing internals (verification layer) | `sims-4`: `references/s4s/casp-simdata.md` |