---
name: sims4-package-authoring
description: Authoring and building Sims 4 .package files programmatically — constructing DBPF containers, assigning resource keys (Type/Group/Instance), adding or merging resources (tuning XML, SimData, STBL strings, cloned CC), and emitting a .package via Node/TypeScript (S4TK @s4tk/models) or another build script. Use when the task is to build, write, create, assemble, generate, extend, or clone-and-expand a .package, or to write a package build script. For parsing/reading/inspecting existing packages, use the sims-4 skill instead.
---

# Sims 4 — Package Authoring

Build `.package` mods and custom content from code, not the Sims 4 Studio GUI.
Read-only parsing, TGI preservation, and byte-level formats are owned by the
`sims-4` skill; this skill owns writing/assembling. Its evidence rules are
inherited: never guess a resource type ID, group, instance, compression code,
or field layout.

## Choose the toolchain

- **Inside Sims Creator Studio:** SCS's native `electron/main/sims/` package
  code (`dbpf.ts`, `refpack.ts`, `simdata.ts`, `sims-package-service.ts`,
  `tray/blueprint-writer.ts`) stays **authoritative for reading, inspection,
  reverse engineering, lot/tray/save work, and custom codecs**. For **emitting
  standard mod packages** (tuning + SimData + STBL + clones), `@s4tk/models`
  is the preferred writer for resource types it supports, sitting behind an
  authoring seam; SCS-native code fills every seam S4TK does not cover or got
  wrong. Follow the repo's AGENTS.md rules (stream indexes light, reuse the
  shared RefPack decompressor, zero new typecheck errors in touched files).
- **Standalone TS/Node build script or spike:** S4TK `@s4tk/models` (MIT,
  npm). See `references/toolchain.md` for the verified recipe, API surface,
  and its maintenance caveats.
- **One-off work and GUI round-trips:** Sims 4 Studio and s4pe/s4pi remain the
  reference tools; their packages are interchangeable with programmatic output.

## Workflow

Each step ends on a completion criterion. A step is not done until its
criterion holds.

### 1. Decide the resource set

From the mod's design, enumerate every resource the `.package` must contain:
which tuning XML, which SimData, which STBL strings, any cloned CC to ship
unchanged, any images/meshes. A script mod's code lives in a separate
`.ts4script` — see `sims4-ts4script-authoring`.

**Done when:** a checklist names every resource, its type, its source (new vs
clone), and what it does. Any resource type ID not yet resolved is resolved
before any bytes are written.

### 2. Assign resource keys

Every resource needs a Type/Group/Instance triple. Rules for new resources
(not clones) live in `references/resource-keys.md`: tuning instances come from
the XML `s` attribute, SimData shares its tuning's instance, STBL instances
are FNV hashes of string keys, and hand-chosen IDs are collision-careful.
Clones keep their original keys exactly.

**Done when:** every source file maps to a deterministic triple, no two new
resources share an instance, and clone keys are byte-identical to the source
package's index.

### 3. Construct each resource

- **Tuning XML** — parse with `XmlResource` from the file bytes.
- **SimData** — `SimDataResource.fromXml`; instance derived from the matching
  tuning, group derived from the tuning type.
- **STBL** — build from a string-key → text map; read the container layout
  from the `sims-4` `stbl.md` reference, never from memory.
- **Clones/textures/meshes** — carry the original resource bytes raw; never
  re-encode.

**Done when:** every new resource builds from its source without errors, and
every clone's raw bytes match the source package.

### 4. Assemble and write

Add resources under their keys; merge cloned resources raw. Use the library's
standard compression path, not a hand-rolled one. Write the `.package` to the
intended Mods output.

**Done when:** a valid DBPF 2.1 `.package` is emitted and the resource count
written equals the step-1 checklist.

### 5. Verify round-trip

Reopen the package with an independent reader (`sims-4` inspection, s4pe, or
S4S). Every key written is present and decodable, no duplicate instances,
tuning XML well-formed, STBL complete.

**Done when:** the second-tool read matches the written manifest with zero
errors and zero key collisions.

### 6. Deploy and test (optional)

Copy the `.package` into the game's Mods folder and confirm the intended
behavior in game. Duplicate TGIs across mods are last-one-wins conflicts.

**Done when:** the effect reproduces in game with no exception logs in the
game's documents folder.

## Progressive reference loading

| Task | Reference |
| --- | --- |
| S4TK setup + verified build recipe | `references/toolchain.md` |
| What S4TK actually emits (empirically verified + empty-SimData gotcha) | `references/verified-behavior.md` |
| TGI assignment, collisions, filename conventions | `references/resource-keys.md` |
| DBPF header/index/compression (byte level) | `sims-4`: `references/dbpf-2.1.md`, `internal-compression.md` |
| Resource type map | `sims-4`: `references/resource-types.md` |
| STBL layout/encoding | `sims-4`: `references/stbl.md` |
| Evidence rules, never guess facts | `sims-4` SKILL.md |
| Script-mod partner file | `sims4-ts4script-authoring` |