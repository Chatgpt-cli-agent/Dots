# Sims 4 Lot Architecture container (S4S implementation notes)

All paths relative to `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` unless noted.
Source basis: `S4Studio/Data/IO/World/Architecture/*.cs`, plus context files
`S4Studio/Shared/RecordBundle.cs`, `S4Studio/IO/World/LotArrays/Lot2DArray.cs`,
`S4Studio/IO/World/LotArrays/Lot3DArray.cs`,
`S4Studio/Data/IO/Util/BinaryReadWriteExt.cs`. Claims below are derived only
from these decompiled sources.

---

### Container resource type ID

**Claim:** The lot architecture package root is `WorldLotArchitectureResource`, a `PackedResource` with static type ID 311764532 (0x12952634).
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/WorldLotArchitectureResource.cs:11` (`public static uint Type = 311764532u`).
**Observed behavior:** Read path parses the stream as a length-prefixed `RecordBundle`; write path serializes the same bundle back. Both directions implemented.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation (the decimal/hex ID is not semantically named in the source itself)
**Unknowns:** none at this level.

---

### Top-level layout: size-prefixed RecordBundle

**Claim:** The resource body is an Int32 byte-count followed by exactly that many bytes, which are parsed as a `RecordBundle`.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/WorldLotArchitectureResource.cs:61-76`.
**Observed behavior:** `Read` does `ReadInt32()` then `RecordBundle.Read(new MemoryStream(ReadBytes(count)))`; `Write` does `RecordBundle.Write` into a buffer, then writes `(uint)buffer.Length` followed by the buffer. Round-trips symmetrically.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (community tools mention embedded sub-resource bundles; exact prefix documented nowhere authoritative)
**Unknowns:** none.

---

### RecordBundle magic and header ("LDNB")

**Claim:** A `RecordBundle` begins with the 4 ASCII chars `"LDNB"`, followed by UInt32 Version (max accepted 3), UInt32 `U1`, UInt32 `U2`, and Int32 record count.
**Evidence — S4S implementation:** `S4Studio/Shared/RecordBundle.cs:183` (`private const string LDNB = "LDNB"`), `Read` at lines 306-362 (`CheckVersion(3u)` at line 312), `Write` at lines 364-426.
**Observed behavior:** Read consumes the tag without validating it against "LDNB" (reads 4 chars, discards); Write always emits `"LDNB"`. Version is parsed and written back unchanged; values above 3 throw via `CheckVersion`. `U1`/`U2` are parsed then serialized back verbatim.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (the "LDNB" fourcc circulates informally in modding communities; full header layout undocumented)
**Unknowns:** `U1` (UInt32, unnamed), `U2` (UInt32, unnamed) — preserve as-is.

---

### RecordBundle tables (instances, type-groups, offsets)

**Claim:** After the header the bundle stores: an array of `count` UInt64 instance IDs; a type-group table of `numGroups+1` entries of (UInt32 Type, UInt32 Group, UInt32 StartIndex); and an array of `count+1` record sizes stored as 3-byte big-endian integers; records themselves are stored contiguously between the header and the instance table, sorted/grouped by (Type, Group) ascending.
**Evidence — S4S implementation:** `S4Studio/Shared/RecordBundle.cs:315-358` (read), `364-426` (write), `readInt24BE`/`writeInt24BE` at lines 447-469, `alignStream(stream, 8)` at line 408 / `alignStream` helper lines 433-445.
**Observed behavior:** Read uses forward-declared `StreamPtr` positions to locate each table; each record's bytes are sliced from `[sizes[i], sizes[i+1])` relative to the record-data start pointer and wrapped into a `Record` keyed by `ResourceKey(Type, Group, Instance)`. Write regroups records by (Type,Group) ordered ascending, writes record data first, then instance IDs, then type-group headers (with one synthetic terminator entry whose StartIndex == total records), then the 24-bit BE sizes, aligning the record-data end to 8 bytes. Symmetric round-trip.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** none structural; per-record payloads defer to their own sections.

