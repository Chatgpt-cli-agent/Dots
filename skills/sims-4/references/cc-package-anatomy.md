# Anatomy of Custom-Content `.package` Files

This file separates two kinds of claims:

- **Verified format fact** — resource type IDs and container behavior confirmed
  against fetched sources (cited).
- **Community practice** — how CC authors and tools actually assemble packages;
  useful heuristics, not byte-level guarantees.

The container itself (DBPF) is documented in `dbpf-2.1.md`.

---

## Resource type IDs referenced here

All IDs below come from the [TS4 Modders Reference: Resource Type Index](https://thesims4moddersreference.org/reference/resource-types/)
(community-compiled index, last updated Oct 6, 2025), except where a second
independent source is noted:

| Type | Name | Cross-verification |
| --- | --- | --- |
| `0x034AEECB` | CAS Part | s4pi ships a `CASPartResource` wrapper for "Character customization assets" ([DeepWiki of Sims4Tools](https://deepwiki.com/s4ptacle/Sims4Tools)) |
| `0x015A1849` | Geometry (GEOM) | index only |
| `0x3453CF95` | RLE 2 Image | index only |
| `0xBA856C78` | RLES Image | index only |
| `0x2BC04EDF` | LRLE Image | also observed in the wild as "a new type" introduced with the June/Oct 2020 patches ([MTS: TS4 Default Replacement Fixer thread](https://modthesims.info/d/643164/ts4-default-replacement-fixer-v3-0-10-12-2020-fixes-default-eyes-eyebrows-makeup-and-skins-broken-by-patches.html)) |
| `0x00B2D882` | DST Image | index only |
| `0xC0DB5AE7` | Object Definition (OBJD) | also named in [MTS XML Tuning How-To](https://direct.modthesims.info/showthread.php?t=537976) ("OBJD 0xC0DB5AE7") |
| `0x220557DA` | String Table (STBL) | cross-verified against s4pi source — see `stbl.md` |
| `0x545AC67A` | Sim Data | cross-verified: [SimsWiki 0x545AC67A](https://simswiki.info/wiki.php?title=Sims_4%3A0x545AC67A); format also used by Combined Binary Tuning `0x62E94D38` per [Frankk's binary template header comment](https://github.com/Llama-Logic/Binary-Templates/blob/main/CombinedBinaryTuning_0x62e94d38.bt) |
| `0x2A8A5E22` / `0x3924DE26` / `0xD33C281E` | Tray Item / Blueprint / Blueprint Image | index only |
| `0x729F6C4F` / `0x01942E2C` | Household Description / Lot Description | index only |

## Typical resource mixes

### CAS items (clothing, hair, makeup, skin details)

**Verified building blocks** (types exist and are named as above):

- A **CAS Part** (`0x034AEECB`) resource is the catalog/behavior anchor.
- Visuals come from **Geometry** meshes and texture resources (**RLE2**, RLES,
  LRLE, DST).

**Community practice**: a working CAS package typically contains the CASP plus
its mesh(es), textures, thumbnails, and often STBL strings; Sims 4 Studio's
clone workflow ("Create CAS Standalone") produces exactly such a bundle, and
its *Tools → Modding → Embed all externally referenced resources (CAS)* command
exists because CASPs can reference meshes/textures that live in other packages
([S4S forum thread on mesh-only packages](https://sims4studio.com/thread/9883/mesh-package-lacks-studio-tab),
[S4S skin-detail tutorial](https://sims4studio.com/thread/4873/create-skin-detail-basics-beginners)).

### Build/buy objects

**Verified building blocks**: Object Definition (`0xC0DB5AE7`) plus Model /
Model LOD resources and textures listed in the Build Mode section of the
[resource type index](https://thesims4moddersreference.org/reference/resource-types/)
(Object Catalog `319E4F1D`, Material Definition, Footprint, etc. — names from
the index).

**Community practice**: object CC mirrors the CAS pattern — a catalog/definition
resource anchoring geometry + textures + footprint/slot data.

### Lots and households (Tray content)

**Verified**: Tray bundles are DBPF-style containers holding Tray Item,
Blueprint, Blueprint Image (lots) or Household Description-type resources —
the Modders Reference maps `.trayitem`/`.blueprint`/`.bpi` to lots and
`.hhi`/`.householdbinary` to households
([File Types](https://thesims4moddersreference.org/reference/file-types/),
[Resource Type Index "Lots"/"Households" sections](https://thesims4moddersreference.org/reference/resource-types/)).
See `file-ecosystem.md`.

### Script/tuning mods

- **Verified**: game tuning exists as human-readable XML extracted by modders'
  tools, paired with binary **SimData** (`0x545AC67A`) used for UI/client data.
  Buffs/traits ship both, and custom versions should keep both together
  ([S4S forum: "Why do we have SimData AND tuning XML"](https://sims4studio.com/thread/23833/why-simdata-tuning-xml-buffs)).
  SimData's tabular format (schemas, tables, rows, TGI references) is
  documented in [SimsWiki 0x545AC67A](https://simswiki.info/wiki.php?title=Sims_4%3A0x545AC67A)
  and Frankk's official-derived [binary template](https://github.com/Llama-Logic/Binary-Templates/blob/main/CombinedBinaryTuning_0x62e94d38.bt);
  Combined Binary Tuning uses the same layout at type `0x62E94D38`.
- **Not yet verified**: the resource Type ID for standalone XML tuning
  resources; do not assume one when classifying packages.

## Dependencies between packages (Community practice)

- Packages reference each other by **TGI**; a CASP in one package may point at
  GEOM/textures in another ("mesh package" vs "color package" splits are real
  and seen in the wild). S4S's embed command pulls those externals in to make
  a self-contained package
  ([thread](https://sims4studio.com/thread/9883/mesh-package-lacks-studio-tab)).
- Overrides work by resource key equality: Mods content at priority 500 beats
  Maxis content with the same key
  ([SimsWiki TS4 CC Basics](http://simswiki.info/wiki.php?title=Game_Help%3ATS4_CC_Basics)),
  which is why "override" mods reuse EA TGIs while standalone CC must mint new ones.
- Merged packages are common but fragile for tooling
  ([Default Replacement Fixer notes](https://modthesims.info/d/643164/ts4-default-replacement-fixer-v3-0-10-12-2020-fixes-default-eyes-eyebrows-makeup-and-skins-broken-by-patches.html)).

## How tools classify CC (Community practice)

- **Sims 4 Studio**: clone-based workflows (Create CAS Standalone / Create 3D
  Meshes) produce packages whose composition defines what the community expects
  a "working" CAS or object package to contain
  ([S4S tutorials above](https://sims4studio.com/thread/4873/create-skin-detail-basics-beginners)).
- **s4pe / s4pi**: generic package editor; wrappers register per type ID via
  `WrapperDealer`, so opening a package and reading its type histogram (which
  wrapper would claim each entry) is the standard classification method
  ([Sims4Tools README](https://github.com/s4ptacle/Sims4Tools),
  [DeepWiki overview](https://deepwiki.com/s4ptacle/Sims4Tools)).
- Practical rule for any classifier: build a **type histogram first**
  (e.g., many `CASP`+GEOM+RLE2 ⇒ CAS item; `OBJD`+Model ⇒ build/buy object;
  Tray types ⇒ lot/household export) before claiming what a package "is".

## Not yet verified

- Standalone XML tuning resource Type ID.
- Exact internal linkage fields inside CASP/OBJD that encode dependencies
  (existence of TGI references is community-observed; field offsets unverified).
