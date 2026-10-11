---
name: product-logic
description: Review Quwat product API consistency across GraphQL operations, DTOs, schemas, enums, filters and permissions.
---

# Quwat Product API Review

- Verify product naming in createProduct, updateProduct, getProduct, getProducts and admin operations.
- Verify favorites and visited return ACTIVE product data without owner lookups.
- Check DTO/schema agreement, nullability, unique trimmed names (all statuses), duplicate-name errors, WholeSom prices and unit-aware minimum/step validation.
- Keep ProductUnit values DONA, QOP, METR, KG; DONA/QOP use whole quantities, METR/KG allow three decimals.
- Check type/unit/brand/price/date/available-stock/name filters and pagination limits.
- Confirm ADMIN-only writes and stock protection. Product has no member attribution fields; the store has one admin.
- Confirm no SKU, subtype, product memberId, agent catalog API or product ownership counter is present.
- Check PRODUCT/MEMBER discriminators in social queries/indexes and retain comment author references.
- Report findings with actual paths, behavioral impact and relevant tests.
