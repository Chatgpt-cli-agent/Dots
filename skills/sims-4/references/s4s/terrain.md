# S4S Reference — Terrain, Pools/Ponds, Foundations & Platforms

Scope: terrain and water-adjacent formats actually present in S4S. Catalog resources in `S4Studio/Data/IO/BuyBuild/`; lot-level terrain data in `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs`; PondResource and PlatformResource live in `S4Studio/Shared/`.

**Covered:** TerrainPaintResource, TerrainToolResource, lot TerrainPaintLayersResource, TerrainHeightMap, PondPoolData, PondResource, FoundationResource, PlatformResource, BlockResource, SurfaceTypeFlags.
**NOT covered by S4S:** no pool-water simulation resource, no pond/fish-spawner format beyond the items below, no terrain sculpt brush format, no foundation/platform placement geometry parser.

### TerrainPaintResource (catalog item)
**Claim:** Terrain paint catalog entries (type 0xEBCBB16C) are BuyBuildSwatchResources with: version(≤3), Common, AuralMaterials block, an external material TGI list, and a Seasons byte gated at version ≥ 3.
**Evidence — S4S implementation:** `BuyBuild/TerrainPaintResource.cs` (Read 91–111).
**Observed behavior:** Materials stored as int32 count + raw TGIs (same pattern as FloorResource). No swatch color list is read. Cloning/thumbnail flows exist via `ViewModels/BuildBuy/TerrainPaintPrototype.cs` / `TerrainPaintStandalone.cs` and FileDb `TerrainContentMetadata`.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U-fields: none named beyond Seasons; per-slot meaning of the material list.

### TerrainToolResource
**Claim:** Terrain tool catalog entries (type 0x1427C109) contain only version(≤1), Common, and one u32 U1.
**Evidence — S4S implementation:** `BuyBuild/TerrainToolResource.cs` (60 lines).
**Observed behavior:** Read/Write of exactly three elements; nothing else implemented.
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** U-fields: U1 entirely unknown; S4S assigns no semantics.

### Lot terrain paint layers
**Claim:** Painted terrain on a lot is a versioned block (type 0x2D173F89) holding two layer lists — the second only at version ≥ 4 — then Width/Height ints, then per-layer byte masks sized Width×Height.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs` class `TerrainPaintLayersResource` (lines 4074–4307).
**Observed behavior:** Layer = TerrainPaint TGI + u32 U1 (+ B1 byte when v ≥ 4) + LotByteValues mask read as (Width, Height, 1). At version < 4 the second count is read and discarded and Layers2 cleared. ToString resolves layer names through TerrainPaintResource display names.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: Layer.U1 and B1 unnamed; what distinguishes Layers1 from Layers2 (e.g. paint vs floor-terrain) is not stated in S4S.

### Lot terrain heightmap
**Claim:** Terrain elevation is stored (type 0xE17A612D) as float arrays whose layer count depends on lot version — Depth layers below version 10, fixed 2 above — each sized (Width+1)×(Height+1)×Depth, followed by zero or four int "CompressedVals" arrays (four only at lot version ≥ 12) sized Width×Height×Depth.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs` class `TerrainHeightMap` (lines 3453–3550); array helpers in `World/Architecture/LotFloatValues.cs`, `LotIntValues.cs`, `LotArrayUtils.cs`; dimensions come from shared `LotSize`.
**Observed behavior:** Read/Write symmetric against the shared lot Size/version, not a local version field. The +1 vertex-grid dimension vs cell-grid masks is explicit in code (`size.Width + 1`).
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: CompressedVals contents/encoding are parsed as raw ints with no decode step — compression scheme Unknown_0x00 in S4S.

