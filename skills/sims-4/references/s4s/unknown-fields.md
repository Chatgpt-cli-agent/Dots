# Unknown Fields Registry

Registry of notable unidentified fields encountered while converting the S4S
verification docs (`dbpf-verification.md`, `casp-simdata.md`, `geom.md`,
`textures-rle.md`, `animation-clips.md`). Names are **preserved exactly as
they appear in the decompiled source or community lore** — no semantics are
invented. Every hypothesis below is explicitly labeled as such and should be
treated as unverified until confirmed against game data or EA code.

**This file is meant to grow:** when new formats get mined or an unknown gets
identified, update its row here (status → identified) rather than deleting it.

| # | Name (as preserved) | Size / type | Where seen | Current hypotheses (HYPOTHESIS unless noted) |
|---|---|---|---|---|
| 1 | `IndexRecordPositionLow` | u32 (header 0x28) | DBPF header; read but never used for lookup by S4S | Short-form absolute index offset for >4 GB-era compat; real writers always leave 0 and use 0x40 |
| 2 | `Unused4` ("index version") | u32 (header 0x3C), default 3 | DBPF header | Index format/version selector; opaque in S4S, never validated |
| 3 | `CreationTime` / `UpdatedTime` | 2 × u32 (header 0x18/0x1C) | DBPF header | Timestamps never written by any observed writer; possibly DOS-time or unix epoch if ever set |
| 4 | `Committed` / s4pi `Unknown2` | u16 (index entry tail) | DBPF expanded index entries | Default 1, round-tripped, never interpreted; maybe a "record committed to delta" flag |
| 5 | *(unnamed)* trailing +4 | u32-equivalent slack | `DefragmentedSize = 96 + IndexSize + DataStreamSize + 4` in DBPFPackage | Legacy slack from an older writer layout; no corresponding writer exists in S4S |
| 6 | NameMap string encoding | Pascal32 bytes | DBPF NameMap resource | Community says UTF-8; S4S decodes ASCII. Game-written namemaps unresolved |
| 7 | `U1`, `U2` | 2 × uint32 (OccultBitField-typed) | CASP field 33, v≥46 (`CASPartResource.cs:1917-1919`) | Additional occult/species gating planes beyond HideForOccultFlags; Fairy/werewolf-era additions |
| 8 | `CASPartFlags2.UnknownFlag0x08` | bit 0x08 of byte | CASP PartFlags2, v≥39 | Unknown behavior flag |
| 9 | `CASPartFlags2.UnknownFlag0x20` | bit 0x20 of byte | CASP PartFlags2, v≥39 | Unknown behavior flag |
| 10 | `CASPartFlags2.UnknownFlag0x40` | bit 0x40 of byte | CASP PartFlags2, v≥39 | Unknown behavior flag |
| 11 | `CASPartFlags2` bit 0x80 ("Layerable") | bit 0x80 of byte | CASP PartFlags2, v≥39; drives v50 auto-bump with LayerID | S4S property name "Layerable" may not match game semantics |
| 12 | AgeGenderFlags bits `0x100–0xFFF` | 12 bits of uint32 | CASP AgeGender field | Reserved/unnamed in code; possibly per-pack age extensions or historical flags |
| 13 | SimRegion value `7` | enum slot | SimRegion enum (JAW=5, FOREHEAD=6, BROWS=8) | Unnamed region slot between FOREHEAD and BROWS |
| 14 | `CASPartLod.Unused` | uint32 | Per-CASP-LOD record after Level | Possibly legacy LOD threshold distance |
| 15 | BGEO two skipped u32s | 2 × uint32 | BlendGeometryResource.ReadData step 4 | Read and discarded; possibly blend-nominal counts or padding |
| 16 | Float16 raw `0` → NaN | ushort encoding | BGEO vector components (`v*8000 ^ 0x8000` scheme) | Zero may be a deliberate NaN sentinel for "no delta" |
| 17 | *(ignored)* pre-primitive u32 | uint32 | CAS GEOM between vertices and the must-be-2 byte; writer emits constant 1 | Index-buffer-related value per comment; possibly index-format/version marker |
| 18 | Primitive-type byte (=2) | byte | CAS GEOM after the ignored u32 | S4S interprets as "triangle list"; not verified against EA code |
| 19 | VertexElementUsage `Index` (value 10) | declaration slot | CAS GEOM vertex formats; mapped but never produced by S4S writers | Purpose unknown; possibly software-skinning helper index |
| 20 | `Model.U4`, `Model.U5` | 2 × uint32 | Object MODL header after CustomFadeDistance | Unknown; possibly fade-related flags |
| 21 | unnamed `MeshFlags` bits | bits beyond 0x1–0x40, 0x4000 | ModelMesh flags word (upper 24 bits of PrimitiveType\|Flags<<8) | Remaining mesh-flag bits unnamed in code |
| 22 | VBUF must-be-zero word | uint32 | VBUF header after version | Validation placeholder; meaning unknown |
| 23 | VBUF `SwizzleInfo` block ref | i32 block index | VBUF header | Swizzle/shuffle metadata for vertex streams; internals untraced |
| 24 | IBUF third header word | uint32 | IBUF header (after version + flags) | Unknown alongside DisplayList flag semantics |
| 25 | `Float16_2`, `Float16_4` formats | enum members | ModelVertexElementFormat (object meshes) | Enum exists, no decoder branch — reading throws NotImplementedException; packing presumably standard 16-bit floats but unverified |
| 26 | TGA/DST type-ID collision | shared ID 796721158 | Sims4Image registration (`DSTImageResource.TuningType2` == TGA type) | Resolution order when both wrappers registered is unverified |
| 27 | RLES/RLE2 mip-header offset names | 5–6 × int32 per mip | Texture mip tables (`CommandOffset, Offset2, Offset3, Offset0, Offset1[, Offset4]`) | Stream-role naming inferred from usage, not from authoritative docs |
| 28 | DST swizzle permutation | data reorder | DSTImageResource/DSTUtility | Byte-reordering algorithm present but not traced line-by-line |
| 29 | Thumbnail resource layouts | various | CASPartThumbnail, SimOutfitThumbnail, ThumbnailCache*, etc. | Entire layouts unmined |
| 30 | RLE-family endianness | container-level | ConvertDDS accepts swapped magics | Which endian Maxis actually writes is unobserved |
| 31 | RIG bone `Flags` default `0x913C` (37180) | uint32 | Per-bone record | Individual bits' meanings unknown; default constant only |
| 32 | RIG v4+ fields (`RigName`, `InfoNodes[11]`, `SlotInfo`) | conditional | RigResource ≥ major 4; IKChain gated Major≥4 on read vs Minor≥4 on write | Gating condition inconsistent in source; v4+ semantics unverified against game data |
| 33 | CLIP envelope `Flags` | uint32 | ClipResource envelope | Bit meanings unknown |
| 34 | Clip inner `Padding` | uint16 | Embedded Clip blob header after TickCount | Unknown; preserved verbatim on copy to ClipHeader |
| 35 | Channel frame data (all `ChannelType` variants) | opaque byte[] per channel | Embedded Clip blob | **The big one:** per-sample bit layout / quantization / interpolation never decoded in S4S. Smallest-three quaternion packing suspected for types 17–21 (hypothesis only) |
| 36 | Event `Header1`, `Header2` | 2 × uint32 | Every CLIP event payload prefix | Unknown; possibly event GUID halves or priority/category words |
| 37 | EffectEvent `U1` | ulong | EffectEvent payload between BoneNameHash and ActorNameHash2 | Unknown 64-bit value |
| 38 | VisibilityEvent `U1`; ParentEvent `U1..U4`; SnapEvent `U1`; StopEffectEvent `U1`,`U2`; etc. | assorted uints | All implemented event classes (see animation-clips.md §event fields table) | Placeholder-named fields throughout the event system |
| 39 | TrackMask `U1`, `F1` | uint32 / float32 | TrackMaskResource header before mask grid | Possibly mask-default value and normalization factor |
| 40 | TimelineEvents payload uints (`U1..U7` etc.) | assorted | All `*EventData` classes | Nearly all payload words semantically unidentified |
| 41 | `Floats[19]` fixed array | 19 × float32 | OverrideReferenceMotionFrameRangeData | Fixed-size motion-range window; semantics unmapped |
| 42 | AnimationBoundaryConditionCache / AnimationConstraintCache payloads | entire resources | Types 0x1C99B344 / 0xE2249422 | No Read/Write implemented at all — fully opaque |
| 43 | JAZZ (AnimationStateMachine) schema | SimData schema | Type 0x02D5DF13 parsed as packed SimData | Internal schema contents unmined (usable via generic SimData reader) |
| 44 | `TuningDependenciesCache` pickle payload | pickled Python blobs | Type 879540542, names `td_pickle_cache[_py_unopt]_<pack>` | Python pickle structure unmined |
| 45 | SimData column `flags` | uint16 | SchemaColumn records in DATA resources | Flag semantics unknown (nullable? deprecated? client-only?) |
| 46 | Per-element `EmitClientBinaryData()` mappings | n/a | TuningEditor ElementModel export path | How each tunable maps into exported GameplayData rows beyond SchemaHashMap gating was not traced |

## Identified since conversion

*(empty — seed list; move rows here once verified)*
