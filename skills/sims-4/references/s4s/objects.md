# Sims 4 — Objects-in-Lots / Packages (S4S implementation layer)

Derived from decompiled Sims 4 Studio source at `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` (read-only).
Claim format: **Claim / Evidence / Observed behavior / Confidence / Public-reference agreement / Unknowns**.

---

### World object container: WorldDataResource ("OMGS")
**Claim:** Placed-object data for a world lives in a `WorldDataResource` whose payload begins with the magic `"OMGS"` followed by a size-prefixed block containing one or more `ObjectManager` records read back-to-back until end-of-stream.
**Evidence — S4S implementation:** `S4Studio/Data/IO/WorldDataResource.cs`
**Observed behavior:** Read: verifies 4-char magic "OMGS", reads uint32 size, then loops `ObjectManager.Read(stream)` until stream end. Write: writes "OMGS" + a relative `StreamPtr` size patch, then each manager. Type ID `2164920365` (`0x810A102D`). Named via `ResourceNameCache.Default.Set(WorldDataResource.Type, FNV.Hash64(worldFileName), ...)` in `Shared/AppModel.cs:317` — i.e. one resource instance per world package name.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial (community docs describe an "objects" world resource; exact type hex rarely published)
**Unknowns:** none at container level.

---

### ObjectManager chunk loop ("OMGR", not "OBJ ")
**Claim:** Each `ObjectManager` record starts with magic `"OMGR"` + uint32 byte-size, then loops size-prefixed 4-char-tagged sub-records dispatched through `ObjectManagerData.Create(tag)` until the block end — `"OBJ "` is the tag of *one sub-record kind* (the per-object list), not the wrapper.
**Evidence — S4S implementation:** `S4Studio/Data/IO/ObjectManager.cs`, `ObjectManagerData.cs`, `ObjectManagerObjectData.cs`, `ObjectManagerLotData.cs`, `ObjectManagerDataID.cs`, `ObjectManagerSnowData.cs`
**Observed behavior:** Sub-record framing on both read and write: `[tag:4 chars][int32 length][payload bytes]`; payload parsed in an isolated MemoryStream. Known `ObjectManagerData` tags:
| Tag | Class | Payload |
|---|---|---|
| `"ID  "` | ObjectManagerDataID | uint64 ObjectManagerID |
| `"LOT "` | ObjectManagerLotData | list of tagged `LotData` records (same tag+len framing) |
| `"OBJ "` | ObjectManagerObjectData | list of tagged `ObjectData` records (same framing) |
`ToString()` skips `ObjectManagerDataID` entries and groups the rest by class name+count — diagnostic only.
Note: `ObjectManagerSnowData` (tag `"SNOW"`, single byte CanHaveSnow) inherits from `ObjectData`, not `ObjectManagerData`, so it registers in the *object-record* typemap, not the manager-record typemap — likely a decompiler-visible quirk worth flagging.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** any `ObjectManagerData` tag outside {ID, LOT} throws in `Create()` (unknown tags are unrecoverable in this build).

---

### Per-object tagged records (ObjectData scheme)
**Claim:** Every object inside an `"OBJ "` chunk is itself a tag-length-prefixed record dispatched by string tag via the reflection-built `ObjectData.TypeMap`; S4S models these fields:
**Evidence — S4S implementation:** `S4Studio/Data/IO/ObjectData.cs` + `ObjectData*.cs` siblings
**Observed behavior / field table:**

| Tag | Field | Type | Notes |
|---|---|---|---|
| `"ID  "` | ObjectID | ulong | `ObjectDataID.cs` |
| `"DGUD"` | ObjectDefinitionGUID64 | ulong | links to OBJD instance; display name resolved via `ResourceNameCache.Default.GetObject(guid)` (`ObjectDataDefinition64.cs`) |
| `"DEFG"` | ObjectDefinitionGUID32 | uint | legacy 32-bit variant (`ObjectDataDefinition32.cs`) |
| `"POS "` | Position | Vector3 | `DeserializeVector3` (`BinaryStreamWrapper`) |
| `"ROT "` | Rotation | Quaternion | `DeserializeQuaternion` |
| `"LEVL"` | Level | int | floor level |
| `"MODL"` | Model | ResourceKey (TGI) | read/written as ITG block |
| `"PTID"` | ParentID | ulong | parent object id (e.g. slot parenting) |
| `"SCAL"` | Scale | float | |
| `"SCRP"` | ScriptName | string | |
| `"SLOT"` | SlotHash | uint | |
| `"MLOD"` | MinSpecLOD | byte | |
| `"TRES"` | — | (empty) | zero-payload record; pure marker (`ObjectDataTRES.cs`) |
| `"OPRP"` | U1 | uint | opaque; printed as hex only (`OPRP.cs`) |
| `"SNOW"` | CanHaveSnow | byte | see note above |

