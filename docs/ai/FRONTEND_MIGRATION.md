# Frontend Migration

Updated: **2026-10-13**. No frontend source exists in this repository. Product, Saved and Attendance GraphQL contracts are implemented; frontend work remains separate.

## Contract mapping

| Old operation/contract | Current contract |
| --- | --- |
| getProperty(propertyId) | getProduct(productId) |
| getProperties | getProducts with ProductsInquiry |
| createProperty | createProduct, ADMIN-only |
| updateProperty and updatePropertyByAdmin | updateProduct, ADMIN-only |
| getAllPropertiesByAdmin | getAllProductsByAdmin with AllProductsInquiry |
| removePropertyByAdmin(propertyId) | removeProductByAdmin(productId), archives |
| getAgentProperties | Removed; no agent management replacement |
| likeTargetProperty(propertyId) | likeTargetProduct(productId) |
| getFavorites/getVisited | Same names, Products output; ACTIVE cards only |
| USER | CLIENT |
| PROPERTY/ARTICLE social groups | PRODUCT retained, ARTICLE removed; MEMBER retained |
| MemberUpdate role/status/ID | Profile-only MemberUpdate; AdminMemberUpdate for administrative changes |
| memberDecs | Correct field: memberDesc |
| Board/Follow, their counters and meFollowed | Removed |

Comment queries now require `search.commentGroup` alongside `commentRefId`.

## Product UI

- Public catalog/detail: productName, Uzbek productType, optional brand/description, productImages, unit and whole-so‘m price. No housing badges, SKU, subtype or owner.
- Filters: typeList, unitList, brandList, pricesRange(start/end), periodsRange(start/end), inStock and literal name text. Public search has no status/agent field.
- Pagination: page >= 1, limit 1–100; default createdAt DESC. Admin search additionally accepts productStatus.
- Use `_id` in routes/cache/references. Names must be unique after trimming across all statuses (case-sensitive). Handle name conflicts from createProduct/updateProduct.
- Admin product forms call createProduct/updateProduct; default status DRAFT, explicit ACTIVE publishing. Removal archives; updateProduct can restore.
- Hide product creation/editing controls from CLIENT and AGENT. There is no `/agent/products` management workflow.
- ADMIN forms may send initial productQuantity on create (default zero). For a changed total on update, send productQuantity and expectedProductQuantity from the loaded product; omit both when stock is unchanged. Enforce whole DONA/QOP, three-decimal METR/KG, 0–1,000,000,000 and total >= reserved. Never send productReservedQuantity. Product has no creator/updater member references. receiveStock is not yet callable.
- WholeSom is a numeric scalar, map to number in codegen. Never use GraphQL Int for price. Metric quantities use Float with three-decimal validation.
- ProductUnit values are DONA (dona), QOP (qop), METR (metr), KG (kilogramm). Send these values in product inputs and search.unitList; for example, JSON variables use "productUnit": "DONA". Refresh generated GraphQL types and Postman requests after this breaking enum change.
- Signup exposes no role selection; profile cannot change role/status. JWT carries identity only; use returned member data for current UI roles and handle server-side revocation. App entry/focus/visible return now uses refreshSession to renew a still-valid token for 30 days and retrieve the current profile. Cross-tab token changes use non-renewing validation; expired tokens require login. See AUTH_SESSION.md.

## Implemented frontend integration

AGENT attendance is implemented with with requestAttendance (no client date/member ID), getMyAttendances and statuses ABSENT/PENDING/APPROVED/REJECTED. Only APPROVED is present. Display virtual ABSENT rows without linking to a request or showing request/review times (all null). Use ADMIN getAllAttendancesByAdmin with PENDING filter for the queue, reviewAttendance for approval/rejection, and getDailyAttendancesByAdmin for the current-agent roster including ABSENT/BLOCK. Calculate UI dates in Asia/Tashkent; finalized decisions cannot be reversed. Distinguish stored-request history from computed daily/calendar rows, and handle the explicit setup-required error until rollout initialization is complete. See ATTENDANCE_API.md.

CLIENT Saved is implemented with saveProduct/unsaveProduct/getSavedProducts, separate from likes/favorites and any cart. Select Product.meSaved in catalog/detail queries for bookmark state; anonymous/ADMIN/AGENT responses are false. Saved returns ACTIVE and ARCHIVED cards; use productStatus to label ARCHIVED as unavailable and disable ordinary product-detail links for archived cards (getProduct remains ACTIVE-only). DRAFT/missing cards are hidden, with saved links retained; restoration shows the card again. Repeated save does not change its list position; unsave then save creates a new first-save date. See SAVED_PRODUCTS_API.md for requests/variables.

Locate the actual frontend repository and read its instructions; update GraphQL documents/fragments and generated types against the current schema. Remove old agent listing, Board and Follow routes/widgets. Verify public ACTIVE filtering, admin lifecycle actions, input rejection and favorites/visited.

CLIENT cart and /mypage?category=orders, AGENT /mypage?category=payments, and ADMIN /_admin/sales are implemented. requestSale reserves stock, approveSale records offline CASH/CARD receipt, cancelSale releases own pending reservations. Daily reports use Asia/Tashkent completion dates and immutable price/name/quantity snapshots. See SALES_API.md. No online gateway, debt or fulfillment UI/API was added.
