# Sims 4 walls (WallInfo and wall-bearing sections) — S4S implementation notes

All paths relative to `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/`. Primary
source: `S4Studio/Data/IO/World/Architecture/WallInfo.cs`; supporting:
`ArchitectureResourceFactory.cs` (nested classes `WallBlocksResource`,
`WallCutoutResource`, `X9118FDFF`, `X2081B4E6`, `FenceSpandrelExtraResource`,
`StairsData`), `BuildItemDefinition.cs`.

---

### WallInfo: per-wall-block record with its own version

**Claim:** `WallInfo` is a self-versioned structure (UInt16 `Version`, per block, not per file) beginning with BlockID and a signed floor level, followed by version-gated fields, a segment table, 16 mandatory zero bytes, and a BuildItemDefinition list.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/WallInfo.cs:120-174` (`Read`), `176-225` (`Write`).
**Observed behavior:** Field order (read = write except where noted below):
1. UInt16 `Version`
2. UInt16 `BlockID`
3. Byte cast to SByte `FloorLevel` (signed — supports basement levels)
4. UInt16 `S1` — only if `Version >= 36`
5. Byte `B1`
6. Bytes `B2`, `B3` — only if `Version > 17`
7. Float32 `F1`
8. Byte `B4` — if `31 <= Version < 33`; else Float32 `F2` — if `Version >= 35`
9. Segment table (below)
10. Exactly 16 bytes, all must be zero on read; write emits `new byte[16]`
11. Int32 count of `BuildItemDefinition` entries, each = ITG key (Instance u64, Type u32, Group u32) + UInt32 `U1` + UInt32 `U2` (`BuildItemDefinition.cs:77-91`)
Both directions implemented; symmetric for steps 1–8 and 10–11.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation at this field level
**Unknowns:** `S1` (u16, v≥36), `B1`, `B2`, `B3`, `B4`, `F1`, `F2` — semantics unverified; do not rename.

---

### Wall segments: struct-of-arrays layout

**Claim:** Segments are stored as `List<List<WallSegment>>`: outer UInt16 row count; each row stores UInt16 segment count, then that many (Byte X, Byte Y) coordinate pairs first, then the same number of per-segment data blocks in a second pass.
**Evidence — S4S implementation:** `WallInfo.cs:145-162` (read: coordinates loop then data loop), `205-218` (write: identical two-pass order).
**Observed behavior:** X/Y are grid cell coordinates (Bytes). The two-pass (coordinates-then-payload) ordering is identical in read and write — symmetric. `X`/`Y` are the only semantically named segment position fields.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (community tools show wall grids; the SoA binary ordering is not publicly documented)
**Unknowns:** none positional; payload unknowns listed under the next claim.

---

### WallSegment payload: build-item references incl. wall covering

**Claim:** Each segment's data block is: Byte `B1`, then seven named UInt32 build-item indices — `WallCovering`, `Wall`, `Fence`, `Spandrel`, `Foundation`, (unnamed `U1`), `FloorTrim`, `WallTrim` — then conditional `PlatformTrim` (UInt32), then `U2` (UInt32), then `U3` (UInt32).
**Evidence — S4S implementation:** `WallInfo.cs:41-59` (`Read(Stream, ushort s1)`), `61-79` (`Write`).
**Observed behavior (exact read order):**
`B1(u8), WallCovering(u32), Wall(u32), Fence(u32), Spandrel(u32), Foundation(u32), U1(u32), FloorTrim(u32), WallTrim(u32), [PlatformTrim(u32) if s1 ∈ {31,35,36}], U2(u32), U3(u32)`
where `s1` is the enclosing WallInfo `Version`.
The named fields are treated as opaque UInt32 item references (no key expansion); only their parse/serialize behavior is verified, not which catalog they index.
**Confidence:** Implementation-verified (layout) / Hypothesis (catalog mapping of names to game objects)
**Public-reference agreement:** Partial (wall-covering-per-segment behavior is community-known; exact binary slot order is not published)
**Unknowns:** `B1` (u8), `U1`, `U2`, `U3` (each u32).

---

### WallSegment read/write asymmetry (round-trip defect)

**Claim:** `Read` gates `PlatformTrim` on versions {31, 35, 36} but always reads `U3`; `Write` always writes `PlatformTrim` but gates `U3` on {31, 35, 36} — inverted conditionals between the two paths.
**Evidence — S4S implementation:** `WallInfo.cs:53-58` vs `WallInfo.cs:72-78`.
**Observed behavior:** For a WallInfo whose Version is NOT 31, 35, or 36, reading consumed `[... WallTrim, U2, U3]` while writing would emit `[... WallTrim, PlatformTrim, U2]` — a different byte length and content. For Versions ∈ {31,35,36} both paths agree. Any tool replicating S4S must treat non-{31,35,36} versions as lossy/unsafe here.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** n/a (defect documentation).

---

### WallBlocksResource: standalone wall-block list

**Claim:** Section type 2425094600 (0x908C01C8) stores UInt32 `Version`, UInt32 `U1`, UInt16 item count, then items of {UInt16 `BlockID`, embedded `WallInfo`} — no `CheckVersion` guard is applied.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs:4309-4429` (`WallBlocksResource`, Read lines 4402-4415, Write lines 4417-4428).
**Observed behavior:** Version parsed and written back verbatim; no maximum enforced. Symmetric round-trip.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** `U1` (u32 header field).

