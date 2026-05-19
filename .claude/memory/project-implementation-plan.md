---
name: FleetGuard implementation plan pointer
description: The mock → Firebase migration plan lives at IMPLEMENTATION_PLAN.md in project root — read before any backend wiring
type: project
originSessionId: c5b2b0e4-cc0b-4bfb-9858-bdb3dfdef04f
---
The authoritative migration plan from mock data to live Firebase lives at **`IMPLEMENTATION_PLAN.md`** at the project root. It covers 13 phases from env setup to end-to-end testing, and locks in the safety contract that only new `fg_*` collections may be created.

**Why:** User asked for a plan on 2026-04-15 before any backend wiring starts. Plan explicitly honors the "never touch existing DB" constraint and mirrors the brief's §13 build order.

**How to apply:**
- Before starting any Phase N work, re-read the "Safety contract" section at the top of the plan
- Each phase lists exactly which files to create and which `fg_*` collections it touches
- Do not reorder phases — later phases depend on earlier ones (e.g. API routes need the Admin SDK from Phase 2)
- Update the plan's phase checkboxes as work lands (keep it as the single source of truth for backend progress)
