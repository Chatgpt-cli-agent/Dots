# .blueprint — S4S implementation reference

Sources studied (READ ONLY): `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/S4Studio/Data/IO/BlueprintResource.cs`, `BluePrintData.cs`, `BluePrintImageData.cs`, `BlueprintItem.cs`, `RoomResource.cs`, `HouseholdDescriptionResource.cs`, plus `S4Studio/Shared/RecordBundle.cs`, `S4Studio/Data/IO/World/Architecture/ArchitectureResourceFactory.cs`, `S4Studio/Data/IO/Images/BlueprintImageResource.cs` + `CatalogThumbnail.cs` + `Core/BasicResource.cs`, `S4Studio/Images/JNGCompress.cs`, `S4Studio/Shared/ViewModels/Tools/Screenshots/{MyLibraryVM,TrayItemVM}.cs`, `S4Studio/ViewModels/Warehouse/ResourceKeyFilenameParser.cs`.

Sample bundle directly observed: `/mnt/Sims-SSD-2/TSR CC Manager Library/Tray/0x00000000!0x0e6317098ed21203.blueprint` (37,446 bytes) — full parse performed with a standalone Python Snappy decoder.

---

### Blueprint resource type ID
**Claim:** The .blueprint resource type ID is 958717478 (0x3924DE26), declared as `BlueprintResource.Type`.
**Evidence — S4S implementation:** S4Studio/Data/IO/BlueprintResource.cs:13 (`public static uint Type = 958717478u`)
**Direct observation:** Filename prefix of the sample is `0x00000000!0x0e6317098ed21203.blueprint`; per ResourceKeyFilenameParser the `.blueprint` extension forces type = BlueprintResource.Type, so the file is T=0x3924DE26, G=0x00000000, I=0x0E6317098ED21203.
**Observed behavior:** Round-trip symmetric: Read/Write in BlueprintResource.cs write exactly Version(int32) + Snappy-blob-length(int32) + Snappy bytes.
**Confidence:** Directly observed
**Public-reference agreement:** Yes
**Unknowns:** none for this claim.

### .blueprint outer container layout
**Claim:** A .blueprint file is: int32 Version, int32 byte-count, then that many bytes of Snappy-compressed payload; everything else lives inside the compressed block.
**Evidence — S4S implementation:** S4Studio/Data/IO/BlueprintResource.cs:91-96 (Read) and :142-196 (Write, uses IronSnappy).
**Direct observation:** Sample file: Version = 1; count = 37,438; file length 37,446 = 8 + 37,438 with zero trailing bytes; Snappy-decompressed payload = 198,338 bytes.
**Observed behavior:** Write re-compresses the whole reconstructed inner stream with Snappy; Read decompresses before any field parsing.
**Confidence:** Directly observed
**Public-reference agreement:** Yes
**Unknowns:** none.

### NewFormat magic gate
**Claim:** The first uint32 inside the decompressed payload selects the format: value 4272011949 (0xFEA1BAAD) ⇒ "NewFormat" branch; anything else is treated as a plain uint32 length followed by a protobuf LotObjectList.
**Evidence — S4S implementation:** S4Studio/Data/IO/BlueprintResource.cs:99-136 (`if (num == 4272011949u) NewFormat = true; ... else { ... ReadBytes((int)num) ... }`).
**Direct observation:** Sample payload begins 0xFEA1BAAD → NewFormat path taken.
**Observed behavior:** Write emits 0xFEA1BAAD only when the in-memory `NewFormat` flag was set by Read; old-format files round-trip as old-format.
**Confidence:** Directly observed (magic constant + sample)
**Public-reference agreement:** Yes
**Unknowns:** semantics of the magic constant itself are not named anywhere in source (treated as format sentinel).

