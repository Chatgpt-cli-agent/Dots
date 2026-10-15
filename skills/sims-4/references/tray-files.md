# The Sims 4 — Tray Folder Reference

Reference for the Gallery/Library export files in the Tray folder
(`Documents/Electronic Arts/The Sims 4/Tray`). Every claim below is sourced;
anything that could not be confirmed is explicitly marked **not yet verified**.

Sources used:

- [S1] SimsWiki, "Sims 4:0x2A8A5E22" (trayitem resource page):
  https://simswiki.info/wiki.php?title=Sims_4%3A0x2A8A5E22
- [S2] Carl's Sims 4 Guide forum, "How-To: Organize the Files in the Tray Folder":
  https://www.carls-sims-4-guide.com/forum/index.php?topic=26535.0
- [S3] The Sims 4 Modders Reference, "File Types":
  https://thesims4moddersreference.org/reference/file-types/
- [S4] The Sims Resource, "[TS4] How to Install Sims & Lots":
  https://www.thesimsresource.com/content/view-post/post/27512/[TS4]%20How%20to%20Install%20Sims%20&%20Lots
- [S5] The Sims Resource, "Files needed for uploading Sims 4 Sims, Households and Lots":
  https://www.thesimsresource.com/news/view-post/post/26857/
- [S6] SocialSimmer, "The Sims 4 Tray Folder: Location & File Types Inside":
  https://socialsimmer.com/the-sims-4-tray-folder
- [S7] Carl's Sims 4 Guide forum, "How-To: Recover a Saved Game" (slot naming context):
  https://www.carls-sims-4-guide.com/forum/index.php?topic=21519.0

## Overview

The Tray folder holds everything saved to the in-game Gallery (Library): lots,
rooms, and households. Each Library entry is **not** a single file — it is a
bundle of sibling loose files that all share a common identity string in their
filenames and were written at the same moment (same timestamp), so they are
normally grouped by modification date [S2][S5][S6].

