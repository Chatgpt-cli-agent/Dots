# Local Sims engineering references

Use for DBPF/package implementation comparisons, resource layouts, resource type
IDs, and modding tutorials. Checkouts live under:
`/home/windenburg/Projects/All About The Sims4/References/`.

## Choose the source

- **LlamaLogic/LlamaLogic.Packages/**: read `DataBasePackedFile.cs` for package
  I/O, `ResourceKey.cs` for TGI handling, `ResourceType.cs` for resource IDs,
  and `Models/` for supported resource models. Compare expected behavior with
  `LlamaLogic/LlamaLogic.Packages.UnitTests/`. This is implementation evidence;
  a model is authoritative only for versions and structures it actually handles.
- **Binary-Templates/**: read `Package.bt` for the container. For a resource
  type, normalize its ID to eight lowercase hex digits and load the matching
  `*_0x<type>.bt` from the table below. Follow version branches and dependencies
  in the template. These are 010 Editor templates, not native Koda parsers.
- **TS4-Modders-Reference/src/content/docs/**: search Markdown/MDX for prose
  format references, script/tuning relationships, injectors, debugging, Linux,
  maps and world workflows. Read the relevant page, not the entire tree.

## Evidence rules

Apply the evidence tiers in SKILL.md. Installed files and reproducible byte
observations take priority for the specific game version. Compare applicable
S4S/s4pi/LlamaLogic implementations, then templates and community documentation.
Shared ancestry or copied layouts do not count as independent confirmation.
Record source commit, file, version branch, and byte observations for claims.
Preserve unknown fields. Report disagreements rather than silently picking a winner.
Template field names are community evidence, not proof of semantics; world
resource chunks alone do not establish Tray/save placement equivalence.
Before translating a template into a parser, verify on real resources and add
bounds, malformed-input, version, and round-trip checks appropriate to the parser.
These checkouts are references; reading them requires no .NET or 010 Editor install.

## Snapshot provenance

Cloned 2026-09-07 from `https://github.com/Llama-Logic/<repository>.git`.
These are pinned local snapshots, not a promise of current game compatibility.

| Repository | Commit |
| --- | --- |
| LlamaLogic | `1014bc8f08705e66cc8469a40135f11fbf26dea6` |
| Binary-Templates | `68fa20f93120671fe80380943fe6752099ac7b1a` |
| TS4-Modders-Reference | `291e847adc73dcb0f5d8a05f15cecf2c3f94e8ce` |

To refresh intentionally, first inspect `git status --short` in the checkout,
then fetch and fast-forward only a clean checkout; record the new commit here.
Keep upstream license/provenance when adapting source.

## Resource template lookup

Paths below are relative to `Binary-Templates/`. A missing match means consult
other evidence; it does not imply support or permission to invent a layout.

| Resource type | Template |
| --- | --- |
| `0xFD04E3BE` | `AudioConfiguration_0xfd04e3be.bt` |
| `0x067CAA11` | `BlendGeometry_0x067caa11.bt` |
| `0x034AEECB` | `CASPart_0x034aeecb.bt` |
| `0xEAA32ADD` | `CASPreset_0xeaa32add.bt` |
| `0x6B20C4F3` | `Clip_0x6b20c4f3.bt` |
| `0x62E94D38` | `CombinedBinaryTuning_0x62e94d38.bt` |
| `0x81CA1A10` | `CutoutInfoTable_0x81ca1a10.bt` |
| `0xDB43E069` | `DeformerMap_0xdb43e069.bt` |
| `0xD382BF57` | `Footprint_0xd382bf57.bt` |
| `0x015A1849` | `Geometry_0x015a1849.bt` |
| `0x729F6C4F` | `HouseholdDescription_0x729f6c4f.bt` |
| `0x01942E2C` | `LotDescription_0x01942e2c.bt` |
| `0x319E4F1D` | `ObjectCatalog_0x319e4f1d.bt` |
| `0xC0DB5AE7` | `ObjectDefinition_0xc0db5ae7.bt` |
| `0xD65DAFF9` | `RegionDescription_0xd65daff9.bt` |
| `0xAC16FBEC` | `RegionMap_0xac16fbec.bt` |
| `0x27FE5365` | `ShaderPrecomp_0x27fe5365.bt` |
| `0x545AC67A` | `SimData_0x545ac67a.bt` |
| `0x0354796A` | `Skintone_0x0354796a.bt` |
| `0x71A449C9` | `SkyBoxTextureData_0x71a449c9.bt` |
| `0xD3044521` | `Slot_0xd3044521.bt` |
| `0x220557DA` | `StringTable_0x220557da.bt` |
| `0x3D8632D0` | `TerrainBlendMap_0x3d8632d0.bt` |
| `0x9063660D` | `TerrainData_0x9063660d.bt` |
| `0x033B2B66` | `TerrainKDTree_0x033b2b66.bt` |
| `0xAE39399F` | `TerrainMesh_0xae39399f.bt` |
| `0xB93A9915` | `ThumbnailCache_0xb93a9915.bt` |
| `0x76BCF80C` | `Trim_0x76bcf80c.bt` |
| `0xD04FA861` | `WorldConditionalData_0xd04fa861.bt` |
| `0x810A102D` | `WorldData_0x810a102d.bt` |
| `0xA680EA4B` | `WorldDescription_0xa680ea4b.bt` |
| `0x1CC04273` | `WorldMap_0x1cc04273.bt` |
| `0xFCB1A1E4` | `WorldObjectData_0xfcb1a1e4.bt` |
| `0x19301120` | `WorldTimelineColor_0x19301120.bt` |