### BluePrintData.NewFormat field order
**Claim:** In NewFormat payloads the body is: U1:int32, protobuf LotObjectList (length-prefixed), U2:uint32, ObjectFallbacks (int32 count, then count × {From:uint64, To:uint64}), and — only when U1 == 2 — an image table (int32 count, then count × {7 raw bytes U1, byte B1, int32 length, bytes ImageData}).
**Evidence — S4S implementation:** S4Studio/Data/IO/BlueprintResource.cs:100-130 (Read) mirrored at :148-178 (Write); BluePrintData.cs:8-21; BlueprintItem.cs:5-7; BluePrintImageData.cs:5-15.
**Direct observation:** Sample parses cleanly under this grammar: U1=2, LotObjectList blob = 50,676 bytes (starts `08 ed80c4b60f ...`), U2=1, 84 fallback pairs (first: 0x28D3E→0x5CC2 …), image-table count = 0 (present because U1==2 but empty), remainder 146,294 bytes = LDNB bundle.
**Observed behavior:** All fields are written back verbatim; U1/U2/fallback/image names are opaque in source — no semantics are assigned beyond "U1==2 gates the image section".
**Confidence:** Implementation-verified (grammar verified end-to-end against a real file; field meanings unknown)
**Public-reference agreement:** Partial
**Unknowns:** `BluePrintData.U1`, `BluePrintData.U2`, `BluePrintImageData.U1` (7 bytes, hex string), `BluePrintImageData.B1` — preserved as U1/U2/B1 exactly as in source; do not rename.

### LotObjectList is protobuf
**Claim:** The placed-object list inside a .blueprint is a protobuf-serialized `LotObjectList` (EA.Sims4.Network), deserialized with protobuf-net.
**Evidence — S4S implementation:** S4Studio/Data/IO/BlueprintResource.cs:107 / :135 (`Serializer.Deserialize<LotObjectList>(...)`); class lives in EA/Sims4/Network decompiled sources bundled with S4S.
**Direct observation:** Length-prefixed blob starts `08 ...` (protobuf field 1 varint), consistent with a message stream; not further decoded.
**Observed behavior:** Serialized with `Serializer.Serialize(memoryStream, BluePrintData.Objects)` on save; byte-for-byte content depends on the proto contract, so round-trip is not guaranteed byte-identical, only semantically.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** individual LotObjectList member fields not inventoried here.

### ObjectFallbacks
**Claim:** .blueprint carries a From/To ulong pair list ("ObjectFallbacks") whose purpose the source does not name; entries are opaque 16-byte records.
**Evidence — S4S implementation:** S4Studio/Data/IO/BlueprintItem.cs (only properties `From`, `To`); BlueprintResource.cs:110-117 / :160-165.
**Direct observation:** Sample has 84 entries; values look like small object-instance IDs (e.g. 0x28D3E → 0x5CC2).
**Observed behavior:** Pure pass-through on read/write.
**Confidence:** Implementation-verified (structure), Hypothesis (any mapping meaning — e.g. CC-object substitution — is NOT stated in source and must stay unclaimed)
**Public-reference agreement:** None documented
**Unknowns:** purpose of From→To mapping = Unknown_0x pair semantics; keep name `ObjectFallbacks`.

### Embedded architecture bundle (LDNB)
**Claim:** After the parsed sections, every remaining payload byte is an embedded `RecordBundle` ("LDNB") holding the lot's architecture resources, read via `ArchitectureBundle.Read(...)`.
**Evidence — S4S implementation:** S4Studio/Data/IO/BluePrintData.cs:18 (`new RecordBundle(new ArchitectureResourceFactory())`); BlueprintResource.cs:137-139; bundle container format in S4Studio/Shared/RecordBundle.cs:306-362 (Read) / :364-426 (Write): magic "LDNB", uint32 version (checked ≤3), U1, U2, record count, self-pointer table, instance IDs (uint64 each), (Type,Group,StartIndex) group headers incl. one terminator entry, big-endian int24 size offsets.
**Direct observation:** Sample LDNB: version 3, U1=0, U2=0, **33 records**, 33 type-groups, all Group=0, all Instance=1; distinct types include 0x2081B4E6, 0x9118FDFF, 0xF22074AA, 0x49B12B23, 0x07B188259? (see histogram below). Full observed type list (one record each):
```
0918E671 0B188259 1DE7B2AC 2081B4E6 251D6FDC 2D173F89 3E0A3111 42F8F4BA
44E749F6 49B12B23 65859EB2 659EFBF4 69C99784 72187564 7B36E0D3 826C8B59
881171F6 908C01C8 90A9C827 9118FDFF 93F3D6EF A276970B AB53B0C5 C3D98B48
C59B5293 C9106475 D2AF154F E17A612D E6405EFA E6BBD7DE F22074AA F8B7FD69
FAD4C271
```
Types with known S4S classes: 0x2081B4E6 (`X2081B4E6`, carries a `BlueprintInstance` ulong among wall-height/style data), 0x9118FDFF (wall blocks), 0xF22074AA (opaque blocks), 0x49B12B23 (single float), 0x826C8B59 (PondPoolData), 0x92EDE8BD-style key-list resource NOT present in this sample.
**Observed behavior:** Bundle is appended verbatim on save (`ArchitectureBundle.Write`) after the NewFormat sections; unmodified blueprints round-trip through this path.
**Confidence:** Directly observed (structure + real-file index dump)
**Public-reference agreement:** Partial
**Unknowns:** most LDNB record types have no S4S class and fall back to `UnknownResource`/`UnsupportedVersionResource` (RecordBundle.cs:56-78) — their internal layouts remain Unknown_0x…; do not invent names.

