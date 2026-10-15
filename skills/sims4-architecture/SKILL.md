---
name: sims4-architecture
description: Architectural design, floor plan interpretation, tile geometry translation, build planning, For Rent rental unit configuration, and routing validation for The Sims 4. Use when designing lots, converting real-world architectural floor plans to Sims tiles, creating room schedules, object schedules, roof plans, landscaping layouts, unit manifests, or validating build accessibility.
---

# Sims 4 — Architecture and Build Planning

Treat Sims architecture and build planning as a major technical specialty. Use this skill to design, interpret, translate, validate, and document playable, buildable Sims 4 structures.

Operate from **reference → geometry → room plan → circulation → structure → objects → gameplay → validation**.

---

## Real Measurements to Sims Tiles

When translating real-world dimensions into Sims geometry:

1. Identify the important dimensions.
2. Determine which dimensions must remain accurate.
3. Choose a practical Sims tile interpretation (commonly ~2.5 to 3 feet / 0.75 to 0.9 meters per tile as a working approximation).
4. Preserve proportions where exact scale is impossible.
5. Prioritize usable room geometry over rigid math.
6. Maintain believable circulation.
7. Account for wall thickness visually.
8. Verify furniture fit.
9. Verify stair clearance and landing footprint.
10. Verify door and window placement.

Do not pretend there is one universally exact real-world-to-Sims conversion ratio. When using a working approximation, state the assumption, apply it consistently, and adjust where gameplay requires compromise.

---

## Floor Plan Interpretation

When given a floor plan, architectural drawing, or reference image:

### 1. Inspect
Identify:
- Exterior footprint
- Room labels and functional zoning
- Dimensions and wall relationships
- Doors, windows, and circulation paths
- Stairs and vertical connections
- Closets, bathrooms, and kitchens
- Structural focal points and unusual geometry

### 2. Translate
Create a Sims-ready layout with:
- Exterior tile dimensions
- Room-by-room tile dimensions
- Hallway widths (minimum 2 tiles for primary halls, 3+ for grand circulation)
- Door and window locations
- Stair locations (reserve full run plus 1–2 landing tiles)
- Floor alignment across levels
- Foundation or platform elevation notes

### 3. Validate
Check:
- Whether rooms fit standard Sims furniture
- Whether hallways route without bottlenecks
- Whether stairs have sufficient top and bottom landing space
- Whether bathrooms and kitchens function without obstruction
- Whether doors collide with adjacent walls or objects
- Whether the exterior massing remains proportionally coherent

Convert plans into structures that can actually be built and played.

---

## Build Output Formats

Produce concrete, structured outputs when useful.

### Tile Dimensions Example
```text
First Floor Exterior:
28 × 34 tiles

Living Room: 8 × 7
Kitchen: 7 × 6
Dining Room: 6 × 5
Main Hall: 3 tiles wide
```

### Floor-by-Floor Layout Example
```text
GROUND FLOOR
Front:
- Entry: 4 × 3
- Study: 6 × 5
Center:
- Main Hall: 3 tiles wide
- Stairwell: 5 × 7
Rear:
- Kitchen: 8 × 6
- Dining: 7 × 6
- Family Room: 9 × 7
```

### Room Schedule
| Room | Tiles | Floor | Doors | Windows | Notes |
|---|---:|---:|---|---|---|
| Kitchen | 8×6 | 1 | Hall, Dining | Rear | Island fits; 1 tile clearance on all sides |
| Primary Bedroom | 8×7 | 2 | Hall | Front + side | Ensuite adjacent; fits double bed with dual access |

### Object Schedule
Include:
- Object purpose & catalog category
- Preferred size / footprint
- Pack requirement or Base Game substitute
- Placement notes (routing clearances, surface slots)

### Roof Plan
Specify:
- Roof types (gabled, hipped, half-gabled, mansard, flat/platform)
- Footprint & ridge directions
- Dominant primary roof mass vs secondary cross-roofs
- Pitch, overhang, trim, and dormer placement

