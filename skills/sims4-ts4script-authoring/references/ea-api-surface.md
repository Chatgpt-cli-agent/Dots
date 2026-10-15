# Reading the EA scripting API from the installed build

Never write a script-mod import or call from memory. The API shifts between
game versions; this box's version is the only authority. Evidence tier for
everything below: **direct observation on this machine** unless a URL is given.

## Where the API lives on this box

- `Game/Bin/Python/python37_x64.dll` — CPython 3.7 runtime.
- `Game/Bin/Python/generated.zip` — 59 files, mostly `protocolbuffers/*_pb2.pyc`
  plus a `key` file. This is the protobuf layer only, not the gameplay API.
- **`Game/Data/Simulation/Gameplay/` — `simulation.zip`, `base.zip`, `core.zip`**
  (verified 2026-09-04). These ARE the game's scripting modules for this
  install: `simulation.zip` holds the gameplay API `.pyc` files (dated
  `2026-08-06`, matching the installed patch), `base.zip` holds the Python
  stdlib under `lib/`, `core.zip` the engine core (`accumulator`, `algos`,
  `enum`, `api_config`, ...). This corrects an earlier claim that modern
  installs ship no loose zips: the archives exist here, under different names
  (`simulation.zip` is the API; historical workspaces assumed
  `Core.zip`/`base.zip`/`libs.zip`, which this box does NOT use).
- `Game/Data/Simulation/` and `EPxx/Data/Simulation/` — the Simulation
  `.package` files (`SimulationFullBuild0.package`,
  `SimulationDeltaBuild0.package`, `SimulationPreload.package`, per-DLC
  copies) are the **data/tuning-def side**. Observed on this install: those
  packages are overwhelmingly compiled binary definitions (e.g. type
  `0xC0DB5AE7` / `0x319E4F1D` blocks), NOT loose XML tuning; the base
  `SimulationFullBuild0.package` contains, e.g., Animation-State-Machine XML
  and small XML sets, and contains no loose Buff/CombinedTuning/STBL/Trait
  resources. See `sims-4` `file-ecosystem.md` notes on the compiled-then-XML
  split.
- The in-game `.package` catalog (ClientFullBuild etc.) is the tuning/data
  side, separate from scripting; its big counts are images (e.g. DdsImage,
  type `0x00B2D882` thumbnails) and compiled defs.
- For **scripting**, the useful source is the `Gameplay/*.zip` `.pyc` modules:
  decompile those directly rather than excavating the Simulation `.package`
  files.

## How to read a real signature

1. Decompile the module you need from **`Data/Simulation/Gameplay/*.zip`**:
   `unzip -d` the three archives, then run a decompiler
   (`unpyc3.py`, `pycdc`, `unpyc37`) over the `.pyc`. (This box also keeps the
   Simulation `.package` files, but the zips are the direct script source.)
2. Open the module for the class you need (e.g. the interaction/zone/service
   module relevant to your hook) and quote the exact signature from the
   decompiled text.
3. Note the game build/version the decompile came from; if the game updates,
   re-decompile before assuming.

## Well-established API landmarks (cross-confirmed, but verify each call)

- `sims4.commands.Command` — decorator registering a console cheat, e.g.
  `@Command('mymod.cheat')`; documented across all major modding guides.
- Tuning is accessed through instance managers at runtime (tuning XML → Python
  classes loaded by the game); the `sims4-tuning-authoring` skill covers the
  authoring side.
- `sims4` core module + the gameplay packages (`services`, `objects`,
  `interactions`, `zone`, ...) are the import surface scripts extend. Typical
  mod flows: register on zone load, inject a method into a game class, or hook
  a zone event.
- Injections are the least invasive pattern: the community workspace ships
  `injector.py` helpers (`azigler`, `Sanjo`) — copy the pattern from the
  workspace you chose rather than inventing one.

## Prose references (cross-confirmed guides)

- Lot 51 simdex "Learn to Mod" — https://lot51.cc/simdex/resources (2026
  index; links the Modern Python Modding series and concept docs).
- SanjoSolutions/sims4-modding-guide — https://github.com/SanjoSolutions/sims4-modding-guide
  (Python 3.7 guidance + tuning/SimData pointers).

Rule: any call you ship must trace to decompiled code or a cited guide for
this game version; if neither is available, say so and write the call as
"verify before finalizing", never as confident reality.