# Deconstruction pipeline — tools and evidence log

The operational detail behind the SKILL.md workflow. Tools referenced are
verified on this machine or from the cited repos.

## Toolkit

- **Package inspection (read-only):** the `sims-4` skill's parsers and
  references (`dbpf-2.1.md`, `resource-types.md`, `stbl.md`); or s4pe/s4pi;
  or S4TK `@s4tk/models` `Package` reading APIs (see
  `sims4-package-authoring`). Use two independent readers when a claim matters.
- **Extraction of game originals (for override comparison):** the game's
  packages at `<game>/Data/Client/`, `<game>/Delta/`, `<game>/Data/Simulation/`
  and `EPxx/` (see `sims-4` `file-ecosystem.md` for layout).
- **Script decompilation:** `unpyc3.py` (azigler workspace), `pycdc` /
  `unpyc37` (ssinakhot workspace submodules), or Python 3.7 `marshal`/`dis` on
  the `.pyc` header + code objects (the game runs CPython 3.7; on this box
  `Game/Bin/Python/python37_x64.dll`). Decompile game modules from the
  Simulation packages to check what the mod imports and patches.
- **STBL decode:** `sims-4` `stbl.md` hashing/layout; decode to show visible
  strings (the mod's user-facing text is your best clue to its function).

## Evidence log format

Keep a running log with one entry per discovery. Required fields:

```
resource: <type> <group> <instance hex>   (or code file:line)
claim:    what the mod does/effects
evidence: URL / resource key / byte range / decompiled line
tier:     direct-observation | implementation-verified | community-observed | hypothesis
```

Every claim in the final analysis must cite at least one evidence entry. A
claim keyed only to "this mod seems to" is thrown out. This is the difference
between "the mod adds two tuning instances" (resource keys in hand) and a
vibe.

## Override-vs-new determination

For each extracted tuning instance, check whether the same instance exists in
the game's own packages:

- Present in an EA package → the mod **overrides** it (merge/authoring: same
  TGI, changed payload).
- Absent from EA packages → the mod adds **new** content; look for the
  references that wire it in (which existing tuning points at the new
  instance).
- For script patches: diff the decompiled mod module against the game's own
  module of the same name (from the Simulation packages). Changed/extended
  class = injection; wholly new module = new system.

## Reference-isolation checklist

For "dependency" claims, mark each find as one of:

- EA resource referenced (needs a specific EP/GP/base version).
- Other-mod resource referenced (mod dependency — note the requirement).
- Self-contained (fully independent).
- Optional/fail-safe (mod degrades gracefully without it).

Determining the minimum working set = removing everything the above tells you
is non-essential, justified per item.

## Clean-room discipline

The reproduction recipe describes **behavior and structure** from your
evidence (career gains, interaction preconditions, TGI layout, string keys),
never copies original source files or binaries. If the mod is licensed
permissively you may reuse with attribution; otherwise treat the recipe as a
spec, and rebuild behavior from first principles using the authoring skills.