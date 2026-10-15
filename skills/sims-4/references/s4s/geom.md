# GEOM / Mesh Formats — claim-based reference

Conversion of `../s4s-geom-mesh.md`. All evidence from the decompiled S4S
source at `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` (paths relative to
`S4Studio/`). Public-reference doc consulted: `references/resource-types.md`
(type IDs). Two distinct mesh systems exist in the code:

| | CAS body/sim mesh | Object (Buy/Build) model |
|---|---|---|
| Root resource class | `GeometryResource` (`Data/IO/CAS/GeometryResource.cs`) | `Model` (`Data/IO/BuyBuild/Geometry/Model.cs`) |
| Tag | `GEOM` | `MODL` |
| Type ID | 0x015A1849 = 22681673 | 0x01661233 = 23466547 |
| Sub-block tags | none (single stream) | `MLOD`, `VRTF`, `VBUF`, `IBUF`, embedded blocks |
| Version checked | 14 ("Pets patch"), 15 ("Nature patch"), current = 15 | MODL 768, MLOD 518 |

---

## CAS GEOM

### GEOM tag handling and versions
**Claim:** GeometryResource (type 0x015A1849, class `GeometryResource :
LinkedResource`) carries the FourCC tag "GEOM", validates tags via
LinkedResource.ReadTag/WriteTag which read exactly tag-length ASCII bytes and
throw `InvalidDataException` on mismatch, defines kPetsPatch=14 /
kNaturePatch=15 / Current=15, and defaults new resources to version 15.
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs:21-30,300,401`;
`Data/IO/Core/LinkedResource.cs:58-72`.
**Observed behavior:** Read path calls `CheckVersion(15u)`.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md confirms 0x015A1849
GEOM as "RCOL GEOM chunk"; version semantics undocumented publicly.
**Unknowns:** whether EA ever wrote versions > 15.

### GEOM on-disk field order
**Claim:** After the tag, fields follow this order (little-endian): version
u32 (checked = 15); ResourceKeyList header (BeginRead reads u32 offset-to-TGI-
table + u32 length; keys stored as T,G,I triples at that offset); shader u32
(cast to ShaderType); conditional material block (only if Shader ≠ None:
u32 byte-length then MaterialBlock payload — round-tripped, with a log if
length/padding is off); merge group u32; sort order u32; vertex count u32;
vertex format; vertices (stride×count); an ignored u32 (index-buffer-related;
writer emits constant 1); a byte that must equal 2 else InvalidDataException;
index count u32 + n×uint16 indices (always 16-bit for GEOM); UV stitch count +
entries; vertex stitch count + entries (v≥13 only); slot ray intersection
count + entries; bone list (u32 count + n×uint32 bone hashes — pre-v15 the
count was implicit from distance to the TGI table `(keyListOffset - pos)/4`,
mismatch logged); geometry states (v≥15: u32 count, per state State u32,
StartIndex i32, MinVertexIndex i32, VertexCount i32, PrimitiveCount i32);
finally TGI key data consumed by EndRead.
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs:430-598`
(`ReadData`); list params at `Data/IO/Core/ResourceKeyList.cs:74-120`;
ShaderType at `Data/IO/Material/ShaderType.cs:3`.
**Observed behavior:** Every vertex must consume exactly
`VertexFormat.Stride` bytes or `InvalidDataException("Invalid vertex stride")`
is thrown (:520-523).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented at byte level.
**Unknowns:** the ignored u32 before the primitive-type byte; whether the
byte=2 record is truly a "triangle list" primitive type (S4S's interpretation,
not verified against EA code).

### Vertex format declarations
**Claim:** The vertex format is int32 declaration count followed by
per-declaration records of uint32 usage, uint32 format, byte size-in-bytes;
VertexFormat.Stride is the sum of declaration sizes; element counts derive
from Size / BytesPerElement.
**Evidence — S4S implementation:** `Data/IO/CAS/Geometry/VertexFormat.cs:34,41-51`;
`Data/IO/CAS/Geometry/VertexDeclaration.cs:125-168`.
**Observed behavior:** Usage enum (VertexElementUsage.cs:3-13):
1 Position, 2 Normal, 3 UV, 4 BlendIndex, 5 BlendWeight, 6 Tangent, 7 Color,
10 Index. Format enum (VertexElementFormat.cs:3-9): 1 Float (4 bytes/elem),
2 Byte (1), 3 ARGB (1), 4 Uint (4).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** usage value gaps (0, 8, 9 unused).

