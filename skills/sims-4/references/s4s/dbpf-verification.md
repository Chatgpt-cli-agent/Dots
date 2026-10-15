# DBPF Package I/O — S4S Verification Layer

Claim-based verification of the Sims 4 `.package` (DBPF) format against the
public docs `references/dbpf-2.1.md` and `references/internal-compression.md`.
All evidence is from the decompiled Sims 4 Studio source at
`/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` (paths relative to `S4Studio/`).
No decompiled code is reproduced; behavior is described in prose.

Note: `S4Studio/Resources/CAS/ResourceNames.txt` does not exist in this source
tree (`S4Studio/Resources/` contains only `Strings.cs`); package resource names
come from NameMap resources at runtime (see claim 16).

---

### DBPF header size and field order
**Claim:** The package header is exactly 96 bytes, read/written as strict
sequential little-endian u32 operations in a fixed field order.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFHeader.cs`
(`Size == 96`, `Read`, `Write`).
**Observed behavior:** Field offsets are the cumulative positions of the
sequential reads:

| Offset | Size | S4S field | Notes |
|-------:|-----:|-----------|-------|
| 0x00 | 4 | magic | must be ASCII `"DBPF"`, else `NotASimsPackageException` |
| 0x04 | 4 | FileVersionMajor | new-header default `2` |
| 0x08 | 4 | FileVersionMinor | new-header default `1` |
| 0x0C | 4 | UserVersionMajor | no default set |
| 0x10 | 4 | UserVersionMinor | no default set |
| 0x14 | 4 | Unused1 | |
| 0x18 | 4 | CreationTime | never written by save code (stays whatever it was) |
| 0x1C | 4 | UpdatedTime | never written by save code |
| 0x20 | 4 | Unused2 | |
| 0x24 | 4 | IndexRecordEntryCount | set from live entry count on every header write |
| 0x28 | 4 | IndexRecordPositionLow | **read but never used for index lookup** (see next claim) |
| 0x2C | 4 | IndexRecordSize | computed after writing the index |
| 0x30 | 12 | Unused3[3] | array of 3 u32 |
| 0x3C | 4 | Unused4 | default `3` on a fresh header; written back verbatim |
| 0x40 | 4 | IndexRecordPosition | where S4S actually seeks for the index |
| 0x44 | 24 | Unused5[6] | array of 6 u32 |

**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (dbpf-2.1.md §96-byte header — identical
field order; s4pi field names differ slightly).
**Unknowns:** none beyond the header's own unused fields.

### Version fields are never validated
**Claim:** Only the ASCII `"DBPF"` magic is checked on load; version numbers
are preserved but never compared against anything.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFHeader.cs` (`Read`).
**Observed behavior:** Major=2/Minor=1 are merely defaults for newly created
packages; existing files' values round-trip unvalidated. Minor=1 cannot be
arbitrated by S4S either way.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial (dbpf-2.1.md treats minor=1 as
verified spec with Kuree-wiki dissent; S4S neither confirms nor enforces).
**Unknowns:** whether any real package carries minor ≠ 1.

### Header unused field at 0x3C defaults to 3 and is opaque
**Claim:** The header word at 0x3C ("index version") defaults to 3 on a fresh
header and is copied through untouched, but nothing interprets or validates it.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFHeader.cs`
(constructor + write path).
**Observed behavior:** Value written back verbatim; no branch reads it for
meaning.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (dbpf-2.1.md "always 3",
community-observed; S4S confirms it as a writer default but adds that it is
unvalidated).
**Unknowns:** semantics if ≠ 3.

### CreationTime / UpdatedTime are never written
**Claim:** Nothing in the S4S save path assigns header CreationTime or
UpdatedTime; they persist only via deserialization.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFHeader.cs`,
verified across all writer files listed in this doc.
**Observed behavior:** Values parsed into properties but never set except on
load; header always rewritten at offset 0 at end of save
(`Data/IO/Package/DBPFPackage.cs` `WriteHeader`).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (dbpf-2.1.md: "typically, not set", per
s4pi).
**Unknowns:** whether Maxis packages ever populate them.

