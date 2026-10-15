# CAS Resources & Tuning/SimData — claim-based reference

Merged conversion of `../s4s-cas-resources.md` and `../s4s-tuning.md`. All
evidence from the decompiled S4S source at
`/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` (paths relative to `S4Studio/`).
Public-reference docs consulted: `references/resource-types.md` (type IDs),
`references/stbl.md` (string tables).

---

## Part A — CASP (`CASPartResource`, type 0x034AEECB)

### CASP identity and version gate
**Claim:** The CASP resource has type ID 55242443 (0x034AEECB), a max known
version of 52, accepts only versions 34–52 on load, and writes new resources
at version 52.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:22-26,1714,1734`
(class `CASPartResource : PackedResource, IVersionResource, ISwatchResource, …`).
**Observed behavior:** The `Version` setter rejects anything outside 34–52;
the constructor sets 52.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (resource-types.md confirms 0x034AEECB as
CASP across four independent community sources).
**Unknowns:** semantics of versions < 34 (never parsed here).

### Named CASP version constants
**Claim:** CASP code names patch versions: kEmissionMapPatch=30,
kAlienPatchVersion=31, kGenderPatchVersion=40, kToddlerPatch=42,
kKnittingVersion=43, kSpecialMakeupVersion=44, kWeddingVersion=46,
kCrystalCreationsPatch=49, kHobbyPatchVersion=50, kNaturePatchVersion=51,
kRoyaltyAndLegacyVersion=52.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:28-48`.
**Observed behavior:** These constants drive per-field read/write gating and
auto version bumps (below).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** official EA names for the boundaries.

### VersionRaw vs Version inconsistency
**Claim:** Some CASP field gates use `VersionRaw` (on-disk) while others use
the normalized `Version`; e.g. LayerID is written when `VersionRaw >= 50` but
GameplayLockedDescriptionKey when `Version >= 43`.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:1791-1919`
(read) vs `2035-2163` (write).
**Observed behavior:** Byte-compatibility requires reproducing this mix
exactly.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** which gate EA's own writer uses.

### CASP uses a TGI-list indirection for all references
**Claim:** Immediately after the version field a `ResourceKeyList("igt",
countSize:8, useLength:false)` opens; every texture/model reference stored
inline is a single byte index into that list, and the actual TGI blocks are
appended at the end of the resource via
`EndWrite(..., relative_offset: true)`.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:1778,2005,2018,2231`;
list parameters at `Data/IO/Core/ResourceKeyList.cs:20-27`.
**Observed behavior:** Read side calls `resourceKeyList.EndRead(stream)` at
the tail; write side appends the key data block last.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md documents that
CASP "points at GEOM/texture/region-map resources" via an internal key table,
but the byte-level "igt" list encoding is undocumented publicly.
**Unknowns:** none material.

