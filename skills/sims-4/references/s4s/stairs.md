# S4S Reference — Stairs, Railings, Friezes, Columns, Fences & Modular Trims

Scope: every modular/inclined build piece format S4S implements. Catalog resources in `S4Studio/Data/IO/BuyBuild/`; lot-placed stair data in `ArchitectureResourceFactory.cs`; PlatformResource lives in `S4Studio/Shared/`.

**Covered:** StairsResource + InclineBase, lot StairsData, RailingResource, FriezeResource, ColumnResource, FenceResource, SpandrelResource, HalfWall*/Trim, TrimBase family (Deco/Fountain/Pool/Floor trims, Platform), GenericMTXResource.
**NOT covered by S4S:** no elevator resource, no firepole, no semantic naming for byte-flag fields (B1–B6 etc.).

### Shared trim layout (TrimBase)
**Claim:** FloorTrim, HalfWallTrim, DecoTrim, FountainTrim, PoolTrim and Platform resources all share one binary layout defined by TrimBase: Version(≤7), Common, ITG TrimKey, u32 MaterialVariant, ITG ModelKey, u64 PrototypeId, swatch colors, u32 U1.
**Evidence — S4S implementation:** `BuyBuild/TrimBase.cs` (Read 116–133); subclasses `FloorTrimResource.cs`, `HalfWallTrimResource.cs`, `DecoTrimResource.cs`, `FountainTrimResource.cs`, `PoolTrimResource.cs`, `../Shared/PlatformResource.cs`.
**Observed behavior:** Subclasses append fields after base.Read. DecoTrim adds float F1, u32 U2, byte B1. HalfWallTrim adds AuralMaterials block, ObjectCatalogKey1 ITG, FenceKey ITG. FountainTrim and PoolTrim add nothing (type-only bindings 0xE7ADA79D / 0xA5DFFCF3). Platform type is 0x99C07284.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: TrimBase.U1; DecoTrim F1/U2/B1; all unnamed in source.

### StairsResource catalog layout
**Claim:** The stairs catalog resource (type 0x9A20CD1C) extends InclineBase with WallKey/ObjectKey TGIs, bytes B1–B3, MaterialVariant, PrototypeId, swatches, B4, then a RailingKey+B5 pair gated at version ≥ 11 ("HobbyVersion") and B6+AdditionalModels gated at version ≥ 13 ("RoyaltyVersion"/MaxVersion).
**Evidence — S4S implementation:** `BuyBuild/StairsResource.cs` (Read 232–273); base `BuyBuild/InclineBase.cs`.
**Observed behavior:** InclineBase contributes: Common, AuralMaterials, ITG Model1..Model4, u32 MaterialVariant, and an ObjectKey defaulted to ObjectDefinitionResource.Type. Version checked ≤ 13. AdditionalModels is a byte-counted list of ITGs included in AllModels(). Models1–4 are filtered to valid Model-typed non-zero instances by InclineBase.AllModels().
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U-fields: B1–B5 flags unnamed; role split of the four models (S4S names them only Model1–4).