---

### Lazy record decode and round-trip fidelity

**Claim:** Each record keeps its raw bytes untouched until first accessed; decode failures degrade gracefully so unknown/unversioned data still round-trips byte-exact.
**Evidence — S4S implementation:** `S4Studio/Shared/RecordBundle.cs:42-85` (`Record.Data` getter), `125-128` (`GetData()`), `161-173` (`internal void Write(Stream)`), exception handling lines 66-78.
**Observed behavior:** On first access, the factory builds a typed resource, injects the bundle (`INeedBundle.SetBundle`), parses, and throws `InvalidOperationException` if trailing bytes remain unread. On `UnsupportedResourceVersionException` the record is re-wrapped as `UnsupportedVersionResource`; on any other exception as `UnknownResource` — both hold raw bytes. `Write` emits the original raw `data` array if the record was never materialized, otherwise re-serializes the parsed object. This is the core S4S fidelity mechanism: untouched sections are bit-preserving.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** n/a.

---

### Shared-version scheme (ArchitectureSharedVersionResource)

**Claim:** Array-type architecture sections have no version field of their own; they inherit both dimensions and a "version" from the sibling `LotSize` record via a weak reference to the containing bundle.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/ArchitectureSharedVersionResource.cs:7-28` (`Size` => `bundle.GetSection<LotSize>()`, fallback `EmptyLotSize` 1x1x1), `S4Studio/Data/IO/World/Architecture/BundleDependent.cs:7-25` (`INeedBundle`, `SetBundle`), `S4Studio/Shared/RecordBundle.cs:280-290` (bundle wires new records implementing `INeedBundle`), `471-475` (`GetSection<T>` matches by the static `Type` field via reflection).
**Observed behavior:** When the bundle is absent, a hardcoded 1x1x1 `LotSize` is used instead of failing. `GetSection<T>` looks up the first record whose `Key.Type` equals the requested class's static `Type`. Read and write paths of every shared-version resource query this same property, so dimension handling is identical in both directions.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** n/a.

---

### LotSize section (level/foundation dimensions)

**Claim:** `LotSize` (type 1156008438 = 0x44E749F6) stores UInt32 Version (max 13) and, for Version > 2, three Bytes: `Width`, `Height`, `Depth` (Depth acts as the level/layer count for all 3D lot arrays).
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs:5006-5140` (class `LotSize`, `CheckVersion(13u)` line 5119, `Width/Height/Depth` gated on `Version > 2` lines 5120-5125 read / 5133-5138 write).
**Observed behavior:** Parsed then serialized back symmetrically. Consumed by every `ArchitectureSharedVersionResource` (see above) and by the summary string in `RecordBundleArchitectureExt.GetArchitectureSummary` (`S4Studio/Data/IO/World/Architecture/RecordBundleArchitectureExt.cs:15-19`).
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (lot dimensions are user-visible in tooling; binary layout undocumented publicly)
**Unknowns:** none named beyond W/H/D; semantic mapping of Width/Height to world axes is not stated in code — treat axis assignment as unverified.

---

### Factory dispatch

**Claim:** `ArchitectureResourceFactory` dispatches section type IDs to concrete classes via reflection over its own nested types: any non-abstract nested `PackedResource` with a public static `Type` field is registered; unknown IDs fall back to `UnknownResource`.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs:5531-5556` (static ctor builds `tmap`, `GetResourceInstance` invokes the `(IResourceKey)` constructor, `GetResourceType` returns `typeof(UnknownResource)` on miss).
**Observed behavior:** Every registered section class carries a static `uint Type`; instances are created through `(IResourceKey)` ctor reflection. Unknown sections therefore survive as opaque `UnknownResource` byte blobs (bit-preserving round trip through `Record.Write`).
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** n/a (mechanism claim only).

---

### Registered section types observed in the factory

**Claim:** The factory registers ~38 nested section classes; the following table maps class name → static Type ID (decimal / hex) as declared in code.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs` (each `public static uint Type` within the listed nested class).

