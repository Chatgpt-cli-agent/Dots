---
name: sims-4-tray-lab
description: "Narrow helper for an unknown Sims 4 Tray byte layout. Defers file types, DBPF structure, and the reverse-engineering method to sims-4."
triggers: sims-4-tray-lab, tray, trayitem, blueprint, householdbinary
---

# Sims 4 Tray Lab

## When to use
Use this only when the user has Tray files and wants a field map that `sims-4` has not already documented. For known Tray types, DBPF layout, or the comparison method, load `sims-4` and stop.

## Steps
1. Load `sims-4` and its Tray references (`references/tray-files.md`, `references/s4s/tray-pipeline.md`, `references/reverse-engineering.md`).
2. Identify the file by size and header, then compare two samples that differ by one in-game change.
3. Record each candidate field as confirmed or hypothesis. Do not promote a hypothesis to a format fact.

## Do not invent
- Do not claim an undocumented Sims 4 field, checksum, or timestamp as fact.
- Do not restate the Tray type list or the DBPF layout that `sims-4` already owns.

## Defer to
- sims-4 — Tray file types, the tray-to-blueprint pipeline, and the byte-comparison method
