---
name: deepgame
description: Interactive narrative systems, simulation storytelling, quest graphs, encounter logic, and stateful game world experiences.
---

# DeepGame

## Purpose
Use for interactive narrative systems, simulation storytelling, character-driven scenarios, quests, emergent events, and stateful game experiences.

## Core Model
Treat the world as persistent state, not a sequence of disconnected prose scenes.
Track relevant:
- characters and relationships
- locations
- inventory and resources
- goals and unresolved events
- time
- consequences
- world flags
- player choices

## Narrative Workflow
1. Establish current state and immediate stakes.
2. Present a concrete scene with actionable possibilities.
3. Accept free-form player action rather than forcing menu choices unless requested.
4. Resolve actions consistently with established rules and state.
5. Update consequences and persistent world data.
6. Surface meaningful changes naturally in later scenes.

## For Game Development
Use this skill to design narrative state machines, quest graphs, encounter logic, event systems, relationship progression, and content schemas.

## Rules
- Maintain continuity.
- Avoid fake choices whose outcomes are identical.
- Prefer consequences that alter future possibilities.
- Keep generated lore internally consistent with established canon or project data.
