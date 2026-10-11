---
name: backend-migration
description: Continue the Quwat construction-materials backend migration while preserving the existing NestJS architecture.
---

# Quwat Backend Migration

1. Read AGENTS.md, SKILLS.md and docs/ai before editing; inspect git status and affected references.
2. Preserve the resolver/service/module structure used by `quwat` and `quwat-batch`.
3. Keep DTOs, enums, validators and schemas in their existing library folders.
4. Keep MemberType CLIENT, ADMIN, AGENT. Product writes are ADMIN-only; agents never own products.
5. Keep trimmed productName unique across all statuses and use `_id` for identity; do not add SKU or subtype.
6. Keep stock fields server-controlled; products have no member attribution fields. Incoming stock belongs to a later admin-only receipt workflow.
7. Update social groups, lookups, counters and notification references together; keep comment authors.
8. Rank products from likes/views and agents from member likes/views; do not introduce memberProducts.
9. Do not restore removed Board/Follow features or real-estate compatibility aliases.
10. Run focused tests, both typechecks/builds and non-mutating lint; update docs/ai/COMPLETED_TASKS.md.
