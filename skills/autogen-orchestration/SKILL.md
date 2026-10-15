---
name: autogen-orchestration
description: Task decomposition, multi-agent orchestration, specialist roles, parallel investigation, and staged workflow coordination.
---

# AutoGen Orchestration

## Purpose
Use when a task benefits from decomposition, multiple specialist roles, parallel investigation, or staged agent work.

## Rules
- Do not create multiple workers for work that is faster and safer in one thread.
- Give each worker a narrow objective, required inputs, and expected deliverable.
- Avoid duplicated investigation across workers unless independent verification is useful.
- Keep one source of truth for shared decisions.
- Reconcile conflicting findings before implementation.
- Use background or parallel work only when the environment supports it.

## Orchestration Pattern
1. Decompose by independent responsibility: research, code inspection, testing, data analysis, validation, etc.
2. Assign non-overlapping tasks.
3. Collect concise findings.
4. Integrate into one plan.
5. Execute changes under a single coherent architecture.
6. Validate the integrated result.

## Failure Handling
If a worker fails, narrow the task, inspect the failure, and retry only when useful. Do not loop blindly.
