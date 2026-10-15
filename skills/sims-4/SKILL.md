---
name: sims-4
description: Expert The Sims 4 file-format and modding guidance for .package/DBPF, saves, Tray files, worlds, script mods, CC resources, resource keys, reverse engineering, and Sims-focused tooling. Use for .package, .save/.ver*, .world, .ts4script, .trayitem, .blueprint, .bpi, .hhi, .householdbinary, .sgi, .room, .rmi, DBPF/TGI parsing, Sims 4 Studio/s4pe-style inspection, lot/household extraction, and Sims 4 binary-format coding. Router for Sims authoring: dispatch package building to sims4-package-authoring, script mods to sims4-ts4script-authoring, tuning/SimData/STBL to sims4-tuning-authoring, and mod dissection to sims4-mod-reverse-engineering. Evidence-first; never guess undocumented format details.
---

# The Sims 4 — Koda Expert Skill

Use this skill whenever the task involves The Sims 4 game files, modding files,
custom content, Tray content, save files, package/resource parsing, Sims 4
reverse engineering, or tools that inspect/transform those formats.

## Skill delegation — this skill is the router

This skill owns **reading/inspecting** Sims files and the byte-level format
facts. **Authoring and dissection** work dispatches to a specialist — load the
specialist (not this body) for that work:

| User intent | Load |
| --- | --- |
| Build/create/extend a `.package`, write a package build script | `sims4-package-authoring` |
| Write/compile/debug a Python script mod (`.ts4script`) | `sims4-ts4script-authoring` |
| Write/edit tuning XML, SimData, STBL; buffs/interactions/careers/objects | `sims4-tuning-authoring` |
| Deconstruct an existing mod: what it does, its dependencies, clean-room recipe | `sims4-mod-reverse-engineering` |
| Architectural design, floor plans, For Rent units, room layout | `sims4-architecture` |
| Archive triage, duplicate mod checks, "Reveal what lies within" audit | `sims4-archive-diagnostics` |
| Create or edit mesh CC, CAS items, objects, recolors, from concept through test | `references/modding-guide.md` (this skill) |
| Read/parse/inspect files, byte-level formats, evidence-tier rules | **this skill** (below) |

The specialists inherit this skill's evidence rules; don't re-teach them there.
Inspection tasks that *lead into* an authoring step hand off to the specialist
for that step. If a specialist is loaded, keep this skill's progressive-loading
table available for byte-level questions it points at.

## Identity facts Koda must know

- **DBPF = Database Packed File.** In this context, never invent another expansion.
- The Sims 4 commonly uses **DBPF 2.1** for package-style containers.
- A Sims 4 DBPF resource key is handled as **Type + Group + 64-bit Instance**.
  Call it a *resource key* or *TGI* and preserve all bits.
- `.package` is the normal DBPF container used by mods, CC, game data, caches,
  and many installed resources.
- `.save` and `.ver0`–`.ver4` are package-style save containers; the `.ver*`
  files are rotating backups.
- `.ts4script` is a renamed ZIP archive containing Python script-mod files,
  usually compiled `.pyc` files.
- Tray content is a **bundle of multiple sibling files**, not one magic "lot
  file" or "household file".

## Non-negotiable anti-hallucination rules

- Never guess a Sims acronym, magic value, offset, resource type ID,
  compression code, schema field, or version.
- Never substitute Sims 2, Sims 3, Spore, or SimCity DBPF layouts for Sims 4.
  DBPF versions are related but not interchangeable.
- When evidence is incomplete, say **unknown / not yet verified** and inspect
  bytes, current references, or known implementations.
- Give every fact an evidence tier, highest first:
  1. Direct observation from real Sims 4 files
  2. Multiple independent working implementations
  3. Sims 4 Studio implementation (`references/s4s/`)
  4. s4pi / Sims4Tools implementation
  5. S4TK / LlamaLogic implementation
  6. Cross-confirmed community documentation
  7. Single community source
  8. Hypothesis / inference
- **NEVER upgrade an unknown field into a named semantic without evidence.**
  Preserve identifiers such as `U1`, `U2`, `Unknown_0x…` until independently
  identified. A mysterious uint32 that happened to be 3 once is not a
  "BedroomCountFlag". Check `references/s4s/unknown-fields.md` before claiming
  any unknown field is understood.
- Distinguish:
  - **verified specification** — current documentation or multiple independent implementations;
  - **community-observed** — reverse-engineered behavior with useful evidence;
  - **hypothesis** — an inference that still needs validation.
- Preserve unknown/reserved fields in parsers. Do not rename an unknown field
  into a confident semantic name without evidence.
- For reverse engineering, prefer difference testing: compare known-good files
  where one controlled in-game property changed.
- Never decide file identity from extension alone. Check magic
  bytes/container structure when possible.
- Never destroy or rewrite original Sims files by default. Inspection tasks
  are read-only unless the user explicitly requests writing.
- When a task says "implement only X", do only X. Do not sneak in
  decompression, mutation, resource decoding, or speculative features.
- A parser must fail safely on malformed data: checked arithmetic, bounds
  checks, size caps, and useful errors.

## Source/evidence priority

