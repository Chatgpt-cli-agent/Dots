# Tray / Gallery lot pipeline — .trayitem ↔ .blueprint ↔ .bpi family

Source studied (READ ONLY): `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` — key files:
`S4Studio/Data/IO/TrayMetadataResource.cs`, `BlueprintResource.cs`, `Images/{Sims4Image,CatalogThumbnail,BlueprintImageResource}.cs`, `Core/BasicResource.cs`, `RoomResource.cs`, `HouseholdDescriptionResource.cs`, `Shared/RecordBundle.cs`, `Data/IO/World/Architecture/ArchitectureResourceFactory.cs`, `Images/JNGCompress.cs`, `ViewModels/Warehouse/ResourceKeyFilenameParser.cs`, `Shared/ViewModels/Tools/Screenshots/{MyLibraryVM,TrayItemVM}.cs`, `EA/Sims4/Network/{TrayMetadata,TrayBlueprintMetadata,ExchangeItemTypes}.cs`.

Sample bundle (Tier-1, directly observed): `/mnt/Sims-SSD-2/TSR CC Manager Library/Tray/` — one lot ("Bluehaven Cottage" by RayDesign9) as 7 sibling files sharing instance `0x0E6317098ED21203`.

---

### Filename convention: `0xGGGGGGGG!0xIIIIIIIIIIIIIIII.<ext>`
**Claim:** S4S tray filenames encode the resource **Group** before the `!` and the 64-bit **Instance** after it; the extension selects the resource Type when no type is encoded.
**Evidence — S4S implementation:** S4Studio/ViewModels/Warehouse/ResourceKeyFilenameParser.cs:14-86 (`0x{group:X8}!0x{instance:X16}` split on `!`; two-part form ⇒ type comes from a fixed extension table).
**Direct observation:** All 7 sample filenames match this shape exactly (groups 0x00000000–0x00000303).
**Observed behavior:** MyLibraryVM parses every non-.lnk file in `<Documents>/The Sims 4/Tray` through this parser, instantiates the mapped resource class, reads it, and adds it to an in-memory DBPF package used as the tray resource provider.
**Confidence:** Directly observed
**Public-reference agreement:** Yes
**Unknowns:** none.

### Extension → Type table
**Claim:** The tray extensions map to these resource types in S4S:

| ext | class | Type (dec) | Type (hex) |
|---|---|---|---|
| `.trayitem` | TrayMetadataResource | 713711138 | 0x2A8A5E22 |
| `.blueprint` | BlueprintResource | 958717478 | 0x3924DE26 |
| `.bpi` | BlueprintImageResource (CatalogThumbnail) | 3543935006 | 0xD33C281E |
| `.room` | RoomResource | 923729262 | 0x370EFD6E |
| `.householdbinary` | HouseholdTemplateResource | — | — |
| `.hhi` | SimHouseholdThumbnailResource | — | — |
| `.sgi` | SimGalleryImageResource | — | — |
| `.rmi` | RoomThumbnail | — | — |
| `.pti` | ExchangePartThumbnail | — | — |
| `.part` | ExchangePart | — | — |

**Evidence — S4S implementation:** ResourceKeyFilenameParser.cs:40-74 switch; type constants in each resource class (`public static uint Type`).
**Direct observation:** Sample uses only `.trayitem`, `.blueprint`, `.bpi`.
**Observed behavior:** Round-trip via the same parser on load; WarehouseResourceClassMap supplies the concrete class per type.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** none for the three extensions observed.

### Exchange item types
**Claim:** A trayitem's protobuf `type` field is an enum: 1 = EXCHANGE_HOUSEHOLD, 2 = EXCHANGE_BLUEPRINT, 3 = EXCHANGE_ROOM (0 invalid, 4 ALLTYPES, 5 PART).
**Evidence — S4S implementation:** EA/Sims4/Network/ExchangeItemTypes.cs:6-15; consumed at TrayItemVM.cs:144.
**Direct observation:** Sample trayitem decodes field 2 = varint **2** → EXCHANGE_BLUEPRINT.
**Observed behavior:** TrayItemVM dispatches loading of image + data resource on this value and throws NotSupportedException otherwise.
**Confidence:** Directly observed
**Public-reference agreement:** Yes
**Unknowns:** none.

