# DBPF 2.1 — The Sims 4 `.package` container format

Reference for the Database Packed File (DBPF) container used by The Sims 4
`.package` (and `.world`, `.dbc`) files. All numbers below were checked against
the sources fetched during research; anything not confirmable is explicitly
marked **not yet verified**.

Verification labels:

- **verified specification** — stated by a primary community implementation
  (s4pi source code) or an explicit format spec page.
- **community-observed** — reported by tool authors/wiki but not backed by an
  official EA spec (no official spec is publicly known).

Historical context only: DBPF originated in The Sims Online / SimCity 4 /
The Sims 2 as "DBPF 1.x" and was reused by Spore/The Sims 3 as "2.0"
([SimsWiki DatabasePackedFile](https://simswiki.info/wiki.php?title=DatabasePackedFile),
[Niotso wiki DBPF](http://wiki.niotso.org/DBPF)). Those 1.x/other-game layouts
(index version 7.0/7.1, hole tables, DIR index) are **different formats** — do
not apply them to Sims 4 packages.

---

## Version identification

- Magic: ASCII `DBPF` at offset 0 (**verified specification**, s4pi `Package.cs`
  https://github.com/Kuree/Sims4Tools/blob/master/s4pi/Package/Package.cs)
- Major version: `2` (**verified specification**, s4pi doc comment "0x00000002")
- Minor version: `1` per the s4pi header doc comment ("Package header:
  0x00000001") and The Sims 4 Modders Reference spec
  (https://thesims4moddersreference.org/reference/dbpf-format/, "uint32 = 1
  minor format version"). Note a discrepancy: the Kuree/Sims4Tools wiki writes
  `minor ;; 0` (https://github.com/Kuree/Sims4Tools/wiki/DBPF-Format). Two
  sources vs one; treat **minor = 1** as verified specification and flag any
  package whose minor differs.
- The Kuree wiki also notes magic variants: `DBBF` never seen; `DBPP` is an
  encrypted variant (**community-observed**).
- Byte order: little-endian throughout (**community-observed**; consistent with
  every parser examined — s4pi `BitConverter` usage assumes LE, s4py reads LE).

## 96-byte package header

Header size is 96 bytes (**verified specification**: s4pi-derived code uses
`HEADER_SIZE = 96`, e.g. https://github.com/Kuree/ts-sims4/commit/e4d6b5d;
Kuree wiki "96 bytes"; TS4MR spec field list sums to 96).

Offsets below are **verified specification** from s4pi `Package.cs`
(accessors read the header at these byte positions):

| Offset | Size | Field (s4pi name) | Notes |
|-------:|-----:|-------------------|-------|
| 0x00   | 4    | Magic | `"DBPF"` |
| 0x04   | 4    | Major | `2` |
| 0x08   | 4    | Minor | `1` (see discrepancy note above) |
| 0x0C   | 4    | UserVersionMajor | unused, typically 0 |
| 0x10   | 4    | UserVersionMinor | unused, typically 0 |
| 0x14   | 4    | Unused1 | unused |
| 0x18   | 4    | CreationTime | "typically, not set" (s4pi) |
| 0x1C   | 4    | UpdatedTime | "typically, not set" (s4pi) |
| 0x20   | 4    | Unused2 | unused |
| 0x24   | 4    | Indexcount | number of index entries |
| 0x28   | 4    | IndexRecordPositionLow | short-form absolute index offset |
| 0x2C   | 4    | Indexsize | index size on disk in bytes |
| 0x30   | 12   | Unused3 | unknown/unused |
| 0x3C   | 4    | Unused4 | index version; s4pi comment "always 3?", Kuree wiki `index_version ;; always 3`, TS4MR "= 3" (**community-observed** that it's always 3) |
| 0x40   | 8    | Indexposition (+ high dword) | long-form absolute index offset |
| 0x48   | 24   | Unused5 | padding |

Index-location resolution (**verified specification**, s4pi `Package.cs:333`):
`Indexposition = header[0x40] if nonzero else header[0x28]`. TS4MR footnote
agrees and adds the observation "Maxis always sets the short index offset to
0" (**community-observed**). s4py additionally prefers the *high* dword when it
is nonzero (https://github.com/thequux/s4py/blob/master/lib/s4py/package/dbpf.py)
(**community-observed**).

If `Indexcount == 0`, there is no index; Kuree wiki states size and position
are also zero then (**community-observed**).

## Resource index

Located at the resolved index position. Structure (**verified specification**
via three independent implementations: s4pi `PackageIndex.cs`,
s4py `dbpf.py`, TS4MR spec):

```
uint32  index flags ("index type")
[per set bit in low 3 bits] uint32 constant value
[indexcount] variable-width entries
```

### Index flags (shared-field bits)

Each set bit moves a normally-per-entry DWORD into the index header, where it
is shared by all entries (**verified specification**, s4pi
`PackageIndex.cs` — header constants written when `(indextype & bit) != 0`;
TS4MR table):

| Bit | Meaning when set |
|-----|------------------|
| 0x01 | Resource **Type** present once in index header (constant) |
| 0x02 | Resource **Group** present once in index header (constant) |
| 0x04 | **Instance upper 32 bits** present once in index header (constant) |

s4pi computes entry width as `9 - hdrsize` DWORDs on disk (`numFields = 9`,
including the flags DWORD itself), matching the Kuree wiki statement that each
fully-expanded logical entry is 8 DWORDs = 32 bytes plus the flags word.

### The 0x80 bit ("extended"/duplicate-index flag)

**Not yet verified.** None of the fetched authoritative sources document an
index-flag bit `0x80`:

- s4pi `PackageIndex.cs` only ever tests bits `0x01..0x04` (`for i < sizeof(uint)`).
- The Kuree wiki describes bits 0–7 of the index type as selecting which of the
  8 entry DWORDs come from the header (bit 7 = Compressed/Unknown2 word), but
  gives no duplicate-index semantics.
- TS4MR, DBPF.js spec (https://github.com/anonhostpi/DBPF.js/blob/main/docs/spec/README.md),
  and s4py do not mention it.

If you encounter claims about a `0x80` duplicate/extended-index behavior,
verify against real game files before relying on them.

### Per-entry fields (expanded form)

Logical field order after expansion (**verified specification**, s4pi
`ResourceIndexEntry.cs` + Kuree wiki bit table + TS4MR):

| # | Field | Size | Notes |
|---|-------|------|-------|
| 1 | ResourceType | u32 | resource type ID |
| 2 | ResourceGroup | u32 | group ID; Kuree wiki notes "top byte is a set of flags" (**community-observed**) |
| 3–4 | Instance | u64 | stored as two u32: instance high (may be a header constant), instance low (always per-entry) |
| 5 | Chunkoffset | u32 | absolute position of resource data in the file |
| 6 | Filesize | u32 | low 31 bits = length of (possibly compressed) data in package; **high bit 0x80000000 = extended entry marker** |
| 7 | Memsize | u32 | uncompressed data length |
| 8a | Compressed | u16 | compression type code (only if extended bit set) |
| 8b | Unknown2 / "committed" | u16 | s4pi comment: "Always 0x0001" (**community-observed**) |

Entry-size rule (**verified specification**, s4py code path
`if entry_size & 0x80000000:` read two u16s): when the filesize high bit is
clear, fields 8a–8b are absent and the chunk is treated as uncompressed;
TS4MR notes Maxis/modder-written entries always set the extended bit
(**community-observed**).

Compression codes in field 8a (**verified specification**, TS4MR; corroborated
by Kuree wiki for 0x5A42/0xFFFF):

| Code | Meaning |
|------|---------|
| 0x0000 | uncompressed |
| 0x5A42 | zlib ("ZLIB" FourCC) — most common |
| 0xFFE0 | deleted marker (delta packages) |
| 0xFFFE | streamable (unknown format, not used) |
| 0xFFFF | internal custom compression (used by Maxis, e.g. string tables) |

zlib-compressed chunks are raw zlib streams decompressible with standard zlib
inflate (**verified specification**: s4py calls `zlib.decompress`; s4pe uses
managed inflate). RefPack (0xFB…) compressed chunks appear under code 0xFFFF
in some files (**community-observed**, s4py `decodeRefPack` handling).

## TGI resource keys

A resource is identified by the triple (**verified specification** — every
implementation above keys lookups this way):

- **Type** — u32 resource type ID (lists: Mod The Sims
  https://db.modthesims.info/wiki.php?title=Sims_4%3APackedFileTypes, Kuree wiki
  "Sims 4 - Packed File Types")
- **Group** — u32 group ID
- **Instance** — u64 instance ID, split into high and low u32 halves on disk

## Known gaps / unverified items

- Index-flag bit `0x80` semantics: **not yet verified** (see above).
- Meaning of header fields at 0x0C–0x20 beyond being unused/zero in practice:
  **not yet verified** (labels "unused" come from s4pi comments).
- Whether `index version` at 0x3C can legally be something other than 3 in
  Sims 4 files: **not yet verified** (all sources say "always 3").
- Exact behavior of the `ResourceGroup` top-byte flags noted by the Kuree wiki:
  **not yet verified**.