### CASP on-disk field order
**Claim:** After version + TGI-list open, fields follow the fixed order below
(little-endian), each row gated by its version condition.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs`
(`Read()`, lines 1773-2010; write mirrors it).
**Observed behavior:**

| Order | Field | Type / encoding | Version condition |
|---|---|---|---|
| 1 | Version | uint32 | — |
| — | TGI list header opens ("igt", byte indices) | — | — |
| 2 | Preset count | uint32; must be 0, else `InvalidDataException("Presets not supported in The Sims 4")` | — |
| 3 | Name | 7-bit-length-prefixed string, BigEndianUnicode | — |
| 4 | DisplayIndex | float32 | — |
| 5 | SecondaryDisplayIndex | uint16 | — |
| 6 | PrototypeId | uint32 | — |
| 7 | AuralMaterialHash | uint32 | — |
| 8 | PartFlags.Value | byte | — |
| 9 | PartFlags2.Value | byte | ≥39 |
| 10 | LayerID | uint16 | ≥50 |
| 11a | ExcludePartFlags count + entries | int32 count, then uint64 each | ≥51 |
| 11b | ExcludePartFlags | uint64 | <51 |
| 11c | ExcludePartFlags2 | uint64 | <51 and ≥41 |
| 12 | ExcludeModifierRegionFlags | uint64 (uint32 below v36) | ≥36 |
| 13 | Tag count + tags | uint32 count; per tag Category uint16 + TagValue uint32 (≥37) or uint16 (<37) | — |
| 14 | SimoleonPrice | uint32 | — |
| 15 | PartTitleKey | uint32 (STBL string key) | — |
| 16 | PartDescriptionKey | uint32 (STBL string key) | — |
| 17 | GameplayLockedDescriptionKey | uint32 | ≥43 |
| 18 | UniqueTextureSpace | byte (== 1 → true) | — |
| 19 | BodyType | int32 (BodyType enum) | — |
| 20 | BodySubType (pre-v35: `Unused`) | int32 | ≥35 |
| 21 | AgeGender.Value | uint32 (AgeGenderFlags) | — |
| 22 | Species | uint32 (Species enum) | ≥32 |
| 23 | PackIDInternal | int16 | ≥34 |
| 24 | PackFlags.Value | byte | ≥34 |
| 25 | PackReserved | 9 × byte | ≥34 |
| 26 | (pre-v34 legacy) Unused2, Unused3 | byte; extra byte if Unused2>0 | <34 |
| 27 | Swatch color count + colors | byte count; per color 4 bytes B,G,R,A (`ReadColor`: reads b,g,r,a order) | — |
| 28 | Buff | byte TGI index | — |
| 29 | VariantThumb | byte TGI index | — |
| 30 | Voice | uint64 | ≥28 |
| 31 | Aural material set count + sets | byte count (=3 written); UpperBody/LowerBody/Shoes uint32 each | ≥30 |
| 32 | HideForOccultFlags | uint32 (OccultBitField) | ≥31 |
| 33 | U1, U2 | 2 × uint32 (OccultBitField) | ≥46 |
| 34 | OppositeGenderPart | uint64 (instance id) | ≥38 |
| 35 | FallbackPart | uint64 (instance id) | ≥39 |
| 36 | Slider opacity/hue/saturation/brightness min/max/step | 11 × float32, fixed order (OpacityMin, OpacityStep, HueMin, HueMax, HueStep, SatMin, SatMax, SatStep, BrightMin, BrightMax, BrightStep) | ≥44 |
| 37 | LinkedParts | byte count; per part byte TGI index | ≥46 |
| 38 | Naked | byte TGI index | — |
| 39 | Parent | byte TGI index | — |
| 40 | SortLayer | int32 | — |
| 41 | LODs | byte count; each `CASPartLod` | — |
| 42 | SlotKeys | byte count; N × byte | — |
| 43 | DiffuseMap | byte TGI index | — |
| 44 | ShadowMap | byte TGI index | — |
| 45 | CompositionMethod | byte | — |
| 46 | RegionMap | byte TGI index | — |
| 47 | Overrides | byte count; each = Region byte + Layer float32 | — |
| 48 | NormalMap | byte TGI index | — |
| 49 | SpecularMap | byte TGI index | — |
| 50 | AdditionalTextureSpace | uint32 (BodyType) | ≥27 |
| 51 | EmissionMap | byte TGI index | ≥29 written / ≥30 read (asymmetric in code!) |
| 52 | BlendGeometryKey | byte TGI index | ≥42 |
| 53 | ColorShiftMask | byte TGI index | ≥49 |
| 54 | SheenMap | byte TGI index | ≥52 |
| 55 | TGI list data block | appended by `EndWrite(relative_offset:true)` | — |

Swatch color bytes are read B,G,R,A into ARGB
(`BinaryReadWriteExt.cs:181-186`).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — the SimsWiki/Kuree CASP pages
(resource-types.md sources) describe the resource conceptually; this exact
field table goes beyond them. The v29/v29-read/v30-write EmissionMap
asymmetry is S4S-only observed.
**Unknowns:** U1, U2 (two OccultBitField u32s, v≥46) — names preserved, no
semantics known.

### CASP auto-bumps its version on save based on content
**Claim:** `UpdateVersionNumber` raises the written version when data demands
it: non-null EmissionMap ⇒ ≥30, Species set ⇒ ≥32, PartFlags2 ≠ 0 ⇒ ≥39,
RestrictOppositeFrame/RestrictOppositeGender ⇒ ≥40, BlendGeometryKey set or
toddler age ⇒ ≥42, LinkedParts present ⇒ ≥46, ColorShiftMask ⇒ ≥49,
LayerID/Layerable ⇒ ≥50, extra exclude-flag entries ⇒ ≥51, SheenMap ⇒ ≥52.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:2249-2315`.
**Observed behavior:** A minimal part stays at low versions; adding features
silently upgrades the record.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** whether EA's writer applies identical rules.

