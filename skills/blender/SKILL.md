---
name: blender
description: Create, inspect, edit, animate, and render Blender scenes using Koda's headless CLI-Anything adapter or the live Blender MCP session.
---

# Blender

Koda has two Blender backends. Choose the backend from the user's requested workflow:

- Use the installed `blender` CLI-Anything capability for reproducible background jobs, generated `.blend` files, scripted scene construction, animation, previews, and final renders.
- Use the enabled `Blender Live` MCP server for inspecting or editing the Blender session currently open on the user's desktop, preserving live scene state, or making iterative object/material/camera changes.

When the task does not specify a live session, prefer CLI-Anything for deterministic artifact creation. When using Blender Live, first confirm Blender is open and the MCP for Blender addon is running from Blender's sidebar. Save before destructive changes and keep Blender MCP safe mode enabled.

Return the output path for every saved `.blend`, rendered image, animation, or preview. Use absolute paths for render outputs so Koda can surface the resulting artifact reliably.