### .trayitem layout
**Claim:** A .trayitem is: uint32 U1, int32 payload-length, then protobuf `EA.Sims4.Network.TrayMetadata`; on write S4S patches the length field to `stream.Length - 8` afterwards.
**Evidence — S4S implementation:** S4Studio/Data/IO/TrayMetadataResource.cs:71-88.
**Direct observation:** Sample: U1=0, length=847, file=855 bytes (=8+847). Protobuf decodes as: id(1)=1036697669043622403 = 0x0E6317098ED21203 (**equals the shared instance ID of all 7 siblings**), type(2)=2, remote_id(3)=16 zero bytes, name(4)="Bluehaven Cottage", description(5), creator_id(6)=1015113025234, creator_name(7)="RayDesign9", metadata(10)=SpecificData{bp_metadata(1){venue_type=28614, size_x=20, size_z=20, price_level=4, price_value=76928, num_bedrooms=2, num_bathrooms=2, architecture_value=17616, num_thumbnails=4, front_side=0, venue_type_stringkey=0xFCCB... , building_type=2, ...}, sku_bits(27), version(1001)=12600}, item_timestamp(11)=63922917281, creator_uuid(12)=477 random-ish bytes, creator_platform_name(29)="RayDesign9".
**Observed behavior:** Read ignores the length int32 (`ReadInt32()` discarded) and lets protobuf consume the rest; Write re-serializes then back-patches length.
**Confidence:** Directly observed
**Public-reference agreement:** Yes
**Unknowns:** `TrayMetadataResource.U1` unnamed in source (0 in sample); protobuf unknown/extension fields preserved implicitly by protobuf-net IExtensible but not enumerated here.

### TrayMetadata SpecificData fields (selected)
**Claim:** SpecificData carries per-type sub-messages keyed by ProtoMember: bp_metadata(1), hh_metadata(2), ro_metadata(7), part_metadata(26), plus gallery flags (is_hidden 3, is_modded_content 5, hashtags 8, sku_id 10, payloadsize 12 …) and version(1001).
**Evidence — S4S implementation:** EA/Sims4/Network/TrayMetadata.cs:24-385; TrayBlueprintMetadata.cs:44-268 (venue_type, size_x/z, price_level/value, num_bedrooms/bathrooms, architecture_value, num_thumbnails default 1, front_side default 0, venue_type_stringkey, ground_floor_index default 2, lot_traits fixed64[], building_type, lot_template_id, university_housing_configuration, tile_count, unit_count, unitTraits, dynamic_areas).
**Direct observation:** Sample version(1001)=12600; bp_metadata populated as listed above. Note num_thumbnails=4 while 5 .bpi siblings exist — do not assume they correspond 1:1.
**Observed behavior:** Unknown proto fields round-trip through IExtensible.
**Confidence:** Directly observed (sample values); Implementation-verified (field list)
**Public-reference agreement:** Yes
**Unknowns:** exact semantics of several bp_metadata members (building_type, dynamic_areas) are named-but-unexplained in source.

### .bpi thumbnails
**Claim:** A .bpi file contains a single raw `BlueprintImageResource` blob (BasicResource passthrough): 24-byte JNG wrapper header — int32 image-byte-count, uint32 zero, 5×uint32 — followed by XOR-obfuscated (xorshift EAKey1) JPEG-with-spliced-PNG-alpha ("JNG") image data; S4S decodes via `TC.JNG` only if the first uint32 equals JNG magic 3774863615, else it de-XORs first.
**Evidence — S4S implementation:** BasicResource.cs:82-91 (whole-file read/write, no parsing); CatalogThumbnail.cs:13-23 (`TC.JNG.DecompressImage(Data)`); JNGCompress.cs:124-170 (TransformToPNG: magic check → UnXOR → 24-byte skip → alpha PNG chunk splice) and UnXOR at ~line 196-208; BMP2JNG writer :60-120.
**Direct observation:** All five sample .bpi files: first uint32 = filesize−24 exactly (10779/34359/44310/52233/55303), byte 4..8 = 00×4, identical 20-byte header tail across files (`8efc2448 9b780e3c 02000000 00000000 bef d192d...`), payload length matches header count with no trailing bytes — consistent with the XOR'd JNG structure.
**Observed behavior:** S4S treats bpi content as opaque bytes until a bitmap is requested; save writes Data verbatim.
**Confidence:** Directly observed (structure match); Implementation-verified (codec)
**Public-reference agreement:** Partial
**Unknowns:** meaning of the 5 header uint32s beyond the count field (JNG internal fields written by BMP2JNG) — treat as codec internals, Unknown_0x…; do not assign lot semantics.

### Multi-thumbnail grouping
**Claim:** Multiple .bpi thumbnails for one lot share the instance ID and differ by Group; consumers pick one image by ordering on Group descending and taking the first.
**Evidence — S4S implementation:** TrayItemVM.cs:148-152 (`FindAll(typeId, null, instanceId) orderby x.Group descending FirstOrDefault()`).
**Direct observation:** Sample groups: 0x00000002, 0x00000003, 0x00000103, 0x00000203, 0x00000303 — i.e. base group 2/3 plus 0x100-strided variants (259, 515, 771). File sizes increase monotonically with group value in this sample (10.8 KB → 55.3 KB).
**Observed behavior:** Highest-group bpi wins for display; all are loaded into the package regardless.
**Confidence:** Directly observed (values + selection rule from source)
**Public-reference agreement:** Partial
**Unknowns:** what the group stride (0x100 steps above 0x103) enumerates (floors? camera angles? sizes?) is NOT stated anywhere in source — leave Unknown_0x0103-family semantics unclaimed.