### Accessory detection is DiffuseMap-type sniffing
**Claim:** `IsAccessory()` returns true exactly when `DiffuseMap.Type` equals
the DST image type (11720834) — accessories use DST textures instead of
DDS/RLE — and variant thumbnails are likewise typed DST when set.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:2392-2395,1656-1660`;
type constant at `Data/IO/Images/DSTImageResource.cs:17`.
**Observed behavior:** No explicit accessory flag is consulted; the texture
type alone decides.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** whether the game uses the same rule.

### Per-species rig instance naming
**Claim:** Rig instance names are derived per species/age by FNV64 over fixed
strings: `auRig`, `cuRig`, `puRig` (toddler), `iuRig` (infant),
`acRig`/`ccRig`, `axRig` (fox), `adRig`/`cdRig`, `alRig`/`cdRig`,
`ahRig`/`chRig`.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:2365-2390`.
**Observed behavior:** Adult/child forms share prefixes with age-letter
prefixes (a/c/p/i/u) plus species letters (x fox, d dog, l large dog?, h
horse).
**Confidence:** Implementation-verified (mapping exists in code).
**Public-reference agreement:** None documented.
**Unknowns:** full letter-to-species table beyond what's coded.

### 3-color swatch lists are stored swizzled
**Claim:** For 3-color swatch lists the on-disk order is [c0, c2, c1];
`UnswizzleSwatchColors`/`SwizzleSwatchColors` convert both ways.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:2317-2353`.
**Observed behavior:** Other color counts pass through unswizzled.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** why the game swizzles.

### Swatch/color surface of CASP
**Claim:** Swatch colors live directly on the CASP as byte-count + BGRA byte
quads; the `ISwatchResource` surface is `PrototypeId`,
`VariantThumbnailInstance` (DST-typed), and `SortField` ==
`SecondaryDisplayIndex`; color-shift variants reference a ColorShiftMask
texture (TGI index, v≥49) which is a normal image resource.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:1584-1698`;
color IO in `Data/IO/Util/BinaryReadWriteExt.cs:181-186`.
**Observed behavior:** See field table rows above.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial (swatches documented conceptually in
community CASP pages; byte layout not).
**Unknowns:** none.

### CASP LOD substructure
**Claim:** Each CASP LOD entry is: `Level` (byte), `Unused` (uint32), asset
count (byte) of `CASPartLodAsset`, model count (byte) with byte indices into
the CASP TGI reference list; each `CASPartLodAsset` is three int32s in the
exact order Sorting, SpecularLevel, CastShadow; each override entry is Region
(byte) then Layer (float32).
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartLod.cs:73-99`;
`CASPartLodAsset.cs:44-51`; `CASPartOverride.cs:41-47`.
**Observed behavior:** See CASP field table row 41/47.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** `CASPartLod.Unused` semantics.

## Part B — CAS flag enums

### AgeGenderFlags bit layout
**Claim:** AgeGender is a uint32 flag field: ages Baby=0x1, Toddler=0x2,
Child=0x4, Teen=0x8, YoungAdult=0x10, Adult=0x20, Elder=0x40, Infant=0x80;
genders Male=0x1000, Female=0x2000; composites AllAges=0xFF,
AllGenders=0x3000, Everything=`All`=0x30FF (12543u). Bits 0x100–0xFFF are
unnamed/reserved.
**Evidence — S4S implementation:** `Data/IO/CAS/AgeGenderFlags.cs:12-27`.
**Observed behavior:** Stored as uint32 in CASP row 21 and CASPreset.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial (community CASP docs mention
age/gender flags without this exact bit map).
**Unknowns:** meaning of bits 0x100–0xFFF.

### BodyType enum spans 0–117
**Claim:** BodyType is a plain default-underlying int32 enum with 118 named
values 0–117 (count verified), from None=0 through BaseLayer=117.
**Evidence — S4S implementation:** `Data/IO/CAS/BodyType.cs:5-122`.
**Observed behavior:** Selected anchors: 0 None, 1 Hat, 2 Hair, 3 Head, 4
Face, 5 FullBody, 6 UpperBody, 7 LowerBody, 8 Shoes, 9 Accessories, 10
Earrings, 40 TattooArmLowerLeft, 44 TattooLegLeft, 56
SkinDetailMoleCheekLeft, 59 SkinOverlay, 60 FurBody, 61 Ears, 62 Tail, 63
SkinDetailNoseColor, 77 Fingernail, 78 Toenail, 79 HaircolorOverride, 80
BodyScarArmLeft, 92 SkinDetailAcnePuberty, 101 Saddle, 106 HairMane, 110
Horn, 114 Wings, 115 HeadDeco, 116 SkinSpecularity, 117 BaseLayer. Index =
ordinal position − first entry; full ordered list in the source file.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented (community lists exist but
weren't cross-checked item-by-item).
**Unknowns:** none within the enum itself.

### CASPartFlags bits (byte)
**Claim:** The v<39 PartFlags byte carries bits 0x01 DefaultForBodyType, 0x02
DefaultThumbnailPart, 0x04 AllowForRandom, 0x08 ShowInUI, 0x10
ShowInSimInfoPanel, 0x20 ShowInCasDemo, 0x40 AllowForLiveRandom, 0x80
RestrictOppositeGender.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartFlags.cs:10-19`.
**Observed behavior:** Written/read as CASP row 8.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial (community docs name several of these
bits; exact set matches here).
**Unknowns:** none.