### Landscaping Plan
Specify:
- Foundation planting, shade trees, and garden zones
- Path widths, fencing, gates, terrain elevation, and outdoor activity spaces

---

## Sims Creator Studio (SCS) Integration & Catalog Selection

When Sims Creator Studio tools are available, use them directly:
1. Search the real Sims 4 catalog rather than guessing names or prices.
2. Inspect pack, category, subcategory, swatches, footprint, and placement tags.
3. Prefer actual catalog resources over invented substitutes.
4. Never fabricate catalog IDs or object names.
5. If pack ownership is unconfirmed, provide the preferred pack item plus a Base Game alternative.

---

## The Sims 4: For Rent Architecture

For residential rental lots (*The Sims 4: For Rent*), treat rental-unit planning as both architectural geometry and gameplay configuration:

### Unit Planning & Boundaries
- Plan residential rental lot layout, unit footprints, and entrances.
- Keep shared corridors, shared yards, utility spaces, and communal recreation clearly separated from private units.
- Ensure private unit boundaries are intentional and internally connected.

### Unit Assignment Manifest
```text
UNIT 1 (Ground Floor)
- Living Room, Kitchen, Bedroom, Bathroom, Rear Patio

UNIT 2 (Second Floor)
- Living Room, Kitchen, Bedroom 1, Bedroom 2, Bathroom

SHARED (Communal)
- Front Porch, Entry Hall, Main Stairwell, Laundry Room, Backyard
```

### For Rent Validation Checklist
- [ ] Each unit is fully internally connected without crossing unowned private space.
- [ ] Shared spaces (stairwells, laundry, amenities) are accessible from all unit entrances.
- [ ] Unit boundaries do not leave orphan tiles or accidentally assign shared hallways to a tenant.

---

## Routing and Accessibility Validation

Validate before finalizing any build:
- **Door clearance**: Minimum 1 tile free in front of both sides.
- **Bed access**: Double beds require at least 1 tile clearance on both sides for two Sims to use them.
- **Stair clearance**: Ensure 1 full tile landing clearance at top and bottom.
- **Appliances**: Stoves, refrigerators, and sinks need unobstructed front tiles.
- **Bathrooms**: Toilets and showers require unimpeded access tiles.

---

## Structured Tray Generation Manifest

When preparing a build specification for deterministic Tray/lot generation:
```text
LOT
- Size: 30×20
- Orientation: Road South
- Building Origin: x=6, y=4

GROUND FLOOR
- Exterior Footprint: 18×14
- Entry: South wall (x=9, y=4)
- Stairwell: x=8..12, y=6..11

SECOND FLOOR
- Exterior Footprint: Aligned with ground floor
- Hallway: 3 tiles wide

ROOF
- Main Gable: East-West ridge
- Secondary Front Cross Gable: North-South ridge

VALIDATION
- All beds dual-accessible
- All appliances functional
- Clear routing through all common doors
```

---

## Interior Design & Themed Builds

Treat Sims interiors as playable, storytelling environments, not static sets.

### Themed & Supernatural Architectural Archetypes
- **Victorian Manors & Conservatories**: Multi-story ancestral massing, formal circulation, stained glass, enclosed glass-and-iron botanical conservatories.
- **Apothecaries & Herb Gardens**: Functional potion crafting, dried herb racks, alchemy stations, greenhouse extensions.
- **Attics & Hidden Rooms**: Concealed doors behind bookcases, spellbook shrines, ancestral artifact storage, ritual circles.
- **Coven & Study Spaces**: Communal gathering circles, research libraries, enchanted dormitories.

### Interior Design Evaluation Checklist
- [ ] **Household Alignment**: Adapt rooms around Sim traits, aspirations, careers, occult types, and family structure.
- [ ] **Playability First**: Verify interaction radii around surfaces, seating, mirrors, and activity objects.
- [ ] **Lighting Hierarchy**: Layer ambient ceiling illumination with wall sconces and focused task lighting.
- [ ] **Pack Integrity**: Identify required packs and always provide Base Game equivalents for essential functional items.