### Index lookup uses only the long-form offset (contradiction)
**Claim:** On load S4S seeks exclusively to header offset 0x40
(IndexRecordPosition); the short-form 0x28 value is deserialized but never
used for index lookup.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`ReadIndexTable`: `fileStream.Seek(Header.IndexRecordPosition,
SeekOrigin.Begin)`); `IndexRecordPositionLow` unreferenced elsewhere.
**Observed behavior:** Any package storing its index via the short-form
offset only would be mis-read by S4S. On write, 0x28 is left at its
in-memory value — 0 for a freshly constructed header. In practice Maxis and
modded packages always populate the long form (community-observed per TS4MR),
and S4S's own writer always fills 0x40.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — CONTRADICTS dbpf-2.1.md/s4pi rule
"`Indexposition = header[0x40] if nonzero else header[0x28]`"; agrees with
TS4MR's observation that real files always use the long form.
**Unknowns:** whether such short-form-only packages exist in the wild.

### Index flags: exactly three shared-field bits exist
**Claim:** The index flags support only three constant-field bits — 0x01
(shared Type), 0x02 (shared Group), 0x04 (shared Instance high dword) — and no
other bit exists in the implementation.
**Evidence — S4S implementation:** `Data/IO/Package/IndexFlags.cs` (enum);
`Data/IO/Package/DBPFPackage.cs` (`ReadIndexTable`).
**Observed behavior:** Read order after the flags u32: one static Type u32 if
0x01, one static Group u32 if 0x02, one static InstanceHi u32 if 0x04
(OR'd into the key as `hi << 32`), then N entries per
Header.IndexRecordEntryCount. There is no flag for a constant instance low
dword.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (dbpf-2.1.md flags table matches exactly).
**Unknowns:** none.

### No 0x80 index-flag bit exists
**Claim:** S4S neither defines nor handles an index-flag bit 0x80 anywhere;
the Kuree wiki's claim that bit 7 moves the Compressed/Unknown2 word into the
header has no counterpart in this implementation.
**Evidence — S4S implementation:** `Data/IO/Package/IndexFlags.cs`;
`Data/IO/Package/DBPFPackage.cs` reader and writer.
**Observed behavior:** Enum contains only None/ConstantType/
ConstantGroup/ConstantInstanceEx; both read and write paths test only bits
0x01/0x02/0x04.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — CONFIRMS dbpf-2.1.md's skepticism
about the "0x80 bit" (documented there as not-yet-verified/dubious);
CONTRADICTED relative to the Kuree wiki's bit-table description.
**Unknowns:** whether the game itself ever honors such a bit (no EA code here).

### Expanded index entry layout
**Claim:** A fully expanded index entry is Type u32, Group u32,
InstanceHi u32, InstanceLo u32, Offset u32, FileSize u32, SizeDecompressed
u32, plus — when FileSize bit 0x80000000 is set — a CompressionType u16 and
Committed u16 pair.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`ReadIndexTable`); `Data/IO/Package/DBPFResourcePointer.cs`.
**Observed behavior:** Instance = `(hi << 32) + lo`. FileSize is masked to
`value & 0x7FFFFFFF`; the high bit is purely an "extended entry present"
marker — when clear there is no compression word pair and the entry is
effectively uncompressed-sized. `Compressed` property =
`CompressionType != Uncompressed(0)` (DBPFResourcePointer.cs).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (dbpf-2.1.md per-entry table and extended-
bit rule match; matches s4py/TS4MR behavior described there).
**Unknowns:** semantics of Committed beyond being a marker (see claim 13).

### Deleted records are fetched as missing, never decompressed
**Claim:** Index entries whose CompressionType is DeletedRecord (0xFFE0)
return null ("Resource not found") without attempting decompression, stay in
the index, and are skipped explicitly by name lookups.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`FetchResource`, `GetName`).
**Observed behavior:** Normal fetches filter them out; they survive saves in
the index.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (internal-compression.md lists 0xFFE0 as
deleted marker, not decompressed).
**Unknowns:** whether Maxis ships 0xFFE0 entries in shipped packages
(internal-compression.md flags this not yet verified).