### CASPartFlags2 bits (byte)
**Claim:** The v≥39 PartFlags2 byte carries 0x01 RestrictOppositeFrame, 0x02
DefaultForBodyTypeMale, 0x04 DefaultForBodyTypeFemale, 0x08 UnknownFlag0x08,
0x10 CreatedInGame, 0x20 UnknownFlag0x20, 0x40 UnknownFlag0x40, and 0x80
UnknownFlag0x80 — whose property is named **Layerable** and which drives the
v50 auto-bump together with LayerID.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartFlags2.cs:10-19,66-80`.
**Observed behavior:** Bits 0x08, 0x20, 0x40 have placeholder names only.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** UnknownFlag0x08, UnknownFlag0x20, UnknownFlag0x40; whether
0x80 truly means "Layerable" in game terms (name is S4S's).

### Supporting CAS enums
**Claim:** OccultBitField (uint32): None=0, Human=1, Alien=2, Vampire=4,
Mermaid=8, Spellcaster=0x10, Werewolf=0x20, Fairy=0x40, AllOccults=0x7E,
All=0x7F. ArchetypeFlags (uint): NONE=0, CAUCASIAN=1, AFRICAN=2, ASIAN=4,
MIDDLE_EASTERN=8, NATIVE_AMERICAN=16, ALL=31, ALL_MASK=uint.MaxValue.
Species: None=0, Human=1, LargeDog=2, Cat=3, SmallDog=4, Fox=5, Horse=6.
SimRegion: EYES=0 … INVALID=64 (full ordered list in source). OutfitCategory:
CURRENT_OUTFIT=-1 then EVERYDAY..SMALL_BUSINESS in order.
**Evidence — S4S implementation:** `Data/IO/CAS/OccultBitField.cs:9-20`;
`ArchetypeFlags.cs:3-11`; `Species.cs:3-10`; `SimRegion.cs:3-37`;
`OutfitCategory.cs:3-18`.
**Observed behavior:** Used in CASP rows (HideForOccultFlags, Species,
RegionMap overrides) and CASPreset.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** SimRegion value 7 gap (no name between CHIN=4… actually JAW=5,
FOREHEAD=6, then BROWS=8) — value 7 unnamed.

## Part C — BGEO blend geometry

### BGEO identity
**Claim:** BlendGeometryResource has type ID 108833297, FourCC tag "BGEO", a
single known version 1536 (checked on read), and always carries a fixed array
of 4 BlendLODs.
**Evidence — S4S implementation:** `Data/IO/CAS/BlendGeometryResource.cs:13-21,70-77,96`
(class `BlendGeometryResource : LinkedResource`; `Tag` override;
`CheckVersion(1536u)`).
**Observed behavior:** The u32 LOD count read must be ≤ 4 and indexes into
the fixed Lods array.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md confirms 0x067CAA11
BGEO as "Blend Geometry — morph/blend targets"; decimal 108833297 =
0x067CAA11. Byte layout undocumented publicly.
**Unknowns:** none.

### BGEO on-disk layout and skip codes
**Claim:** Layout is: tag "BGEO" (4 ASCII bytes), version u32, num = u32 LOD
count (≤4), two skipped/discarded u32s, then per LOD i: IndexBase i32,
IndexRange i32, DeltaCount i32; then per LOD i, IndexRange[i] × int16
"skip codes"; then per LOD i, DeltaCount[i] vectors each (X,Y,Z) as Float16
ushorts appended to Lods[i].Vectors.
**Evidence — S4S implementation:** `Data/IO/CAS/BlendGeometryResource.cs:98-160`
(`ReadData`).
**Observed behavior:** Skip-code semantics (lines 126-152): low 2 bits select
payload — 0 = no vertex (skip), 1 = position delta, 2 = normal delta, 3 =
both; upper 14 bits are an accumulating forward offset from the previous
coded vertex. Writer mirrors this in `MapBlends()` (lines 181-217).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** the two skipped u32s' meaning.

### BGEO Float16 is not IEEE half
**Claim:** The Float16 stored in BGEO encodes `(short)round(v * 8000f) ^
0x8000` and decodes as `(short)(raw ^ 0x8000) / 8000f`; raw 0 decodes to NaN.
**Evidence — S4S implementation:** `Data/IO/CAS/Float16.cs:5-33`.
**Observed behavior:** Scale factor 8000; sign-flip trick; zero → NaN.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** why raw 0 maps to NaN (sentinel?).

### BlendLOD bookkeeping
**Claim:** A BlendLOD holds VertexDeltas (list of BlendVertex) and a dedup'd
Float16 vector pool; IndexBase = min vertex Id, IndexRange = max−min+1;
a BlendVertex holds Id, Position, Normal, HasPosition, HasNormal.
**Evidence — S4S implementation:** `Data/IO/CAS/BlendLOD.cs:5-35`;
`Data/IO/CAS/BlendVertex.cs:5-10`.
**Observed behavior:** Deltas reference vertices by Id within
[IndexBase, IndexBase+IndexRange).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

## Part D — CASPreset

### CASPreset format
**Claim:** CASPreset (type 3936561885u, current version 12u, checked on
read) serializes: Version u32; AgeGenderFlags u32; BodyFrameGender u32 (≥11);
Species u32 (≥8); Region (SimRegion) u32; BodySubType u32 (≥9); Archetype
(ArchetypeFlags) u32; DisplayIndex float; PresetNameKey u32; PresetDescKey
u32; Sculpts (u32 count, per entry Instance u64 + Region u32 only if version
<9); Modifiers (u32 count, per entry Instance u64 + Weight float + Region u32
if <9); IsPhisyiqueSet byte (if >0: HeavyValue/FitValue/LeanValue/BonyValue
floats); if ≥12: IsPartSet byte and if >0: CASPartInstance u64 +
PartBodyType u32; ChanceForRandom float; Tags (u32 count, per tag Category
u16 + TagValue u32 (≥11) or u16 (<11)).
**Evidence — S4S implementation:** `Data/IO/CAS/CASPreset.cs` (Type at :96;
Read method; ctor `Version = 12u`).
**Observed behavior:** Nested types `CASPreset.Sculpt` {Instance u64, Region},
`Modifier : Sculpt` {Weight float}. Display name falls back to
`"<SPECIES> <Region> <Archetype> (<age/gender condensed>)"` using
`CASResourceNameLookup`.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md lists 0xEAA32ADD
(= 3936561885 decimal? note: 3936561885 = 0xEAA32ADD ✓) as "CAS Preset";
layout undocumented publicly. ("Phisyique" misspelling preserved from code.)
**Unknowns:** Header1/Header2-style words absent here; none flagged beyond
that.

### CASP rejects embedded presets but the preset format exists standalone
**Claim:** Although CASP read throws "Presets not supported in The Sims 4"
when the preset count ≠ 0, the standalone CASPreset resource format is fully
implemented in S4S.
**Evidence — S4S implementation:** `Data/IO/CAS/CASPartResource.cs:1781-1783`;
`Data/IO/CAS/CASPreset.cs`.
**Observed behavior:** The two facts coexist: presets never appear inside a
v34+ CASP, but preset resources exist as their own package entries.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** where CASPreset resources are referenced from in live packages.

## Part E — Embedded ResourceNames mapping

### Embedded CAS ResourceNames.txt
**Claim:** S4S embeds `S4Studio.Resources.CAS.ResourceNames.txt` (repo root,
2728 lines; format `<typeHex>:00000000:<instanceHex> <name>` per line),
parsed by `CASResourceNameLookup.AddNames` splitting on space then `:` and
loaded once at startup; most lines use type `c5f6763e` (SimModifier/head-
sculpt type used by `SimModifierResource.Type`). Lookup falls back to the
currently open package's name map.
**Evidence — S4S implementation:** `Data/IO/CAS/CASResourceNameLookup.cs:16-33,37-58`;
startup call `S4Studio/Shared/AppModel.cs:339`
(`AddNames(Res.GetString("S4Studio.Resources.CAS.ResourceNames.txt"))`).
**Observed behavior:** Gives friendly names to sculpt/modifier instances
(e.g. for `CASPreset.Sculpt.Name` lookup).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented (S4S-private asset).
**Unknowns:** provenance/completeness of the 2728-line mapping.

## Part F — Other CAS-adjacent structures

### GeneticData contents
**Claim:** GeneticData (used by SimInfo) contains Sculpts, FaceModifiers,
BodyModifiers, physique floats (Heavy/Fit/Lean/Bony), Parts, GrowthParts,
VoiceActor, VoicePitch.
**Evidence — S4S implementation:** `Data/IO/CAS/GeneticData.cs:11-40`.
**Observed behavior:** Field list verified; serialization details in same
file.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### Vertex seam stitching resources exist but internals unverified
**Claim:** `CASVertexStitchUtility.cs` plus data files
`S4Studio.Resources.CAS.VertexSeamData_*.txt` (repo root) exist for mesh
seam stitching; their internals are not yet traced.
**Evidence — S4S implementation:** `Data/IO/CAS/CASVertexStitchUtility.cs`.
**Observed behavior:** Present in tree; not analyzed line-by-line.
**Confidence:** Hypothesis (functionality inferred from naming).
**Public-reference agreement:** None documented.
**Unknowns:** everything about the seam data files' layout.

---

# Part G — XML tuning

### XML tuning root attributes and PackID placement
**Claim:** `TuningResourceBase` parses the root `<I>` element attributes: `s`
= tuning instance id (TuningId), `i` = tuning type name, `c` = class, `m` =
module, `n` = instance name; setting a name containing ':' computes
`FNV.Hash64(name) | 0x8000000000000000` and writes it to both the attribute
and the package key Instance; PackID lives in the resource key Group, low 16
bits — not in the XML.
**Evidence — S4S implementation:** `Data/IO/XMLResource.cs:8`;
`Data/IO/Tuning/TuningResourceBase.cs:71-180`.
**Observed behavior:** Generic XML base type ID is 53690476; tuning resources
subclass it.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — attribute roles match community
tuning documentation loosely; the FNV64|high-bit rule and PackID-in-group
placement are implementation observations.
**Unknowns:** none flagged.

### Tuning-type → resource-type-ID registry
**Claim:** `_add_inst_tuning(name, resource_type, …)` maps tuning type names
to resource type IDs; unknown types fall back to `FNV.Hash32(name)` with an
error log (~90 more registered beyond these examples; client tunings such as
BuildBuy/camera/renderer settings register by name only and default to FNV32
of the name via `_add_client_tuning()`).
**Evidence — S4S implementation:** `Data/IO/Tuning/TuningResourceBase.cs:186-305,378-422,447-459`
(static initializer).
**Observed behavior:** Verified examples:

| Tuning type | Resource Type ID |
|---|---|
| tuning | 62078431 |
| posture | 2909789983 |
| slot_type | 1772477092 |
| static_commodity | 1359443523 |
| relationship_bit | 151314192 |
| object_state | 1526890910 |
| recipe | 3952605219 |
| statistic | 865846717 |
| mood | 3128647864 |
| buff | 1612179606 |
| trait | 3412057543 |
| slot_type_set | 1058419973 |
| pie_menu_category | 65657188 |
| aspiration | 683034229 |
| objective | 6899006 |
| career | 1939434475 |
| snippet | 2113017500 |
| interaction | 3900887599 |
| object | 3055412916 |
| situation | 4223905515 |
| venue | 3871070174 |
| lot_tuning | 3632270694 |
| region | 1374134669 |
| animation | 3994535597 |

Per-type subclasses: `Tuning/` holds ~190 thin wrapper classes fixing the Type
constant (e.g. `TuningResource.cs:7` = 62078431u).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes for the well-known IDs cross-checked in
resource-types.md (e.g. tuning/snippet/buff families appear in community
lists); the full ~90-entry registry exceeds public lists.
**Unknowns:** IDs only reachable via FNV32 fallback for client tunings.

### Tunable serialization attribute
**Claim:** Serialization of tunables into C# attributes uses
`TunableBaseAttribute` with `[XmlAttribute("n")] Name`.
**Evidence — S4S implementation:** `Data/IO/Tuning/Serialization/TunableBaseAttribute.cs:10-11`.
**Observed behavior:** Used when serializing tuning models to XML.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### Combined tuning context
**Claim:** `CombinedTuning` builds a `TuningContext` over the extracted game
tuning tree: it loads every file listed in the game file table's tuning
metadata under `Sims4FileTable.TuningRoot`, tags each document root with an
`s4studiogroup` attribute derived from the hex prefix of the filename before
'!', and indexes instances by `(s, i)` plus cross-references by the `x`
attribute.
**Evidence — S4S implementation:** `Data/IO/Tuning/CombinedTuning.cs:25-58`.
**Observed behavior:** Enables whole-game tuning navigation outside packages.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md documents
0x62E94D38 combined tuning existing since patch 1.13; the s4studiogroup
convention is S4S-specific.
**Unknowns:** none flagged.

## Part H — SimData (DATA)

### SimData identity and header
**Claim:** SimData has type ID 1415235194, magic bytes "DATA", version u32
with max verified 257 (new files written at 257); after magic+version come
data-section size i32, table count i32, schema-section size i32, schema count
i32, then PackID u32 only when version ≥ 257, then padding to 16-byte
alignment.
**Evidence — S4S implementation:** `Data/IO/Tuning/SimDataResource.cs:20`;
`Data/IO/Tuning/SimDataBase.cs:193,415-439` (`CheckVersion(257)` at :423).
**Observed behavior:** Read path enforces the structure strictly.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes for type ID (0x545AC67A in
resource-types.md, four sources); header layout undocumented publicly.
**Unknowns:** versions between the supported floor and 257.

### SimData tables and schemas
**Claim:** Table entries are: name-offset i32 (relative), name hash u32
(FNV32), schema offset i32 (relative to the offset field position),
SimDataType u32, row size u32, row offset i32, row count u32. Schemas are:
name (rel-offset string), nameHash u32, schemaHash u32 (the Maxis schema
hash), schemaSize u32, column offset i32 (relative), column count u32.
Columns are: name (rel string), nameHash u32, dataType u16, flags u16,
offsetInRow u32, nested-schema rel-offset i32 (RELOFFSET_NULL = int.MinValue
if none).
**Evidence — S4S implementation:** `Data/IO/Tuning/TableInfo.cs`;
`Schema.cs`; `SchemaColumn.cs` (read logic in
`SimDataBase.Read`, `SimDataBase.cs:440-495`).
**Observed behavior:** All offsets in SimData are self-relative signed 32-bit
(`ReadOffset`, `SimDataBase.cs:231-240`; strings likewise :357-371); strings
are NUL-terminated UTF-8 pooled at the end of the file.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented publicly at this detail.
**Unknowns:** semantic meaning of column `flags`.

### SimData type sizes and alignments
**Claim:** Sizes/alignments by SimDataType (enum values = declaration-order
index):

| SimDataType (order matters) | Size | Align |
|---|---|---|
| Boolean/Char/SByte/Byte (0-3) | 1 | 1 |
| Int16/UInt16 (4-5) | 2 | 2 |
| Int32/UInt32/String/Object (6-9 except noted) | 4 | 4 |
| Int64/UInt64/HashedString/Vector | 8 | 8 |
| Single | 4 | 4 |
| Float2/Float3/Float4 | 8/12/16 | 4 |
| TableSetReference | 8 | 8 |
| ResourceKey | 16 (TGIR: u64 inst + u32 type + u32 group) | 8 |
| LocalizationKey | 4 (u32 STBL key) | 4 |
| Variant | 8 (rel offset + variant hash u32) | 4 |

**Evidence — S4S implementation:** `Data/IO/Tuning/SimDataType.cs`;
size/alignment functions at `SimDataBase.cs:201-283`
(`GetSizeForType`, `GetAlignmentForType`).
**Observed behavior:** Drives row layout and nested-schema offsets.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### SimData round-trip through canonical XML
**Claim:** Read converts binary to canonical
`<SimData version="…" u="0x…"><Instances><I name schema type>` /
`<Schemas><Schema name schema_hash><Columns><Column name type flags>` XML;
Write regenerates binary from that XML, reordering rows without schemas last
and emitting columns ordered by name hash; schema hashes are preserved
verbatim from `schema_hash` attributes (parse trims leading "0x").
**Evidence — S4S implementation:** `Data/IO/Tuning/SimDataResource.cs:64-249`
(Write), `:529` (GenerateSchemas).
**Observed behavior:** Round-trip is lossless modulo the documented
reordering.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented (canonical XML form is
S4S-specific).
**Unknowns:** whether reordering can break external consumers.

### SimDataPackedXmlResource
**Claim:** SimDataPackedXmlResource is the same binary format rendered in a
packed XML form, emitting explicit `offset` attributes when writing
(`WriteOffsets => true`).
**Evidence — S4S implementation:** `Data/IO/Tuning/SimDataPackedXmlResource.cs:26`.
**Observed behavior:** Used for Jazz/state-machine style resources (see
animation doc §AnimationStateMachine).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

## Part I — SchemaHashMap.json

### SchemaHashMap gates exported SimData schemas
**Claim:** An embedded JSON resource maps schema class name → schema hash
string; during "export client binary" (GameplayData/SimData export) a
`<Schema>` element is emitted for each exporting element class but the
schema_hash (and thus the schema itself) is included only if the class
appears in SchemaHashMap.
**Evidence — S4S implementation:** embed declared in `S4Studio.csproj:325,168`;
load at `TuningEditor/Models/Document/Elements/SchemaHashMap.cs:16` via
`Res.GetString("S4Studio.Resources.Tuning.SchemaHashMap.json")`; consumer
`ElementModel.EmitClientBinarySchema` at `ElementModel.cs:899-913`.
**Observed behavior:** Generated by the internal command
`ListSimdataSchemaHashCommand` (`Shared/Common/ListSimdataSchemaHashCommand.cs`),
which scans all loaded SimDataResources, groups distinct
`Schema/@name → @schema_hash` pairs, and dumps JSON named exactly
`SchemaHashMap.json`.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** coverage/staleness of the shipped map vs current game data.

## Part J — TDESC description files & repositories

### TDESC file shape and discovery
**Claim:** `.tdesc` files are plain XML shaped like game tuning descriptions:
a `<TuningRoot>` containing `<Instance instance_type="…" class="…" module="…"
path="…">` with `<Tunable/>`, `<TunableList/>`, etc. children. Discovery
enumerates subdirectories and `*.zip` files under
`AppGlobals.StudioTuningDescriptions` sorted newest-version-first by a
dotted-numeric-aware comparer; the selected source persists in settings
(`TuningPreferences.SelectedTDesc`).
**Evidence — S4S implementation:** `TuningEditor/Data/TDescSource.cs:14-55,95-117`;
verified example installed app file
`Resources/Tuning/Descriptions/CCRecipeInstance.tdesc`
(instance_type="snippet", class="CCRecipeInstance"; encoding iso-8859-1).
The installed v3.2.6.4 Star app folder currently holds two custom CC
descriptions (`CCPaintingTextureInstance.tdesc`, `CCRecipeInstance.tdesc`);
stock per-class descriptions ship inside the app's own resources/zips.
**Observed behavior:** Loading: `TDescRepository.Create(path)` returns
`TDescRepositoryZip` for `.zip` sources or `TDescRepositoryFile` otherwise;
the file repository globs `*.tdesc*` recursively; class names come from
filename minus extension with `-` replaced by `.`; documents cached as
XDocuments.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** full attribute vocabulary of each tdesc element type
(`tuning_state`, `class_restrictions`, `default`, …) observable in example
files but no schema/validation code traced; `TDescRepositoryZip` internal
entry-naming conventions beyond shared `GetName` unverified.

### Instance type resolution drives new-tuning type IDs
**Claim:** `GetInstanceType(n)` streams the file until the first non-
`TuningRoot` element and returns its `instance_type` attribute — this is how
S4S decides which resource type id (via the §G registry) a new tuning gets.
**Evidence — S4S implementation:** `TuningEditor/Data/TDescRepository.cs:56-73`
(+ `GetName` :51-54).
**Observed behavior:** Chain: tdesc instance_type → registry name → resource
Type ID (or FNV32 fallback).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

## Part K — Tuning editor model & STBL interplay

### Editor repositories bridge tdesc ↔ package content
**Claim:** `TuningEditor/Data/` hosts DefinitionRepository /
CASPartRepository / EnumRepository (resolve references for pickers),
TuningReferenceRepository + TunableReferenceItem (index which tunings are
referenced where), and StringTableRepository (unions the open package's
ENG_US string tables with the global game cache, resolving keys via
`AppModel.Instance.GlobalStringTable.GetValue(key)`); catalog/display names
elsewhere use `StringTableCache.Default.GetValue(...)`.
**Evidence — S4S implementation:** `TuningEditor/Data/StringTableRepository.cs:9-61`;
repository files in `TuningEditor/Data/`.
**Observed behavior:** `TuningEditorModel` orchestrates
add/extract/delete/rename/duplicate against the open package
(`TuningEditorModel.cs:35-150`); `Models/Document/Elements/` holds one
view-model per tdesc construct (InstanceElementModel, ModuleElementModel,
ClassElementModel, TunableTupleElementModel, TunableVariantElementModel
(+TypeModel), TunableListElementModel, TunableEnumElementModel,
TunableBooleanModel, TunableLocalizedStringModel,
TunableColorRGBAElementModel, TunableSlotTypeModel, TunableReferenceModel,
OptionalTunableElementModel, plus picker models for resource key, definition,
CAS part, image, string) — all deriving from `ElementModel` handling change
tracking and client-binary emission. UI classes: `PackageTuningEditor`,
`TuningEditorControl`, `TuningEditorWindow`.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented (editor architecture).
**Unknowns:** per-element `EmitClientBinaryData()` implementations (how each
tunable maps into exported GameplayData rows beyond schema gating) were not
traced.

### Tuning stores hashes; STBL supplies text
**Claim:** Tuning XML stores only hashed keys (0x… LocalizationKey in
SimData; STBL ids in tunables); friendly text always comes from StringTable
resources — package-local ENG_US tables plus the game's global table cache.
**Evidence — S4S implementation:** `TuningEditor/Data/StringTableRepository.cs`.
**Observed behavior:** See `references/stbl.md` for the STBL format itself.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (consistent with stbl.md's role
description).
**Unknowns:** none.
