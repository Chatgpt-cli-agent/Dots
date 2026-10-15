# Common Sims 4 Package Resource Type IDs

Reference for The Sims 4 (.package / DBPF) resource Type IDs and how
custom-content (CC) resources are classified.

**Important caveat:** EA has never published the full type-ID space. Every
list below is *community-observed*, compiled from inspecting game packages
with tools such as s4pe/s4pi and Sims 4 Studio. New type IDs appear with
patches and packs; treat any list as partial. Entries marked "(community)"
rest on community observation rather than official documentation.

## Verified well-known type IDs

Each row's ID was confirmed in at least two of: SimsWiki's Sims 4 packed-file
types page [sw-types], the Kuree/Sims4Tools wiki table [kuree-types], The
Sims 4 Modders Reference resource index (compiled by Kallixer) [ts4mr-types],
or the LlamaLogic library's `ResourceType` enum [llama].

| Type ID | Mnemonic | Contains | Sources |
|---|---|---|---|
| `0x220557DA` | STBL | String Table — localized UI text, keyed by FNV32 string hash | [sw-types] [kuree-types] [ts4mr-types] [llama] |
| `0x034AEECB` | CASP | CAS Part Data — one Create-A-Sim clothing/accessory part; versioned binary struct with age/gender flags, body type, color swatches, and a TGI key table pointing at GEOM/texture/region-map resources | [sw-types] [kuree-types] [ts4mr-types] [llama] [sw-casp] |
| `0xC0DB5AE7` | OBJD | Object Definition (Sims 2/3 "OBJD" role) — object definition resource | [sw-types] [kuree-types] [ts4mr-types] |
| `0x319E4F1D` | COBJ | Object Catalog entry — catalog/price/categorization data for an object | [sw-types] [kuree-types] [ts4mr-types] |
| `0x545AC67A` | DATA | SimData — binary tuning data referenced by XML tunings (careers, buffs, skills, …); group IDs partition it by domain | [sw-types] [kuree-types] [ts4mr-types] [mts-groups] |
| `0x62E94D38` | *(combined tuning)* | Combined Tuning — all game tunings merged into one binary resource (XML before patch 1.13) | [sw-types] [ts4mr-types] |
| `0x00B2D882` | _IMG | DDS image (DST format variants incl. DXT/ATI compressed and standard) | [sw-types] [kuree-types] |
| `0x3453CF95` | RLE2 | DDS DXT5 RLE2 image — main CAS texture/diffuse format | [sw-types] [kuree-types] [ts4mr-types] [kuree-casp] |
| `0xBA856C78` | RLES | DDS DXT5 RLES image — CAS specular maps etc. | [sw-types] [kuree-types] [ts4mr-types] [kuree-casp] |
| `0x2BC04EDF` | LRLE | LRLE Image — lossless-ish CAS swatch/texture format used by newer CC tooling | [ts4mr-types] |
| `0xAC16FBEC` | RMAP | Region Map — references several GEOM resources; CAS region/subpart mapping | [sw-types] [ts4mr-types] [kuree-casp] |
| `0x015A1849` | GEOM | Geometry — body/CAS-part/object mesh geometry (RCOL "GEOM" chunk) | [sw-types] [kuree-types] [ts4mr-types] |
| `0x01661233` | MODL | Object model geometry ("scene" container) | [sw-types] [kuree-types] [ts4mr-types] |
| `0x01D10F34` | MLOD | Object model LODs | [sw-types] [kuree-types] [ts4mr-types] |
| `0x01D0E75D` | MATD | Material definition | [sw-types] [ts4mr-types] |
| `0x067CAA11` | BGEO | Blend Geometry — morph/blend targets | [sw-types] [kuree-types] [ts4mr-types] |
| `0x8EAF13DE` | _RIG | Rig / skeleton | [sw-types] [kuree-types] [ts4mr-types] [llama] |
| `0x6B20C4F3` | CLIP | Clip — animation | [sw-types] [ts4mr-types] |
| `0xBC4A5044` | CLHD | Clip Header | [ts4mr-types] |
| `0x02D5DF13` | JAZZ | Animation State Machine (Jazz graphs) | [sw-types] [ts4mr-types] |
| `0x0354796A` | TONE | Skin tone | [sw-types] [kuree-types] [ts4mr-types] |
| `0x71BDB8A2` | STLK | Styled Look (outfit preset) | [sw-types] [ts4mr-types] |
| `0xEAA32ADD` | *(CAS Preset)* | CAS Preset | [ts4mr-types] |
| `0xDB43E069` | DMAP | Deformer Map | [sw-types] [ts4mr-types] |
| `0xBDD82221` | AUEV | UI Control Event Map | [ts4mr-types] |
| `0x3C1AF1F2` | THUM | CAS Part Thumbnail (PNG) | [sw-types] [ts4mr-types] |
| `0x2A8A5E22` | *(trayitem)* | Tray Item — household/lot metadata in the Tray folder | [sw-types] [ts4mr-types] |

