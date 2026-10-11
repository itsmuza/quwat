# Frontend Migration: Nestar → Quwat

Snapshot: **2026-10-11**, Asia/Seoul. This is a plan, not an implemented frontend migration.

## Naming and repository boundary

The documentation request says **“map old Nestar frontend pages/components to Quwat pages/components.”** Earlier session decisions and the implemented backend rename consistently use **Quwat**. Quwat has not been established as an application or commerce domain in this session.

**Working assumption:** Quwat is a naming typo for Quwat. The table labels below retain “Quwat/Quwat target” to make the discrepancy explicit. Confirm the name before changing frontend branding; do not rename the backend to Quwat or introduce pet-related features based on that word.

No Next.js source, `.tsx` files or Next.js configuration was found in this backend repository. All old route/component labels below are **representative Nestar concepts**, not verified frontend filenames. Target routes/components are proposed. Router version, actual layout, GraphQL client, code generation, localization and test tooling must be inspected in the frontend repository first.

## Step-by-step migration

1. **Discover and baseline:** locate the frontend repository; read its instructions; inventory pages/routes, Property/Board/Follow components, GraphQL documents, generated types, auth storage, role guards, branding and build configuration. Run its existing checks and record failures.
2. **Confirm branding:** resolve Quwat/Quwat. Update titles, logos already supplied by the project, metadata, navigation, package/app names and environment display labels. Do not replace a database/API hostname or secret by text substitution.
3. **Keep the branding release compatible:** today's backend still exposes Property, USER, Board and Follow. Do not send Product operations or CLIENT values until that backend contract ships. New commerce screens are not functional against today's schema.
4. **Agree the domain contract:** review Product fields, units, quantity validation, whole-so‘m transport/rounding, customer permissions, stock receipt and order/payment/debt/delivery schemas with the backend implementer. Define final operation names and arguments before generating types.
5. **Replace real-estate catalog UI:** implement product cards/detail/forms and category/brand/price/availability filters. Remove beds, rooms, house type, property area, rent, barter, construction date and Korean property-location filters. Delivery address is a new field, not a reused property-location enum.
6. **Migrate roles and remove community:** USER → CLIENT in generated types, routes and guards. Remove Board/Follow navigation, pages, queries, counters and `meFollowed` widgets at the coordinated domain cutover. Keep agent staff views and product/member comments/likes/views.
7. **Add client commerce UI:** cart, order submission/history/detail, cash/card/credit preference, free pickup/delivery choice and private debt/receipt history. Only clients create orders. Backend approval and receipt confirmation determine status; a client selection never records a payment.
8. **Add agent/admin UI:** agents confirm orders, record in-store receipts, approve debt with due dates, record partial repayments and update fulfillment. Admins inspect/update records and receive stock; intake displays existing + incoming = resulting quantity. Hide direct stock replacement from agent product forms.
9. **Cut over GraphQL and cache:** regenerate types from the implemented backend schema; update operation documents, argument/field names, fragments, sort keys, enum values, cache identities and invalidation. For the future new database, invalidate old sessions/cache rather than expecting account/ID continuity.
10. **Validate and release together:** run the actual frontend lint/typecheck/build and focused behavior tests; verify role isolation, quantity/money behavior and all commerce states against an isolated backend. Release the breaking frontend/backend contract together and update the documentation with real paths/results.

## Proposed page/component mapping

Every source label is conceptual until frontend inspection. These mappings describe the Quwat construction-materials target even if Quwat is later confirmed as its frontend display name.

| Nestar page/component concept | Proposed Quwat/Quwat target | Change |
| --- | --- | --- |
| Home / featured properties | `/` / ProductShowcase | Material categories, featured products, store information |
| Property list / PropertyCard | `/products` / ProductCard | SKU/unit/whole-so‘m price/availability; no housing badges |
| Property detail / PropertyDetails | `/products/[productId]` / ProductDetails | Specifications, unit/quantity selector, client add-to-cart |
| Property search / PropertyFilter | ProductFilters | Category, brand, price, availability, text |
| Favorites / favorite-property cards | `/favorites` / FavoriteProducts | Product references and cache updates |
| Visited properties | `/recently-viewed` / RecentlyViewedProducts | Product visits |
| Login/signup / UserProfile | `/login`, `/signup`, `/account` / ClientProfile | Preserve auth operations initially; migrate role to CLIENT later |
| Agent list/profile | Staff directory/profile where required | Internal store agents; no independent shops or follow controls |
| Agent properties / create-edit listing form | `/agent/products` / ProductManagementForm | Product metadata; warehouse quantity not directly editable |
| Admin properties / members | `/admin/products`, `/admin/members` | Inspection, updates, role management |
| Board list/detail/editor / ArticleCard | Removed | Remove routes, navigation, fragments and article interactions |
| Followers/following / FollowButton | Removed | Remove counters, actions and all subscription documents |
| No existing counterpart | `/cart`, `/checkout`, `/orders`, `/orders/[orderId]` | Client-only order creation and order status |
| No existing counterpart | `/account/debts` / DebtHistory | Client-private balance, due date and actual repayment history |
| No existing counterpart | `/agent/orders`, `/agent/payments`, `/agent/debts` | Agent confirmation, offline receipts and credit management |
| No existing counterpart | `/admin/inventory` / StockReceiptForm | Admin-only additive intake/history: 10 + 100 = 110 |
| No existing counterpart | Order delivery section / DeliveryForm | Free delivery or pickup, recipient/address/phone and progress |