Unknown tags throw (`ObjectData.Create`), so this build cannot round-trip unseen tags.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes for common tags (ID/DGUD/POS/ROT/LEVL); Partial for OPRP/TRES
**Unknowns:** `U1` in OPRP (purpose undocumented in code); whether additional real-game tags exist beyond those mapped here (they would crash this parser — treat as Unknown_0xTAG).

---

### LotData records and their role
**Claim:** Inside an `"LOT "` manager record, lot-level data is stored as the same tag-length framed records (`LotData` base + `Create(tag)` dispatch): position, rotation (single float), and tile sizes.
**Evidence — S4S implementation:** `S4Studio/Data/IO/LotData.cs`, `LotDataPosition.cs`, `LotDataRotation.cs`, `LotDataSizeX/Y/Z.cs` (via `ObjectManagerLotData.cs`)
**Observed behavior / field table:**

| Tag | Field | Type |
|---|---|---|
| `"POS "` | Position | Vector3 |
| `"ROT "` | Rotation | float (not quaternion — unlike object rotation) |
| `"SIZX"` | TileCountX | uint |
| `"SIZY"` | TileCountY | uint |
| `"SIZZ"` | TileCountZ | uint |

Role: describes the lot footprint/placement within the world's object manager; distinct from tray `LotDescriptionResource` (type `26488364` / `0x01942E2C`, which carries LotId, sizes, camera, flags — `Data/IO/LotDescriptionResource.cs`) and from world-side `WorldObjectDataResource` below.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** whether further LotData tags exist in live game files (parser throws on unmapped tags).

---

### World-side lot objects: WorldObjectDataResource / WorldLot / WorldObject
**Claim:** A separate resource (`WorldObjectDataResource`, type `4239499748` / `0xFCB1A1E4`, version-checked ==10) stores per-lot object lists for worlds: `uint count` lots, each with LotID, a TGI FootprintKey, then three/four lists: Objects, ObjectsNoScript, Locators, and Objects2 (version ≥ 9).
**Evidence — S4S implementation:** `S4Studio/Data/IO/WorldObjectDataResource.cs`, `WorldLot.cs`, `WorldObject.cs`, `WorldObject2.cs`
**Observed behavior:** `WorldObject` fields: Locator (embedded `WorldLocator`), ObjectId (ulong), MinSpecLod (byte), ParentId (ulong), SlotHash (uint), AccumulatesSnow (byte, version>7), U1 (uint, version>9). `WorldObject2`: Locator + U1 (uint). `PathResource` (type `975082574` / `0x3A1E944E`, version==5) stores waypoint items: Vector3 + Quaternion + U1 (uint). `PassInfo` (used by geometry-side pass blocks, not lot packages): OpaquePass byte, LightingPass byte, byte-count-prefixed LayerIDs list, uint-list named `Unused`.
**Confidence:** Implementation-verified
**Public-reference agreement:** Partial
**Unknowns:** `WorldObject.U1`, `WorldObject2.U1`, `PathResource.Item.U1`, `PassInfo.Unused` list contents.

---

### Catalog linkage: how placed objects reference definitions/tuning
**Claim:** A placed object points at its catalog definition by 64-bit GUID (`"DGUD"` record = OBJD instance id); the OBJD (`ObjectDefinitionResource`, type `3235601127` / `0xC0DB5AE7`) is a versioned (==2) pointer-table resource where each property is located by FNV-hashed, type-XOR'd ids into a shared byte pool.
**Evidence — S4S implementation:** `S4Studio/Data/IO/BuyBuild/ObjectDefinitionResource.cs`, `Data/Util` FNV usage therein
**Observed behavior:** OBJD layout: uint16 version, uint32 total-size, pooled property bytes, uint16 pointer-count, then `{uint32 Id, uint32 Offset}` pairs; property value typed by XOR key (`kbool`, `kfloat`, `kInt64`, `kUInt64`, `kByte("uint8")`, `kUInt32`, `kArray`, `kString8`). Named properties include `Name`, `MaterialVariant`, `Tuning` (string8; when it contains ':', `TuningId = FNV.Hash64(value) | 0x8000000000000000`), `SimoleonPrice`, `ThumbnailGeometryState`, `EnvironmentScores`, `EnvironmentScoreEmotionTags(_32)`, `Components` (uints → `ObjectComponentType` enum), and ResourceKey arrays `Model`, `Rig`, `Slot`, `Icon`, `Footprint`. Unnamed properties preserved as `U1` (byte @ hash 4266724023), `U2` (bool), `U3` (byte), `U4` (ulong), `U5` (byte list @ 4094735891). Write re-serializes pointers in insertion order; read throws if declared size ≠ consumed bytes.
Catalog side: `ObjectCatalogResource` (type `832458525` / `0x319E4F1D`) extends `BuyBuildSwatchResource` and embeds a `CTProduct` "Common" block: Version (==11 checked), NameHash, DescriptionHash, SimoleonPrice, ThumbnailHash (ulong), DevCategoryFlags, byte-count style list of external TGIs, PackID/PackFlags/PackReserved(9 bytes) for version ≥ 10, tag list (ushort pre-v10, uint v10+), ObjectTooltipTags, gameplay description keys, SwatchColorsSortPriority, VariantThumbImageHash.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes (OBJD property scheme matches community SimsWiki/Moderator notes); CTProduct details Partial
**Unknowns:** OBJD `U1–U5` semantics; `CTProduct.Unused2/Unused3` (pre-v10 path); `PackReserved` 9 bytes; full `ObjectComponentType` enum values not enumerated here.

