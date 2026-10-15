# Resource keys (TGI) for authoring

A Sims 4 resource key is **Type + Group + 64-bit Instance**. When authoring,
get each part right before writing bytes. Evidence tier notes follow each rule.

## Clones: preserve, never recompute

If the resource comes from an existing package (game or another mod), keep its
key **exactly** as indexed there. Recomputing a clone's instance is how
overrides silently stop overriding. (verified — s4pi/s4py preserve index keys)

## New tuning resources

- The XML tuning file's root element carries the identity fields:
  - `s` attribute = instance, as a decimal string → `BigInt`.
  - `i` attribute = type selector, decoded via the S4TK/type machinery
    (`TuningResourceType.parseAttr(i)` for individual tuning; root tag `M`
    denotes a generic tuning module).
  - `name` attribute = resource name.
- Group: by convention taken from a `.G########.xml` filename suffix
  (8 hex digits); otherwise `0`.
- (verified — `sims4toolkit/package-builder-template` `scripts/build.cjs`)

## New SimData resources

- Instance **must equal** the instance of the tuning it configures.
- Group = `SimDataGroup.getForTuning(tuningType)` — derived from the tuning
  type, not hand-picked.
- Resource type = SimData (`BinaryResourceType.SimData`, type
  `0x545AC67A`).
- (verified — same `build.cjs`; type value from `sims-4` `resource-types.md`)

## STBL string tables

- Each string is stored under a key; the key is the string table instance
  namespace. See the `sims-4` `stbl.md` for the exact FNV variant and container
  layout — that is the single source of truth. Never guess the hash flavor.
- (community-observed — FNV-64 string keys are the modding standard, but the
  exact registration lives in S4S `StringTable.cs` / `references/stbl.md`)

## Collision care

- Instance IDs identify resources globally. Two mods shipping the same
  instance on different content = last-one-wins conflict; same instance on
  identical TGI is the *point* when overriding.
- Never count up (`1, 2, 3…`): tiny hand IDs collide with other mods easily.
- For a new system, hash a personal namespace string (e.g. your name + mod
  name) so your IDs sit in an effectively private range.
- To **override** EA or another mod's behavior, reuse that exact key — that is
  the deliberate exception to collision care.
- (community-observed — modding convention; the "last one wins" conflict rule
  is stated in `sims-4` `cc-package-anatomy.md`)

## The modder filename convention `TYPE!GROUP!INSTANCE`

Loose-file tools and hot-reload systems identify a tuning override by its key
embedded in the filename. Verified example from
`azigler/ts4-modding-workspace` (`Mods/hotreload/`):

```
E882D22F!00000000!0000000000006A25.Idle_Chatting_STC.InteractionTuning.xml
^^^^^^^^ ^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^
type     group        instance        .Name.<TuningType>.xml
```

All in fixed-width uppercase hex (`TTTTTTTT-GGGGGGGG-IIIIIIIIIIIIIIII` when
printed as a key). When a workflow ships a loose XML that a tool re-injects,
carry the TGI in the filename this way.