## GraphQL operation and type migration

**Current:** all operation/type names below still use the existing Nestar domain. **Target:** proposed names are not implemented; validate them against the final backend contract.

| Current operation | Proposed domain-phase operation | Required document changes |
| --- | --- | --- |
| `getProperties` | `getProducts` | Product selection, category/unit/availability filters, product sort keys |
| `getProperty(propertyId)` | `getProduct(productId)` | Variable/argument rename and Product fragment |
| `createProperty` | `createProduct` | ProductInput; agent form; no housing fields |
| `updateProperty` | `updateProduct` | ProductUpdate; keep stock mutation separate |
| `getAgentProperties` | `getProductsByAgent` | Finalize whether agent parameter filters creation attribution or returns shared store catalog |
| `likeTargetProperty(propertyId)` | `likeTargetProduct(productId)` | Product ID and cache invalidation |
| `getAllPropertiesByAdmin` | `getAllProductsByAdmin` | Admin Product filter/selection |
| `updatePropertyByAdmin` | `updateProductByAdmin` | Admin metadata update; receipts through inventory operation |
| `removePropertyByAdmin(propertyId)` | `removeProductByAdmin(productId)` | Final removal/archive behavior must preserve sale/stock history |
| `getFavorites`, `getVisited` | Same names, Product return types | Replace all Property fragments and cache references |
| `signup`, `login`, `getMember`, `updateMember`, admin member operations | Same names unless contract review changes them | CLIENT enum, removed community fields, restricted privileged inputs |
| `getAgents`, `likeTargetMember` | Retained if still required | Agent staff terminology; no marketplace/follow assumptions |
| `createComment`, `getComments`, `updateComment`, `removeCommentByAdmin` | Same names with revised groups | PROPERTY → PRODUCT; remove ARTICLE group |
| `subscribe`, `unsubscribe`, `getMemberFollowers`, `getMemberFollowings` | Removed | Remove documents, hooks, components and generated types |
| Board article operations | Removed | Remove create/get/list/update/like/admin article operations and fragments |

Type changes include Property → Product, Properties → Products, PropertyInput/Update → ProductInput/Update, catalog inquiry/filter types, MemberType.USER → CLIENT and PROPERTY/ARTICLE interaction groups. Housing enums must not be mechanically mapped to material categories. No legacy records need converting.

New proposed operation families: client `getCart`, `setCartItem`, `removeCartItem`, `createOrder`, `getMyOrders`, `getOrder`, `cancelOrder`; admin `receiveStock` and receipt history; agent order confirmation, receipt recording, credit approval/repayment and delivery updates. Only the first names listed in the session are proposals with explicit spelling; additional agent/query names must be agreed before codegen.

Do not change response envelope/nullability assumptions merely by replacing operation names. The current list envelope uses `list`/`metaCounter`; retain it or coordinate an explicit new schema. Review money range/serialization: whole-so‘m currency alone does not specify a GraphQL scalar.

## UI terminology and behavior

| Previous/requested term | Target label or behavior |
| --- | --- |
| Nestar | Quwat; Quwat naming confirmation pending |
| Property / listing | Mahsulot / tovar (Product) |
| User / USER | Mijoz / CLIENT |
| Agent | Sotuvchi / do‘kon xodimi (AGENT) |
| Admin | Administrator; inspection/update/stock intake |
| Apartment/Villa/House | Material category chosen from the new category model |
| Beds/Rooms/Rent/Barter | Removed |
| Article/Board/Follow | Removed |
| Dona / qop / metr / kg | Exactly these four sale units |
| Decimal currency / tiyin | Whole `so‘m`; display no currency fraction |
| Pay now / online card form | Do‘konda to‘lash; CASH/CARD receipt is recorded by an agent |
| Credit | Nasiya / qarz; approved due date and remaining balance |
| Paid delivery | Bepul yetkazib berish; fee `0 so‘m` |
| Replace stock quantity | Kirim miqdori; preview current + received = resulting stock |
| Returned/refunded sale | No completed-sale return/refund UI |

Format money from validated integer amounts; formatting must not conceal invalid fractional backend values. Allow fractional metr/kg and whole dona/qop with product minimum/step validation. Never collect card credentials for an integration that does not exist. Show fulfilled credit orders with outstanding debt, rather than presenting COMPLETED as PAID. Disable actions by role/state in the UI, while enforcing the same authorization on the backend.

## Acceptance checklist

- Branding-only release works with today's unchanged GraphQL API.
- Future Product/CLIENT UI uses the actual released schema and has no Board/Follow or housing remnants.
- Only clients create orders; only agents record sales receipts/debt approval; only admins receive stock.
- Intake 10 + 100 previews and persists 110; new receipts preserve existing reservations.
- Whole-so‘m prices/totals and four-unit quantity inputs agree with backend rounding/validation.
- Free delivery requires recipient/address/phone; no gateway, marketplace checkout or return screens are introduced.
- Client A cannot access Client B's orders, receipts or debt through routes or API calls.
- Actual frontend checks and API contract tests pass; unresolved items and baseline failures are reported.