---

### What travels together when S4S clones/exports objects
**Claim:** S4S has an object clone pipeline (`CloneObj`) that copies OBJD + OBJC as a pair and pulls in every referenced resource (models, MTBL cutouts, rig/slot/footprint/icon keys, thumbnails, STBL strings) — but there is **no furnished-lot clone/export flow** in this source tree; lot/world object resources (OMGS, WorldObjectDataResource) are handled only as generic readable/writable resources.
**Evidence — S4S implementation:** `S4Studio/Core/OBJItem.cs:302-360` (`CloneObj`), `Core/ModelCloneUtils.cs:44-79` (`CloneModel`), `Core/LinkedResourceCloneUtils.cs`, `Core/DefinitionCloneUtils.cs`, `Shared/S4SCLIObjectExport.cs` (`objmodelexport`)
**Observed behavior:** `CloneObj` gathers: all OBJDs sharing the OBJC `PrototypeId` (via `ObjectContentMetadata` in the file table), copies OBJC + master OBJD, optionally clones the DST thumbnail, recomputes `PrototypeId`/`Name`/`MaterialVariant`/name & desc STBL hashes with a salt (renumber option), builds a new local STBL, and clones a merged CutoutInfoTable (MTBL). `CloneModel` deep-clones Model LOD/mesh resources and their linked materials via `CloneLinkedResource` (rehashes nonzero instances with `FNV.Hash64(instance + salt)` and adds them into the result package). OBJD references to Rig/Slot/Footprint/Icon must resolve either inside the resulting package or against game files — S4S does not relocate them during clone except through model/material link cloning. The CLI `objmodelexport` writes mesh JSON + diffuse texture, not package relocation. No code path moves `ObjectManager`/"OBJ " records between packages; furnished-lot transfer is therefore **Hypothesis territory**: based on the format, an OMGS/WorldObjectDataResource move would additionally require every referenced DGUD→OBJD plus OBJD-referenced Model/Rig/Slot/Footprint resources to travel along, but S4S implements no such tooling here.
**Confidence:** Implementation-verified (object clone); Hypothesis (furnished-lot bundle requirements)
**Public-reference agreement:** Yes (community CC cloning workflow matches); lot-bundle question None documented in-code
**Unknowns:** whether Maxis' own tray importer accepts OMGS-style object records copied verbatim (untestable from this source).

---

## Unknown-field inventory

| Symbol | Location | Meaning |
|---|---|---|
| U1 (OPRP) | `Data/IO/OPRP.cs` | single uint32, purpose unknown |
| U1 (WorldObject) | `Data/IO/WorldObject.cs` | uint32 appended when resource version > 9 |
| U1 (WorldObject2) | `Data/IO/WorldObject2.cs` | uint32 after locator |
| U1 (PathResource.Item) | `Data/IO/PathResource.cs` | uint32 per waypoint |
| Unused (PassInfo) | `Data/IO/PassInfo.cs` | uint list after LayerIDs |
| U1–U5 (OBJD) | `Data/IO/BuyBuild/ObjectDefinitionResource.cs` | unnamed typed properties keyed by raw hashes 4266724023 / 2227785151 / 1304649228 / 3168761331 / 4094735891 |
| Unused2 / Unused3 (CTProduct) | `Data/IO/BuyBuild/CTProduct.cs` | pre-version-10 bytes |
| PackReserved (CTProduct) | `Data/IO/BuyBuild/CTProduct.cs` | 9 opaque bytes (version ≥ 10) |
| Unknown / Unknown2 (LotDescriptionResource) | `Data/IO/LotDescriptionResource.cs:485,504` | byte + uint, unexplained |
| SNOW registration anomaly | `ObjectManagerSnowData.cs` | class extends ObjectData though used in manager context — placement ambiguous |