### Value decoding in CAS GEOM has no normalization
**Claim:** Values decode to float as: Float→float, Byte/ARGB→raw byte widened
to int (**no /255 normalization**), Uint→uint widened; vertices are decoded
strictly in stored declaration order and mapped to Position/Normal/UV(list)/
BlendIndex/BlendWeight/Tangent/Color(list)/Index fields.
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs:476-519`;
`Data/IO/CAS/Geometry/VertexDeclaration.cs:141-168`.
**Observed behavior:** Declaration order in the file is authoritative.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### S4S canonical write order for fresh formats
**Claim:** When constructing a fresh format from a `Vertex`, S4S writes
declarations in the order: Position(F,12), Normal(F,12), UV…(F,8 each),
Color(ARGB,4), BlendIndex(Byte,4), BlendWeight(Byte,4), Tangent(F,12).
**Evidence — S4S implementation:** `VertexFormat.FromVertex`,
`Data/IO/CAS/Geometry/VertexFormat.cs:62-132`.
**Observed behavior:** Index (usage 10) is never produced by S4S writers; its
purpose is not yet verified.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** purpose of usage-10 Index elements in real files.

### CAS GEOM stores full Float32 positions/normals/UVs
**Claim:** CAS GEOM vertex data uses no half-floats anywhere; Float16 appears
only in BGEO blend geometry and helper IO (`ReadFloat16` at
`Data/IO/Util/BinaryStreamWrapper.cs:93`; vector helper
`DeserializeVector3_16F` at `Data/IO/Core/Geometry/Sims4GeometryIOExt.cs:40-48`).
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs` decode
paths; `Data/IO/CAS/BlendGeometryResource.cs:110,186-188`.
**Observed behavior:** Contrast with object meshes, which are heavily
quantized (below).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### CAS vertex color semantics: channel 4 is BodyType
**Claim:** Color is ARGB, 4 bytes, where the 4th channel is a `BodyType`
value, not alpha (see `VertexColorSummary` formatting
`(BodyType)(byte)x[3]`); RGB channels are tint/makeup weights.
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs:308-315`;
shared container `Data/IO/Core/Geometry/Vertex.cs:6-27`.
**Observed behavior:** `ProcessVertices(byte body_type)` rewrites color[3] to
the outfit's body type and normalizes a legacy all-white marker
(R+G+B ≥ 765 → 0,127,0) (:696-758); a legacy scale fix divides stale R values
(>63 with G=255,B=0) by 85/21 in `UpdateVertexPaint` (:913-937).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** full historical semantics of the legacy markers.

### CAS blend weights are raw bytes normalized to 255
**Claim:** BlendWeights are stored raw 0–255 (Byte format) with an expected
sum of 255; ProcessVertices normalizes to floor(w/sum*255), dumps the
remainder onto the max weight, and gives zero-weight vertices weights [255,…]
(bound to first bone).
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs:722-757`.
**Observed behavior:** BlendIndices are byte indices into the GEOM's Bones
array.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** relationship of the bone-hash list to rig bones beyond this
usage ("standard", not further verified).

### No barycentric element exists in CAS GEOM
**Claim:** There is no barycentric vertex element in CAS GEOM; tangents are
plain Float3. (The tangent slot's 4th component serves as sign in object
meshes.)
**Evidence — S4S implementation:** `Data/IO/CAS/Geometry/VertexElementUsage.cs`;
decode paths in `Data/IO/CAS/GeometryResource.cs`.
**Observed behavior:** Format allows arbitrary Size, so a 4th tangent float
is theoretically possible in real files — unverified whether any exist.
**Confidence:** Implementation-verified (absence in code); Hypothesis (real
files never carry it).
**Public-reference agreement:** None documented.
**Unknowns:** whether real files ever carry a 4th tangent float.

