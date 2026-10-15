---
name: sims4-mod-reverse-engineering
description: Deconstructing an existing Sims 4 mod to learn exactly what it does and how — inventorying .package/.ts4script pairs, resolving every resource key, extracting tuning/SimData/STBL, decompiling script modules, mapping tuning-to-Python-to-EA-resource graphs, identifying overrides/injections, and producing a clean-room reproduction recipe with evidence. Use when the task is to figure out how a mod works, dissect/break down a mod, extract its resources, find its dependencies, determine a minimum working file set, or reproduce a mod cleanly. For unknown-binary-format RE, the sims-4 skill's reverse-engineering reference applies instead.
---

# Sims 4 — Mod Reverse Engineering

Understand an existing Sims 4 mod precisely — not "what it seems to do", but
what files, resources, and code it is made of, and how the parts reference each
other. Every claim must carry evidence: a resource key, an extracted byte
range, a decompiled line. Respect the author's license terms; decompiling for
learning is standard practice, distributing their code is not.

Evidence rules are inherited from the `sims-4` skill. The target-mod-specific
reverse-engineering methodology here is distinct from generic unknown-binary
RE (`sims-4` → `references/reverse-engineering.md`).

## Workflow

### 1. Inventory the mod

List every shipped file and its pair: `.package` resource containers, one or
more `.ts4script` Python archives, plus any loose files. Note file sizes; a
single-resource package and a mega-package behave differently.

**Done when:** file list + sizes + pairing recorded, nothing unaccounted for.

### 2. Parse the .package → resource histogram

Read the DBPF index (see `sims-4` for the container formats) and produce a
histogram: resource types, groups, instance ranges, compressed vs raw. This
tells you the mod's shape before you read a single payload.

**Done when:** histogram complete; every type ID resolved to a name (or
marked unknown).

### 3. Extract tuning and SimData

Extract each tuning XML and SimData resource. List which tuning instances are
**new** and which **override** EA resources (compare instances against the
game's client/simulation packages). Decode STBLs to get every visible string.

**Done when:** every tuning/SimData/STBL payload is extracted and classified
new-vs-override, with instance + name noted.

### 4. Decompile the .ts4script

Rename to `.zip`, list modules, decompile the `.pyc` (see
`sims4-ts4script-authoring` for decompilers). Identify: registered commands,
zone-load hooks, injected methods, imported game modules, and any tuning
classes referenced by name/tuning type.

**Done when:** module list + decompiled sources read and summarized; every
game import identified.

### 5. Build the tuning ↔ code ↔ EA map

Connect the dots:

- tuning → the Python class it instantiates (via the tuned type / instance
  manager),
- tuning references → other tuning (which instance points where),
- script code → the tuning it reads (imports of tuning classes, instance
  lookups),
- overrides/injections → the EA resources or classes they replace/extend.

Record the graph, not just a list.

**Done when:** a graph (or exact table) connects every resource and code
module to what it affects in the base game.

### 6. Determine the minimum working set

Remove redundancy: which files/resources actually change behavior vs. which are
cosmetic, duplicated, or bundled-but-unused. Say which EA resources the mod
*requires* (an EP it needs, a base-game class it patches).

**Done when:** a defensible minimum file/resource set, each element justified
against the evidence.

### 7. Write the build procedure + clean-room reproduction plan

Describe how the mod is assembled: which resources are authored (XML/SimData/
STBL), which are cloned-and-tweaked, which script modules are compiled, and
how they combine (see the three authoring skills).
Then produce a **clean-room recipe**: an independent specification written from
observed behavior + the extracted resources, sufficient to rebuild the same
functionality without copying the original author's code. Keep the recipe
behavioral ("a career with 9 levels, chance cards…"), not verbatim source.

**Done when:** the build procedure's steps map 1:1 to the authoring skills,
and the clean-room recipe is a standalone spec an agent could implement fresh.

## Progressive reference loading

| Task | Reference |
| --- | --- |
| Step-by-step tool commands + evidence log format | `references/deconstruction-pipeline.md` |
| DBPF/index/type/STBL/SimData parsing | `sims-4` (table in its SKILL.md) |
| Decompiling script mods + workspaces | `sims4-ts4script-authoring` |
| Understanding the resources you uncover | `sims4-tuning-authoring` |
| Repackaging findings as a buildable mod | `sims4-package-authoring` |
| Unknown/fragile binary formats (not an existing mod) | `sims-4`: `references/reverse-engineering.md` |