# Texture Formats (RLES / RLE2 / LRLE / DST / DDS) — claim-based reference

Conversion of `../s4s-textures-rles.md`. All evidence from the decompiled S4S
source at `/mnt/Sims-SSD-2/S4S-SourceCode/S4Studio/` (paths relative to
`S4Studio/`). Public-reference docs consulted:
`references/resource-types.md` (type IDs). Source folders studied:

- `S4Studio/Data/IO/Images/` — AlphaImageResource, ApartmentThumbnail1/2,
  BlueprintImageResource, BuyBuildThumbnailResource, CachedAvatar,
  CASPartThumbnail, CASPresetThumbnail, CatalogThumbnail, DDSImageResource,
  DeformerMapResource, DSTImageResource, DSTUtility, ExchangePartThumbnail,
  IImagePreview, ITexturePreview, LotPreviewThumbnail, MemorialThumbnail,
  PeltPresetThumbnail, PetFacePresetThumbnail, Physiques, PNGImageResource,
  RLE2ImageResource, RLESImageResource, RobeChannel, RoomThumbnail,
  SaveGameCustomTexture, SaveGameHouseholdThumbnail,
  SaveGameLotLevelThumbnail(+Mask), SaveGameLotThumbnail1/2, SaveThumbnail3,
  ShapeOrNormals, SimBustThumbnailResource, SimFeaturedOutfitThumbnail,
  SimGalleryImageResource, SimHouseholdThumbnailResource,
  SimMannequinOutfitThumbnail, SimOutfitThumbnail,
  SimPortraitThumbnailResource, SimPresetThumbnail, Sims4Image,
  SimThumbnailID, SimThumbnailResource, SimTravelThumbnailResource,
  TGAImageResource, ThumbnailCacheResource, ThumbnailCacheTableEntry,
  ThumbnailModel, ThumbnailSize, ThumbnailType, WorldmapLotThumbnail
- `LRLE/LRLEUtility.cs`
- `Gibbed/Sims4/TextureCompress/` — FourCC.cs, MipHeader.cs,
  RLEErrorCode.cs, RLEImageException.cs, RLEUtilities.cs
- `S4Studio/Images/` — JNGCompress.cs, RLE.cs, WindowsBitmap.cs,
  WindowsBitmapExtensions.cs, WindowsTextureCompress.cs (+ CAS-specific:
  CASPartRegion.cs, RegionMap.cs, VertexDeclaration*.cs etc.)

---

### Image resource type IDs
**Claim:** The image family's type IDs are: RLES 3129306232u, RLE2 877907861u,
LRLE 734023391u (`S4Studio.Shared.LRLEImageResource`), plain DDS 3066607264u,
DST 11720834u, PNG 796721156u, TGA 796721158u; all inherit `Sims4Image :
BasicResource`, and the extension mapping is built by reflection over every
concrete Sims4Image subclass's static Type field. PNG shares 796721156 with
`DSTImageResource.TuningType`, and TGA shares 796721158 with
`DSTImageResource.TuningType2` — resolution order for that collision is not
yet verified.
**Evidence — S4S implementation:** `Data/IO/Images/RLESImageResource.cs:10`;
`RLE2ImageResource.cs:12`; `Shared/LRLEImageResource.cs:18`;
`DDSImageResource.cs:5`; `DSTImageResource.cs:14-17`; `PNGImageResource.cs:5`;
`TGAImageResource.cs:5`; `Data/IO/Images/Sims4Image.cs:66-78`.
**Observed behavior:** Reflection-driven registration means any subclass is
automatically loadable by type ID.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md independently
confirms RLE2 = 0x3453CF95 (=877907861 ✓), RLES = 0xBA856C78 (=3129306232 ✓),
LRLE = 0x2BC04EDF (=734023391 ✓), _IMG DDS = 0x00B2D882 (=11720834? no —
0x00B2D882 = 11720834 ✓ matches DST here; note community docs call this
"_IMG DDS image (DST format variants)" which aligns with DST being the
accessory/thumbnail flavor).
**Unknowns:** TGA/DST-tuning type-ID collision resolution.

