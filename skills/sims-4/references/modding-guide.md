# Sims 4 Modding — High-Level Workflow

Practical, tool-first overview of how to create a Sims 4 mod. For byte-level
format details, follow the "Progressive reference loading" table in `SKILL.md`.

## Two kinds of mods

1. **Package mods** (`.package`): add or override game resources — tuning XML
   (TDESC), STBL strings, images, meshes, CAS parts. These are DBPF containers.
2. **Script mods** (`.ts4script`): compiled Python that runs in-game. See
   `ts4script-guide.md`.

## Tools

- **Sims 4 Studio (S4S)** — the standard GUI tool for package mods and custom
  content (recolors, mesh edits, tuning, batch fixes). Use this first: it
  validates and re-saves packages.
- **s4pe (Sims 4 Package Editor)** — lower-level package editor from the
  s4pi / Sims4Tools family. Use when you need to inspect or hand-edit raw
  resources (STBL, XML) that S4S doesn't expose.
- **A text editor** for tuning XML (Tuning Descriptions).

## General workflow

1. **Identify what to change** — pick the game resource to override (a tuning
   XML, a CAS part, a texture) or decide on new content.
2. **Clone, don't edit** — always work from a clone of the game resource or a
   new package. Never modify EA's files directly; ship an override `.package`.
3. **Edit the resource** — tuning XML via a text editor or S4S's tuning UI;
   textures and meshes via S4S.
4. **Save as `.package`** and place it in the game's Mods folder (verify the
   exact path for the current install; it varies by platform).
5. **Test in game** — load, confirm the change, and watch for conflicts with
   other mods (duplicate TGI keys cause "last one wins" conflicts).
6. **Check for conflicts** — inspect resource keys (TGI) for collisions. See
   `resource-types.md` and `cc-package-anatomy.md`.

## Choose the workflow by content type

Do not give one generic mesh procedure. Name the type, then follow that path.
Byte-level facts stay in the format references; this section is the workshop order.

| Type | Start from | Then |
| --- | --- | --- |
| Recolor only | Clone the EA item in Sims 4 Studio | Swap textures, swatch, thumbnail, catalog strings. No mesh export. |
| CAS mesh (clothing, hair, accessory, shoes) | Clone a similar EA CAS part | Export to Blender, edit, import back. LODs are separate GEOMs on the CAS part, not a list inside one mesh. Weights and vertex groups must match the cloned rig. |
| Object / Build-Buy mesh | Clone a similar object | Edit the LOD0–LOD3 meshes and the shadow LOD. Check footprint, slots, and catalog tuning after the mesh imports. |
| Gameplay mod (buff, trait, interaction, career, aspiration, recipe) | `sims4-tuning-authoring` | Package with `sims4-package-authoring`. Add a `.ts4script` only when the behavior is not tuning. |
| Script behavior | `sims4-ts4script-authoring` | Ship the script beside its tuning package. |

Mesh format questions go to `references/s4s/geom.md`. CAS part, swatch, and blend questions go to `references/s4s/casp-simdata.md`. Animation and rig resources go to `references/s4s/animation-clips.md`.

## Mesh checks before import

- UVs stay in the 0–1 space the clone used, with seams where the texture splits.
- Normals face outward and match across LOD levels.
- Weights and vertex groups transfer from the clone; a clothing or hair mesh that drops them will not deform.
- Each lower LOD is the same silhouette with fewer faces, not a different shape.
- Object shadow meshes cover the silhouette. A missing shadow LOD is a lighting bug, not a texture bug.
- Look for clipping, split seams, and a polycount that is in the same range as the cloned EA item. Do not invent a universal triangle cap.

## Workshop rules

- Clone or create a new package. Never edit EA's installed files.
- Keep the `.blend` and a copy of the package from before the last import.
- Test in a save that has no other custom content, then add the rest of the Mods folder back to see conflicts.
- Package, tuning, and script work hand off to the specialist skills named above.
- Use original meshes and textures, or resources the user has a license to ship. Do not pull another creator's mesh or texture into a package.
- If a Sims 4 Studio button, poly limit, or game behavior is not in the format references, say so and name the check (import, then look at the resource in Studio) instead of stating it as fact.

## Evidence tier

All format specifics (header layout, index-entry flags, TGI handling) come from
`dbpf-2.1.md` and the `s4s/` verification layer — not from memory. Never guess a
resource type ID, offset, or compression code.