### UV stitching data
**Claim:** UVStitchData serializes as uint32 vertex index + int32 count +
pairs of float32 (the set of alternate absolute UVs shared by co-located
vertices); S4S regenerates stitches by grouping vertices by rounded position
and collecting abs(UV) of the last UV set.
**Evidence — S4S implementation:** `Data/IO/CAS/Geometry/UVStitchData.cs:58-87`;
`Data/IO/CAS/GeometryResource.Stitch` at `GeometryResource.cs:760-790`.
**Observed behavior:** CAS-only section after the index buffer.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### Vertex stitching (v≥13)
**Claim:** VertexStitchData (present when Version ≥ 13) serializes as uint32
Index + uint16 VertID.
**Evidence — S4S implementation:** `Data/IO/CAS/Geometry/VertexStitchData.cs:52-64`;
gate at `Data/IO/CAS/GeometryResource.cs:545-555`.
**Observed behavior:** CAS-only.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** exact stitching algorithm used by the game.

### Slot ray intersections change identity scheme at v14
**Claim:** Each slot-ray entry serializes per the table below; version ≥ 14
("post Pets patch") switches both slot and pivot identification from indices
to FNV32 name hashes.

| v<14 | v≥14 | Field |
|---|---|---|
| u32 SlotIndex | u32 SlotHash | slot bone (index into aurig vs hash) |
| 3×u16 | 3×u16 | triangle Indices |
| f32 ×2 | same | barycentric B1, B2 |
| f32 | same | Distance |
| 3×f32 | same | OffsetFromIntersectionOs |
| 3×f32 | same | SlotAveragePosOs |
| 4×f32 | same | TransformToLs quaternion |
| u8 PivotBoneIdx | u32 PivotBoneHash | pivot bone |

**Evidence — S4S implementation:** `Data/IO/CAS/Geometry/SlotRayIntersectData.cs:290-312,331-377,436-439`.
**Observed behavior:** CAS-only section.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### Geostates share the object record type
**Claim:** CAS GEOM v≥15 stores geometry states inline at the end using the
same 20-byte record as objects (State, StartIndex, MinVertexIndex,
VertexCount, PrimitiveCount — shared class `Data/IO/BuyBuild/Geometry/
GeometryState.cs:118-126`); `GetGeostate(stateId)` slices indices
Skip(StartIndex).Take(PrimitiveCount*3) over the single shared vertex list.
**Evidence — S4S implementation:** `Data/IO/CAS/GeometryResource.cs:584-595,411-428`.
**Observed behavior:** One vertex/index buffer per file, sliced per state.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

---

## Object / Buy-Build model (MODL/MLOD)

### MODL container layout
**Claim:** Model (tag MODL, type 23466547, version 768 checked) is laid out:
tag, u32 version, i32 LOD count, BoundingBox, i32 extra-bounds count + boxes,
u32 FadeType, f32 CustomFadeDistance, u32 U4, u32 U5, then LOD entries each
holding a block-index reference to an MLOD, u32 flags (ModelLODFlags
None/Portal/Door), u32 ObjectLODID, f32 MinZ, f32 MaxZ.
**Evidence — S4S implementation:** `Data/IO/BuyBuild/Geometry/Model.cs:140,240-301,280`;
`ModelLODEntry.cs:132-150`; `ModelLODFlags.cs`; `ObjectLODID.cs`.
**Observed behavior:** ObjectLODID spans LOD 0–3 plus shadow LODs 65536–65539.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md confirms 0x01661233
MODL as object-model container; byte layout undocumented publicly.
**Unknowns:** U4, U5.

### MLOD holds self-prefixed mesh blocks
**Claim:** ModelLOD (tag MLOD, type 30478132, version 518 checked) is: tag,
u32 version, i32 mesh count, then that many ModelMesh blocks whose sizes are
self-prefixed per mesh; all sub-resources embed via a reference list
(LinkedResourceSerializer / IReferenceList) unlike CAS GEOM's flat stream +
external-style TGI list.
**Evidence — S4S implementation:** `Data/IO/BuyBuild/Geometry/ModelLOD.cs:46,116`;
`ModelMesh.cs:594-596,706-709`.
**Observed behavior:** N meshes per MLOD, N LODs per MODL.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md lists 0x01D10F34
MLOD (= 30478132 decimal? note: 30478132 = 0x01D10F34 ✓); layout undocumented
publicly.
**Unknowns:** none flagged.

