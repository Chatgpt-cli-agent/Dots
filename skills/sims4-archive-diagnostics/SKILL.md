---
name: sims4-archive-diagnostics
description: Deep archive diagnosis and folder health checks for The Sims 4. Audits mod archives (.zip, .package, .ts4script), detects duplicate packages, checks script nesting depth, identifies tuning collisions, isolates conflicting mod versions, and produces structured diagnostic reports. Activated automatically or via the phrase "Reveal what lies within."
---

# Sims 4 — Deep Archive Diagnostics & Mod Health

Use this skill when auditing, troubleshooting, cleaning, or diagnosing Sims 4 mod collections, archives (`.zip`, `.rar`, `.7z`), or active `Mods/` folders.

Operate from: **Inspect → understand → isolate → repair safely → validate**.

---

## Cue Phrase: Deep Archive Audit

The phrase:
> **"Reveal what lies within."**

activates a full **Deep Archive Inspection** whenever a mod file, directory, or archive is provided. Perform the actual technical inspection rather than merely describing what could be done.

---

## The 4-Phase Audit Workflow

### Phase 1 — Inventory
- Scan files, directories, archives, `.package` containers, and `.ts4script` archives.
- Inventory contents, file sizes, and directory nesting depths.
- Flag backup files placed inside active folders (e.g., `.package.bak`, `Copy of...`).

### Phase 2 — Resource Inspection
- Parse DBPF headers and resource index histograms.
- Inspect resource types (tuning XML, SimData, STBL, CAS, OBJ, MODL).
- Check instance IDs and Python bytecode versions in `.ts4script` files.
- For deep code decompilation, delegate to `sims4-mod-reverse-engineering`.

### Phase 3 — Structure Analysis
- **Script Depth Verification**: Verify `.ts4script` files are placed at most 1 subfolder deep in the `Mods/` directory (`Mods/*.ts4script` or `Mods/<FolderName>/*.ts4script`). The game engine cannot load Python scripts nested 2 or more subfolders deep.
- **Duplicate Detection**: Identify identical packages, packages with differing version suffixes (e.g. `mod_v1.2.package` vs `mod_v1.3.package`), and duplicate instance IDs across distinct packages.
- **Tuning Conflict Check**: Flag multiple packages modifying the exact same EA tuning instance ID.

### Phase 4 — Safe Repair
- **Never overwrite the user's only recoverable original copy.**
- Make the smallest justified correction.
- Quarantine or remove only confirmed bad duplicates.
- Re-validate archive integrity after adjustments.

---

## Diagnostic Output Format

When completing a deep audit or archive inspection, structure the findings clearly:

### 1. Archive Health Summary
A concise summary covering overall status, primary issues discovered, and whether the archive is healthy, damaged, outdated, conflicted, or disorganized.

### 2. Diagnostic Report
- **Archive Structure**: Directory tree and nesting depth.
- **Resources Found**: Breakdown of `.package`, `.ts4script`, and loose files.
- **Conflicts & Duplicate Resources**: Confirmed ID collisions, duplicate packages, and version mismatches.
- **Suspected Issues**: Outdated mods, missing prerequisites, or legacy dependencies.
- **Recommended Folder Layout**: Clear organization plan.
- **Repairs Performed**: Exactly what was cleaned, quarantined, or updated.

### 3. Seal of Completion
Conclude every deep archive inspection report with:
**🪞✨**
