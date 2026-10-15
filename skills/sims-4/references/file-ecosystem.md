# Sims 4 Installable / User File Ecosystem

Evidence-first reference. Every factual claim below carries a citation. Items
without solid sources are marked **not yet verified**.

Confidence labels used here:

- **Verified** — confirmed against current documentation or independent implementations.
- **Community-observed** — reverse-engineered or practitioner-reported behavior.

---

## User data root

The Sims 4 user data folder lives at:

```
Documents/Electronic Arts/The Sims 4/
```

It contains `Mods`, `saves` (lowercase), `Tray`, `Screenshots`, `Recorded Videos`,
and `Options.ini`. [Carls Guide, "The Sims 4 Saves - Backing Up Your Game"](https://www.carls-sims-4-guide.com/help/save.php)

## Mods folder

Location: `Documents/Electronic Arts/The Sims 4/Mods`.

### Layout and nesting (Verified)

- The game creates a `Resource.cfg` file inside `Mods` on first run. It tells
  the game which file patterns to load and how deep to scan subfolders.
  [TSR Zendesk: "The Sims 4 resource.cfg File"](https://thesimsresource.zendesk.com/hc/en-us/articles/31361444145683-The-Sims-4-resource-cfg-File)
- The default contents are:
  ```
  Priority 500
  PackedFile *.package
  PackedFile *\*.package
  ```
  [SimsWiki: "Game Help:TS4 CC Basics"](http://simswiki.info/wiki.php?title=Game_Help%3ATS4_CC_Basics)
- Widely distributed variants extend the `PackedFile` lines to five levels,
  e.g. `PackedFile */*/*/*/*/*.package`; each extra `*/` adds one folder level.
  [TSR Zendesk article above](https://thesimsresource.zendesk.com/hc/en-us/articles/31361444145683-The-Sims-4-resource-cfg-File),
  [SimsWiki: "Game Help:TS4 Organizing Custom Content"](https://simswiki.info/wiki.php?title=Game_Help%3ATS4_Organizing_Custom_Content)
- The `Priority 500` line marks loaded packages as high priority, so they
  override Maxis-authored resources with identical resource keys.
  [SimsWiki: "Game Help:TS4 CC Basics"](http://simswiki.info/wiki.php?title=Game_Help%3ATS4_CC_Basics)

### `.package` mods (Verified)

- `.package` is the DBPF container used for game data, mods, and custom
  content. [SimsWiki: "Game Help:TS4 CC Basics"](http://simswiki.info/wiki.php?title=Game_Help%3ATS4_CC_Basics)
  See `dbpf-2.1.md` for container internals.

### `.ts4script` script mods (Verified)

- A `.ts4script` file is nothing more than a ZIP archive containing compiled
  Python 3.7 files (`.pyc`), renamed to `.ts4script`.
  [Matroska TS4 API docs](https://matroska.mechapower.eu/api)
- The recommended way to confirm the game's current Python version is to
  inspect `<PATH_TO_SIMS_4>/Game/Bin/python*_x64.dll`.
  [SanjoSolutions/sims4-mod-development-tools README](https://github.com/SanjoSolutions/sims4-mod-development-tools)
  (As of those sources, the version is 3.7. If the DLL reports something else,
  trust the DLL.)
- The game loads only `zip` files, including zips renamed to `.ts4script`;
  packaging both `.py` and matching `.pyc` files is recommended because the
  game's load behavior across folders is nuanced.
  [June Hanabi, "The Sims 4 Modern Python Modding: Ultimate Loading Guide"](https://medium.com/@junebug12851/the-sims-4-modern-python-modding-ultimate-loading-guide-77ce1b68f1e7)
- Load rules observed by that guide (**community-observed**): loose files in
  the top-level `Mods` folder are ignored except `ts4script`/`zip`; first-level
  subfolders are treated as organization folders whose `ts4script`/`zip` files
  load; additionally, a special `Scripts` subfolder inside a mod folder is
  recursively scanned for plain `.py` files (development convenience).
- Script mods should be kept near the top of the Mods tree; deep nesting can
  break some script mods. [EA Forums answer](https://forums.ea.com/discussions/the-sims-4-mods-and-custom-content-en/re-how-do-i-edit-my-resource-cfg-file-for-sims-4/9268685) (**community-observed**)

## saves folder

- Location: `Documents/Electronic Arts/The Sims 4/Saves` (referred to as
  `saves`). Contains `.save` files plus rotating backups `.ver0`–`.ver4`
  (up to five backups per save slot).
  [TS4 Modders Reference: File Types](https://thesims4moddersreference.org/reference/file-types/)
- `.save` and the `.ver*` backups are renamed `.package` files (DBPF-style
  containers). [TS4 Modders Reference: File Types](https://thesims4moddersreference.org/reference/file-types/)
- Save slots are named like `Slot_xxxxxxxx.save` where `xxxxxxxx` is an
  8-digit hexadecimal slot number. [SocialSimmer: "Understanding The Sims 4 Saves Folder"](https://socialsimmer.com/the-sims-4-saves-folder) (**community-observed** naming detail)

## Tray folder

- Location: `Documents/Electronic Arts/The Sims 4/Tray`. Holds Gallery/Library
  items — households, lots, rooms — each saved as a *bundle of multiple sibling
  files*, never a single file. Deleting any one file of the bundle breaks the item.
  [EA Forums: "Tray & Saves Folders"](https://forums.ea.com/discussions/the-sims-4-gameplay-en/tray--saves-folders/8574622)
- File roles (Verified, [TS4 Modders Reference: File Types](https://thesims4moddersreference.org/reference/file-types/)):
  - `.trayitem` — used by all three kinds of tray items (lot, room, household)
  - `.blueprint` — lot information; `.bpi` — lot thumbnail images
  - `.hhi`, `.householdbinary` — household-related
  - `.rmi`, `.room` — room-related
- Which subset appears varies per item.
  [TS4 Modders Reference: File Types](https://thesims4moddersreference.org/reference/file-types/)
- Files must sit loose in the Tray root; subfolders are not scanned, and
  misplaced `.package`/`.save` files are ignored there.
  [SocialSimmer: "The Sims 4 Tray Folder"](https://socialsimmer.com/the-sims-4-tray-folder) (**community-observed**)

## Not yet verified

- Exact grammar/parser of `Resource.cfg` beyond the `Priority n` /
  `PackedFile <glob>` lines shown above.
- Any official EA documentation URL describing `.ts4script` packaging (EA's
  help pages discuss installing mods generally; the Python-version facts above
  rest on community tooling docs and the `python*_x64.dll` check).
