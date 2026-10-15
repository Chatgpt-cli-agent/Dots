# S4TK toolchain + verified build recipe

The provisioning facts in this file were fetched from the cited repositories.
Byte-level DBPF details intentionally live in the `sims-4` skill references
(`dbpf-2.1.md`, `internal-compression.md`) — this file only records how to
drive the authoring tools.

## S4TK — Sims 4 Toolkit (`@s4tk/models`)

- Repo: https://github.com/sims4toolkit/models — "Models for packages and the
  resources they contain."
- npm: `@s4tk/models` (verified v0.6.14, MIT, author frankkulak). Install:
  `npm i @s4tk/models`.
- Docs: https://sims4toolkit.com/#/docs/models (most up to date).
- Companion packages: `@s4tk/compression`, `@s4tk/encoding`, `@s4tk/hashing`,
  `@s4tk/xml` (pinned by `@s4tk/models` v0.6.14).
- **Maintenance status (checked 2026-09-04): stale.** Last npm release
  2024-03-10 (v0.6.14), no repo commits since; official status is
  "pre-release… breaking changes are likely". This machine's game install has
  EPs newer than the library has resource models for. Treat S4TK as support for
  the *stable* formats (DBPF 2.1 assembly, index, STBL, standard tuning XML,
  SimData) and validate per resource type before relying on it — a resource
  type it cannot serialize must fall through to SCS-native or raw bytes, never
  be force-fit.

## Verified build recipe (from `sims4toolkit/package-builder-template`)

The template repo (archived 2023) is the minimal working example of S4TK-as-a
-build-script. Config came from `s4tk-config.json`, the pipeline from
`scripts/build.cjs`:

```jsonc
// s4tk-config.json shape
{
  "buildFolders": ["./out"],
  "buildName": "MyProject",
  "cache": true,
  "cachePath": "./s4tk-cache.json",
  "cancelOnError": true,
  "sourceFolder": "./src",
  "sourcePatterns": {
    "packages": ["./packages/**/*.package"],            // clones/CC merged raw
    "simdata":  ["./xml/**/*.SimData.xml"],             // SimData sources
    "tuning":   ["./xml/**/!(*.SimData).xml"]           // tuning XML sources
  }
}
```

### Pipeline facts observed in `build.cjs`

- **API surface:** `Package`, `XmlResource`, `SimDataResource` from
  `@s4tk/models`; `BinaryResourceType`, `TuningResourceType`, `SimDataGroup`
  from `@s4tk/models/enums`.
- **Tuning key derivation:** parse `XmlResource.from(buffer)`; read
  `xml.root.name` (name), `xml.root.attributes.s` (instance, decimal string →
  `BigInt`), `xml.root.attributes.i` (type selector). When `root.tag === "M"`
  the key type is generic `TuningResourceType.Tuning`; otherwise
  `TuningResourceType.parseAttr(i)`. Group comes from a `.G########.xml`
  filename suffix, else `0`.
- **SimData key derivation:** a `.SimData.xml` file's instance equals its
  matching *tuning* instance; group = `SimDataGroup.getForTuning(tuningType)`;
  resource type = `BinaryResourceType.SimData`.
- **Clone merging:** `Package.extractResources(buffer, { loadRaw: true })`
  then `buildPkg.addAll(resources)` — clones are carried raw, keys unchanged.
- **Emission:** add new resources with `buildPkg.add(key, resource)`, then
  `buildPkg.getBuffer()` → write to each `buildFolders` path.
- **Determinism:** a cache file maps source filepath → `type_group_instance`
  so repeated builds assign identical keys without re-deriving.

The template's source layout is the natural skin of every S4TK build:
`src/xml/**/*.xml` (tuning), `src/xml/**/*.SimData.xml` (SimData),
`src/packages/**/*.package` (clones). The build script globs them, derives
keys, and emits one merged `.package`.

## Sims Creator Studio in-app code

When working inside SCS, prefer its own parsers over pulling in S4TK, unless
the task clearly wants S4TK. Verified files on this box
(`/mnt/Sims-Studio/Sims-Creator-Studio/electron/main/sims/`):

- `dbpf.ts` — DBPF package read + `decompressResource`
- `refpack.ts` — shared RefPack decompressor (reuse, never copy from `dbpf-save.ts`)
- `simdata.ts`, `dbpf-save.ts`, `sims-package-service.ts`
- `tray/blueprint-writer.ts` — tray/blueprint emission side

SCS's primary format authority is the decompiled Sims 4 Studio source at
`/home/windenburg/Projects/All About The Sims4/Sims4Tools/S4S-SourceCode/`
(see the `sims-4` skill). New SCS code must satisfy the repo's AGENTS.md:
stream indexes light, zero new `tsc` errors in touched files.

## GUI validation tools

- **Sims 4 Studio** — validates and re-saves packages; the community standard
  for round-tripping a programmatic `.package`.
- **s4pe / s4pi** — low-level editor; independent reader for verification.
  (https://github.com/s4ptacle/Sims4Tools)