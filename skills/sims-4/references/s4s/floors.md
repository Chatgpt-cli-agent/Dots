# S4S Reference — Floors, Floor Patterns & Floor Trims

Scope: what Sims 4 Studio (S4S) actually implements for floor-surface resources. All claims are read/write behavior from decompiled S4S code at `S4Studio/Data/IO/BuyBuild/` unless noted. Nothing here is inferred beyond what the code does.

**Covered:** FloorResource, FloorInfo/FloorPoint, RoomArchitectureData floor layers, FloorTrimResource, FloorKeyList, shared catalog base (BuyBuildSwatchResource / CTProduct).
**NOT covered by S4S:** no separate "floor pattern" resource type distinct from FloorResource; no editor/parser for per-tile floor painting outside the MagalogResource path (see Unknowns).

### FloorResource layout
**Claim:** The floor catalog resource is a swatch catalog resource whose body is: version u32, common catalog block (CTProduct), AuralMaterials block, an external material-reference list, swatch colors, one unknown u32, and PrototypeId u64.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/FloorResource.cs`; base classes `BuyBuildSwatchResource.cs`, `CTProduct.cs`, `AuralMaterials.cs`.
**Observed behavior:** Read/Write symmetric. Fields in order: Version (u32, checked ≤ 6), Common.Read (CTProduct), AuralMaterials.Read, int32 material count followed by that many raw TGIs (u64 instance, u32 type, u32 group) stored as ExternalResource entries, byte count + Color list for SwatchColors, u32 field named only `Unknown` (no semantics), u64 PrototypeId. New resources default Version = 6.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes (field order matches community documentation of 0xB4F762C9)
**Unknowns:** U-field: the trailing u32 is named `Unknown` in source — semantics unknown.

### FloorResource type ID
**Claim:** FloorResource uses resource type 0xB4F762C9 (3036111561).
**Evidence — S4S implementation:** `FloorResource.cs` line 12 (`public static uint Type = 3036111561u`).
**Observed behavior:** Used as the default ResourceKey type and referenced by name lookups elsewhere (e.g., PondPoolData's `FloorKeyName` resolves names via `FloorResource.Type`).
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** none.

### Catalog references live in CTProduct
**Claim:** All floor catalog metadata (name hash, description hash, thumbnail hashes, tags, pack ID/flags, swatch sort priority) is carried in the shared `Common` CTProduct block inherited from BuyBuildSwatchResource, not in floor-specific fields.
**Evidence — S4S implementation:** `BuyBuildSwatchResource.cs` (properties NameKey, DescKey, ThumbnailInstance, VariantThumbnailInstance, Tags, PackID, PackFlags, SortField all delegate to `Common`), `CTProduct.cs`.
**Observed behavior:** Read/written as one block between Version and resource-specific fields for every BuyBuildSwatchResource-derived type.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** fields inside CTProduct not exposed as properties were not audited for this file.

### Materials-per-floor encoding
**Claim:** A FloorResource references its rendering materials as a flat list of external TGI keys (count + keys); S4S stores no per-tile or per-corner material assignment inside this resource.
**Evidence — S4S implementation:** `FloorResource.cs` Read() lines 101–112.
**Observed behavior:** int32 count, then full TGIs; entries kept as `ExternalResource` (lazy references). Source contains a dead comparison of Materials.Count against 1 (lines 111–112) with no effect.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (community docs agree on list-of-keys; S4S assigns no meaning to individual slots)
**Unknowns:** which list slot maps to which surface corner/edge is Unknown_0x00 — not implemented in S4S.

### Per-tile floor placement (FloorInfo / FloorPoint)
**Claim:** Placed floors are recorded per tile-point as X byte + Y byte + ushort + uint32 "FloorDefinitionIndex" + byte; there is no bit-packed multi-pattern-per-tile word anywhere in S4S.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/FloorInfo.cs` (FloorPoint.Read/Write lines 119–137).
**Observed behavior:** Each point is exactly 1+1+2+4+1 = 9 bytes. FloorInfo itself = int32 point count + points + ITG FloorKey + int32 BuildItemDefinition count + definitions.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: `S1` (ushort) and `B1` (byte) on FloorPoint have no assigned meaning in S4S. How multiple patterns coexist on one tile is Unknown_0x01 — S4S parses one definition index per point and nothing more.

### Floor layers per room (RoomArchitectureData)
**Claim:** Room architecture data carries five independent FloorInfo layers — Floor1..Floor4 plus Ceiling — with Floor4 and Ceiling present only when the lot-architecture version is ≥ 15.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/RoomArchitectureData.cs` lines 25–73.
**Observed behavior:** Read(stream, version)/Write(stream, version): walls list, key list (TGI), then Floor1–3 always; `if (version >= 15)` gates Floor4 and Ceiling. Consumed by `MagalogResource.cs` (room magalog).
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** none for the version gate; layer-to-game-level mapping is implied by property order but never named in S4S beyond Floor1..4/Ceiling.

### FloorTrimResource is a bare trim
**Claim:** FloorTrimResource adds zero fields to TrimBase; it exists only to bind type 0x84C23219 (2227319321) to the generic trim layout.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/FloorTrimResource.cs` (18 lines); layout in `TrimBase.cs`.
**Observed behavior:** Inherits TrimBase.Read/Write: Version (checked ≤ 7), Common, ITG TrimKey, u32 MaterialVariant, ITG ModelKey, u64 PrototypeId, byte+Color swatch list, u32 U1. Default ModelKey typed Model, TrimKey typed TrimResource.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U1 (uint32) — unnamed in source.

### FloorKeyList (lot-level floor key table)
**Claim:** A lot-architecture companion resource (type 0xF8B7FD69) stores a 16-byte hex blob followed by a counted list of {ITG key, u32, u32} entries whose keys resolve against FloorResource.
**Evidence — S4S implementation:** `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs` class `FloorKeyList` (lines 2936–3042).
**Observed behavior:** Read: 16-byte hex string, int32 count, per item ITG + U1 + U2. Display name resolves via `ResourceNameCache.Get<FloorResource>(FloorResource.Type, Key.Instance)`. Not versioned (no Version field).
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** U-fields: header 16-byte blob purpose unknown (source initializes it to "000102…0F" placeholder); Item.U1/U2 unknown.

### What S4S does NOT implement for floors
**Claim:** S4S contains no parser for a distinct floor-pattern binary format, no floor-paint editing tool over lot data, and no semantic naming for any floor-specific unknown field.
**Evidence — S4S implementation:** absence checks: grep across `S4Studio/` shows FloorResource/FloorInfo consumed only by catalog UIs (`ViewModels/BuildBuy/FloorStandalone.cs`) and MagalogResource; no other floor-format readers exist under Data/IO.
**Observed behavior:** Floors are handled purely as catalog items (clone/swatch/thumbnail flows) plus passive parsing inside room architecture data.
**Confidence:** Implementation-verified
**Public-reference agreement:** n/a
**Unknowns:** everything above; do not assume pattern-blending, corner variants, or diagonal-tile encodings exist in these resources.
