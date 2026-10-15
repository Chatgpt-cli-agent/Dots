# Verified S4TK behavior on this box (2026-09-04)

Empirical results from the Phase-1 spike
(`~/Projects/All About The Sims4/Projects-Sims/s4tk-authoring-spike/`). These
were observed, not guessed — if the library version or behavior changes,
re-verify before relying on them.

## What `@s4tk/models@0.6.14` emits

- **Container:** DBPF 2.1 — `DBPF`, major=2, minor=1, 96-byte header, index
  version field present as the spec describes.
- **Index layout:** flags `0x0` — every key field is written per-entry (S4TK
  does not use shared-field constants even when all entries share a type).
- **Chunk framing:** the extended bit is set on `filesize`
  (`0x80000000`), compression code `0x5A42` (zlib), trailing `unknown2 = 0x0001`
  (matches the "always 0x0001" community observation in `sims-4/dbpf-2.1.md`).
  Tuning XML and STBL are zlib-compressed by default.
- **Round-trip:** keys written via `pkg.add(key, resource)` come back
  byte-for-byte identical through both `Package.from` and an independent
  spec-based parser; zlib inflate matches `memsize`.

## Gotchas

- **Empty `SimDataResource` is broken.** `new SimDataResource()` serializes
  32 bytes that the library's own reader throws on
  (`RangeError` in `structStringTable` during SimData read). Always build
  SimData from a real `.SimData.xml` via `SimDataResource.fromXml(...)`;
  never construct it empty.
- **Real `.SimData.xml` → `fromXml` round-trips perfectly (verified).** The
  spike built the `package-builder-template` "MyStatistic" mod's real Statistic
  SimData and confirmed `fromXml` → serialize → `SimDataResource.from` →
  `toXmlNode()` reproduces the exact `<I>/<T>/<Schema>` XML (schema hash
  `0x8273C673`, columns `max_value_tuning`/`min_value_tuning`/`stat_name`).
- **Package serialization:** use `pkg.getBuffer()` (calls through to
  `WritableModel#_serialize`). It also exists on every individual resource.
- String `getBuffer()`/`getBufferAsync()` accept `(cache?, minify?)`.

## Verified tuning/SImData key recipes (from real published mod bytes)

- `TuningResourceType.parseAttr(i)` resolves the XML `i="<typename>"` attribute
  to the numeric tuning type — verified with `i="statistic"` → `0x339BC5BD`.
- `SimDataGroup.getForTuning(type)` derives the SimData group — verified
  `getForTuning(Statistic)` → `0x009BC58E`.
- Tuning instance comes from the XML `s="<decimal>"` attribute (`BigInt(s)`);
  SimData instances the tuning, group per the tuning type.
- `Package.extractResources(buffer, { loadRaw: true })` merges prebuilt
  packages (cloned object + English STBL) raw into the output — verified
  inbound STBL string ("Hello, world!") survived transit.

## Authority ladder (as of this date)

1. S4TK reads its own output — proven.
2. Independent spec-based reader + zlib inflate — proven.
3. Game/s4pe/S4S acceptance of an S4TK-built package — **not yet tested**.

## Pointers

- Spike reproduction: `VERIFICATION-NOTES.md` in the spike workspace
  (re-run with `node spike.cjs`).
- Tuning key recipe verified end-to-end: XML `<I s="<decimal instance>"
  i="<TuningResourceType value>">` where instance = `fnv64("prefix|<name>")`.
## Buff/Moodlet mod recipe (verified 2026-09-04, this build)

A visible moodlet = Buff tuning XML + matching SimData (group `0x0017E8F6` =
`getForTuning(Buff)`, instance == buff instance) + STBL. Schema source: the
game's real `Buff` schema (`Data/Simulation/SimulationFullBuild0.package`
simdata instances 74414/74415), `schema_hash 0x83A7824A`:

| Column | DataType | S4S XML token |
|---|---|---|
| audio_sting_on_add / on_remove | 19 | `ResourceKey` |
| buff_description / buff_name / timeout_string | 20 | `LocalizationKey` |
| icon / icon_highlight | 19 | `ResourceKey` |
| mood_type | 18 | `TableSetReference` (bare tuning id, e.g. 14640 = `Mood_Happy`) |
| mood_weight / ui_sort_order | 6 | `Int32` |

Authoring notes:
- Buff SimData group is `0x0017E8F6` (NOT the tuning/group-0); instance equals
  the buff tuning's instance; SimData written via `SimDataResource.fromXml`
  with an explicit `<Schema name="Buff" schema_hash="0x83A7824A">` block —
  S4TK **trusts** `schema_hash` from XML, so embed the game's real hash.
- In S4S-style SimData XML the per-column tags are `<T name="col">value</T>`
  (attribute `name`, NOT `n`); root `<I name="..." schema="Buff"
  type="Object">`; children of `<SimData>` are `<Instances>` then `<Schemas>`.
- STBL keys are uint32; use `fnv32(string)` via `Number()` before
  `StringTableResource.add(key, value)`; reference the same key as the
  `LocalizationKey` values (`"0x" + fnv32hex` uppercase, 8 digits).
- Modern buff icons are **DdsImage thumbnails (`0x00B2D882`)**, not the old
  `0x2F7D0004`; reference any real installed DDS (e.g. `SP47/magalog.package`
  `A1341DA22EF730BF`, 600×380). Missing icon renders blank, no crash.
- Location keys (moodlet): `mood_type` = tuning id of the Mood (metadata from
  `BG/mood` dump folder, e.g. 14640 = `Mood_Happy`).

## Bonus findings
- SimData column type codes (game bytes) == S4TK `DataType` enum: 18 =
  `TableSetReference`, 19 = `ResourceKey`, 20 = `LocalizationKey`, 6 = `Int32`.
- Buff tuning XML `audio_stings_on_add/remove` are `<L>` lists of lowercase
  `type:group:instance` TGIs; `icon`/`icon_highlight` same form.
