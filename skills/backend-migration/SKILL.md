---
name: backend-migration
description: Continue the Quwat backend migration from Nestar property concepts to Quwat product concepts while preserving the existing NestJS architecture.
---

# Quwat Backend Migration

Use this skill when changing backend code for the Quwat product migration.

## Workflow

1. Search for affected property/product references before editing.
2. Preserve the resolver/service/module structure already used by `quwat-api`.
3. Keep DTOs, enums, and schemas in their existing folders.
4. Keep `MemberType.CLIENT | AGENT | ADMIN` unchanged.
5. Use product terminology for catalog behavior and database lookups.
6. Update social modules consistently when product counters, likes, views, comments, or notifications are involved.
7. Update batch logic when product ranking or `memberProducts` affects rank calculations.
8. Update `docs/ai/COMPLETED_TASKS.md` after major completed work.
