# Python 3.7 build toolchain — verified workspaces

Three real, working workspaces bootstrap Sims 4 script mods. The facts below
come from their READMEs/source trees (fetched during research). In-file rules:
**all** of them target the game's Python 3.7 — do not replace that target with
the host Python.

## 1. SanjoSolutions/sims4-mod-development-tools

- https://github.com/SanjoSolutions/sims4-mod-development-tools
- "Compiler for Sims 4 mod python scripts. It creates the ts4script file."
- Game Python version: check the game's python DLL — "At the time of writing
  this seems to be 3.7"; on this box: `<game>/Game/Bin/Python/python37_x64.dll`.
- Setup: copy `settings.template.py` → `settings.py`; set author, project
  name, folder paths. `src_subpath` = source, `build_subpath` = build output,
  plus projects folders for decompiled Python/tuning under `__util/`.
- `compile.py` — compiles `src` → `.ts4script` into `build` and copies it to
  the game's Mods folder under `Mods/<Author>_<Project>/`.
- `devmode.py` — "Dev Mode": clears compiled output, symlinks `src` into the
  Mods folder so no recompile is needed; `compile.py` exits Dev Mode. `devmode.reload [path.to.module]` reloads code live in-game.
- `sync_packages.py` — copies top-level `.package` files from `assets/`
  alongside the scripts; run automatically by `compile.py`/`devmode.py`.
- `debug_setup.py` / `debug_teardown.py` — build/remove PyCharm Pro debugging
  helper `.ts4script` mods (the only community-known real debugger route).
- `decompile.py` — decompiles the game's Python into a projects folder.
- Sibling repos: `sims4-boilerplate` (project template) and
  `sims4-modding-guide` (broader guide, incl. tuning via the TDESC builder).
- Python 3.7 on Linux: anaconda env `conda create --name Sims4 python=3.7`, or
  deadsnakes PPA `python3.7`.

## 2. azigler/ts4-modding-workspace

- https://github.com/azigler/ts4-modding-workspace (23 stars)
- Bash + Python: `Scripts/compile.sh`, `Scripts/decompile.sh` drive
  `Utilities/compile.py`, `Utilities/decompile.py`, `Utilities/unpyc3.py`
  (decompiler), `Utilities/injector.py`, `Utilities/settings.py`,
  `Utilities/get_dir.py`.
- Python 3.7 bootstrap trick: symlink the 3.7 interpreter into the workspace
  as `./python3` (`ln -s .../bin/python3.7 ts4-modding-workspace/python3`),
  confirm with `./python3 -V` — so every script's shebang resolves to 3.7.
- Ships a working sample: `Mods/hello_world/example_script.py` +
  `injector.py`.
- Ships hot reload: `Mods/hotreload/script_reloader.py`,
  `xml_reloader.py`, `settings.py`, plus an example tuning-override XML whose
  filename embeds its TGI:
  `E882D22F!00000000!0000000000006A25.Idle_Chatting_STC.InteractionTuning.xml`.

## 3. ssinakhot/sims4-workspace (also mirrored as gbataglini/sims4-workspace)

- https://github.com/ssinakhot/sims4-workspace
- Heaviest tooling: `compile.py`, `decompile.py`, `datamine/` package parser +
  tuning splitter, `devmode.py` with `devmode.reload`, `debug_setup/teardown.py`,
  VS Code devcontainer that installs Python 3.7, and submodules `pycdc` +
  `unpyc37` (decompilers).
- Mounts in `.devcontainer/devcontainer.json` point at the game install (for
  decompile) and the Documents/Mods folder (for compile).
- "All code must remain compatible with Python 3.7."

## Which to pick

- Fastest start, fewest dependencies: **azigler** (symlink 3.7, sample mod).
- Most automated release + package-sync + devmode: **Sanjo**.
- Most complete decompile + datamine chain + devcontainer: **ssinakhot**.
- Inside Sims Creator Studio, the app's Python side (`api/`) is FastAPI and is
  **not** the in-game scripting runtime — the game embeds its own 3.7; build
  .ts4script for the game, not for SCS's server.