### Room data linkage (.room / RoomResource)
**Claim:** Rooms saved from build mode use a separate resource type 923729262 (0x370EFD6E, extension `.room`) parsed by `RoomResource` as: uint32 Version + int32 length + protobuf `TrayRoomBlueprintMetadata`; it is a sibling-of-blueprint tray item, not embedded in .blueprint.
**Evidence — S4S implementation:** S4Studio/Data/IO/RoomResource.cs:12,68-87; EA/Sims4/Network/TrayMetadata.cs SpecificData ProtoMember(7) `ro_metadata`; TrayItemVM.cs:171-179 dispatches EXCHANGE_ROOM to RoomResource.Type + RoomThumbnail images.
**Direct observation:** Not performed (sample bundle contains no .room file).
**Observed behavior:** TrayItemVM loads RoomResource by instance = trayitem instance, same pattern as blueprint.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** TrayRoomBlueprintMetadata field-by-field contents not enumerated here.

### HouseholdDescription linkage
**Claim:** Households use type 1923050575 (0x729F6C4F) parsed by `HouseholdDescriptionResource`: uint32 version (current default 18), then version-gated fields including lot/household name & description hashes (string-table lookups), bedroom/bathroom counts, plex/rent/deposit, university housing fields, venue tuning, and rental-unit block (lease length, unit number, Pascal32 name, active plex, unit size).
**Evidence — S4S implementation:** S4Studio/Data/IO/HouseholdDescriptionResource.cs:14,697-743 (Read) / :745-790 (Write).
**Direct observation:** Not performed (no household binary in sample).
**Observed behavior:** Strict version gating (>7, ≥11, >11, ≥18) on both Read and Write; `CheckVersion(18)` guards forward versions.
**Confidence:** Implementation-verified
**Public-reference agreement:** Yes
**Unknowns:** `U1`, `U2`, `B1`, `F1`, `Blanks` (32-byte hex) are unnamed in source — preserve those identifiers.

### Thumbnail linkage inside .blueprint vs sibling files
**Claim:** The in-blueprint `BluePrintImageData` image table exists only when BluePrintData.U1 == 2 and was empty in the sampled lot; gallery thumbnails for tray items normally live in separate `.bpi` files (type 0xD33C281E), located by matching instance ID to the trayitem instance and picking the highest Group.
**Evidence — S4S implementation:** BlueprintResource.cs:118-130; TrayItemVM.cs:146-155 (`FindAll(BlueprintImageResource.Type, null, tray.Key.Instance) orderby Group descending FirstOrDefault`); ResourceKeyFilenameParser.cs:54-55.
**Direct observation:** Sample: U1==2 with Images count = 0; five external .bpi siblings present instead.
**Observed behavior:** S4S never writes BluePrintImageData in normal flows seen in source; external bpi is the operative thumbnail channel.
**Confidence:** Directly observed
**Public-reference agreement:** Partial
**Unknowns:** whether any live content ships non-empty in-blueprint image tables — Unknown_0xNN until another sample proves it.
