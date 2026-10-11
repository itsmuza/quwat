# Frontend Migration

Updated: **2026-10-11**. No frontend source exists in this repository. The Product GraphQL contract is now implemented in the backend working tree; frontend work remains separate.

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
- Do not send stock quantities in inputs. Product has no creator/updater member references. Stock starts at zero and receiveStock is not yet callable.
- WholeSom is a numeric scalar, map to number in codegen. Never use GraphQL Int for price. Metric quantities use Float with three-decimal validation.
- ProductUnit values are DONA (dona), QOP (qop), METR (metr), KG (kilogramm). Send these values in product inputs and search.unitList; for example, JSON variables use "productUnit": "DONA". Refresh generated GraphQL types and Postman requests after this breaking enum change.
- Signup exposes no role selection; profile cannot change role/status. JWT carries identity only; use returned member data for current UI roles and handle server-side revocation.

## Next frontend work

Locate the actual frontend repository and read its instructions; update GraphQL documents/fragments and generated types against the current schema. Remove old agent listing, Board and Follow routes/widgets. Verify public ACTIVE filtering, admin lifecycle actions, input rejection and favorites/visited.

Commerce screens remain future work. Agent payment confirmation must produce COMPLETED payment status without automatically marking an order delivered or debt fully settled. Do not add earlier agent order/debt/fulfillment permissions without an agreed contract.
