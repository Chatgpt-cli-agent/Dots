# S4S verification/reference layer

Claim-based format facts extracted from decompiled Sims 4 Studio "Star"
v3.2.6.4 source (`/home/windenburg/Projects/All About The Sims4/Sims4Tools/S4S-SourceCode/`, see `../sources.md`).

These docs describe **what working software demonstrates** — never decompiled
code dumps. Each claim carries its own evidence trail.

## Evidence tiers used in Confidence fields

1. **Directly observed** — verified against real Sims 4 files (hex-level)
2. **Implementation-verified** — demonstrated by S4S read+write code
3. **Community-observed** — from public docs only
4. **Hypothesis** — inference needing validation

Each claim also records `Public-reference agreement` (Yes / Partial / None
documented) against the public docs in `references/` (`dbpf-2.1.md`,
`internal-compression.md`, `resource-types.md`, etc.).

Three-way agreement (public docs + S4S + real files) = high confidence.
Disagreement = record the conflict, never guess.

## Unknown-field discipline

Unnamed fields are preserved verbatim as `U1`, `U2`, `Unknown_0xNN`, `B1`,
`F2`, `S1`… exactly as they appear in the implementation. They are NEVER
upgraded to semantic names without independent identification. The registry
lives in [unknown-fields.md](unknown-fields.md) — check it before claiming any
unknown field is understood.

## Files

| File | Topic |
| --- | --- |
| `tray-pipeline.md` | .trayitem ↔ .blueprint ↔ .bpi lot bundle pipeline (with real-sample observation) |
| `blueprint.md` | .blueprint container internals, LDNB record bundle linkage |
| `lot-architecture.md` | LOT architecture container (LDNB), typed value grids, factory dispatch |
| `walls.md` | WallInfo, wall segments, coverings, cutouts, platform trim |
| `floors.md` | Floor patterns/floors/trims, room floor layers |
| `roofs.md` | Roof resources/patterns/trims, lot roof data |
| `stairs.md` | Stairs, railings, friezes, columns, fences, spandrels, half-walls |
| `terrain.md` | Terrain paint/heightmaps, ponds, pools, foundations, platforms |
| `objects.md` | Placed-object records (OMGS/OMGR/OBJ), catalog chain DGUD→OBJD→OBJC |
| `dbpf-verification.md` | DBPF as S4S implements it; verdicts vs public DBPF docs |
| `casp-simdata.md` | CASP/BGEO/swatches + XML tuning + SimData schemas |
| `geom.md` | CAS GEOM meshes + object MODL/MLOD |
| `textures-rle.md` | RLES/RLE2/LRLE/DST texture formats |
| `animation-clips.md` | RIG/CLIP/events (track frame data honestly opaque) |
| `unknown-fields.md` | Registry of unidentified fields across all formats |

## Known S4S blind spots

Formats S4S does *not* implement (so these docs cannot speak to them):
per-tile floor painting outside the Magalog path, pool water simulation,
pond contents, terrain sculpt deltas, roof procedural geometry, spiral
stairs/elevators geometry, CLIP track frame decoding.
