# EGONAIR Remote Studio — Project Knowledge Base

## What Is This Folder?

This folder is the persistent knowledge base for the **EGONAIR Remote Radio Studio** project.
It exists so that any future agent, engineer, or collaborator can understand the full system state
and continue work safely, without reverse-engineering the codebase from scratch.

---

## MANDATORY: What Every Agent Must Read Before Making Any Changes

Before touching **any** code, configuration, database schema, or environment variable, you must read the following files **in order**:

| Priority | File | Why |
|---|---|---|
| 1 | `project-knowledge-base/AGENT_HANDOFF.md` | Current state, what was last done, what is next |
| 2 | `project-knowledge-base/CURRENT_STATUS.md` | Phase, feature completeness, and known gaps |
| 3 | `project-knowledge-base/ARCHITECTURE.md` | Full system map — services, ports, data flow |
| 4 | `project-knowledge-base/DECISIONS.md` | Why things were built the way they were |
| 5 | `STREAMING_STRATEGY.md` | The streaming provider decision (SHOUTcast only) |
| 6 | `FUTURE_REQUIREMENTS.md` | What is planned but NOT yet built |
| 7 | `backend-audio/PRODUCTION_INTEGRATION_PLAN.md` | The step-by-step plan for the audio pipeline merge |
| 8 | `project-knowledge-base/ISSUES_AND_FIXES.md` | Known bugs already solved — do not re-introduce them |
| 9 | `project-knowledge-base/NEXT_STEPS.md` | The ordered list of what to build next |

> **If `frontend/SRS.md` is ever created, read it immediately after `AGENT_HANDOFF.md`.**

---

## Mandatory Rule for Agents Ending a Work Session

Before concluding any session, the agent **must** update:

- `project-knowledge-base/CURRENT_STATUS.md`
- `project-knowledge-base/ISSUES_AND_FIXES.md`
- `project-knowledge-base/NEXT_STEPS.md`
- `project-knowledge-base/AGENT_HANDOFF.md`

Failure to update these files leaves the project in an undocumented state and creates risk for the next agent.

---

## Project Name and Platform

- **Product:** EGONAIR Remote Studio
- **Language:** Arabic UI (RTL), English code
- **Audience:** Radio station — Admin + Presenters (مذيعون)

---

## File Map

```
project-knowledge-base/
  README.md                  ← This file
  CURRENT_STATUS.md          ← Phase and completion state
  ARCHITECTURE.md            ← System map, ports, data flows
  DECISIONS.md               ← Why things were built this way
  ISSUES_AND_FIXES.md        ← Bugs found and fixed
  NEXT_STEPS.md              ← Ordered implementation backlog
  AGENT_HANDOFF.md           ← Last session summary + immediate next action
```

*Last updated: 2026-04-28*
