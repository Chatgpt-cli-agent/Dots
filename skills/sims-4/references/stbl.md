# STBL — String Table Resource Format

Cross-verified against two independent sources:

1. [TS4 Modders Reference: "String Table File (STBL) format"](https://thesims4moddersreference.org/reference/stbl-format/) (spec by Fogity)
2. s4pi `StblResource` wrapper source ([s4ptacle/Sims4Tools, `s4pi Wrappers/StblResource/StblResource.cs`](https://github.com/s4ptacle/Sims4Tools/blob/fff19365/s4pi%20Wrappers/StblResource/StblResource.cs))

Both sources agree on every field below. All integers are **little-endian**.

## Resource type

- String Table resources have resource Type `0x220557DA`.
  - s4pi registers its wrapper for `"0x220557DA"` (source above).
  - The TS4 Modders Reference resource index lists `220557DA` as "String Table"
    ([Resource Type Index](https://thesims4moddersreference.org/reference/resource-types/)).

## Layout (Verified)

```
HEADER
  byte[4]   magic "STBL"            (s4pi checks FOURCC("STBL"))
  uint16    version = 5             (s4pi throws unless version == 0x05)
  byte      isCompressed            ("compressed"; unused by Maxis and modders per Modders Reference)
  uint64    numEntries              string count
  byte[2]   reserved / unknown      (s4pi reads 2 bytes it does not interpret)
  uint32    stringLength            total string size if null terminated
                                    (informational; entries carry their own lengths)

ENTRY[numEntries]
  uint32    keyHash                 the FNV-style string key hash (see caveat)
  byte      flags                   observed as 0; unused by Maxis and modders
  uint16    length                  string byte size
  byte[len] data                    UTF-8 encoded, NOT null terminated
```

Key points:

- **Encoding is UTF-8**, not UTF-16. s4pi decodes with `Encoding.UTF8` and
  re-encodes with UTF-8 on write; the Modders Reference states "UTF-8 (not
  null terminated)".
- Strings are **length-prefixed** with a `uint16` byte count; there is no
  terminator and no alignment padding between entries.
- The header's `stringLength` field is a convenience checksum of sorts; s4pe
  releases note that STBL resources with *incorrect length information* exist
  in the wild, so parsers must not rely on it
  ([Sims4Tools release notes, 0.4.3](https://github.com/s4ptacle/Sims4Tools/releases/tag/0.4.3-release)).
- Entry order in the file should be preserved when reading/writing.

## Caveats / not yet verified

- The exact hash algorithm producing `keyHash` (commonly believed to be an
  FNV-1 variant over the lowercased string) is **not yet verified** from a
  primary source here; do not hardcode an algorithm without checking bytes.
- Behavior of non-zero `flags` values: not yet verified.
- Whether any game build ever used a version other than 5: s4pi rejects all
  versions except 5 when "checking" is enabled; no other version has been
  verified.