### FourCC magic values
**Claim:** The texture-compression FourCC constants (read as little-endian
u32) are: "DXT5" = 894720068u, "RLE " = 541412434u, "RLE2" = 843402322u,
"RLES" = 1397050450u, "L8, " = 538982476u; DDS file magic "DDS " =
542327876u; LRLE container magic "LRLE" = 1162629708u.
**Evidence — S4S implementation:** `Gibbed/Sims4/TextureCompress/FourCC.cs:3-9`;
magic guards in `Gibbed/Sims4/TextureCompress/RLEUtilities.cs`
(e.g. ImportToRLES); `LRLE/LRLEUtility.cs` (`Writer.Write`, `const uint LRLE`).
**Observed behavior:** All import paths check these before parsing.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### RLES header and per-mip table
**Claim:** RLES layout (little-endian): FourCC 894720068 ("DXT5" — yes, RLES
reuses the DXT5 tag), version FourCC 1397050450 ("RLES"), u16 Width, u16
Height, u16 MipCount, u16 Reserved (must be 0), then mipCount × 24-byte
per-mip headers (data begins at 16 + 24*mipCount); each per-mip header is six
int32s in order CommandOffset, Offset2, Offset3, Offset0, Offset1, Offset4
(struct in MipHeader.cs:3-11), with a synthetic entry after the last mip
using end-of-file as its final bound.
**Evidence — S4S implementation:** encode/decode in
`Gibbed/Sims4/TextureCompress/RLEUtilities.cs` (`ExportFromRLES`,
`ImportToRLES`); wrapper `Data/IO/Images/RLESImageResource.cs`.
**Observed behavior:** Wrapper exports as `.dds` plus a separate `.png` mask
(`HasMask => true`).
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — resource-types.md describes RLES as
"CAS specular maps etc." DXT5 image without byte detail.
**Unknowns:** semantic names of Offset2/Offset3 vs Offset0/Offset1 ordering.

### RLES five-stream planar block data
**Claim:** Per mip there are five data streams besides commands: color-a (2
bytes/block), color-b (6 bytes/block), c0 (4 bytes/block), c1 (4
bytes/block), and a mask stream (Offset4) holding 16 mask bytes per block;
the importer writes block[0..2], block[2..8], block[8..12], block[12..16],
and a 16-byte alpha/mask entry into the respective streams.
**Evidence — S4S implementation:** `RLEUtilities.ImportToRLES`
(memoryStream assignments as described).
**Observed behavior:** Planar layout reconstructed on export into DXT5 blocks.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none beyond stream naming.

### RLES command stream opcodes
**Claim:** Each command is a uint16, low 2 bits = opcode, upper 14 bits =
repeat count (max 16383): opcode 0 emits count fully-transparent fixed DXT
blocks `{00 05 00...}`; opcode 1 pulls per block 2+6 endpoint bytes, 4+4
index bytes, and 16 mask-stream bytes (non-trivial mask); opcode 2 pulls 2+6
endpoint bytes and 4+4 index bytes with alpha implied 255 (opaque). Blocks
are 4×4 pixels, DXT5-style (decoder writes 16-byte DXT5 blocks into a DDS
output with FourCC = DXT5). The mask stream is reconstructed from DXT5
alpha-index lookups (UnpackAlpha interpolation table) into a grayscale PNG via
RLE.WriteMask.
**Evidence — S4S implementation:** decode side of `ExportFromRLES`,
`UnpackAlpha`, `RLE.WriteMask` in
`Gibbed/Sims4/TextureCompress/RLEUtilities.cs` and `S4Studio/Images/RLE.cs`.
**Observed behavior:** Encoder splits counts > 16383 blocks across multiple
commands.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### RLES import constraints
**Claim:** Import requires a DDS with FourCC-format DXT5 (else NotDXT5),
mipmaps present (NoMipMaps), mipCount ≤ 16, dimensions ≤ 65535, power-of-two
width, and height either width×2 or width÷2 (InvalidSize) — i.e. CAS texture
aspect ratios; error codes are NotDDS, NotDXT5, NoMipMaps, InvalidSize,
BadPixelFormat, RequiresUncompressed.
**Evidence — S4S implementation:** `RLEUtilities.ImportToRLES`;
`Gibbed/Sims4/TextureCompress/RLEErrorCode.cs:3-10`.
**Observed behavior:** Enforced on all Import functions.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** whether the game accepts non-conforming textures.

### RLE2 format
**Claim:** RLE2 is the same family without a mask stream: header FourCC
894720068 + version 843402322 ("RLE2"), u16 width, u16 height, u16 mipCount,
u16 reserved=0; per-mip header is **five** int32s (CommandOffset, Offset2,
Offset3, Offset0, Offset1) so data starts at 16 + 20*mipCount; same three
opcodes but only two data streams besides commands (endpoints 2+6 bytes,
indices 4+4 bytes).
**Evidence — S4S implementation:** `ExportFromRLE2` / `ImportToRLE2` in
`Gibbed/Sims4/TextureCompress/RLEUtilities.cs`.
**Observed behavior:** resource-types.md identifies RLE2 as the main CAS
texture/diffuse format.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Yes for role/type ID; None documented for
byte layout.
**Unknowns:** none flagged.

