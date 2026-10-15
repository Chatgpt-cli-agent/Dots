---
name: koda-skill-creator
description: Meta-skill to design, create, convert, improve, merge, validate, and install reusable Koda skills from Custom GPTs, prompts, workflows, and documentation.
---

# Koda Skill Creator

## Purpose

Use this skill to design, create, improve, merge, validate, and install reusable Koda skills.

This is a meta-skill: it creates and maintains other skills.

Koda already has terminal, filesystem, Git, memory, skills, background/parallel work, and specialized integrations. Do not rebuild those capabilities inside every new skill. Instead, create focused skill instructions that teach Koda when and how to use her existing capabilities.

---

# Primary Responsibilities

Use this skill when the user asks to:

- create a new Koda skill
- convert a Custom GPT into a Koda skill
- convert a prompt into a Koda skill
- turn a workflow into a reusable skill
- improve an existing skill
- merge overlapping skills
- split an oversized skill
- audit the skill library
- remove duplication
- create a specialized workflow
- package or install skills
- build a skill from documentation, a repo, a prompt, or an example workflow

---

# Core Principle

A skill should teach Koda **how to work**, not merely who to pretend to be.

Prefer operational instructions over persona-only prompting.

Good skills define:

- when to activate
- what evidence to inspect
- which tools to use
- what sequence to follow
- how to validate results
- what output to produce
- what failure modes to avoid

A personality may be included when it materially improves the user experience, but it must not replace the operational workflow.

---

# Skill Creation Workflow

Follow:

**Inspect → classify → compare → design → write → validate → install → document**

---

## 1. Inspect the Source

The source may be:

- a Custom GPT prompt
- a system prompt
- a user workflow
- a GitHub project
- documentation
- a previous Koda skill
- a collection of prompts
- an app or tool description
- a manually described capability

Identify:

- core purpose
- required expertise
- unique behaviors
- workflows
- tool expectations
- output formats
- validation rules
- safety boundaries
- personality/style
- duplicated ideas

Do not blindly preserve every sentence from the source.

Extract the useful behavior.

---

## 2. Classify the Capability

Determine whether the source should become:

### A. New Skill

Create a new skill when the capability:

- represents a distinct domain
- has a unique workflow
- requires specialized tools
- has its own validation process
- would be useful independently

### B. Merge Into Existing Skill

Merge when:

- the new prompt substantially overlaps an existing skill
- the only differences are tone or minor behavior
- creating another skill would confuse routing
- the new material strengthens an established workflow

### C. Supporting Reference

Use a reference file instead of a new skill when the source is mainly:

- factual documentation
- examples
- terminology
- API details
- schemas
- checklists
- static knowledge

### D. Tool or Script

Create a tool/script instead when the desired behavior requires deterministic execution rather than instructions alone.

---

# Duplication Check

Before creating a new skill:

1. inspect the existing skill library
2. compare names and descriptions
3. compare activation conditions
4. compare workflows
5. identify overlapping responsibilities

If overlap is substantial, prefer improving the existing skill.

Avoid libraries like:

```text
coding/
coding-expert/
coding-pro/
10x-coder/
super-coder/
best-coder/
```

Prefer one strong skill with clear responsibilities.

---

# Naming

Use short, descriptive, filesystem-safe names.

Good:

```text
research
sims4-architecture
sims4-modding
game-development
tool-builder
data-analysis
visual-analysis
```

Avoid:

```text
ultimate-super-awesome-coder-v7-final
```

Use lowercase kebab-case for directory names.

---

# Standard Skill Structure

Default:

```text
skill-name/
├── SKILL.md
├── references/
├── examples/
└── scripts/
```

Only create directories that are actually needed.

A minimal skill may contain only:

```text
skill-name/
└── SKILL.md
```

---

# SKILL.md Structure

Use this structure where appropriate:

```markdown
# Skill Name

## Purpose

## When to Use

## Inputs

## Workflow

## Tool Usage

## Validation

## Output

## Failure Modes

## Safety / Boundaries

## Integration With Other Skills
```

Do not force every heading into every skill if it adds no value.

---

# Activation Rules

Each skill should clearly state when it applies.

Example:

```markdown
Use this skill for:

- Sims 4 floor plans
- Build/Buy architecture
- real-world dimensions converted to tiles
- roof planning
- lot validation
```

Avoid vague triggers such as:

```markdown
Use this whenever helpful.
```

---

# Tool Rules

Skills should use Koda's existing tools.

Do not repeatedly recreate:

- filesystem access
- terminal access
- Git
- browser/search
- memory
- package inspection
- code execution
- background work
- Sims Creator Studio capabilities

Instead say what tools to use and when.

Example:

```markdown
When the project is available locally:

1. inspect the actual files
2. search the codebase
3. run relevant diagnostics
4. make the smallest justified change
5. test
6. validate
```

---

# Action-First Rule

When Koda can directly perform the task, the skill should encourage action.

Prefer:

**inspect → act → validate → explain**

over:

**explain → ask user to do everything manually**

Do not stop at instructions when Koda can:

- edit
- build
- run
- test
- search
- validate
- package
- repair
- organize
- inspect

---

# Clarification Rule

Ask a question only when the missing information would materially change the result or block safe progress.

Otherwise:

- inspect available context
- make a reasonable assumption
- label the assumption
- proceed

Avoid unnecessary setup questions.

---

# Validation

Every technical skill should define what success means.

Examples:

### Coding

- code builds
- tests pass
- no new errors
- requested behavior works

### Sims Modding

- package structure is valid
- dependencies are present
- resources are correctly referenced
- no confirmed duplicate conflicts remain

### Sims Architecture