| Class | Type ID |
|---|---|
| WorldLotArchitectureResource (outer container, separate file) | 311764532 / 0x12952634 |
| X92EDE8BD | 2465065149 / 0x92EDE8BD |
| XF22074AA | 4062213290 / 0xF22074AA |
| PondPoolData | 2188151641 / 0x826C8B59 |
| X7B33C1F5 | 2066989557 / 0x7B33C1F5 |
| FenceSpandrelExtraResource | 1980314405 / 0x76093325 |
| LotObjectData | 3325813684 / 0xC63BE3B4 |
| X9118FDFF (contains `WallInfo` blocks) | 2434334207 / 0x9118FDFF |
| X49B12B23 | 1236347683 / 0x49B12B23 |
| StairsData | 186155609 / 0x0B188259 |
| X2081B4E6 (contains `WallHeights`) | 545371366 / 0x2081B4E6 |
| RoofData | 3285814088 / 0xC3D98B48 |
| FloorKeyList | 4172807529 / 0xF8B7FD69 |
| X69C99784 | 1774819204 / 0x69C99784 |
| TerrainHeightMap | 3782893869 / 0xE17A612D |
| XA691F240 | 2794582592 / 0xA691F240 |
| XC9106475 | 3373294709 / 0xC9106475 |
| XFAD4C271 | 4208247409 / 0xFAD4C271 |
| VenueInfoResource | 3871070174 / 0xE6BBD7DE |
| TerrainPaintLayersResource | 756498313 / 0x2D173F89 |
| WallBlocksResource (contains `WallInfo`) | 2425094600 / 0x908C01C8 |
| WallCutoutResource | 2067194067 / 0x7B36E0D3 |
| X93F3D6EF | 2482231023 / 0x93F3D6EF |
| X881171F6 | 2282844662 / 0x881171F6 |
| LotSize | 1156008438 / 0x44E749F6 |
| ResourceManifest | 152626801 / 0x0918E671 |
| X72187564 | 1914205540 / 0x72187564 |
| XC59B5293 (`Lot2DArray<LotByteValues>`) | 3315290771 / 0xC59B5293 |
| X659EFBF4 (`Lot3DArray<LotInt16Values>`) | 1704918004 / 0x659EFBF4 |
| XE6405EFA (`Lot3DArray<LotByteValues>`) | 3862978298 / 0xE6405EFA |
| XD2AF154F (`Lot3DArray<LotByteValues>`) | 3534689615 / 0xD2AF154F |
| X90A9C827 (`Lot3DArray<LotInt16Values>`) | 2427045927 / 0x90A9C827 |
| XAB53B0C5 (`Lot2DArray<LotInt16Values>`) | 2874388677 / 0xAB53B0C5 |
| XA276970B (`Lot2DArray<LotInt16Values>`) | 2725680907 / 0xA276970B |
| X65859EB2 (`Lot3DArray<LotByteValues>`) | 1703255730 / 0x65859EB2 |
| X42F8F4BA (`Lot3DArray<LotByteValues>`) | 1123611834 / 0x42F8F4BA |
| X3E0A3111 (`ArchitectureSharedVersionResource`, custom) | 1040855313 / 0x3E0A3111 |
| X251D6FDC (`Lot3DArray<LotInt16Values>`) | 622686172 / 0x251D6FDC |
| X1DE7B2AC (`Lot3DArray<LotInt16Values>`) | 501723820 / 0x1DE7B2AC |

**Observed behavior:** All listed classes implement both `Read` and `Write`; names beginning with `X…` are decompiler-derived (hex of the type ID) and carry **no** asserted semantics — do not rename them.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (a few IDs, e.g. VenueInfo/LotSize, are discussed informally by modders; most are undocumented)
**Unknowns:** all `X…`-named classes are semantically unknown by definition of this corpus.

---

### Key encoding inside sections (TGI vs ITG)

