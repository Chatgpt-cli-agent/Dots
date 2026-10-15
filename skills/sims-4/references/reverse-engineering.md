# Reverse-Engineering Unknown Sims 4 Binary Formats

This is a methodology guide, not a format spec. It contains few hard facts by
design; the facts it does state are cited. Follow the skill's confidence
labels: **verified**, **community-observed**, **hypothesis**.

## 0. Ground rules

- Never decide file identity from the extension alone; check magic bytes and
  container structure first (skill rule; consistent with s4pi, which validates
  magic tags on parse — see e.g. the STBL wrapper's `Expected magic tag`
  exception in [StblResource.cs](https://github.com/s4ptacle/Sims4Tools/blob/fff19365/s4pi%20Wrappers/StblResource/StblResource.cs)).
- Work on copies. Inspection is read-only unless writing is explicitly requested.
- Record every finding with a confidence label and the evidence that earned it.

## 1. Identify the container before the payload

1. Check whether the blob sits inside a DBPF package (see `dbpf-2.1.md`) or is
   a standalone container (`.world`, Tray files are DBPF-derived per the
   [TS4 Modders Reference File Types page](https://thesims4moddersreference.org/reference/file-types/)).
2. For resources inside a package, the index entry gives Type/Group/Instance
   for free — use the Type ID to look for an existing name in a curated index
   ([TS4 Modders Reference Resource Type Index](https://thesims4moddersreference.org/reference/resource-types/))
   and an existing wrapper in
   [s4ptacle/Sims4Tools](https://github.com/s4ptacle/Sims4Tools) (s4pi's
   `WrapperDealer` resolves wrappers by type code).
3. Hex-inspect the first 64–128 bytes: look for a FOURCC tag, plausible
   version fields (`0x0005`, small incrementing u16/u32), counts, then offsets.
   Hypothesize field roles only after counting sizes against file length.

## 2. Difference testing with controlled samples (primary technique)

The most reliable way to map fields:

1. Obtain two files identical except for one known in-game change (e.g., same
   object cloned twice with only the price edited).
2. Byte-diff them ([WinMerge](https://thesims4moddersreference.org/tutorials/compare-files-winmerge/)
   is the community-standard tool for this — see the Modders Reference
   tutorial). Bytes that move are candidates for encoding that property.
3. Repeat with several controlled changes to separate value fields from
   hashes, lengths, and padding. A field whose value tracks your edit *and*
   changes length predictably is likely a length-prefixed datum, not a hash.
4. Watch for derived fields: checksums, size totals, and string tables update
   when content changes even if they encode nothing user-visible.

## 3. Cross-reference known implementations

Before inventing structure, read how mature tools parse the type:

- **s4pi/Sims4Tools** wrappers are the reference C# implementations; the
  project states a wrapper "should be as dumb as possible and not hide or
  rearrange any of the data" — so their parse order usually mirrors the file
  layout faithfully ([Sims4Tools README](https://github.com/s4ptacle/Sims4Tools)).
- **010 Editor binary templates** exist for several types, derived from EA's
  own templates (example: [CombinedBinaryTuning_0x62e94d38.bt](https://github.com/Llama-Logic/Binary-Templates/blob/main/CombinedBinaryTuning_0x62e94d38.bt)
  in Llama-Logic's Binary-Templates repo); templates double as annotated
  layout docs.
- Community format write-ups: [TS4 Modders Reference](https://thesims4moddersreference.org/)
  (e.g., [DBPF format](https://thesims4moddersreference.org/reference/dbpf-format/),
  [internal compression](https://thesims4moddersreference.org/reference/internal-compression-dbpf/)),
  SimsWiki type pages (e.g., [SimData 0x545AC67A](https://simswiki.info/wiki.php?title=Sims_4%3A0x545AC67A)),
  and Kallixer's [Ts4-World-Documentation](https://github.com/Kallixer/Ts4-World-Documentation/wiki).

When two independent implementations agree, upgrade the finding from
*community-observed* toward *verified*. When they disagree, keep the raw bytes
and say why.

## 4. Documenting findings

For each field, record:

```
offset / size / endianness
label:        verified | community-observed | hypothesis
evidence:     diff pair(s), source URLs, sample file hashes
unknowns:     reserved bytes preserved verbatim, never renamed confidently
```

Keep reserved/unexplained bytes in parsers under neutral names
(`reserved_2`, `unknown_0C`) — renaming an unknown into a confident semantic
name without evidence is how format myths start (explicit skill rule).

## 5. Safe parsing practices

- Validate every offset and count against the actual stream length before
  slicing or seeking; treat out-of-range values as malformed input, not as
  truth.
- Use checked arithmetic when computing sizes from untrusted counts.
- Cap allocation sizes derived from file contents.
- Fail with errors that include the byte offset and expected-vs-actual values,
  the way s4pi does for STBL magic/version
  ([source](https://github.com/s4ptacle/Sims4Tools/blob/fff19365/s4pi%20Wrappers/StblResource/StblResource.cs)).
- Prefer parsing the smallest trustworthy structure first (header → index →
  one resource), keeping raw bytes available alongside any interpretation.
- Add regression tests using real fixture bytes, including awkward cases
  (truncated files, wrong version, bad lengths — note that real-world STBLs
  with incorrect length metadata exist per
  [Sims4Tools 0.4.3 release notes](https://github.com/s4ptacle/Sims4Tools/releases/tag/0.4.3-release)).

## Tool links (real, fetched during research)

- s4pe/s4pi (package editor + library): https://github.com/s4ptacle/Sims4Tools
- TS4 Modders Reference: https://thesims4moddersreference.org/
- Llama-Logic Binary Templates: https://github.com/Llama-Logic/Binary-Templates
- Kallixer world docs: https://github.com/Kallixer/Ts4-World-Documentation/wiki