### Lot-placed stairs (StairsData)
**Claim:** Placed staircases/ladders live in block type 0x0B188259 holding counted lists of stair blocks (and ladder blocks when version > 10), each carrying floats/int geometry scalars, a u64 StairsObjectID, and TGIs for StairsKey, RailingKey, WallKey.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs` class `StairsData` (lines 1342–1707).
**Observed behavior:** Version read then checked ≤ 12 despite a declared `RoyaltyVersion = 15u` constant — the code contains `if (Version >= 15)` branches (F7, F8, X4 hex blob) that cannot execute under CheckVersion(12). Block body varies: version ≤ 6 reads F3/F4/I2 and writes U1 as u32; > 6 reads B1+F5 with u16 U1; per-block sub-item list (S1 ushort + B1 byte) only when version > 9; exact-version-9 extras B3+S1; X3 16-byte hex when ≥ 12; count prefix is u16 when version > 6 else u8.
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** nearly all scalars: F1–F8, I1, I2, B1–B4, U1, X2/X3/X4 hex blobs are parsed positionally without meaning. Ladder vs stairs use identical item structure.

### RailingResource
**Claim:** Railings (type 0x1C1CF1F7) store eight fixed model keys plus MaterialVariant, PrototypeId, u32 U1, and swatch colors, at max version 8.
**Evidence — S4S implementation:** `BuyBuild/RailingResource.cs` (Read 257–280).
**Observed behavior:** Order: Version(≤8), Common, ITG ModelKey1..ModelKey8, u32 MaterialVariant, u64 PrototypeId, u32 U1, byte+Color swatches. AllModels returns all eight unconditionally.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U-fields: U1; which model slot is post/cap/panel.

### FriezeResource
**Claim:** Friezes/frieze variants (type 0xA057811C) hold a TrimKey TGI, two model TGIs, two floats F1/F2, MaterialVariant, PrototypeId and swatches, max version 9.
**Evidence — S4S implementation:** `BuyBuild/FriezeResource.cs` (Read 160–178).
**Observed behavior:** Order: Version(≤9), Common, ITG TrimKey, ITG ModelResource, u32 MaterialVariant, u64 PrototypeId, float F1, float F2, ITG ModelResource2, byte+Color swatches. No version-gated fields.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: F1/F2 floats unnamed (position/height not stated anywhere in S4S).

### ColumnResource
**Claim:** Columns (type 0x1D6DF1CF) extend ObjectCatalogResource and switch on a u32 selector U8 after it: U8 == 0 reads four unknown keys; U8 == 1 reads u32 U9 plus nine model keys and nine footprint keys; both branches append Seasons fields (u64+byte) when version ≥ 26.
**Evidence — S4S implementation:** `BuyBuild/ColumnResource.cs` (Read 639–679).
**Observed behavior:** Base ObjectCatalogResource.Read runs first (its own versioning); then U7, U8 u32s. Branch bodies are mutually exclusive on write as well as read. AllFootprints()/AllModels() return the nine-slot arrays regardless of branch taken.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: U7, U8 branch semantics (0 vs 1 meaning), U9, UnknownKey1–4 targets, and what distinguishes the 9 model slots.

### FenceResource
**Claim:** Fences (type 0x0418FE2A) combine four BuildModelEntry lists, seven fixed model keys, a SlotKey, three u16-counted uint lists, and Seasons floats gated at version ≥ 12; byte B1 is read twice, the second read overwriting the first.
**Evidence — S4S implementation:** `BuyBuild/FenceResource.cs` (Read 598–637).
**Observed behavior:** Order: Version(≤12), Common, ModelList1–4 (byte-counted BuildModelEntry), if v≥12 float Seasons1, float Seasons2, byte Seasons3, ITG ModelKey1–7, u32 U1, byte B1, u32 MaterialVariant, u64 PrototypeId, ITG SlotKey (typed SlotResource in ctor), Ulist1–3 (u16 count + u32 items), swatch colors, u32 U2, byte B1 again (overwrites earlier value; write emits B1 twice symmetrically).
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: U1/U2, the three uint lists, B1's true role (double-read suggests source uncertainty), Seasons field meanings.

### SpandrelResource
**Claim:** Spandrels (type 0x3F0C529A) mirror the fence shape minus slot/uint-lists: four BuildModelEntry lists, optional u64+byte Seasons tail (read when v≥8 and stream bytes remain; written only when Seasons1 ≠ 0), seven model keys, MaterialVariant, PrototypeId, swatches; max version 8.
**Evidence — S4S implementation:** `BuyBuild/SpandrelResource.cs` (Read 380–410, Write 421–425).
**Observed behavior:** Read gate is `Version >= 8 && stream.Position < stream.Length` (defensive against older files); Write gate is value-based (`Seasons1 != 0`) — read/write conditions are asymmetric, so a v≥8 file with zeroed Seasons1 loses the tail on rewrite.
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** U-fields: Seasons1/Seasons2 meanings.

### HalfWallResource
**Claim:** Half walls (type 0x9151E6BC) are minimal: Common, float F1, float Height, a WallPattern key, and a PoolTrim key, at max version 1.
**Evidence — S4S implementation:** `BuyBuild/HalfWallResource.cs` (Read 112–122).
**Observed behavior:** Keys written via ReadITG/WriteITG helpers; no swatch color list, no material variant, no model keys.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: F1 purpose; whether PoolTrim key must target PoolTrimResource is unchecked.

### GenericMTXResource
**Claim:** GenericMTX (type 0xAC03A936) carries only a version u32 and the CTProduct common block — no other data is parsed.
**Evidence — S4S implementation:** `BuyBuild/GenericMTXResource.cs` (34 lines total).
**Observed behavior:** Read/Write: Version (≤1) then Common. Used as fallback for MTX-typed catalog resources with no dedicated parser.
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** any real payload beyond Common in actual game files.

### What S4S does NOT implement here
**Claim:** S4S has no parsers for elevators, spiral-stair geometry, or any "stair shape" mesh format; stairs geometry arrives only through the generic Model references and opaque StairsData scalars.
**Evidence — S4S implementation:** absence check: grep across `Data/IO` for Stair/Elevator finds only StairsResource, StairsData, shader enums (`Material/ShaderType.cs` Stairs/StairRailings entries) and FileDb metadata wrappers.
**Observed behavior:** All stair/railing/column editing flows operate on the catalog resources above.
**Confidence:** Implementation-verified
**Public-reference agreement:** n/a
**Unknowns:** all flagged above per-resource.
