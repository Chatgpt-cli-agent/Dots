---
name: game-development
description: Game engine architecture, gameplay systems, simulation mechanics, AI, 3D asset pipelines, and modding frameworks. Supports Godot, Unity, Unreal Engine, and GameMaker, plus connected simulation systems (motives, autonomy, schedules, behavior trees) and cross-game modding (Skyrim, Minecraft, Stardew Valley).
---

# Game Development & Simulation Systems

Use this skill for game architecture, engine integration, simulation mechanics, autonomous AI, 3D asset pipelines, and modding frameworks.

Operate from: **Understand → inspect → design → act → test → validate → explain**.

---

## Supported Engines

### Godot
- **Languages**: GDScript, C#
- **Core Architecture**: Node trees, scene composition, custom resources, signals, autoload singletons.
- **Subsystems**: NavigationAgent, AnimationPlayer/Tree, visual and spatial shaders, 2D/3D physics, UI containers, background scene streaming.
- **Custom Tooling**: EditorPlugin, `@tool` scripts, and custom dock extensions.

### Unity
- **Languages**: C#
- **Core Architecture**: GameObjects, components, prefab variants, ScriptableObjects for data-driven design.
- **Subsystems**: Addressables, NavMesh pathfinding, Animator/Playables, UI Toolkit / UGUI, PhysX, profiling with Memory Profiler.

### Unreal Engine
- **Languages**: Blueprints, C++
- **Core Architecture**: Gameplay Framework (`AGameModeBase`, `APlayerController`, `ACharacter`), Actors, Components, Data Assets.
- **Subsystems**: Behavior Trees, StateTree, UMG interfaces, Niagara particles, World Partition & streaming, packaging.

### GameMaker
- **Languages**: GML
- **Core Architecture**: Rooms, objects, event hierarchy, state machines, sprite management, surface rendering, save serialization.

---

## Simulation Game Architecture

For simulation games (Sims-likes, city builders, colony management), design in connected, modular systems rather than isolated mechanics:

### 1. Motives, Needs & Autonomy
- Model character drives (energy, hunger, hygiene, social, fun) with decay curves and priority scores.
- Autonomy loops: evaluate environmental affordances and object advertisements to pick the highest utility action.

### 2. Autonomous Schedules & NPC AI
- Utility AI and behavior trees to determine daily routines (work, leisure, sleep).
- Perception systems and activation radii to sleep distant agents while preserving macroscopic state.

### 3. World Simulation & Persistence
- Time/day-night cycles driving systemic events.
- Deterministic state serialization (save/load, household inventories, relationships).

---

## Open-World & City-Scale Systems

When working on streaming or large-scale worlds:
- **Simulation Level-of-Detail (Sim-LOD)**: Transition entities between high-fidelity physics/animation when near the player and statistical background simulation when far away.
- **Spatial Partitioning & Scene Streaming**: Stream world chunks asynchronously based on camera frustum and velocity.
- **Resource Budgets**: Enforce strict draw-call limits, texture budgets, and GC alloc targets per frame.

---

## 3D Asset & Engine Pipeline

Coordinate with Blender (via Koda's CLI or live MCP tooling):
- **Transforms**: Ensure $+Z$ up / $+Y$ forward conversions match the target engine. Apply all rotation and scale (`1.0, 1.0, 1.0`) before export.
- **Topology & LODs**: Verify quad-dominant meshes, clean edge loops, and generate progressive LOD levels (LOD0 through LOD2).
- **PBR Materials**: Channel-pack textures (e.g. ORM: Occlusion, Roughness, Metallic) to save memory bandwidth.
- **Collision & Sockets**: Set up collision hulls (`UCX_` meshes for Unreal, simplified collider shapes for Godot/Unity) and weapon/accessory attachment sockets.

---

## Cross-Game Modding Frameworks

Support legitimate, community-standard modding workflows:
- **Skyrim / Fallout**: Creation Kit records, quest graphs, Papyrus scripts, NavMesh, load-order sorting.
- **Minecraft**: Forge / Fabric modding, registries, block states, recipes, data packs.
- **Stardew Valley**: SMAPI, Content Patcher mods, event scripting, custom farm maps.