### Zlib-sniff re-tagging quirk in FetchResource
**Claim:** When an entry claims Zlib, S4S re-tags it as InternalCompression
before decompressing if the first byte ≠ 120 AND the second byte == 251
(i.e. byte0 ≠ 0x78 && byte1 == 0xFB) — a heuristic coded with `&&` where `||`
looks intended.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`FetchResource`); signature validation in
`Gibbed/RefPack/Decompression.cs` (`(u16 & 0x1FFF) == 4347 /* 0x10FB */`).
**Observed behavior:** Raw bytes of length `entry.Size` are read at
`entry.Offset`; after decompression the result length must equal
SizeDecompressed else `ResourceException`. As literally coded the sniff is a
latent bug; 0xFB appears in RefPack signature words. Do not rely on this
heuristic either way.
**Confidence:** Implementation-verified (the quirk itself); Hypothesis (that
`||` was intended).
**Public-reference agreement:** Partial — internal-compression.md documents
byte-based sniffing in s4pi (first byte 0x78 → zlib, second byte 0xFB →
RefPack) which parallels the intent, but S4S's exact condition differs and is
suspect.
**Unknowns:** which condition real mis-tagged payloads actually need.

### Save pipeline is a full rewrite into a temp file
**Claim:** Saving writes everything to a temp file (then copies over the
original), re-syncs unchanged entries' Offset/Size/SizeDecompressed/
CompressionType from the old file so their raw bytes can be copied verbatim,
writes data starting at byte 96, appends the index, then the header last.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`Save` → `SaveTempPackage` → `WriteDataStream` → `WriteIndexTable` →
`WriteHeader`).
**Observed behavior:** Entries iterate in storage order (insertion order; on
load equals source-index order). Modified resources are serialized and
re-compressed; untouched ones are bulk-copied raw — preserving their original
compression even if refpack/deleted. Offsets are sequential with no padding
or alignment. Every save effectively defragments (an explicit `Defragment()`
does the same in place).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented (writer behavior isn't part
of the public container spec).
**Unknowns:** none material.

### Writer always emits flags=0 fully-expanded entries
**Claim:** S4S always saves with index flags = 0 and fully expanded entries:
every entry is exactly 32 bytes and always carries the compression word pair,
even for uncompressed resources (code 0x0000), with the extended bit ALWAYS
set on FileSize.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`SaveTempPackage`: `indexFlags = IndexFlags.None; staticKey = new
ResourceKey();`; `WriteIndexTable`: writes flags 0, then per entry T, G,
InstanceHi, InstanceLo, Offset, `Size | 0x80000000`, SizeDecompressed,
u16 CompressionType, u16 Committed).
**Observed behavior:** S4S can read shrunken (shared-flag) indexes but never
produces them.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes — CONFIRMS dbpf-2.1.md/TS4MR note that
Maxis and modders always set the extended bit; entry width matches the
s4pi/Kuree "8 DWORDs = 32 bytes" expansion.
**Unknowns:** none.

### Compression decision on write
**Claim:** New resources added via `Add()` default to Zlib; serialized data
of ≤ 4 bytes is forced Uncompressed; otherwise the requested type is used,
with fallback to Uncompressed if compression fails or output ≥ input.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`
(`WriteResourceStream`); `Gibbed/RefPack/Compression.cs` (refuses inputs
< 16 bytes).
**Observed behavior:** No minimum-size threshold beyond the ≤ 4-byte check;
zlib uses max deflate level (see next-but-one claim). `Committed` defaults
to 1 on every new pointer (`Data/IO/Package/DBPFResourcePointer.cs`
constructor).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — internal-compression.md documents
s4pe writing zlib when asked; the ≤ 4-byte rule and fallback are S4S-specific
policy, undocumented publicly.
**Unknowns:** none.

### Committed word is a constant 1 that nothing interprets
**Claim:** The per-entry u16 after CompressionType defaults to 1 on new
pointers and is round-tripped but never interpreted.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFResourcePointer.cs`
(constructor); write path in `Data/IO/Package/DBPFPackage.cs`.
**Observed behavior:** Value copied through on load/save; no branch reads it
for meaning.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes (dbpf-2.1.md/internal-compression.md:
s4pi comment "Always 0x0001", community-observed).
**Unknowns:** true semantics ("committed"?); flagged Unknown2 in public docs.

