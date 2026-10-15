---
name: open-design
description: Use Open Design automatically for visual design work, UI prototypes, design systems, live artifacts, exportable HTML/PDF/PPTX/MP4 deliverables, and inspecting or updating projects in the local Open Design workspace through its MCP tools.
---

# Open Design

Use this skill when a request is primarily about visual product design or a
design artifact rather than ordinary source-code implementation.

## When to use it

Route to Open Design for:

- landing pages, dashboards, app screens, component mockups, and UI prototypes;
- design systems, visual directions, palettes, typography, and brand-led layouts;
- live HTML artifacts or exports such as PDF, PPTX, MP4, and image/video design;
- reading, comparing, or updating files in an Open Design project;
- turning a product brief into a polished visual deliverable.

For architecture, API flows, infrastructure, data lineage, or lifecycle
diagrams, use Archify for the diagram itself and Open Design when the result
also needs a visual artifact or presentation.

## How to work

Prefer the local Open Design MCP tools when they are available. Use the active
Open Design project and file context when the user has not named a project.
Inspect the project before editing it, preserve existing design direction, and
write changes back through the Open Design project/artifact workflow so the
preview stays connected to the source.

The Open Design MCP server is the local stdio command:

```text
node /home/windenburg/Projects/open-design/apps/daemon/bin/od.mjs mcp
```

If the MCP server is unavailable, report that Open Design must be running and
continue with ordinary local files only when the user has supplied a clear
filesystem target. Do not silently switch a requested Open Design task to the
AMR Cloud runtime. Open Design's local MCP and local CLI paths do not require
an Open Design wallet balance; only AMR Cloud model calls do.

Keep the user's requested deliverable and tool authority explicit: reading and
designing are safe defaults, while creating, overwriting, exporting, or
starting external processes requires the normal user approval for that action.