### Ponds and pools (PondPoolData)
**Claim:** The only pond/pool data block S4S parses (type 0x826C8B59, max version 3) stores counted items of {u16 S1, u32 U1, FloorKey TGI resolving to FloorResource, u16-counted 5-byte hex strings, u16 S2}.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs` class `PondPoolData` (lines 546–662).
**Observed behavior:** FloorKey name resolution explicitly uses `FloorResource.Type`, i.e. pool/pond surfaces reference floor-pattern resources. Hex items are opaque strings read via ReadHex(5).
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** U-fields: S1/U1/S2 and the hex item list contents — S4S treats them as opaque. Whether this block serves ponds, pools, or both is not distinguished in code (class name says both).

### PondResource (catalog item)
**Claim:** Pond catalog entries (type 0x5003333C) hold only version(≤4), Common, and one u32 U1; they live outside the BuyBuild folder in S4Studio/Shared.
**Evidence — S4S implementation:** `S4Studio/Shared/PondResource.cs` (61 lines).
**Observed behavior:** Same minimal shape as TerrainToolResource. Tag UI references pond-item tags (`Shared/TagManagerExt.cs`) but no deeper pond format exists.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: U1.

### Pool trim (catalog item)
**Claim:** Pool trims exist solely as a type binding (0xA5DFFCF3) onto TrimBase with zero additional fields; HalfWallResource separately carries a PoolTrim key referencing it.
**Evidence — S4S implementation:** `BuyBuild/PoolTrimResource.cs`; `BuyBuild/HalfWallResource.cs` (PoolTrim property); FileDb wrapper `Data/FileDb/Models/PoolTrimContentMetadata.cs`.
**Observed behavior:** Full layout inherited from TrimBase (see stairs.md). GameFileTable indexes PoolTrimItems for catalog browsing only.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: TrimBase.U1 (shared).

### Foundations
**Claim:** The foundation catalog resource (type 0x2FAE983E, max version 7) reads B1, B2, ModelResource TGI, MaterialVariant, PrototypeId, U2, U3, TrimKey TGI, ModelResource2 TGI, swatches, and a third ModelResource3 TGI gated at version ≥ 7.
**Evidence — S4S implementation:** `BuyBuild/FoundationResource.cs` (Read 227–260).
**Observed behavior:** AllModels returns ModelResource, ModelResource2, ModelResource3. Per-wall-segment foundation choice is a plain uint index inside `World/Architecture/WallInfo.cs` WallSegment (`Foundation` field) — S4S does not resolve that uint to a FoundationResource key in WallInfo itself.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U-fields: B1, B2, U2, U3 unnamed; role differences among the three models.

### Platforms
**Claim:** Platforms are implemented only as a TrimBase type binding (0x99C07284, `S4Studio/Shared/PlatformResource.cs`); platform placement traces exist as a `PlatformTrim` uint inside wall segments, gated to wall-info versions 31, 35 and 36.
**Evidence — S4S implementation:** `Shared/PlatformResource.cs`; `Data/IO/World/Architecture/WallInfo.cs` lines 53–56 (`if (s1 == 31 || s1 == 35 || s1 == 36)`); FileDb `PlatformContentMetadata`; ViewModels `PlatformSwatchContent.cs`/`PlatformStandalone.cs`.
**Observed behavior:** PlatformResource adds no fields over TrimBase. Note WallInfo.Write has an asymmetry bug: it writes PlatformTrim unconditionally but gates U3 on s1 ∈ {31,35,36} (Read gates PlatformTrim, not U3).
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** any platform height/level geometry format — not implemented in S4S.

### BlockResource (generic block catalog)
**Claim:** A generic block resource (type 0x07936CE0, 127102176) parses three bytes B1–B3 and an optional trailing list of 3-byte items, appended only when stream bytes remain.
**Evidence — S4S implementation:** `BuyBuild/BlockResource.cs` (Read 121–143).
**Observed behavior:** Version ≤ 7; item list read guarded by `stream.Position < stream.Length`; Write emits the list only if non-empty (asymmetric with the guard).
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** U-fields: everything — B1/B2/B3 and item bytes have no assigned meaning; whether this backs platform/block build tools is Unknown_0x01.

### SurfaceTypeFlags vocabulary
**Claim:** S4S encodes a surface-classification bitfield with named bits Terrain=0x1, Floor=0x2, Pool=0x4, Pond=0x8, FencePost=0x10, AnySurface=0x20, Air=0x40, Roof=0x80.
**Evidence — S4S implementation:** `BuyBuild/SurfaceTypeFlags.cs` (private Flags enum).
**Observed behavior:** Pure flag wrapper (get/set per bit, Value round-trip); used as vocabulary elsewhere in the app rather than as a serialized resource here.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** which resources serialize this bitfield and where is not traced in this file set.

### What S4S does NOT implement for terrain/water
**Claim:** S4S contains no parsers for: pool water volume/simulation data, pond contents beyond PondPoolData's opaque lists, terrain sculpting deltas, world-level terrain KD-trees (only ITG key lists in WorldManifest/CameraManifest/WaterManifest), or any foundation/platform placement geometry.
**Evidence — S4S implementation:** absence checks: grep for terrain/pool/pond under `Data/IO` returns the files cited above plus manifest classes that store only TerrainKDTrees resource keys (`WaterManifestResource.cs` line 252, `WorldManifestResource.cs` line 290, `CameraManifestResource.cs` line 250) without parsing them.
**Observed behavior:** Terrain editing in S4S is limited to the paint-catalog clone flows and whatever lot blocks listed above expose.
**Confidence:** Implementation-verified
**Public-reference agreement:** n/a
**Unknowns:** all listed gaps remain Unknown_* — do not infer their formats.
