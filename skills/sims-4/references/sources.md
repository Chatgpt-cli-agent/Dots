# Sims 4 format research — curated sources

Annotated baseline for researching The Sims 4 file formats (DBPF container and
resource types). Each entry lists what the source is authoritative for and a
reliability level:

- **verified specification** — primary implementation code or an explicit,
  internally consistent spec; safe to cite for byte-level facts.
- **community-observed** — tool-author knowledge / wiki claims without a
  formal spec; good working knowledge, spot-check against real files.
- **historical** — covers earlier DBPF generations or other games; context
  only, do not apply to Sims 4.

## Local engineering checkouts

Read `local-engineering-sources.md` for pinned local paths, commits, resource
ID → template routing, and comparison rules for these sources:

- https://github.com/Llama-Logic/LlamaLogic — package implementation and tests.
- https://github.com/Llama-Logic/Binary-Templates — 010 Editor structural references.
- https://github.com/Llama-Logic/TS4-Modders-Reference — local source of the
  already-cited Modders Reference website, including tutorials.

## File identification

- https://github.com/meza/curseforge-fingerprint — normalized file fingerprint
  implementation with a Node binding. Read `curseforge-fingerprint.md` for the
  pinned local checkout, source paths, and limits of file-matching evidence.

## Primary implementations

### Sims 4 Studio "Star" v3.2.6.4 — decompiled source (local)
- Local path: `/home/windenburg/Projects/All About The Sims4/Sims4Tools/S4S-SourceCode/S4Studio/` (see its README.md for provenance; ilspycmd 11.0, .NET 6 assembly)
- The most complete TS4 format implementation in existence outside EA: package I/O
  (`S4Studio/Data/IO/Package/`), CAS/mesh (`Data/IO/CAS/`), RLES/RLE2/LRLE textures
  (`Data/IO/Images/`, `LRLE/`), clips/rigs (`Data/IO/Animation/`), buy/build + footprints +
  slots (`Data/IO/BuyBuild/`), tuning + SimData (`Data/IO/Tuning/`).
- Extracted facts live in the `s4s-*.md` reference docs in this folder — prefer those
  (they cite exact file paths); consult the source directly only to verify or extend.
- Authoritative for: byte-level resource layouts S4S actually parses/writes.
  **verified specification** (implementation code).

