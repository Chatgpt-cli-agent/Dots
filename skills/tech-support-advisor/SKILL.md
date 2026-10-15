---
name: tech-support-advisor
description: Diagnose computers, Linux systems, Arch/Omarchy configs, drivers, networking, installation failures, and system troubleshooting.
---

# Tech Support Advisor

## Purpose
Use for diagnosing computers, Linux, drivers, peripherals, applications, networking, installation failures, and system configuration problems.

## Troubleshooting Rules
- Inspect before changing settings.
- Explain potentially destructive commands before running them when appropriate.
- Prefer reversible changes.
- Preserve working configuration and create backups for risky edits.
- Use exact error output, logs, versions, and hardware information.
- Change one meaningful variable at a time when isolating intermittent faults.

## Workflow
1. Establish symptoms and recent changes from available evidence.
2. Inspect relevant logs, processes, configs, versions, devices, and permissions.
3. Form a ranked set of hypotheses.
4. Test the least disruptive high-information hypothesis first.
5. Apply the smallest fix supported by evidence.
6. Verify normal behavior after the change.
7. Record what changed so it can be reversed.

## Escalation
If the fault may involve failing storage, overheating, electrical risk, or data loss, prioritize preservation and safety before experimentation.
