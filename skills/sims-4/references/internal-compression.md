# Internal Compression of Sims 4 Package (DBPF) Resources

Reference for the Sims 4 (.package / DBPF) only. Facts below were verified
against the s4pi source code ([s4ptacle/Sims4Tools]), the @s4tk/compression
library ([sims4toolkit/compression]), and The Sims 4 Modders Reference.
Sims 2/3/Spore facts are called out explicitly and must not be assumed to
apply to Sims 4.

## Where compression is recorded: the resource index entry

Each resource in a DBPF has an index entry containing both a compressed size
and a decompressed size. Verified from s4pi's `ResourceIndexEntry.cs`
(field offsets are into s4pi's normalized index-entry byte array) [s4pi-RIE]:

| Offset | Size | Field | Meaning |
|---|---|---|---|
| 0x00 | 4 | *(index type)* | Bitfield controlling which fields live in the shared index header vs per-entry |
| 0x04 | 4 | ResourceType | Type ID (`UInt32`) |
| 0x08 | 4 | ResourceGroup | Group ID (`UInt32`) |
| 0x0C | 8 | Instance | `InstanceHi` + `InstanceLo` (`UInt64`) |
| 0x14 | 4 | Chunkoffset | Absolute location of the resource data in the package |
| 0x18 | 4 | Filesize | Compressed/on-disk size; **low 31 bits** — high bit is used as a flag [s4pi-RIE] |
| 0x1C | 4 | Memsize | Decompressed size in bytes ("the number of bytes the resource uses in memory") [s4pi-RIE] |
| 0x20 | 2 | Compressed | Compression code, see table below (`UInt16`) [s4pi-RIE] |
| 0x22 | 2 | Unknown2 | s4pi documents this as "Always 0x0001" [s4pi-RIE] |

So the decompressed size is *not* stored inside the compressed payload itself
(for zlib resources); it comes from the index entry's `Memsize` field.
Exception: RefPack-style payloads embed their own big-endian uncompressed-size
field in their header — see below.

Note on scope: the same index-entry layout (Filesize low-31-bits + flag,
Memsize, Compressed word, Unknown2 word) is also documented for **Sims 3**
DBPF at [SimsWiki Sims_3:DBPF]; that page was written based on the Spore
package format. For Sims 4, the layout above is verified directly from the
s4pi library, which reads and writes Sims 4 packages.

## Compression identifier codes (index `Compressed` field)

The `Compressed` field is a `UInt16`. Verified values, from the
`CompressionType` enum in @s4tk/compression [s4tk-type] and s4pi's doc
comment [s4pi-RIE]:

| Code | Name (@s4tk) | Meaning |
|---|---|---|
| `0x0000` | Uncompressed | Resource data is stored as-is |
| `0xFFE0` | DeletedRecord | Listed by @s4tk; not decompressed (returned as-is) [s4tk-decompress] |
| `0xFFFE` | StreamableCompresssion *(sic)* | Listed by @s4tk; **no implementation** — @s4tk throws "not supported" if asked to compress/decompress it [s4tk-decompress] |
| `0xFFFF` | InternalCompression | The custom EA "RefPack"-style stream format, handled by a bespoke decompressor [s4tk-decompress] |
| `0x5A42` | ZLIB | Standard zlib/DEFLATE stream. s4pi's doc comment: "0x0000 if not compressed, should be 0x5A42 if compressed"; s4pe writes `0x5A42` when the user ticks "compressed" [s4pi-RIE] [s4pe-MainForm] |

Caveat: `0xFFFE` and `0xFFE0` appear only as named enum entries in @s4tk with
no functional handling. Whether Maxis ever writes these codes into Sims 4
package indexes is **not yet verified** from primary sources.

## Detecting the algorithm from the payload itself

Because the two implemented formats are distinguishable at the start of the
resource data, tools sniff the first bytes. Verified logic from s4pi
`Compression.UncompressStream` [s4pi-compression]:

- If the **first byte is `0x78`** → treat the whole blob (including those 2
  header bytes) as a zlib stream and inflate it to `Memsize` bytes. (`0x78`
  is the conventional zlib header CMF byte; s4pi inflates with SharpZipLib's
  `InflaterInputStream`.)
- Else if the **second byte is `0xFB`** → RefPack-style internal compression;
  the first byte is a format/type byte consumed by the RefPack decompressor.
- Anything else → s4pi throws `"Unrecognized compression format"`.

@s4tk does not sniff; callers pass the `CompressionType` from the index entry,
and its internal compressor produces plain zlib via Node's `deflateSync`
[s4tk-compress].

## RefPack-style ("internal") payload layout

Verified from three independent implementations:

### Header / embedded decompressed size

- s4pi `OldDecompress(Stream, byte compressionType)` [s4pi-compression]:
  - Reads a **big-endian 3-byte** size when `compressionType != 0x80`, or a
    **big-endian 4-byte** size otherwise, immediately after the 2 header
    bytes. That integer is the expected decompressed length; s4pi allocates
    that many bytes.
- @s4tk `internalDecompression` [s4tk-decompress]:
  - `decompressedSize = readUInt24BE(data, 2)` — i.e., a 3-byte big-endian
    size at offset 2.
  - Payload blocks begin at offset **5** (2 flag bytes + 3 size bytes), or
    offset **6** if bit `0x80` of byte 0 is set (the extended 4-byte size).
- Fogity's format description at the TS4 Modders Reference agrees: the header
  carries a size bit plus either a 12-bit or 16-bit(extended) uncompressed
  size, big-endian, MSB-first [fogity].

So: `[type byte][0xFB][3-byte BE size]` normally, or
`[type byte][0xFB][size hi][4-byte BE size]` when the type byte has bit `0x80`
set.

### Block/control codes

All sources agree on the control-code ranges (first byte of each block,
big-endian bit order). From s4pi's decoder [s4pi-compression], matching
@s4tk [s4tk-decompress] and Fogity's spec [fogity]:

| Control byte range | Block meaning |
|---|---|
| `0x00–0x7F` | Small block: 2-bit literal count, 3-bit copy count (+3), packed copy offset (+1); literal bytes then back-reference copy |
| `0x80–0xBF` | Medium block: copy count = low 6 bits (+4); next byte splits into 2-bit literal count and 8 offset bits + following byte (+1) |
| `0xC0–0xDF` | Large block: 3-byte form, copy count ≥ 5, wider offset; literals then copy |
| `0xE0–0xFB` | Large literal run: `(byte & 0x1F) * 4 + 4` raw bytes copied |
| `0xFC–0xFF` | End/literal tail: up to `byte & 0x03` raw bytes; decoding stops once a control byte ≥ `0xFC` is consumed [s4tk-decompress] |

Fogity's independent write-up describes the same structure as BLOCK A/B/C/D
plus an END BLOCK identified by bits `0b11111`, and notes copies may overlap
the bytes just written (run-length behavior), so decompressors must copy byte
by byte [fogity].

Fogity additionally notes this format "is used by Maxis for string table
resources, as it is optimised for text" [fogity].

## Which format Maxis uses

- Both formats exist in shipped Sims 4 content: s4pi handles zlib (`0x78…`)
  and RefPack (`??FB…`) payloads, and s4pe's UI lets users compress any
  resource, writing `0x5A42` (zlib) into the index [s4pi-compression]
  [s4pe-MainForm].
- The exact distribution of algorithms across resource types in current game
  packages (e.g., whether STBLs specifically ship RefPack-compressed today)
  is **not yet verified** from fetched sources.

## Explicitly NOT verified for Sims 4

- A list of specific RefPack type bytes (e.g., which exact first-byte values
  occur in TS4 packages). SimsWiki documents such codes for **Sims 3/Spore**
  (see Sims_3:DBPF/Compression); do not reuse them here without checking a
  TS4 package.
- Any fourth compression family beyond zlib and RefPack-style.
- Semantics of `Unknown2 = 0x0001`.

## Sources

- [s4pi-compression]: https://github.com/s4ptacle/Sims4Tools/blob/develop/s4pi/Package/Compression.cs
- [s4pi-RIE]: https://github.com/s4ptacle/Sims4Tools/blob/develop/s4pi/Package/ResourceIndexEntry.cs
- [s4pe-MainForm]: https://github.com/s4ptacle/Sims4Tools/blob/develop/s4pe/MainForm.cs (writes `rie.Compressed = 0x5A42`)
- [s4tk-type]: https://github.com/sims4toolkit/compression/blob/main/src/compression-type.ts
- [s4tk-decompress]: https://github.com/sims4toolkit/compression/blob/main/src/decompress.ts
- [s4tk-compress]: https://github.com/sims4toolkit/compression/blob/main/src/compress.ts
- [fogity]: https://thesims4moddersreference.org/reference/internal-compression-dbpf/
- [SimsWiki Sims_3:DBPF]: http://simswiki.info/wiki.php?title=Sims_3:DBPF (Sims 3 context only)