### L8 luminance variant of RLE2
**Claim:** A luminance variant exists with FourCC 538982476 ("L8, ") storing
4×4 8-bit luminance blocks (16 bytes/block) under the same opcode scheme where
opcode 2 means white blocks.
**Evidence — S4S implementation:** `ExportL8FromRLE2` / `ImportL8ToRLE2` in
`RLEUtilities.cs`.
**Observed behavior:** Same header/mip structure as RLE2 otherwise.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** which game resources use L8.

### RLE2↔DDS transparent conversion
**Claim:** ConvertDDS auto-detects RLE2/L8-vs-DDS by magic pair and converts
either way; RLE2ImageResource's DDS getter/setter call it transparently, so
stored Data is RLE2 while exposed RawImageData is plain DDS; an RLE2
resource's DisplayName is its first 4 ASCII bytes.
**Evidence — S4S implementation:** `RLEUtilities.ConvertDDS`;
`Data/IO/Images/RLE2ImageResource.cs:17-35,60`.
**Observed behavior:** Callers never handle RLE2 bytes directly.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none.

### LRLE container layout
**Claim:** LRLE container: magic 1162629708 ("LRLE"), format ID u32 (0 =
Codec0000 Default; 842018902u = "V002" palette codec, enum LRLEFormat),
Width int16, Height int16, MipCount int32, then mipCount × uint32 relative
mip offsets measured from end of that table, then codec data (V002: int32
palette length + palette int32s via CodecV002.BeginRead/BeginWrite). Pixel
data is ARGB int32 scanlines reordered from Morton-like 4×4 block order via
BlockIndexToScanlineIndex.
**Evidence — S4S implementation:** `LRLE/LRLEUtility.cs` (`Writer.Write`,
`Reader.Init`, bottom-of-file block-order helper); wrapper
`S4Studio/Shared/LRLEImageResource.cs` (type 734023391u, extension `.lrle`).
**Observed behavior:** resource-types.md calls LRLE "lossless-ish CAS
swatch/texture format used by newer CC tooling".
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial — type ID confirmed; byte layout
undocumented publicly.
**Unknowns:** whether Morton ordering description exactly matches EA's
intent.

### Codec0000 opcodes
**Claim:** Codec0000 reads one byte b whose low 2 bits select: 0 = packed-int
skip/count → advance N empty pixels; 1 = inline pixel run → (b>>2) raw ARGB
int32s follow; 2 = repeat run → packed int count followed by one ARGB int32
repeated; 3 = channel-split sequence → (b>>2) pixels coded per-channel (A,R,G,B
planes), each plane itself RLE-coded with sub-runs (literal bytes /
byte-repeat / zero-skip flags), interleaved back to ARGB on decode. All
counts use 7-bit varints (ReadPackedInt / WritePackedInt, flag bits embedded
at startBit).
**Evidence — S4S implementation:** `Codec0000.Read` in
`LRLE/LRLEUtility.cs`.
**Observed behavior:** See above.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### CodecV002 palette codec with silent fallback
**Claim:** CodecV002 is palette-based (up to 65535 colors via
PaletteBuilder(65535, 20) — bucket size 20): bit0=0 → repeat run, count =
value>>3, mode bits 1-2 choose color source (palette index byte=1, palette
index ushort=2, or inline ARGB int32=3); bit0=1 → sequence, count = value>>2,
mode bits 1-2 choose palette-index varints (0) or inline ARGB int32s (1);
commands are varint-first. If the palette fills up during mip 1 processing
the writer silently falls back to Codec0000 for the whole image (Writer.
AddMip: if ProcessMip fails and codec is CodecV002 → new Codec0000()).
**Evidence — S4S implementation:** `CodecV002.BeginRead/BeginWrite`,
`PaletteBuilder`, `Writer.AddMip` in `LRLE/LRLEUtility.cs`.
**Observed behavior:** Fallback is invisible to callers.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** none flagged.