---

### X9118FDFF: floor-grouped wall blocks (max version 9)

**Claim:** Section type 2434334207 (0x9118FDFF), max supported version 9 ("HobbyVersion"), stores an optional leading Byte `B1` (Version > 2), then Int32-counted Items of {UInt16 `BlockID`, UInt64 `L1`, Int32-counted list of raw `WallInfo`, and if Version > 5: 16 hex bytes `Blanks`, [Version == 6 only: Pascal32 string `Name`], UInt32 `U1`, 3 hex bytes `B1`}; then top-level UInt32 `U1` (Version > 7) and UInt16-counted `L1` list of 21-byte hex blobs (Version >= 9).
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs:1015-1258` (constants line 1034-1036; Read 1162-1208; Write 1210-1257; v7 write rejection 1214-1216).
**Observed behavior:** Read accepts versions ≤ 9 (`CheckVersion(9u)`); Write refuses exactly Version 7. All version gates mirrored in Write. The 21-byte entries and 3-byte/16-byte blobs are preserved as opaque hex strings, guaranteeing byte fidelity.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** Item.`L1` (u64), Item.`Blanks` (16 B), Item.`U1` (u32), Item.`B1` (3 B), top-level `B1` (byte), top-level `U1` (u32), `L1[]` entries (21 B each). `Item.Name` exists only in version 6 streams.

---

### Wall heights (lot-level)

**Claim:** Section type 545371366 (0x2081B4E6), max version 20 ("HobbyVersion"), carries the lot's wall height table as a List<float> `WallHeights` preceded by a signed Byte whose value equals `-Count` (i.e., count stored negated in one byte) followed by a Byte count, plus floats `F1`, `F2`, and `F3` (Version > 15).
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs:1709-2521`; read of the negated byte + count + floats at lines 2352-2372; write mirror at 2446-2462 (`input = (byte)(sbyte)(FList2.Count * -1)`).
**Observed behavior:** Immediately after: a `for (j = b; j < 0; j++)` loop reads `-b` Float32 values into `FList2` — i.e., the leading negative byte doubles as a *second* float-list counter (negative convention), while the positive byte counts `WallHeights`. Later fields: `B1` (v>16), `B2` (v>17), TGI `StyleKey` (v>6), UInt64 `BlueprintInstance` + two `UserIdentifier{UserId u32, Flags u32}` + two Unicode usernames (length-prefixed in chars ×2 bytes) (v>9), hex blob `BList` (v>12), two `UserInfo{UserInfoU1 u32, username, UserIdentifier}` (v>18), then the `Items` list (see lot-architecture.md for the ≤14 collapse quirk). All gates symmetric across Read/Write.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (players know "custom wall heights" exist; binary layout undocumented)
**Unknowns:** `U1` (u32, v>12), `B1`, `B2` (bytes), `F1`, `F2`, `F3` (floats — plausibly offsets/heights but unlabeled in source; keep unnamed), `FList2` elements, `BList` blob, `Items[].U1/U2/B1`, `UserInfo.UserInfoU1`, `UserIdentifier.Flags`.