- All tray files must sit directly in the root of the Tray folder; subfolders
  make items invisible to the game [S6] (community-reported; also consistent
  with MTS discussion of subfolders being untested/likely not working:
  https://modthesims.info/t/552260).
- To share an item, gather all sibling files with the same timestamp into one
  archive; recipients drop the extracted loose files back into Tray [S2][S4][S5].

## Filename scheme

Tray files are named `0x<TYPE>!<INSTANCE>.<extension>`, e.g.
`0x00000000!0x022702cf7aca0049.trayitem` [S2]. The part after `!` is the
instance ID shared by all siblings of one item; the leading hex number varies
per file role within the bundle [S2]. Verified examples from [S2]:

Household:

```
0x00000000!0x001302d262860048.householdbinary
0x00000001!0x001302d262860048.trayitem
0x8dd86402!0x001302d262860048.hhi
0x8dd86403!0x001302d262860048.hhi
0x00000013!0x041302d262860049.sgi      <- 1 .sgi per Sim
```

Lot:

```
0x00000000!0x022702cf7aca0049.blueprint
0x00000000!0x022702cf7aca0049.trayitem
0x00000000!0x022702cf7aca0049.bpi      <- several, +1 per additional floor
```

Room:

```
0x00000000!0x044403b22b520046.room
0x00000002!0x044403b22b520046.rmi
0x00000003!0x044403b22b520046.rmi
0x00000003!0x044403b22b520046.trayitem
```

Note from [S2]: older room exports may use a `.midi` extension for the two
files that newer saves write as `.rmi`.

## File types by item kind

| Extension | Used by | Role |
|---|---|---|
| `.trayitem` | Lots, Rooms, Households | Metadata/index file; makes the item appear in the Library and identifies what it is [S1][S2][S3][S6] |
| `.blueprint` | Lots | Lot structural information (walls/roofs/foundations placement) [S2][S3][S6] |
| `.bpi` | Lots | Blueprint image / lot thumbnails; multiple per lot, more with additional floors [S2][S3][S6] |
| `.householdbinary` | Households | Core household data (sims of the family) [S2][S3][S5][S6] |
| `.hhi` | Households | Household thumbnail/portrait images (typically 2 per household) [S2][S3][S5][S6] |
| `.sgi` | Households | Per-Sim portrait images; 1 per Sim [S2][S5] |
| `.room` | Rooms | Saved individual room layout data [S2][S3][S6] |
| `.rmi` | Rooms | Room metadata/images; typically 2 per room (older exports may use `.midi`) [S2] |
| `.ini` | — | Listed by the user as possibly present; **presence in the Tray folder not yet verified**. The Modders Reference only documents `.ini` as a general settings-file extension used in game/user-data files, not specifically Tray [S3]. |

Counts verified by community documentation [S2]: a 6-Sim household = 1
`.householdbinary`, 1 `.trayitem`, 2 `.hhi`, 6 `.sgi`; a four-story house =
1 `.blueprint`, 1 `.trayitem`, 8 `.bpi` (described as "4 .bpi files + 1 per
additional floor"); any saved room = 1 `.room`, 1 `.trayitem`, 2 `.rmi`
(or legacy `.midi`). Also noted in [S2]: deleting a household from the Library
does not delete its `.sgi` files.

## Internal structure

### .trayitem

Verified via SimsWiki [S1]:

- A `.trayitem` is "essentially a serialized Protobuf file" using VarInt
  encoding for numbers. It is NOT a DBPF package container.
- The resource type associated with trayitem data is documented under
  SimsWiki page `Sims_4:0x2A8A5E22`.
- Fields decoded in the partial dump on that page include: Lot name (length-
  prefixed string, field tag 0x22), Lot description (tag 0x2A), Creator UUID
  (VarInt, tag 0x30), Creator name (string, tag 0x3A), Favourites (tag 0x40),
  Downloads (tag 0x48), Lot width (tag 0x10) / height (tag 0x18), Lot price
  category 1–6 (tag 0x20), Lot value (tag 0x28), Number of bedrooms (tag 0x30),
  Number of bathrooms (tag 0x38), Architecture value (tag 0x40, multi-byte),
  Num thumbnails (tag 0x48), Front-side thumbnail index (tag 0x50), plus
  optional trait-requirement bytes (tag region 0x72) and tags (field 0x42 with
  length prefix). The page itself labels the dump "incomplete" and notes some
  fields are unknown/varying.

### Are the other tray files DBPF packages?

- Community reverse-engineering on Mod The Sims observed that TS4 save files,
  cache, and tray/saved-sim files share the same `DBPF` 2.1 header as package
  files ("save files have the same header as DBPF 2.1 packages ... it seems
  reasonable to presume that all the other files for TS4 - cache, tray, saved
  sims - are also under the same header"), and the poster successfully opened
  such content in s4pe: https://modthesims.info/t/550066 [S8].
- The Modders Reference states `.save`/`.ver*` files are "Renamed .package
  files" but makes no equivalent explicit statement for individual tray
  extensions beyond grouping them as tray-folder files [S3].
- Therefore: **the claim that `.blueprint`, `.householdbinary`, `.room`, etc.
  are each DBPF containers is supported by community observation [S8], but a
  definitive per-extension breakdown of which resource types each contains is
  not yet verified** against a primary source (e.g., S4TS / Tray Importer
  source code was not fetched during this task).

### Magic bytes / headers

- DBPF packages begin with ASCII `DBPF` (`44 42 50 46`) followed by major/minor
  version u32s; TS4 uses major 2, minor 1 (first 12 bytes
  `44 42 50 46 02 00 00 00 01 00 00 00`) [S8], per the Modders Reference DBPF
  spec: https://thesims4moddersreference.org/reference/dbpf-format/ [S9].
- Whether every tray extension starts with these bytes was not individually
  verified here (**not yet verified per-extension**); only the community
  statement in [S8] covers tray files collectively.

## Practical notes

- Browsing the Community Gallery after saving can add extra `.trayitem` files
  to Tray; match siblings by timestamp, not just name [S5].
- A "flying llama" icon in the Library means some sibling files are missing or
  corrupt; the fix is to remove or re-save those items [S2].
- Files for one item can still partially work if a sibling is deleted, which
  makes manual cleanup error-prone (MTS discussion):
  https://modthesims.info/t/552260