### LRLE wrapper behavior
**Claim:** LRLEImageResource's RawImageData getter exports to DDS with mip
level capped (e.g. ExportFromLRLE(Data, 20) / single-mip for preview); the
import path requires a "DDS " input (ImportToLRLE); RequiresAlpha => true. A
batch command converting packages' RLE2 textures to LRLE exists
(ConvertRLE2ToLRLETexturesCommand) with internals not yet verified.
**Evidence — S4S implementation:** `S4Studio/Shared/LRLEImageResource.cs:18-63`;
`S4Studio/Shared/Common/ConvertRLE2ToLRLETexturesCommand.cs`.
**Observed behavior:** LRLE reads/writes round-trip through plain DDS at the
API surface.
**Confidence:** Implementation-verified (wrapper); Hypothesis-level detail
untraced for the batch command.
**Public-reference agreement:** None documented.
**Unknowns:** batch-command internals.

### DDS handling facade
**Claim:** Plain DDSImageResource stores raw .dds bytes verbatim, decoding
through TC.DDS.DecompressImage; compression goes through the same TC facade
(ImportToRLES(IBitmap, …) calls TC.DDS.CompressImage(bmp, requiresAlpha:
true)); DDS headers parse via Gibbed.Sims4.TextureFormats.DDS.Header using
fields Size, Flags, PitchOrLinearSize, Width, Height, Depth, MipMapCount,
PixelFormat{Size, Flags, FourCC, RGBBitCount, bitmask fields}, SurfaceFlags.
The TC facade implementation (TC.CreateImage(), TC.DDS) is not yet verified
here.
**Evidence — S4S implementation:** `Data/IO/Images/DDSImageResource.cs:22-25`;
usage throughout `RLEUtilities.cs`.
**Observed behavior:** One imaging abstraction backs all formats.
**Confidence:** Implementation-verified (usage); Hypothesis (facade
internals untraced).
**Public-reference agreement:** Partial — standard DDS header structure is
public knowledge; the TC facade is S4S-private.
**Unknowns:** TC facade backend.

### RLES is the CAS texture-with-mask format feeding swatch compositing
**Claim:** Reading an RLES produces both the DDS and a separate PNG mask
(MaskExtension => "png"); masks feed swatch region compositing.
**Evidence — S4S implementation:** `RLESImageResource.Read`;
`S4Studio/Images/RLE.ExtractAlphaMipMaps` generates per-mip alpha-block
dictionaries used when encoding RLES mask streams (`S4Studio/Images/RLE.cs:5-27`).
**Observed behavior:** Used for CAS specular/mask textures.
**Confidence:** Implementation-verified.
**Public-reference agreement:** Partial (role documented in resource-types.md;
mechanism not).
**Unknowns:** none flagged.

### Endianness flexibility of the RLE family
**Claim:** All RLE-family files may be big-endian: converters accept either
endian by checking swapped magics (num.Swap() branches in ConvertDDS and
Export functions).
**Evidence — S4S implementation:** `Gibbed/Sims4/TextureCompress/RLEUtilities.cs`.
**Observed behavior:** Both byte orders decode.
**Confidence:** Implementation-verified.
**Public-reference agreement:** None documented.
**Unknowns:** which endian Maxis actually writes.

### Thumbnail resource layouts unverified
**Claim:** Thumbnail resources (CASPartThumbnail, SimOutfitThumbnail,
ThumbnailCache*, etc.) exist in `Data/IO/Images/` but their internal layouts
are not yet verified.
**Evidence — S4S implementation:** class inventory only.
**Observed behavior:** Present, unanalyzed.
**Confidence:** Hypothesis (existence verified, contents not).
**Public-reference agreement:** Partial — THUM 0x3C1AF1F2 listed in
resource-types.md as CAS Part Thumbnail (PNG).
**Unknowns:** all thumbnail binary layouts.

### DST format
**Claim:** The DST payload is a DDS-like blob with a 4-byte prefix before the
DDS Header (GetHeader skips 4 bytes then deserializes); on write
DSTUtility.Swizzle(Data, shouldSwizzle: true) reorders the data and on read
swizzles back (false); swizzle details live in DSTUtility.cs and are not yet
verified line-by-line. DST type 11720834 is what marks a CASP as an accessory
(IsAccessory) and is the thumbnail type assigned to variant thumbs.
**Evidence — S4S implementation:** `Data/IO/Images/DSTImageResource.cs:13-100`;
`Data/IO/Images/DSTUtility.cs`; cross-ref
`Data/IO/CAS/CASPartResource.IsAccessory`.
**Observed behavior:** DST wraps standard DDS headers behind a prefix +
swizzle.
**Confidence:** Implementation-verified (structure); Hypothesis (swizzle
algorithm details).
**Public-reference agreement:** Partial — resource-types.md's "_IMG DDS
image (DST format variants…)" entry corresponds to this type ID; mechanics
undocumented publicly.
**Unknowns:** exact swizzle permutation.