### DefragmentedSize includes an unexplained trailing +4
**Claim:** `DefragmentedSize = 96 + IndexSize + DataStreamSize + 4`, where
`IndexSize = EntryCount * 32` (hard-coding the fully-expanded assumption) and
the trailing 4 bytes have no corresponding writer in the codebase.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackage.cs`.
**Observed behavior:** The extra +4 is possibly legacy slack; not yet
explained.
**Confidence:** Implementation-verified (the formula); Hypothesis (legacy
slack explanation).
**Public-reference agreement:** None documented.
**Unknowns:** why the +4 exists.

### Compression codes and algorithm handling
**Claim:** Compression type is a u16 enum: 0x0000 Uncompressed (passthrough),
0x5A42 Zlib (SharpZipLib standard zlib inflate; compressed with
`Deflater(9)`), 0xFFFF InternalCompression (EA RefPack via Gibbed,
level Max), 0xFFFE StreamableCompression (defined but throws "Unrecognized
compression type" on decompress AND compress), 0xFFE0 DeletedRecord
(expects empty data; compresses to empty byte[0]).
**Evidence — S4S implementation:** `Data/IO/Package/DBPFCompressionType.cs`;
`Data/IO/Package/PackageCompressor.cs` (+ `IPackageCompressor.cs`);
`Gibbed/RefPack/Compression.cs`, `Gibbed/RefPack/Decompression.cs`.
**Observed behavior:** Packages containing 0xFFFE entries are effectively
unreadable by S4S despite the code defining the value.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes — CONFIRMS the community table in
dbpf-2.1.md and internal-compression.md (0x5A42 zlib, 0xFFE0 deleted, 0xFFFE
streamable/unimplemented, 0xFFFF RefPack); adds that 0xFFFE is hard-unreadable
here (parallel to @s4tk throwing).
**Unknowns:** whether Maxis ever writes 0xFFFE (both docs flag unverified).

### NameMap resource format and encoding
**Claim:** The NameMap resource (type 0x0166038C = 23462796) is version u32
(must be 1), entry count i32, then per entry a u64 Instance followed by a
Pascal32 string (u32 byte-length prefix + raw bytes), decoded as ASCII.
**Evidence — S4S implementation:** `Data/IO/Package/NameMapResource.cs`
(`CheckVersion(1u)`; `Type`); `Data/IO/Util/BinaryStreamWrapper.cs`
(`ReadPascalString`/`WritePascalString`; static ctor default encoding ASCII —
NameMapResource does not set `CharacterEncoding`).
**Observed behavior:** A package may contain multiple namemap resources;
`DBPFPackage.GetName` scans all of them for the instance. `SetName` edits the
first map containing the instance, else appends to the first found map
(creating a standalone one in memory if none exists — that path does not call
`Add()`, so persistence depends on the caller; flagged odd, not traced
further). Format is unchanged from the SimsWiki Sims 3 NMAP layout
(version/count/QWORD+length-prefixed name).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — type ID confirmed against TS4MR /
s4pi BrowserWidget; layout confirmed against SimsWiki NMAP; but community
docs often say UTF-8 while S4S decodes ASCII. Non-ASCII names would be
mangled under S4S's reading; which is correct for game-written namemaps is
not verified.
**Unknowns:** actual text encoding of game-written namemap strings.

### Merged packages are an S4S-private extension
**Claim:** S4S merged packages carry a manifest resource whose type ID is
FNV.Hash32("S4SMergedPackageManifest"); its presence makes
`DBPFPackage.IsMerged` true, and the manifest is a u32 Version (=1) followed
by a recursive folder tree.
**Evidence — S4S implementation:** `Data/IO/Package/S4SMergedPackageManifest.cs`;
`MergedFolderItem.cs`; `MergedPackageItem.cs`;
`Data/IO/Package/PackageMergeUtility.cs`.
**Observed behavior:** Manifest tree: each folder = Pascal32 name + u32
subfolder count + folders + u32 package count + packages; each package item =
Pascal32 name + count × (u64 Instance, u32 Type, u32 Group) listing its
resource keys. Manifest strings are explicitly UTF-8. Merge appends other
packages' raw resource bytes to the end of the merged file, skipping
duplicates and other manifests, enforcing a 2 GB limit ("Merged package
cannot exceed 2GB"), then rewrites index+header in place starting at the old
`Header.IndexRecordPosition`. Unmerge writes each logical package back out
as its own `.package`, reusing offsets/data from the merged file. Removing a
resource from a merged package also removes it from the manifest
(`DBPFPackage.Remove`).
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented (S4S-private format).
**Unknowns:** none within S4S's own usage.

### Subset views have a FindKey/FindEntry inconsistency
**Claim:** `DBPFPackageSubset` wraps a basis package plus a
`MergedPackageItem` filter exposing only the listed keys; `FindKey` searches
only the subset while `FindEntry` falls through to the whole basis package;
its `Save` pushes all loaded resources back to the basis and defragments it.
**Evidence — S4S implementation:** `Data/IO/Package/DBPFPackageSubset.cs`.
**Observed behavior:** Key-vs-entry resolution diverges between the two
lookup paths — worth knowing before relying on subset isolation.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none material.

### SQLite-backed entry storage exists but is dead code
**Claim:** `SQLitePackageEntryStorage` keeps the index in an in-memory SQLite
database (`:memory:`) with columns Id (PK autoincrement), Instance (signed
i64, cast back to ulong on use), Type, Group, Offset, Size, SizeDecompressed,
Committed, CompressionType (u16), plus six indexes including a unique TGI
index — but it is never instantiated anywhere in the decompiled source
(DBPFPackage defaults to `ListPackageEntryStorage`; grep finds only the
definition).
**Evidence — S4S implementation:** `Data/IO/Package/SQLitePackageEntryStorage.cs`;
`ListPackageEntryStorage.cs`; `IPackageEntryStorage.cs`.
**Observed behavior:** Likely dead/experimental code in this build.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** why it exists (experimental?).

---

## Verification summary vs public docs

| Claim | Public-doc status | S4S verdict |
|---|---|---|
| Header 96 bytes, field order/offsets | verified spec (dbpf-2.1.md) | CONFIRMED exactly |
| Minor version = 1 | verified spec (with Kuree-wiki dissent) | writes 1 on new packages, never validates |
| Index at 0x40, fallback to 0x28 | verified spec (s4pi) | PARTIAL CONTRADICTION — uses only 0x40 |
| Flags 0x01/0x02/0x04 constants | verified spec | CONFIRMED exactly |
| Flag 0x80 (compressed-word-from-header) | dubious / not yet verified | CONTRADICTED — no such bit exists in S4S |
| Filesize high bit = extended entry | verified spec | CONFIRMED; S4S also always sets it on write |
| Extended bit always set by real writers | community-observed | CONFIRMED by S4S's writer |
| Committed = 0x0001 always | community-observed | CONFIRMED (default 1, never interpreted) |
| Unused4/index-version = 3 | community-observed | CONFIRMED as default; opaque, unvalidated |
| Compression codes 0x0000/0x5A42/0xFFE0/0xFFFE/0xFFFF | verified spec | CONFIRMED values; 0xFFFE defined but unreadable |
| 0xFFFF = internal custom compression | verified spec | CONFIRMED: EA RefPack via Gibbed |
| RefPack data under 0xFFFF | community-observed | CONFIRMED (plus suspicious zlib-sniff hack) |
| NameMap 0x0166038C, v1, QWORD+length-prefixed strings | TS4MR/SimsWiki | CONFIRMED; but decoded as ASCII, not UTF-8 |