Use the evidence tiers above for binary claims. For local LlamaLogic source,
010 Editor templates matched by resource type ID, or TS4 Modders Reference
Markdown/MDX, read `references/local-engineering-sources.md`.
Read `references/sources.md` for the broader curated research baseline.

## Progressive reference loading

Load only what the current task needs:

| Task | Reference |
| --- | --- |
| **Lot system: tray → blueprint → architecture pipeline** | `references/s4s/tray-pipeline.md` |
| .blueprint container + LDNB linkage | `references/s4s/blueprint.md` |
| LOT architecture container (LDNB, value grids) | `references/s4s/lot-architecture.md` |
| Walls, segments, coverings, cutouts | `references/s4s/walls.md` |
| Floors / floor patterns / room layers | `references/s4s/floors.md` |
| Roofs | `references/s4s/roofs.md` |
| Stairs/railings/fences/columns/half-walls | `references/s4s/stairs.md` |
| Terrain/pools/ponds/foundations/platforms | `references/s4s/terrain.md` |
| Placed objects + catalog chain (OBJD/OBJC/DGUD) | `references/s4s/objects.md` |
| CurseForge file matching or fingerprint algorithms | `references/curseforge-fingerprint.md` |
| Local implementation comparison, binary templates by type ID, modding docs | `references/local-engineering-sources.md` |
| DBPF header/index/package parsing (public research) | `references/dbpf-2.1.md` |
| DBPF as S4S implements it — verification vs public docs | `references/s4s/dbpf-verification.md` |
| CAS parts, blends, swatches, tuning XML, SimData | `references/s4s/casp-simdata.md` |
| GEOM/mesh formats (CAS + object MODL/MLOD) | `references/s4s/geom.md` |
| RLES/RLE2/LRLE/DDS textures | `references/s4s/textures-rle.md` |
| RIG/CLIP animation, events, bone poses | `references/s4s/animation-clips.md` |
| Unidentified-field registry (check BEFORE naming unknowns) | `references/s4s/unknown-fields.md` |
| Rust implementation | `references/rust-dbpf-readonly.md` |
| Package resource IDs / CC classification | `references/resource-types.md` |
| Tray/lot/household/room files | `references/tray-files.md` |
| Save files | `references/save-files.md` |
| Script mods / installable file classes | `references/file-ecosystem.md` |
| STBL strings | `references/stbl.md` |
| Sims internal DBPF compression | `references/internal-compression.md` |
| CC package classification/dependencies | `references/cc-package-anatomy.md` |
| Unknown binary format investigation | `references/reverse-engineering.md` |
| Creating/authoring a package mod | `sims4-package-authoring` |
| Creating/authoring a script mod (.ts4script) | `sims4-ts4script-authoring` |
| Authoring tuning/SimData/STBL | `sims4-tuning-authoring` |
| Deconstructing an existing mod | `sims4-mod-reverse-engineering` |
| Architectural design, floor plans, For Rent units | `sims4-architecture` |
| Archive audit & duplicate mod diagnosis | `sims4-archive-diagnostics` |
| Repairing a broken .package | `references/package-repair.md` |

The `references/s4s/` layer is a claim-based verification layer extracted from
decompiled Sims 4 Studio source (`/home/windenburg/Projects/sims/All About The Sims4/Sims4Tools/S4S-SourceCode/`, see its
README). Each claim carries Evidence / Confidence / Public-reference agreement
lines and preserves unknown field names verbatim. The lot system
(`tray-pipeline` → `blueprint` → `lot-architecture` → surface docs) is the
priority chain for lot generation work. When a public doc and an s4s doc
disagree, record the conflict — do not silently pick a winner.

## Default workflow for Sims file-inspection tasks

1. Identify the exact Sims 4 artifact being handled.
2. Determine its container/magic before interpreting fields.
3. State the supported scope precisely.
4. Parse the smallest trustworthy structure first.
5. Keep raw values available alongside interpreted values.
6. Validate offsets/sizes before slicing or seeking.
7. Produce a resource/type histogram before guessing what a package "is".
8. Add tests using real or fixture bytes covering both common and awkward layouts.
9. Keep unsupported formats explicit instead of silently misparsing them.

If Koda sees DBPF in a Sims 4 task, immediately think:

> Database Packed File → Sims 4 package/save/world-style container → verify
> version → 96-byte header → locate resource index → parse variable-width
> index entries using shared-field flags → preserve TGI and compression
> metadata → only then inspect resources.

Do not brainstorm what the acronym might mean.

## Coding posture

- Prefer simple, auditable binary readers over clever abstractions.
- Separate parse from interpret from extract.
- Model offsets and file lengths with 64-bit integers during validation.
  Convert to `usize` only after checked range validation.
- Avoid unsafe for basic binary parsing unless there is a measured reason.
- A read-only tool should open files without write permissions and should not
  create modified copies unless asked.
- Preserve package order when returning index entries.
- When printing keys, use fixed-width uppercase hex:
  `TTTTTTTT-GGGGGGGG-IIIIIIIIIIIIIIII`.

## What good behavior looks like

Bad:

> "DBPF (Duke Beyond the Perilous Frontier?)"

Good:

> "This is a Sims 4 DBPF 2.1 container. I'll implement only the 96-byte
> header and resource-index parser, including the index shared-field flags
> and extended-entry bit. I'll leave resource decompression and decoding out
> of this phase."
