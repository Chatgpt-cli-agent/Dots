# Tuning fundamentals

Tuning = the game's data layer. This file pins the mental model; byte-level
layouts stay in the `sims-4` skill references.

## How tuning maps to gameplay

- Tuning XML resources are loaded by the game and mapped to Python classes
  through **instance managers**. A tuned instance instantiates the Python class
  the tuning type is bound to; fields become the instance's tunables.
- So "a buff" is a tuning record of the buff class; "an interaction" is tuning
  of the interaction class it extends. Changing data = editing tuning; changing
  behavior beyond data = a script mod (`sims4-ts4script-authoring`).
- Lot 51's game-concepts docs explain this model plainly:
  https://lot51.cc/simdex/resources ("Learn to Mod" 2026 index links the
  concept pages + the Modern Python Modding series).
- The Sims 4 Tuning Builder (TDESC) is the reference catalog of tuning types
  and their fields: https://tdesc.lot51.cc/ (per-type pages like
  `.../Interactions/Descriptions/SuperInteraction.tdesc`).

## New vs override — the one decision that decides everything

- **Override** = ship a resource with the **same TGI** as the EA target but
  different content. Last-one-wins: your package must load after the base or
  win the conflict.
- **New content** = a new instance (and where relevant a new group/type), plus
  references FROM existing tuning (an object listing your new interaction) so
  the game reaches it. Nothing references your new instance until something
  does — a brand-new interaction nobody's object offers will never appear.
- Failure mode to look for: an override that "silently doesn't apply" usually
  means the instance no longer matches the live base resource (game updated, or
  the key was mis-typed). Re-extract the current EA resource and diff the key.

## Tuning identity fields (verified — package-builder-template build.cjs)

- Root tag: `<I>` = individual tuning; `<M>` = generic tuning module
  (`root.tag === "M"` → generic Tuning resource type in S4TK).
- Attributes S4TK keys off for the package index:
  - `s` — instance, decimal string (`BigInt(s)`).
  - `i` — type selector, resolved through `TuningResourceType.parseAttr(i)`
    for individual tuning.
  - name — resource name.
- Group: from a `.G########.xml` filename suffix; else `0`.
- Hot-reload overrides use the `TYPE!GROUP!INSTANCE.Name.InteractionTuning.xml`
  loose-file convention so a tool can reinject them — see
  `sims4-package-authoring` → `references/resource-keys.md`, with the verified
  azigler example.

## Referencing other tuning

- Interactions are attached to objects/careers by tuning references (instance
  ids), not by free text. Every reference must point at a real resource.
- Extract the EA resource you're extending and mirror its references, or use
  the TDESC builder's pickers, rather than fabricating ids.
- Sanjo's modding-guide shows the practical minimum (interaction + pie-menu
  category + SimData): https://github.com/SanjoSolutions/sims4-modding-guide