**Claim:** Resource references inside architecture sections use two field orders: `ReadTGI`/`WriteTGI` = Type(u32), Group(u32), Instance(u64); `ReadITG`/`WriteITG` = Instance(u64), Type(u32), Group(u32). Sections consistently use ITG for `Item1.Key`, `FloorKeyList.Item.Key`, and `BuildItemDefinition.Key`, and TGI elsewhere.
**Evidence — S4S implementation:** `S4Studio/Data/IO/Util/BinaryReadWriteExt.cs:189-215`; usage examples `ArchitectureResourceFactory.cs:311` (`ReadITG(Key1)`), `:3023-3027` (FloorKeyList ITG), `BuildItemDefinition.cs:80` (`ReadITG(Key)`); TGI examples `ArchitectureResourceFactory.cs:633` (PondPoolData FloorKey), `:892` (FenceSpandrelExtraResource).
**Observed behavior:** Same order applied in both read and write paths per site; asymmetric order would corrupt round-trip and none is observed within a single field.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (TGI ordering is broadly known in the community; the ITG variant placement is not publicly tabulated)
**Unknowns:** n/a.

---

### Typed value arrays (byte / int16 / int / float grids)

**Claim:** Grid sections are generic 2-D or 3-D arrays of typed cells: `LotArrayData<T>` stores `width` columns of `height` cells serialized column-major (outer loop width, inner loop height), one cell per `ReadItem`/`WriteItem`; element types are `LotByteValues` (u8), `LotIntValues` (i32), `LotFloatValues` (f32), and `LotInt16Values` (four packed Int16 per cell, exposed as `Short4Value.S1..S4`).
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/LotArrayData.cs:68-94` (Read/Write loops), `ILotArrayData.cs:6-17` (interface), `LotByteValues.cs`, `LotIntValues.cs`, `LotFloatValues.cs`, `LotInt16Values.cs:123-142` (Short4Value = 4×Int16), `ArrayItem.cs` (inner row holder), `LotArrayUtils.cs:7-19` (`EnsureSize` resize-with-fill), `S4Studio/IO/World/LotArrays/Lot2DArray.cs:45-55` (single grid sized Width×Height), `S4Studio/IO/World/LotArrays/Lot3DArray.cs:44-64` (`Depth` independent grids).
**Observed behavior:** `EnsureSize` grows/shrinks arrays to the current `LotSize` before reading or writing, filling new slots with `DefaultItem()` (0 / 0f / default Short4Value), so a resized lot writes consistent data rather than stale garbage. Read and write iterate identically (same loops, same counts) — fully symmetric.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** What each grid *means* (routing, lighting, etc.) is not encoded anywhere in this source; all `Lot2DArray`/`Lot3DArray` subclasses keep X-prefixed names — leave them unnamed.

---

### How records index into the value arrays

**Claim:** Records do not store indices into the typed arrays; association is implicit — each grid section covers the whole lot footprint (Width×Height, ×Depth for 3-D), and per-cell meaning is fixed per type ID, while `TerrainHeightMap` and `X3E0A3111` compute their layer counts arithmetically from `LotSize.Version`, `.Depth`, `.Width`, `.Height` at read AND write time.
**Evidence — S4S implementation:** `TerrainHeightMap.Read/Write` at `ArchitectureResourceFactory.cs:3507-3549`: height-map layer count = `Depth` if bundle Version < 10 else 2; compressed Int-layer count = 4 if Version >= 12 else 0; height maps read `(Width+1)×(Height+1)` cells per `Depth`, compressed maps `Width×Height`. `X3E0A3111.Read/Write` at lines 5476-5498: layer count = 1 if `Size.Version <= 8` else `Size.Depth`, cells `Width×Height`.
**Observed behavior:** Identical formulas in Read and Write (symmetric); `LotArrayUtils.EnsureSize` reconciles stored arrays with computed lengths on both paths. Note the same symbol `Size.Version` here refers to the shared `LotSize` resource's version — the only "version" governing these layouts.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** Semantic content of height maps vs compressed values is not labeled in source; preserve as-is.

---

### Level / foundation data

**Claim:** Vertical level count lives in `LotSize.Depth`; per-segment foundation style references live inside `WallInfo.WallSegment.Foundation` (UInt32 build-mode item index) — there is no standalone "foundation" section in this factory.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs:5062-5079` (`Depth` property), `S4Studio/Data/IO/World/Architecture/WallInfo.cs:27` (`Foundation` field), consumed in `WallSegment.Read/Write` (lines 41-79). See also walls.md.
**Observed behavior:** Foundation value parsed and re-serialized per wall segment; no validation performed.
**Confidence:** Implementation-verified (field-level) / Hypothesis (that `Foundation` selects a foundation catalog item — the name is decompiler-surviving but its target catalog is not shown in this corpus)
**Public-reference agreement:** Partial
**Unknowns:** `Foundation` target ID space unidentified here.

