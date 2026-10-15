# S4S Reference — Roofs

Scope: roof resources implemented in S4S. Catalog items live in `S4Studio/Data/IO/BuyBuild/`; the lot-placed roof data block lives in `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs`.

**Covered:** RoofResource, RoofPatternResource, RoofTrimResource, lot-level RoofData.
**NOT covered by S4S:** no roof geometry generation/mesh format beyond Model references; no semantic naming of unknown scalars.

### RoofResource layout
**Claim:** The per-roof-style catalog resource (type 0x91EDBD3E) is: version, Common, u32 U1, PatternKey TGI, TrimKey1 TGI, TrimKey2 TGI, RoofToolKey TGI, u32 U2, and a u32 U3 that exists only at version ≥ 5.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/RoofResource.cs` (Read 179–207, Write 209–232).
**Observed behavior:** Version checked ≤ 5; new resources default Version = 5. All four keys are full raw TGIs (u64 instance/u32 type/u32 group). No swatch color list in this resource (it is BuyBuildSwatchResource but Read never populates SwatchColors).
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U-fields: U1, U2, U3 unnamed; purpose of RoofToolKey is named only by property name — its target resource type is not constrained in code.

### RoofPatternResource layout
**Claim:** Roof pattern catalog items (type 0xF1EDBD86) link one MaterialDefinition key and one FloorResource-typed key, plus prototype id, swatch colors, and a Seasons byte gated at version ≥ 6.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/RoofPatternResource.cs` (Read 133–161).
**Observed behavior:** Order: Version (≤ 6), Common, u32 U1, Material key TGI, Floor key TGI (constructor defaults `new ExternalResource(FloorResource.Type)`), u64 PrototypeId, byte+Color swatches, then `if (Version >= 6) Seasons = ReadByte()`. Implements IMaterialListResource with Materials wrapping the single Material entry.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** U-fields: U1 unnamed.

### RoofTrimResource layout and version gate
**Claim:** Roof trims (type 0xB0311D0F) read B1 always but B2 only when version < 6, followed by TrimKey, MaterialVariant, ModelKey, PrototypeId and swatch colors.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/RoofTrimResource.cs` (Read 135–162).
**Observed behavior:** Version checked ≤ 6. The B2 byte was dropped in version 6 — reading old files keeps it, writing uses the same gate. Single model via AllModels().
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: B1, B2 semantics unnamed.

### Lot-level RoofData block
**Claim:** Placed roofs on a lot are stored in a versioned block (type 0xC3D98B48) whose per-block entries reference a RoofResource key, two roof-trim keys, a RoofPatternResource key, a WallResource key (version > 10), and triangle-point lists with coordinate/index pairs.
**Evidence — S4S implementation:** `ArchitectureResourceFactory.cs` class `RoofData` (lines 2523–2934).
**Observed behavior:** Header: Version (checked ≤ 13); RoofPatternKey TGI only when Version < 7; 16 "Blanks" bytes; float F1; u32 U1; byte B1; int32 block count. Per block: u32 U1; (Version < 11) one legacy fixed point pair; TGIs for RoofKey/RoofTrim1Key/RoofTrim2Key/RoofPatternKey; (Version > 10) WallKey TGI + counted RoofBlockPoint list where each point is X1,Y1 bytes + Index1 ushort + X2,Y2 + Index2, plus X3/Y3/Index3 triple only when Version < 13; byte B1; geometry floats F1–F3 (Version ≥ 11) or legacy U2/B2/F1 tail (Version < 11), extended with F4–F7 when Version > 12; 8 extra bytes when Version > 8. Write mirrors all gates including downgrades (legacy write collapses Points to a single entry when Version < 11).
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** U-fields: header F1/U1/B1, per-block U1/B1, Blanks bytes, the trailing 8-byte blob; Index values' unit/meaning are parsed but unnamed.

### Geometry linkage
**Claim:** Roofs connect to meshes/materials only through external keys: RoofTrim resources carry a ModelKey, RoofPattern carries a MaterialDefinition key, and RoofData blocks reference those catalog items by TGI; S4S parses no roof-specific geometry inline.
**Evidence — S4S implementation:** `RoofTrimResource.cs` (ModelKey, AllModels), `RoofPatternResource.cs` (Material/Floor keys), `RoofData.RoofBlock` key fields.
**Observed behavior:** All linkage is lazy ExternalResource/ResourceKey references resolved elsewhere in the app (catalog UIs, thumbnail generation).
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** how engine picks TrimKey1 vs TrimKey2 on RoofResource is Unknown_0x00 — both are stored symmetrical u32-tagged TGIs with no role flags.

### What S4S does NOT implement for roofs
**Claim:** There is no roof-shape/foundation parser, no procedural roof geometry writer, and no naming for any roof scalar beyond the property names shown above.
**Evidence — S4S implementation:** absence check: grep for Roof across `Data/IO` yields only the three catalog resources + RoofData + FileDb metadata wrappers (`Data/FileDb/Models/RoofPatternContentMetadata.cs`, `RoofTrimContentMetadata.cs`) which add no binary fields.
**Observed behavior:** Roof editing in S4S = clone/swatch/thumbnail of catalog items; placement geometry stays opaque inside RoofData floats.
**Confidence:** Implementation-verified
**Public-reference agreement:** n/a
**Unknowns:** all float semantics in RoofData blocks.
