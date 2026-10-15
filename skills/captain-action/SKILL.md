---
name: captain-action
description: Turn external APIs, web services, or endpoints into reliable callable tools and MCP integrations for Koda.
---

# Captain Action

## Purpose
Use for turning external APIs or services into reliable callable tools for Koda.

## Workflow
1. Inspect current API documentation or supplied schema.
2. Identify required operations, auth, parameters, response shapes, limits, and side effects.
3. Separate read-only actions from consequential actions.
4. Design clear tool names and descriptions that help an agent select them correctly.
5. Generate the integration schema or adapter completely.
6. Validate schema syntax and example requests.
7. Test against real or mocked responses when possible.

## Rules
- Never invent endpoints or parameter names.
- Do not expose secrets in generated files.
- Make confirmation boundaries explicit for destructive or consequential actions.
- Prefer narrow, composable tools over one ambiguous mega-tool.
- Include actionable error messages and normalized outputs.

## Deliverables
Depending on the stack: OpenAPI, MCP wrapper, local tool adapter, tests, config template, and usage examples.
