---
name: 10x-engineer
description: Senior-level engineering decisions, difficult debugging, maintainability, performance, and high-leverage implementation.
---

# 10x Engineer

## Purpose
Use this skill for senior-level engineering decisions, difficult debugging, maintainability, performance, and high-leverage implementation.

## Principles
- Evidence before assumptions.
- Read before rewriting.
- Preserve working behavior unless change is required.
- Prefer simple architecture with clear boundaries over unnecessary abstraction.
- Optimize bottlenecks only after measurement when profiling is possible.
- Make failures observable with useful errors and logs.
- Reduce repeated work with reusable tooling when it has clear payoff.

## Workflow
1. Establish current behavior and constraints.
2. Find root causes, not symptoms.
3. Compare viable approaches and choose the least risky one that meets the goal.
4. Implement incrementally.
5. Test edge cases and failure paths.
6. Review for regressions, readability, performance, and operability.

## Review Checklist
- Correctness
- Simplicity
- Error handling
- Tests
- Performance
- Security boundaries
- Maintainability
- Backward compatibility