IDs present in older lists but left unlisted above (blank mnemonics or
contradictory descriptions across sources, e.g. `0x010FAF71`, `0x105205BA`,
`0x9D1AB874`) are omitted rather than guessed.

## How custom content is classified

CC authors don't invent new types; they reuse the game's own resource types
and bind them together through TGI keys (Type/Group/Instance triples):

- **CAS items (clothing, hair, makeup):** a **CASP** (`0x034AEECB`) acts as
  the manifest. Its internal key table indexes GEOM meshes
  (`0x015A1849`), RLE2 diffuse/bump textures (`0x3453CF95`), RLES speculars
  (`0xBA856C78`), and a Region Map (`0xAC16FBEC`) [sw-casp] [kuree-casp].
- **Objects:** OBJD (`0xC0DB5AE7`) plus a COBJ catalog entry
  (`0x319E4F1D`), model resources (MODL/MLOD/GEOM), MATD materials, footprints,
  and STBL strings for catalog name/description [sw-types] [ts4mr-types].
- **Tuning/script mods:** XML tunings and SimData (`0x545AC67A`) /
  combined-tuning fragments, plus STBLs (`0x220557DA`) for any user-visible
  text; script mods ship DLL resources alongside them.
- Everything is packaged in DBPF containers addressed by TGI; tools like s4pe,
  Sims 4 Studio, and @s4tk classify each entry purely by its Type ID
  (wrapper-dealer pattern in s4pi registers wrappers per hex type code)
  [deepwiki-s4tools].

The claim that specific *combinations* constitute "the standard CC recipe"
is community practice documentation, not EA specification.

## Not yet verified

- Any authoritative/complete type-ID registry — none exists publicly; the
  space is undocumented by EA.
- Type IDs introduced after the sources' last updates (SimsWiki page last
  touched 2016; Modders Reference Oct 2025).
- Mnemonics for the blank entries in the community tables.

## Sources

- [sw-types]: https://simswiki.info/wiki.php?title=Sims_4:PackedFileTypes
- [kuree-types]: https://github.com/Kuree/Sims4Tools/wiki/Sims-4---Packed-File-Types
- [ts4mr-types]: https://thesims4moddersreference.org/reference/resource-types/
- [llama]: https://github.com/Llama-Logic/LlamaLogic/blob/main/LlamaLogic.Packages/ResourceType.cs
- [sw-casp]: https://simswiki.info/wiki.php?title=Sims_4:0x034AEECB
- [kuree-casp]: https://github.com/Kuree/Sims4Tools/wiki/0x034AEECB
- [mts-groups]: https://modthesims.info/showthread.php?p=4529075 (SimData group-ID survey)
- [deepwiki-s4tools]: https://deepwiki.com/s4ptacle/Sims4Tools
