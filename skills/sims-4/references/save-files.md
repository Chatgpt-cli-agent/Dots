# The Sims 4 — Save Files Reference

Reference for save games in the `saves` folder
(`Documents/Electronic Arts/The Sims 4/saves`). Every claim below is sourced;
anything that could not be confirmed is explicitly marked **not yet verified**.

Sources used:

- [A1] EA Forums (official Game Info Hub blog), "Backing Up Saves in The Sims 4":
  https://forums.ea.com/blog/the-sims-game-info-hub-en/backing-up-saves-in-the-sims-4---keep-your-sims-safe/12913482
- [A2] Crinrict's Sims 4 Help Blog, "Save Games":
  https://sims4.crinrict.com/eng/2014/09/save-games/
- [A3] Crinrict's Sims 4 Help Blog, "Recover Backup Save Game":
  https://sims4.crinrict.com/eng/2014/09/recover-backup-save-game/
- [A4] Carl's Sims 4 Guide forum, "How-To: Recover a Saved Game":
  https://www.carls-sims-4-guide.com/forum/index.php?topic=21519.0
- [A5] EA Forums thread, "Is there a way to delete just one of my save files?":
  https://forums.ea.com/discussions/the-sims-4-gameplay-en/is-there-a-way-to-delete-just-one-of-my-save-files/8664142
- [A6] EA Forums thread, "Save files - need info, please":
  https://forums.ea.com/discussions/the-sims-4-technical-issues-pc-en/save-files---need-info-please/13256543
- [A7] SocialSimmer, "Understanding The Sims 4 Saves Folder":
  https://socialsimmer.com/the-sims-4-saves-folder
- [A8] The Sims 4 Modders Reference, "File Types":
  https://thesims4moddersreference.org/reference/file-types/
- [A9] The Sims 4 Modders Reference, "Database Package File (DBPF) format":
  https://thesims4moddersreference.org/reference/dbpf-format/
- [A10] Mod The Sims, "Header differences between DBPF versions":
  https://modthesims.info/t/550066

## Slot naming

- Save files are named `Slot_XXXXXXXX.save`, where the eight digits are a slot
  number/hex value assigned by the game; e.g. `Slot_00000002.save` [A4][A7].
- Each "Save As" takes the next free slot. Slot 1 was historically the
  autosave slot; autosave is no longer used, so real saves start at
  `Slot_00000002.save` and count upward [A4][A2].
- After slots 2–9 are used the game continues with letters (A–F), then 10–19,
  1a–1f, and so on [A4]. (SocialSimmer describes the number as an eight-digit
  hexadecimal value [A7]; the two descriptions agree on 8 characters but the
  full enumeration order beyond what [A4] documents is **not yet verified**.)
- The slot number must remain exactly 8 characters for the game to recognize
  the file if renamed manually [A3].
- Like Tray files, `.save` files must sit loose in the root of the saves
  folder — saves inside subfolders are invisible to the game [A7]
  (community-reported).
- All files sharing one slot number (`Slot_00000003.save` plus its `.verN`
  files) are different versions of the same save; deleting that whole set
  removes that save from the Load Game menu [A5].

## The rotating .ver0–.ver4 backup scheme

- Alongside each `Slot_XXXXXXXX.save` the game keeps up to five automatic
  backups: `Slot_XXXXXXXX.save.ver0` through `Slot_XXXXXXXX.save.ver4` [A1][A2][A3][A4][A5][A7].
- Backups are created when you use **Save** (not Save As). Each new Save
  demotes the existing chain: current `.save` becomes `.ver0`, `.ver0` becomes
  `.ver1`, etc.; once five backups exist the oldest is overwritten [A2][A3][A4][A5].
- Ordering: `.ver0` is the most recent backup and `.ver4` the oldest [A1][A5][A6][A4].
- Only the plain `.save` file is strictly required; the `.ver*` files can be
  deleted or archived without harming the game [A4][A6] (with the usual advice
  to keep some backups).

### Recovering a backup

Two verified methods [A1]:

1. In-game: Load Game → select the save → click the floppy-disk "Recover
   Save" button → choose a version → confirm.
2. Manually: exit the game, delete/move the `Slot_XXXXXXXX.save` file, and
   rename e.g. `Slot_XXXXXXXX.save.ver0` by removing the `.ver0` suffix. The
   game then lists it as a legitimate save [A1][A3].

## Format: package-style containers

- Save files are DBPF packages: the Modders Reference states plainly that
  `.save` / `.ver0`–`.ver4` files are "Renamed .package files" [A8].
- Community reverse-engineering confirms TS4 save files carry the same DBPF
  2.1 header as game packages ("save files have the same header as DBPF 2.1
  packages do") and were successfully opened with s4pe [A10]. The Sims 4
  package signature is ASCII `DBPF` (`44 42 50 46`) followed by version u32s,
  major 2 minor 1 (first 12 bytes `44 42 50 46 02 00 00 00 01 00 00 00`)
  [A10], matching the documented DBPF layout of header → resource data →
  resource index [A9].

> Note on versions: sources disagree on whether TS4 DBPF is "2.0" or "2.1"
> (the Modders Reference DBPF page shows major=2/minor=1 fields [A9]; some
> secondary sites say 2.0). The byte-level evidence in [A10] shows minor
> version = 1 for actual TS4 packages.

## Contents

Verified at the level of *resource types found inside save packages*, per the
Modders Reference "Save Files" internal-file list [A8]:

- **Save Game Data** — data about the save at the exact time it was saved:
  info identifying the save point and its chronology, the account it was made
  on, timestamp, notification-wall contents, clubs, game options, custom CAS
  colours, camera position, calendar info, sims — "virtually everything that
  can be tracked as data."
- **Zone Object Data** — information about lots in the save, listed by world
  and lot name.
- Thumbnails/images: Memorial Thumbnail (deceased sims), Save Game Household
  Thumbnail (last-played household, shown on the main menu), Save Game Lot
  Thumbnail 1 & 2 (main/small thumbnails for viewed lots), Save Game Lot Level
  Thumbnail and Lot Travel Thumbnail Mask (plex-system apartments),
  Save Game Custom Texture (pictures/paintings created in the save).

So a save contains many resource types covering sim, household, lot/zone, and
world state plus generated imagery — consistent with it being one large DBPF
container rather than loose per-system files.

**Not yet verified:** the specific numeric resource-type IDs used inside save
packages (e.g., type GUIDs for Save Game Data), the exact protobuf/binary
schemas of those resources, and any per-resource compression details beyond
the generic DBPF compression mechanisms documented at [A9].