---

### Room ↔ wall relationships

**Claim:** This corpus contains no explicit room object; rooms are only implied by (a) `WallInfo` blocks carrying `BlockID`s and floor levels, (b) `FloorKeyList` (0xF8B7FD69) listing floor-material keys each with two UInt32 unknowns, and (c) roof blocks referencing a `WallKey` (`RoofData.RoofBlock.WallKey`, typed `WallResource`). Any stronger room↔wall graph must live outside these files.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs:2936-3042` (FloorKeyList: 16-byte `U1` hex blob header, then Int32 count of {ITG key, U1, U2}); `:2565` (`RoofBlock.WallKey` defaults to `new ResourceKey(WallResource.Type)`); `WallInfo.BlockID` in `WallInfo.cs:93`.
**Observed behavior:** FloorKeyList parses/writes symmetrically; its leading 16-byte blob defaults in the constructor to `00…00` then immediately gets overwritten with the hex string `"000102…0F"` (lines 3003-3007) — a default-value quirk, not necessarily what shipped files contain.
**Confidence:** Implementation-verified (structures) / Hypothesis (room interpretation)
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** `FloorKeyList.U1` (16-byte blob), `FloorKeyList.Item.U1`, `.U2`.

---

### Read vs write fidelity summary (container)

**Claim:** S4S achieves round-trip fidelity through lazy per-record decoding, raw-byte passthrough for untouched or failed records, and strictly symmetric Read/Write implementations; the few intentional asymmetries are enumerated here.
**Evidence — S4S implementation:** `S4Studio/Shared/RecordBundle.cs:161-173`; per-section Read/Write pairs throughout `ArchitectureResourceFactory.cs`.
**Observed behavior (asymmetries found):**
1. `X9118FDFF.Write` throws `UnsupportedResourceVersionException` for Version == 7 although `Read` accepts it (`ArchitectureResourceFactory.cs:1214-1216`) — editing a v7 block of this section forces a failure rather than silent corruption.
2. `X2081B4E6.Write` collapses `Items` to a single entry when Version <= 14 (`ArchitectureResourceFactory.cs:2497-2510`) — multi-item data would be truncated on rewrite of old versions.
3. `WallSegment.Write` writes `PlatformTrim` unconditionally and `U3` only for versions {31, 35, 36}, while `Read` does the opposite (`WallInfo.cs:53-78` vs `71-77`) — a latent round-trip defect for other versions; see walls.md.
4. `RecordBundle.Read` ignores the 4-char tag content (any magic accepted on read; always "LDNB" on write).
Everything else observed is symmetric.
**Confidence:** Implementation-verified
**Public-reference agreement:** No corresponding public documentation
**Unknowns:** n/a.

---

### Display-name summary extension

**Claim:** `RecordBundleArchitectureExt.GetArchitectureSummary` composes a display name from the VenueInfo section's venue tuning name plus `"{W}x{H}x{D}"` from LotSize.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/RecordBundleArchitectureExt.cs:7-21`; consumed by `WorldLotArchitectureResource.DisplayName` (`WorldLotArchitectureResource.cs:36-48`).
**Observed behavior:** Read-path/UI only; no serialization impact.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes (tooling-visible naming)
**Unknowns:** n/a.