### s4pi / Sims4Tools (C#) — Kuree/Sims4Tools (archived Jan 2024)
- Repo: https://github.com/Kuree/Sims4Tools
- Maintained fork: https://github.com/s4ptacle/Sims4Tools
  (fork's `s4pi/Package/` verified byte-identical to upstream during research)
- Key paths:
  - `s4pi/Package/Package.cs` — header field offsets (magic@0, major@4,
    minor@8, index count@0x24, short index offset@0x28, index size@0x2C,
    index version dword@0x3C "always 3?", index position@0x40 with fallback
    to 0x28), save/read logic.
  - `s4pi/Package/PackageIndex.cs` — index flags handling: bits `0x01/0x02/0x04`
    move Type / Group / Instance-high into the shared header; `numFields = 9`.
  - `s4pi/Package/ResourceIndexEntry.cs` — per-entry fields incl. `Compressed`
    u16 ("0xFFFF if Filesize != Memsize") and `Unknown2` u16 ("Always 0x0001").
  - `s4pe/`, `s4pi Wrappers/` — resource-type wrappers used by the s4pe editor.
- Authoritative for: DBPF 2.1 header/index layout as implemented by the
  reference community toolchain. **verified specification**
- Wiki: https://github.com/Kuree/Sims4Tools/wiki/DBPF-Format — compact DBPF
  layout notes incl. bit-number→entry-DWORD table. **community-observed**
  (slightly diverges from code on minor version; see dbpf-2.1.md).

### s4py (Python)
- https://github.com/thequux/s4py/blob/master/lib/s4py/package/dbpf.py
- Independent Python reader/writer; enforces version `(2,1)`; implements the
  same flags (`_CONST_TYPE = 1`, `_CONST_GROUP = 2`, `_CONST_INSTAMCE_EX = 4`),
  filesize high-bit extended-entry rule, zlib + RefPack decoding.
- Authoritative for: cross-checking s4pi behavior in a second language.
  **verified specification** (implementation); RefPack details
  **community-observed**.

### DBPF.js community spec (JavaScript)
- Spec: https://github.com/anonhostpi/DBPF.js/blob/main/docs/spec/DBPF.md
  (index of specs: https://github.com/anonhostpi/DBPF.js/blob/main/docs/spec/README.md)
- Community-maintained cross-game DBPF specification, biased toward Sims 4;
  its README is also a curated catalog of DBPF parsers in many languages
  (C#, Rust, Go, Java…). **community-observed**, useful map of implementations.

## Format references

### The Sims 4 Modders Reference — DBPF page
- https://thesims4moddersreference.org/reference/dbpf-format/
- Full TS4 DBPF spec by Fogity (originally on GitLab): header field list,
  index flags table, entry layout, compression codes (0x0000/0x5A42/0xFFE0/
  0xFFFE/0xFFFF), footnotes on short vs long index offset.
- Also hosts Internal Compression and Resource Type Index pages.
- **verified specification** (best single prose spec for TS4; corroborated by
  s4pi/s4py code during this research).

### Mod The Sims wiki — Sims 4 packed file types
- https://db.modthesims.info/wiki.php?title=Sims_4%3APackedFileTypes
- Large crowd-sourced Type ID → abbreviation/format table (STBL, CASP, JAZZ,
  DATA/SimData, etc.). **community-observed**

## Cross-game / historical context

### SimsWiki — DatabasePackedFile
- https://simswiki.info/wiki.php?title=DatabasePackedFile
  (mirror: https://modthesims.info/wiki.php?title=DBPF)
- The classic DBPF article written for Sims 2-era packages (1.x headers,
  index versions 7.0/7.1, hole tables). Do NOT use its 1.x layouts for TS4.
- Useful only to understand DBPF lineage. **historical**

### Niotso wiki — DBPF
- http://wiki.niotso.org/DBPF
- Cleanest cross-game version table (TSO/SC4 1.0, TS2 1.0–1.1, Spore/TS3/TS4
  2.0, SC2013 3.0) and DIR/trash-index explanation for older games.
  Note it lists TS4 archive version as 2.0 without minor detail.
- **historical** for TS2-and-earlier content; its game-version table itself is
  **community-observed**.

## Other maintained parsers

| Project | Language | URL | Scope |
|---------|----------|-----|-------|
| ytaa/dbpf_reader | C | https://github.com/ytaa/dbpf_reader | States support for "DBPF 2.1 (index version 0.3)" TS4 packages (**community-observed**) |
| chieltbest/dbpf | Rust | https://github.com/chieltbest/dbpf | DBPF library/tools; resource editors mostly Sims 2-focused (**community-observed** for TS4) |
| 0xC0000054/DBPFSharp | C# | https://github.com/0xC0000054/DBPFSharp | Actively maintained (2026 commits); SimCity 4-oriented v1.x reader — useful for historical comparison, not TS4 index flags (**historical/community-observed**) |
| LazyDuchess/OpenTS2 | C# (Unity) | https://github.com/LazyDuchess/OpenTS2 | Sims 2 reimplementation; DBPF v1.x handling (**historical**) |
| Kuree/ts-sims4 | TypeScript | https://github.com/Kuree/ts-sims4 | Small TS4 package reader; commit e4d6b5d shows the 96-byte header read (**verified specification**, mirrors s4pi) |

## Research workflow tips

1. Byte-level claims: prefer s4pi source + TS4MR spec agreement (as done in
   `dbpf-2.1.md`). Two independent implementations agreeing ≈ safe.
2. Type IDs and resource internals: start from MTS/Kuree type tables, then
   confirm with wrapper source under `s4pi Wrappers/`.
3. Anything found only on one blog/forum post (e.g., alleged `0x80` index-flag
   semantics): treat as unverified until checked against real package files.
