---
name: sims4-ts4script-authoring
description: Writing Sims 4 script mods — Python 3.7 source targeting the game's embedded Python/EA API, compiling to .pyc, packaging as a .ts4script (renamed ZIP), deploying to Mods, injection, hot reload, and debugging. Use when the task is to write, build, compile, extend, debug, or reproduce a script mod (.ts4script), game cheat commands, injections, zone events, or to decompile game/mod Python. For package/tuning authoring, use sims4-package-authoring / sims4-tuning-authoring; for inspecting files, the sims-4 skill.
---

# Sims 4 — Script/Automation Mod Authoring

A `.ts4script` is a renamed ZIP of compiled Python (`.pyc`) modules that the
game imports at startup. The game embeds CPython 3.7 on this box — verified
`python37_x64.dll` in
`<game>/Game/Bin/Python/`. Target that Python; do not reach for modern syntax
the 3.7 compiler rejects.

Evidence rules are inherited from the `sims-4` skill. Exact API signatures
must be read from the installed game build, never recalled from memory.

## Core rules

- Target **Python 3.7** bytecode. Compile with a 3.7 toolchain (see
  `references/build-toolchain.md`), not the system Python if it is a newer
  major version.
- The game's scripting API (`sims4.*` and the gameplay modules) ships as
  `.pyc` modules in the **zips under `<game>/Data/Simulation/Gameplay/`** —
  `simulation.zip` (the API), `base.zip` (stdlib `lib/*`),
  `core.zip` (engine core). Verified on this box (2026-09-04); a decompiler
  (`unpyc3.py`/pycdc/unpyc37) reads those directly. `Game/Bin/Python/generated.zip`
  is the protobuf layer only. The Simulation `.package` files are the
  data/tuning-def side (compiled defs), not loose script modules.
  `references/ea-api-surface.md` explains how to read the real API from the
  installed build.
- One `.ts4script` per mod; ship it and its `.package` (tuning) side by side.
- Test in-game on a throwaway save; a bad script can error the whole game.

## Workflow

### 1. Confirm the environment

Verify the game's embedded Python on this box before planning syntax:
`Game/Bin/Python/python37_x64.dll` (direct observation; community sources say
3.7). Identify the Mods folder for the current install.

**Done when:** the target Python version, game install path, and Mods path are
confirmed on this machine.

### 2. Set up a mod workspace

Stand up one of the verified workspaces from `references/build-toolchain.md`
(Sanjo mod-development-tools, azigler ts4-modding-workspace, or
ssinakhot/sims4-workspace) pinned to Python 3.7. Prefer git + the workspace's
settings file so builds are reproducible.

**Done when:** a clean `compile` run produces an empty or trivial
`.ts4script` in the configured build folder.

### 3. Read the real API for the installed build

For any API you will call, decompile the relevant modules from the game's
Simulation packages (see `references/ea-api-surface.md`) and quote what you
find. Do not write calls against remembered signatures.

**Done when:** every API surface you depend on is confirmed against
decompiled code for this game version.

### 4. Write the mod

- Target Python 3.7; no f-strings with debug tricks, no `match`, no `:=`
  unless 3.7-safe (and never assume — check the target).
- Prefer the least invasive hook: an injected method, a registered command
  (`@Command`), a zone-load callback — over replacing a whole module.
- Respect the original author's terms when borrowing from other mods.
- Validate imports against the decompiled set; an import of a module the game
  build lacks breaks startup.

**Done when:** the source parses under the 3.7 compiler, imports resolve
against the decompiled API, and the hook points are cited.

### 5. Compile and package

Compile to `.pyc`, assemble the ZIP with the module layout, rename to
`.ts4script` (or use the workspace's `compile.py` which does this). Never zip
with a tool that adds unsupported compression; keep it a plain ZIP.

**Done when:** the `.ts4script` is produced and opens as a valid ZIP with the
expected modules inside.

### 6. Deploy and test

Place the `.ts4script` (and its partner `.package`) in the Mods folder, run
the game, and confirm behavior. Watch the game's exception log
(`LastException.txt` / `exception` folder under the game's documents dir) and
the script log if present.

**Done when:** the intended behavior appears in game and the exception log is
clean of your mod.

### 7. Iterate with devmode or hot reload

Long dev loops: use the workspace's `devmode.py`, `xml_reloader.py` /
`script_reloader.py`, or the `devmode.reload` cheat to avoid game restarts.
See `references/build-toolchain.md` for which tool supports what.

**Done when:** the iteration loop is documented (which file, which command,
which in-game signal) and actually re-loads changes.

## Progressive reference loading

| Task | Reference |
| --- | --- |
| Workspaces, compile/decompile/devmode, Python 3.7 setup | `references/build-toolchain.md` |
| Reading the real EA API from the installed build | `references/ea-api-surface.md` |
| What a .ts4script ZIP must contain | `sims-4`: `references/file-ecosystem.md`, `ts4script-guide.md` |
| Tuning your script mod configures | `sims4-tuning-authoring` |
| Bundling tuning/strings with the mod | `sims4-package-authoring` |