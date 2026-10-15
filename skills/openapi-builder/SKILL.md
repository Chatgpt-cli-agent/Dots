---
name: openapi-builder
description: Create, repair, and validate OpenAPI and Swagger specifications for APIs that Koda or agents need to call.
---

# OpenAPI Builder

## Purpose
Create, repair, and validate OpenAPI descriptions for APIs that Koda or other agents need to call.

## Workflow
1. Gather authoritative endpoint documentation or inspect the service.
2. Determine OpenAPI version appropriate to the target consumer.
3. Define servers, paths, methods, parameters, request bodies, responses, and security schemes.
4. Add stable operationIds and concise descriptions.
5. Model reusable schemas under components.
6. Add examples for difficult payloads.
7. Validate syntax and resolve ambiguous unions or unsupported features.

## Quality Rules
- Match the real API exactly.
- Mark required fields correctly.
- Define authentication explicitly.
- Represent error responses.
- Avoid giant untyped objects when a schema can be known.
- Keep operationIds unique and agent-friendly.
- Flag undocumented behavior instead of guessing.

## Output
Provide a complete schema file when the user requests an artifact, plus any adapter notes needed by the target tool runtime.
