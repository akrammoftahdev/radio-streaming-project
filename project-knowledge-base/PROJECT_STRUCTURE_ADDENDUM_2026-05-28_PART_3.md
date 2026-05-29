# Project Structure Addendum — May 28, 2026 (Part 3)

---

## New/Modified Files — Evening Session

### DSP System

```
frontend/src/lib/dsp-presets.ts
├── DspParams interface        — Added 8 optional boolean enable flags
├── DEFAULT_DSP_PARAMS          — Added enable defaults (filter=true, rest=false)
├── DSP_GROUP_ENABLE_KEY        — NEW: maps group keys to enable flag names
├── DspNumericKey type          — NEW: excludes boolean flags from param meta
├── DSP_PARAM_META              — Type changed from Record<keyof DspParams> to Record<DspNumericKey>
├── DSP_GROUPS                  — Unchanged
└── SYSTEM_PRESETS (×10)        — All updated with explicit enable flags
```

```
frontend/src/components/studio/DspPanel.tsx
├── Import: DSP_GROUP_ENABLE_KEY — NEW
├── Group header                 — Split into toggle button + expand chevron
├── Toggle switch                — dir="ltr", left positioning, violet/grey
└── Slider container             — opacity-40 + pointer-events-none when disabled
```

```
frontend/src/app/studio/studio-ui.tsx
└── applyDspParams()             — Checks per-group enable flags, sets bypass values
```

### KB Cleanup

```
frontend/prisma/schema.prisma           — Comments: LOCAL DEV ONLY + VPS/PRODUCTION
frontend/prisma/schema.cloud.prisma     — Comments: Production schema — PostgreSQL on VPS
project-knowledge-base/AGENT_HANDOFF.md — 18 historical markers
project-knowledge-base/CURRENT_STATUS.md — 19 historical markers
project-knowledge-base/NEXT_STEPS.md    — 10 historical markers
project-knowledge-base/ISSUES_AND_FIXES.md — 12 historical markers
project-knowledge-base/09_deployment_and_infrastructure.md — 5 historical markers
project-knowledge-base/SYSTEM_AUDIT_CURRENT_STATE_2026-05-19_PART_1.md — 6 historical markers
```