### ModelMesh record fields
**Claim:** After a u32 total-size prefix, ModelMesh contains: Name u32 (mesh-
name hash); Material i32 block idx (MaterialDefinition or MaterialSet);
VertexFormat i32 block idx (VRTF); VertexBuffer i32 block idx (VBUF or shadow
variant); IndexBuffer i32 block idx (IBUF or shadow variant); u32 packing low
byte ModelPrimitiveType + upper 24 bits MeshFlags.Value; StreamOffset u32
(byte offset of this mesh's vertices inside VBUF); StartVertex, StartIndex,
MinVertexIndex, VertexCount, PrimitiveCount (5×i32 slicing info); Bounds
(BoundingBox); SkinController i32 block idx; bone count + n×u32 per-mesh
bone-hash list (ModelBoneReference); ScaleOffsets i32 block idx (holds
PosScale/UvScale shader fields); geometry states (i32 + n×20B, same record as
CAS); ParentNameHash u32; MirrorPlaneNormal 3×f32; MirrorPlaneOffset f32;
SortOrderHint u32; and if v≥518 && Flags.ExtraBoundingBox && Bones>0, n ×
BoundingBox per-bone bounds (flag bit 0x4000 detected heuristically for older
versions).
**Evidence — S4S implementation:** `Data/IO/BuyBuild/Geometry/ModelMesh.cs:591-660`
(+ :601-603,673-675 flag packing; :529,533-550 scale offsets; :632-655,699-705
extra-bounds heuristic).
**Observed behavior:** Known mesh flag names (`MeshFlags.cs:6-40`):
BasinInterior=0x1, HDExteriorLit=0x2, PortalSide=0x4, DropShadow=0x8,
ShadowCaster=0x10, Foundation=0x20, Pickable=0x40, ExtraBoundingBox=0x4000;
remaining bits unnamed.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** unnamed mesh-flag bits; heuristic nature of the 0x4000
detection for pre-518 files.

### VRTF object vertex format
**Claim:** VRTF (tag VRTF, type 30467875) is: tag, u32 version (=2 when
written), i32 stride, i32 declaration count, u32 IsExtendedFormat, then per
declaration 4×u8 (Usage, UsageIndex, Format, Offset) in normal mode or 4×u32
of the same fields in extended mode.
**Evidence — S4S implementation:** `Data/IO/BuyBuild/Geometry/ModelVertexFormat.cs:111-228`.
**Observed behavior:** Usage enum starts at 0 (`ModelVertexElementUsage.cs`:
Position=0 … Color=6); format enum (`ModelVertexElementFormat.cs:3-22`)
includes packed types absent from CAS: UByte4, ColorUByte4, Short2/Short4,
UByte4N, Short2N/Short4N, UShort2N/UShort4N, Dec3N, UDec3N, Float16_2,
Float16_4.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** Float16_2/Float16_4 support — enum members exist but no decoder
branch handles them; reading such a format throws NotImplementedException.

### Shader-driven default object vertex formats
**Claim:** DefaultForMesh provides per-shader canonical layouts: Decal =
Position Float3, Normal Float3, UV Float2, BlendIndex UByte4, BlendWeight
UByte4N, Tangent Float3; ShadowDecal/FootprintDecal = Position Float3, Color
Float3, UV Float2; SunShadow = Position Short4; Dropshadow = Position
UShort4N, UV Short4.
**Evidence — S4S implementation:** `DefaultForMesh`,
`Data/IO/BuyBuild/Geometry/ModelVertexFormat.cs:113-159,298-317`.
**Observed behavior:** Used when constructing formats without reading one.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### VBUF decoding rules
**Claim:** VBUF (tag VBUF, type 30467835) header is tag, u32 version, u32
unknown (must be 0), i32 SwizzleInfo block ref, then raw bytes to end of
resource; vertices start at mesh.StreamOffset (or StreamOffset +
geostate.MinVertexIndex*Stride for a geostate); decoding per declaration:
plain Float/2/3/4 floats; UV+Short2 = int16 × uv_scale (per-channel scales
from material UVScales, default 3.051851E-05 ≈ 1/32768); UV+Short4/UShort4N =
four int16 → [u*scale0, v*scale1, w/511] (third pair member is a second UV
set packed in; 4th short dropped after use as w source scaled by 1/511);
UByte4/UByte4N → BlendIndex raw bytes, BlendWeight/Color byte/255,
Normal/Tangent 3 reversed bytes mapped (b+1)/128 − 1 with b==0 → −1, and 4th
byte as tangent-sign/flag (1 → w=−1, 128 → z=0, otherwise w=+1); Position +
Short4 (SunShadow etc.) = three int16 divided by a trailing u16 divisor
(default 2047 when zero; Water shader uses pos_scale instead), UShort4N
variant defaulting divisor 512.
**Evidence — S4S implementation:** `Data/IO/BuyBuild/Geometry/VertexBuffer.cs:80-121,176-383,508-538`;
scale sources `ModelMesh.cs:533-550`.
**Observed behavior:** Heavily quantized storage reconstructed via
material-provided scales/divisors.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** the must-be-0 VBUF header word; SwizzleInfo block internals.

### IBUF index encoding
**Claim:** IBUF (tag IBUF, type 30467855) header is tag, u32 version, u32
flags, u32 unknown; then indices to end of resource. Flags:
DifferencedIndices=1 (stored as running delta, accumulated on read),
Index32=2 (i32 vs i16 words), DisplayList=4. GetIndices slices
[StartIndex, StartIndex+PrimitiveCount*3) and subtracts MinVertexIndex (per
geostate when requested).
**Evidence — S4S implementation:** `Data/IO/BuyBuild/Geometry/IndexBuffer.cs:105-190`;
flags at `Data/IO/BuyBuild/Geometry/IndexBufferFlags.cs:9-14`.
**Observed behavior:** Object indices may be delta-encoded; CAS indices never
are.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** the third header word.

---

## CAS GEOM vs object MODL summary

| Aspect | CAS GEOM | Object MODL |
|---|---|---|
| Container | single flat stream + TGI list at end | nested linked blocks (MLOD/VRTF/VBUF/IBUF/material/skin) |
| Versions | 13/14/15 branches | MODL 768, MLOD 518, VRTF 2 |
| Vertex precision | everything Float32 (except Byte/ARGB slots) | heavily quantized (Short2/Short4/UByte4N/UShort4N…) with material-provided scale/divisor reconstruction; Float16 enums exist but undecoded |
| Indices | always uint16, plain | int16/int32, optionally delta-encoded (DifferencedIndices) |
| Multiple meshes | no — one vertex/index buffer per file | yes — N meshes per MLOD, N LODs per MODL |
| LODs | none in-file (LOD level carried by the external CASPart resource) | explicit ModelLODEntry list with ObjectLODID 0–3 + shadow LODs 65536–65539 |
| Skeleton binding | Bones hash list + per-vertex BlendIndex/BlendWeight | optional SkinController block + per-mesh bone-hash list |
| Extras | UV stitches, vertex stitches (v≥13), slot rays, inline geostates (v≥15) | mesh flags, extra/per-bone bounding boxes, mirror plane, sort-order hint, swizzle info, geostates |
| Color semantics | ARGB where A = BodyType; raw byte range 0–255 | Color elements decoded /255 normalized (UByte4N) or float (shadow decals) |

## Blender pipeline cross-reference

### Blender integration passes parameters through templates
**Claim:** `BlenderUtilities.cs` fills template placeholders (__GEOM__,
__STATE__, __BODY_TYPE__, __SHADER__, __RIG__, …) into geomimporter.py /
geomexporter.py and runs Blender headless; MLOD goes through
objectimporter.py/objectexporter.py with __STATIC_POS_SCALE__.
**Evidence — S4S implementation:** `Blender/BlenderUtilities.cs:384-428,496-534`;
template script
`/mnt/Sims-SSD-2/Documents-Sims/Sims4Studio_v3.2.6.4 (Star)/Blender/Scripts/Templates/geomimporter.py`.
**Observed behavior:** In geomimporter.py the shader string decides material
choice ('simskin' in shader.lower() selects skin material, lines 55/67);
geostate id and body type pass through to
load_geom(..., state_hash, body_type) (line 68); actual binary parsing lives
in the compiled s4studio python package (from s4studio.cas.geometry import
BodyGeometry), so byte-level facts must come from the C# side above.
**Confidence:** Implementation-verified (C# side); Community-observed
(python template text).
**Public-reference agreement:** None documented.
**Unknowns:** compiled python package internals.