### Bundle assembly & linkage rules
**Claim:** All tray files of one gallery item share one instance ID; S4S loads every file into one DBPFPackage and resolves cross-references purely by (Type, Instance): trayitem(type enum) → BlueprintResource/RoomResource/HouseholdTemplateResource at same instance; thumbnail images likewise; the blueprint itself embeds its LDNB architecture bundle internally rather than referencing external room resources.
**Evidence — S4S implementation:** MyLibraryVM.cs:110-150 (folder scan → composite provider); TrayItemVM.cs:139-185 (per-type lookup by `tray.Key.Instance`); BluePrintData.cs:18 + BlueprintResource.cs:137-139 (embedded LDNB).
**Direct observation:** All 7 sample files share instance 0x0E6317098ED21203; trayitem id field equals that instance; blueprint group 0; trayitem group 2; bpi groups as listed. No .room/.hhi/.sgi siblings present for this lot.
**Observed behavior:** Deleting/renaming a sibling breaks only that link (lookup returns null → e.g. `Data = ... Find(...)?.Data<...>()` null-tolerant for blueprint/room, NOT null-tolerant for household template).
**Confidence:** Directly observed
**Public-reference agreement:** Yes
**Unknowns:** whether the game itself enforces the group numbering seen here (TSR-exported) vs any group being acceptable — Unknown_0xNN.

### Per-file TGI histogram of the real sample bundle (directly observed)
```
File                                              T(G=filename prefix)      records
0x00000000!…blueprint   T=0x3924DE26 G=0x00000000  1 resource; inside its Snappy payload:
                            NewFormat body + LDNB v3 bundle, 33 records,
                            all G=0 I=0x1, distinct types:
                            0918E671 0B188259 1DE7B2AC 2081B4E6 251D6FDC 2D173F89
                            3E0A3111 42F8F4BA 44E749F6 49B12B23 65859EB2 659EFBF4
                            69C99784 72187564 7B36E0D3 826C8B59 881171F6 908C01C8
                            90A9C827 9118FDFF 93F3D6EF A276970B AB53B0C5 C3D98B48
                            C59B5293 C9106475 D2AF154F E17A612D E6405EFA E6BBD7DE
                            F22074AA F8B7FD69 FAD4C271
0x00000002!…trayitem    T=0x2A8A5E22 G=0x00000002  1 resource (protobuf TrayMetadata)
0x00000002!…bpi         T=0xD33C281E G=0x00000002  1 image blob, 10,803 B
0x00000003!…bpi         T=0xD33C281E G=0x00000003  1 image blob, 34,383 B
0x00000103!…bpi         T=0xD33C281E G=0x00000103  1 image blob, 44,334 B
0x00000203!…bpi         T=0xD33C281E G=0x00000203  1 image blob, 52,257 B
0x00000303!…bpi         T=0xD33C281E G=0x00000303  1 image blob, 55,327 B
```
**Claim:** see table.
**Evidence — S4S implementation:** types per extension table; LDNB container RecordBundle.cs.
**Direct observation:** hexdump + full parse of all seven files (Snappy-decompressed the blueprint; walked the LDNB index tables; decoded the trayitem protobuf).
**Observed behavior:** n/a (static evidence).
**Confidence:** Directly observed
**Public-reference agreement:** Partial
**Unknowns:** 29 of the 33 embedded architecture types have no S4S class (rendered as UnknownResource) — their names remain Unknown_0x….

### Save path behavior (how S4S writes bundles)
**Claim:** S4S's library view only *reads* the Tray folder into memory; source shows no exporter writing `0x…!….bpi/.blueprint` files — batch export goes through the warehouse filename parser instead, so on-disk tray bundles are authored by the game/TSR, and S4S round-trips them resource-by-resource.
**Evidence — S4S implementation:** MyLibraryVM.cs (constructor + LoadTray, read-only usage); ResourceKeyFilenameParser.cs used for import/export naming.
**Direct observation:** n/a.
**Observed behavior:** Any edit marks the PackedResource dirty; persistence of edited tray items back to the Tray folder is not present in the inspected sources.
**Confidence:** Implementation-verified
**Public-reference agreement:** None documented
**Unknowns:** whether other S4S modules (not under S4Studio/Data/IO or Screenshots) export tray sets — Unknown_0xNN.