---

### Cutouts: WallCutoutResource with TREV / TCES tagged blocks

**Claim:** Section type 2067194067 (0x7B36E0D3), version-checked ≤ 9, repeats until end-of-stream: {UInt32 `U1`, `"TREV"` block, `"TCES"` block}; TREV = ASCII tag + Int32 count + records of 7 bytes {`U1`,`X1`,`X2`,`U2`,`Y1`,`Y2`,`U3`}; TCES = ASCII tag + Int32 count + fixed 12-byte opaque records.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs:4431-4666` (`WallCutoutResource.Read` 4639-4652 loops `while Position < Length`; `TREV.Read` 4475-4496 validates the 4-char tag else `InvalidDataException`; `TCES.Read` 4538-4553).
**Observed behavior:** Tags are validated on read and re-emitted on write. X/Y pairs inside TREV are the only positional naming; everything else is preserved opaquely. Both directions symmetric; no record count precedes the repeat loop (terminated purely by stream length).
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (the TREV/TCES fourccs appear in some community hex dumps; structure undocumented)
**Unknowns:** Item.`U1` (u32 — likely links cutout to a wall/segment but no code shows the join; do not assert), TREV `U1`,`U2`,`U3` (bytes), TCES `Data` (12 bytes).

---

### Openings / windows / doors references

**Claim:** No section in this corpus carries explicitly named door/window/opening structures; the only candidate references are (a) `BuildItemDefinition` lists embedded in every `WallInfo` (ITG key + 2×u32), (b) `BuildItemDefinition` lists inside `X69C99784` (KeyList1/KeyList2/KeyList3 interleaved with mandatory zero-byte padding of 16/16/12 bytes), and (c) `StairsData.Item.WallKey` (TGI) linking stairs to a wall resource.
**Evidence — S4S implementation:** `WallInfo.cs:111,167-173`; `BuildItemDefinition.cs:77-91`; `ArchitectureResourceFactory.cs:3298-3389` (`X69C99784.Read` — throws `NotSupportedException("Expected blank bytes")` if the 16-byte paddings are non-zero; trailing sections gated by remaining stream length), `:1585-1587` (`StairsData` StairsKey/RailingKey/WallKey TGIs).
**Observed behavior:** All lists parse/write symmetrically; `X69C99784` enforces blank padding on read and writes zeros back. What the keys point to (doors vs windows vs other build items) is not determinable from this source — preserve as generic BuildItemDefinitions.
**Confidence:** Implementation-verified (structures) / Hypothesis (that openings live among these definitions)
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** every `BuildItemDefinition.U1`/`U2`; `X69C99784` sub-item fields (`ItemA.B1..B4,S1,S2`; `ItemB.B1..B4,U1`; `ItemC.B1..B5`; trailing `UB` hex remainder).

---

### Wall coverings, fences, spandrels

**Claim:** Per-segment wall covering/fence/spandrel/floor-trim/wall-trim/platform-trim are the named UInt32 slots inside `WallSegment` (see above); fence and spandrel extras additionally have a dedicated section type 1980314405 (0x76093325) `FenceSpandrelExtraResource` storing UInt32 Version then two Int32-counted lists (FenceItems, Spandrels) of {UInt32 `U1`, Float `F1`, Float `F2`, TGI key}.
**Evidence — S4S implementation:** `WallInfo.cs:19-37` (named u32 slots); `ArchitectureResourceFactory.cs:779-930` (`FenceSpandrelExtraResource`, Read 879-907 / Write 909-929).
**Observed behavior:** Fully symmetric; no version gating beyond the leading version u32 (no CheckVersion call here). The TGI key per item is the only full-key (Type+Group+Instance) reference in this area.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** FenceSpandrelExtra `Item.U1`, `F1`, `F2`.

---

### Platform handling

**Claim:** Platform support appears in this corpus only as the version-gated `WallSegment.PlatformTrim` UInt32 (present when WallInfo.Version ∈ {31, 35, 36}); no other platform-specific geometry, level, or flag logic exists in these files.
**Evidence — S4S implementation:** `WallInfo.cs:35, 53-55, 73-75`.
**Observed behavior:** Parsed/written per the asymmetry defect documented above. Platform *level* placement would have to be encoded via `FloorLevel` (sbyte) or grid data — nothing in source states this; treat as unknown.
**Confidence:** Implementation-verified (field existence/gating) / Hypothesis (anything beyond the field)
**Public-reference agreement:** Partial (platforms are a known game feature since patch 2020; binary handling unpublished)
**Unknowns:** semantic link between `PlatformTrim` and platform catalog content.

---

### Consolidated unknown-field inventory (walls corpus)

Preserve these names exactly; never rename without independent identification:

| Location | Field | Type | Notes |
|---|---|---|---|
| WallInfo | `S1` | u16 | present iff Version ≥ 36 |
| WallInfo | `B1` | u8 | after FloorLevel/S1 |
| WallInfo | `B2`, `B3` | u8 | Version > 17 |
| WallInfo | `F1` | f32 | |
| WallInfo | `B4` | u8 | 31 ≤ Version < 33 only |
| WallInfo | `F2` | f32 | Version ≥ 35 only |
| WallSegment | `B1` | u8 | leads payload |
| WallSegment | `U1`, `U2`, `U3` | u32 | U3 read-always / write-gated defect |
| WallInfo trailer | 16 zero bytes | 16×u8=0 | validated on read |
| BuildItemDefinition | `U1`, `U2` | u32 | alongside ITG key |
| WallBlocksResource | `U1` | u32 | header |
| X9118FDFF | top-level `B1` | u8 | Version > 2 |
| X9118FDFF.Item | `L1` | u64 | |
| X9118FDFF.Item | `Blanks` | 16 B hex | Version > 5 |
| X9118FDFF.Item | `U1` | u32 | Version > 5 |
| X9118FDFF.Item | `B1` | 3 B hex | Version > 5 |
| X9118FDFF.Item | `Name` | Pascal32 str | Version == 6 only |
| X9118FDFF | top-level `U1` | u32 | Version > 7 |
| X9118FDFF | `L1` entries | 21 B hex each | Version ≥ 9 |
| X2081B4E6 | `U1` | u32 | Version > 12 |
| X2081B4E6 | `B1`, `B2` | u8 | v>16 / v>17 |
| X2081B4E6 | `F1`, `F2`, `F3` | f32 | F3 v>15; unlabeled |
| X2081B4E6 | `FList2` | f32[] | counted by negated byte |
| X2081B4E6 | `BList` | hex blob | v>12 |
| X2081B4E6.Items[] | `U1`, `U2` | u32 | U1 skipped in v≤11,13,14 |
| X2081B4E6.Items[] | `B1` | u8 | |
| WallCutoutResource.Item | `U1` | u32 | per cutout group |
| WallCutout TREV | `U1`, `U2`, `U3` | u8 | around X1,X2,Y1,Y2 |
| WallCutout TCES | `Data` | 12 B opaque | per record |
| FenceSpandrelExtra.Item | `U1`, `F1`, `F2` | u32,f32,f32 | |
| X69C99784 | `ItemA.B1..B4,S1,S2`; `ItemB.*`; `ItemC.*`; `UB` | mixed | all unnamed |
