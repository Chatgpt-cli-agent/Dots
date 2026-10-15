# Working with .ts4script Files — High-Level Workflow

## What a .ts4script is

A `.ts4script` is a **renamed ZIP archive** containing compiled Python
(`.pyc`) files — the script mod. It is not a DBPF. See `file-ecosystem.md`.

## To inspect an existing script mod

1. Copy it and change the extension to `.zip` (or unzip it directly).
2. Extract the `.pyc` files.
3. Decompile with a Python decompiler to read the source (for reference or
   troubleshooting).
4. Read the resulting Python against the Sims 4 scripting API.

## To create a script mod

1. Write the Python using the Sims 4 scripting API (mod class, tuning refs).
2. Compile to `.pyc` matching the game's Python version.
3. Package the `.pyc` into a ZIP.
4. Rename the ZIP to `.ts4script`.
5. Place it in the game's Mods folder (verify the exact path for the current
   install; it varies by platform).

## Notes

- Script mods run as code in the game — a malformed script can break the game
  or conflict with other script mods. Test carefully.
- Decompiling others' mods is for learning/troubleshooting; respect the
  original author's terms.
- Python version and API specifics are version-dependent. Verify against the
  current game and `file-ecosystem.md`, not from memory.
