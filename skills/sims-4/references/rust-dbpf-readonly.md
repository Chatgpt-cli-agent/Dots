# Implementing a Read-Only Sims 4 DBPF Parser in Rust

Guidance for a safe, auditable, read-only parser. **No format facts are
repeated here** — the container layout lives in `dbpf-2.1.md`. This file is
about Rust technique.

## Scope discipline

- Read-only means: open files without write permissions, never create modified
  copies unless asked, never decompress or decode resources beyond the agreed
  phase (skill rule: "implement only X" ⇒ do only X).
- Preserve index entry order as stored; do not sort, dedupe, or canonicalize
  on read.
- Keep raw field values available alongside interpreted ones.

## Crates (verified to exist)

| Crate | Version verified | Role | Link |
| --- | --- | --- | --- |
| `byteorder` | 1.5.0 (docs.rs, fetched 2026-08) | Little-endian integer reads via `ReadBytesExt` (`read_u32::<LittleEndian>()` etc.) | [docs.rs/byteorder](https://docs.rs/byteorder/latest/byteorder/) |
| `nom` | 8.0.0 (docs.rs, fetched 2026-08) | Parser combinators if you prefer declarative parsing; zero-copy over byte slices | [docs.rs/nom](https://docs.rs/nom/latest/nom/) |

Note from the [byteorder docs](https://docs.rs/byteorder/latest/byteorder/):
since Rust 1.32, std methods like `u32::from_le_bytes` cover many of the same
use cases — for a small fixed-layout header, plain `from_le_bytes` on slices
is often clearer than any dependency.

## Recommended approach: plain byte slices

For a 96-byte header plus an index of known-width fields, prefer explicit
slice reads:

```rust
fn read_u16_le(b: &[u8], off: usize) -> Result<u16, ParseError> {
    let end = off.checked_add(2).ok_or(ParseError::Overflow { offset: off })?;
    if end > b.len() {
        return Err(ParseError::UnexpectedEof { offset: off, needed: 2, have: b.len() });
    }
    Ok(u16::from_le_bytes(b[off..end].try_into().unwrap()))
}
```

Every read goes through bounds-checked helpers like this; nothing indexes
unchecked. Use `nom` instead when the grammar is irregular enough that manual
offsets become error-prone — its complete-mode parsers return
`Err(Err::Error(...))` on short input rather than panicking
([nom docs](https://docs.rs/nom/latest/nom/)).

## Checked arithmetic and u64→usize conversion

DBPF offsets/sizes are wider than `usize` can be on 32-bit targets, and file
sizes exceed what you want to slice blindly:

1. Model offsets and lengths as `u64` during validation (skill coding posture).
2. Validate before converting:
   ```rust
   fn to_usize(v: u64) -> Result<usize, ParseError> {
       usize::try_from(v).map_err(|_| ParseError::OffsetTooLarge { value: v })
   }
   ```
3. Range-check against the real data length *after* conversion:
   ```rust
   let start = to_usize(offset)?;
   let len = to_usize(length)?;
   let end = start.checked_add(len).ok_or(ParseError::Overflow { offset: start })?;
   if end > data.len() {
       return Err(ParseError::RangeOutOfBounds { start, end, file_len: data.len() });
   }
   ```
4. Cap derived allocations (entry counts × entry size) at a sane maximum so a
   corrupt count cannot drive a huge allocation.

## Error types

One concrete enum, `thiserror`-style, carrying offsets:

```rust
#[derive(Debug)]
pub enum ParseError {
    BadMagic { expected: [u8; 4], got: [u8; 4] },
    UnsupportedVersion { got: u32 },
    UnexpectedEof { offset: usize, needed: usize, have: usize },
    RangeOutOfBounds { start: usize, end: usize, file_len: usize },
    OffsetTooLarge { value: u64 },
    Overflow { offset: usize },
}
```

Mirror s4pi's error style: report expected vs actual values and position
(e.g., STBL's `"Expected magic tag ...; read ...; position ..."`) — see
[StblResource.cs](https://github.com/s4ptacle/Sims4Tools/blob/fff19365/s4pi%20Wrappers/StblResource/StblResource.cs).

## No unsafe

Nothing here needs `unsafe`. Bounds-checked slicing, `try_into()` for
fixed-size arrays, and `from_le_bytes` cover everything. If you feel the urge
to reinterpret bytes with pointer casts, you are doing it wrong.

## Entry handling

- Return entries as a `Vec` in file order (preserve package order — skill rule).
- Each entry keeps its full Type + Group + Instance bits; never truncate the
  64-bit instance to pointer width during storage.
- Expose compression metadata verbatim even if this phase doesn't decompress.

## Key formatting helper

Fixed-width uppercase hex with dashes, per skill convention
`TTTTTTTT-GGGGGGGG-IIIIIIIIIIIIIIII`:

```rust
pub fn format_tgi(t: u32, g: u32, i: u64) -> String {
    format!("{t:08X}-{g:08X}-{i:016X}")
}
```

(`{:08X}` pads with zeros to fixed width and uppercases; no runtime cost
beyond allocation.)

## Testing checklist

- Fixture bytes: one minimal valid package, plus malformed variants
  (bad magic, wrong version, index past EOF, entry count that overflows
  `count * size`, truncated final entry).
- Assert errors carry offsets and don't panic — fuzz-lite by feeding random
  truncations of the valid fixture through the parser.