- geometry fits the lot
- stairs and doors route
- rooms function
- unit assignments are correct
- objects exist in the catalog when exact catalog use is required

### Data Analysis

- calculations are reproducible
- source data is preserved
- assumptions are stated
- outputs match requested scope

A skill without validation often becomes a suggestion generator instead of a working skill.

---

# Failure Modes

Explicitly prevent common bad behavior.

Examples:

- do not invent file contents
- do not claim a command succeeded without checking
- do not invent exact object IDs
- do not diagnose from filenames alone
- do not rewrite working systems unnecessarily
- do not create duplicate skills without checking existing ones
- do not claim unsupported capabilities
- do not stop at planning when implementation was requested and possible

---

# Source Conversion Rules

## Custom GPT → Koda Skill

Map:

```text
GPT Instructions
    ↓
Operational rules + workflow

GPT Knowledge Files
    ↓
references/

GPT Conversation Starters
    ↓
examples/ or activation examples

GPT Actions
    ↓
existing Koda tools, scripts, APIs, or MCP integrations

GPT Personality
    ↓
optional tone/style layer
```

Do not blindly copy GPT instructions verbatim.

Rewrite them for Koda's actual environment.

---

# Prompt → Skill

When converting a prompt:

1. extract the capability
2. separate style from workflow
3. identify tool assumptions
4. remove unsupported claims
5. convert passive language into operational steps
6. define validation
7. define routing conditions
8. preserve useful output formats

---

# Repo → Skill

When converting a GitHub repo into a skill:

1. inspect README
2. inspect docs
3. inspect architecture
4. identify workflows
5. identify reusable patterns
6. respect the repository license
7. avoid copying proprietary or leaked material
8. create original instructions based on legitimate public behavior and documentation

A repo may inspire a skill without becoming a verbatim copy.

---

# Ethical Prompt Mining

When a source contains leaked, extracted, or proprietary hidden prompts:

- do not copy them verbatim into Koda
- extract high-level capabilities and design patterns
- write original Koda-native instructions
- preserve useful workflows without reproducing stolen hidden text

Prefer publicly documented behavior, creator-provided material, and permissively licensed sources.

---

# Merge Workflow

When two skills overlap:

1. compare purposes
2. compare triggers
3. compare workflows
4. identify unique sections
5. preserve stronger rules
6. remove repetition
7. resolve contradictions
8. update the surviving skill
9. validate routing still makes sense

Do not simply concatenate both files.

---

# Split Workflow

Split an oversized skill when it has multiple independent domains.

Example:

```text
power-of-3
```

may remain a presentation/personality layer while specialized work is handled by:

```text
sims4-architecture
sims4-modding
game-development
blender-3d
```

Use specialization when it improves routing and maintainability.

---

# Skill Dependency Guidance

Skills may cooperate.

Example:

```text
sims4-architecture
    ↓
visual-analysis
    ↓
sims-catalog
    ↓
lot-generation
    ↓
validation
```

Do not duplicate an entire downstream skill inside the caller.

Reference or invoke the specialized capability instead.

---

# Skill Quality Checklist

Before considering a skill finished, verify:

- clear purpose
- clear activation conditions
- unique capability
- no unnecessary duplication
- operational workflow
- tool guidance
- validation rules
- explicit failure prevention
- realistic capabilities
- useful outputs
- reasonable scope
- readable structure
- no contradictory instructions

---

# Skill Testing

When possible, test new skills against realistic tasks.

Examples:

### Architecture Skill

> Convert this floor plan into a Sims 4 30×20 lot.

Expected behavior:

- inspect plan
- calculate tile geometry
- plan stairs and roofs
- search real catalog when needed
- validate routing

### Coding Skill

> Fix this crash.

Expected behavior:

- inspect logs and code
- reproduce when possible
- identify root cause
- patch
- test

### Research Skill

> Find the latest documentation for this library.

Expected behavior:

- search current sources
- compare dates
- cite evidence
- distinguish current from outdated documentation

If the skill produces only generic advice, improve it.

---

# Installation

Default user skill location:

```text
~/.agents/skills/<skill-name>/
```

Before installing:

1. check whether the target exists
2. inspect existing content
3. avoid destructive overwrite
4. merge when appropriate
5. preserve backups when replacing important skills
6. confirm final files exist

---

# Skill Registry Awareness

When a skill index, router, manifest, or registry exists:

- update it when required
- preserve its format
- validate registration
- do not create duplicate entries

If no registry is required, do not invent one.

---

# Documentation

For every generated skill, provide a concise summary including:

- name
- purpose
- activation triggers
- important dependencies
- whether it was newly created or merged
- files created or changed

---

# Self-Improvement

Koda may use this skill to improve her own skill library.

When doing so:

1. audit current skills
2. identify gaps
3. identify duplication
4. identify weak or vague instructions
5. propose or implement focused improvements
6. test representative workflows
7. preserve working behavior

Do not rewrite the entire library simply for stylistic consistency.

Improve what materially helps performance.

---

# Skill Creation Output

When creating a new skill, produce:

```text
Created:
~/.agents/skills/<name>/SKILL.md
```

and any supporting files.

Then summarize:

- what the skill does
- why it was created instead of merged
- how it activates
- how it was validated

---

# Operational Rule

This is a working meta-skill.

Koda should use her real filesystem and tools to create skills.

Do not merely print a hypothetical `SKILL.md` when the user has asked Koda to install or create the skill and filesystem access is available.

Use:

**inspect → decide → create/merge → validate → install → report**

Above all:

**Build fewer, stronger skills.  
Reuse existing capabilities.  
Remove duplication.  
Make every skill actionable.  
Validate what you create.**
