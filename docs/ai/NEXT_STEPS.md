# Next Steps

Planned for **tomorrow: Monday, 2026-10-12, Asia/Seoul**, relative to this session's 2026-10-11 client date. This is a prioritized work queue, not a scheduled automation or a promise to complete the entire commerce platform in one day.

Current baseline: Quwat project rename completed; real-estate domain remains. Future requirements are in [BACKEND_MIGRATION.md](BACKEND_MIGRATION.md) and [DECISIONS.md](DECISIONS.md).

## Backend cleanup and migration

| Priority | Task                                                                                   | Completion criterion                                                                                               |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| P0       | Fix login's missing `await` in `apps/quwat/src/components/member/member.service.ts:51` | Wrong password cannot produce an access token; valid login still works                                             |
| P0       | Close signup/self-profile role and status escalation                                   | Public registration produces the customer role; privileged account changes require admin authorization             |
| P0       | Hash password updates; check current DB role/status during protected requests          | Password update/login works; blocked users and stale privileged tokens are denied                                  |
| P1       | Repair existing ESLint configuration/dependency mismatch in a separate tooling task    | Lint starts with the approved existing toolchain; separate baseline findings from new violations; no broad autofix |
| P1       | Remove sensitive log output and constrain upload target paths                          | Password/token values are not emitted; uploads stay within allowed directories                                     |
| P1       | Finalize Product/CLIENT schema and money/quantity contract                             | Document fields, statuses, role permissions, ranges, rounding, unit steps and GraphQL wire types before coding     |
| P1       | Implement Product migration and Board/Follow removal as a dedicated breaking change    | No legacy housing/community schema branches remain; Like/View/Comment and batch imports compile                    |
| P2       | Add admin inventory receipts                                                           | Existing SKU 10 + incoming 100 = 110; atomic/idempotent receipt history; agents cannot directly alter stock        |
| P2       | Build client cart/order reservation workflow                                           | Price snapshots, ownership checks, assignment, cancellation and parallel-stock behavior covered                    |
| P2       | Add offline receipts, approved interest-free debt and free delivery                    | Cash/card/credit, due date, partial repayment and fulfillment are independently represented                        |
| P3       | Extract shared libraries and update batch jobs                                         | Batch no longer imports API-app files directly; removed article/follow counters are absent from ranking            |

Separate the login/tooling cleanup from the larger breaking domain migration so each diff has a clear acceptance boundary. Do not delete the existing database. Configure a new Quwat database only when implementing the new-domain rollout.

## Frontend migration

| Priority | Task                                                                            | Completion criterion                                                                                                  |
| -------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P0       | Locate the actual Next.js repository and resolve Quwat/Quwat naming           | Actual router, routes, package manager, API client, codegen and naming decision documented                            |
| P1       | Apply branding-only frontend changes against today's backend                    | Branding updated; current Property operations and USER enum remain compatible                                         |
| P1       | Review the future Product schema with backend work                              | Operation names, argument names, selected fields and role guards agreed; no speculative generated types               |
| P2       | Replace property catalog/detail/forms and housing filters                       | Product fields and four units render correctly; integer-so‘m prices throughout                                        |
| P2       | Remove Board/Follow navigation, pages, widgets and operations at domain cutover | No dangling imports, generated operations or subscription counters                                                    |
| P2       | Add client cart/orders/debt views, agent sales/receipts and admin stock intake  | Agent/admin capabilities stay distinct; receipts never imply an online charge                                         |
| P3       | Coordinate deploy/cache/session handling                                        | New backend contract and frontend released together; new-database identities are not assumed to preserve old sessions |

Frontend component/route names in [FRONTEND_MIGRATION.md](FRONTEND_MIGRATION.md) are proposed until that repository is inspected.

## Testing

1. **P0:** Add targeted regression tests for authentication fixes using controlled fixtures/mocks; no production credentials or database.
2. **P1:** After each backend code change, run both app typechecks, lint without autofix and sequential app builds.
3. **P1:** Establish an isolated database-backed GraphQL e2e setup; make test discovery explicit. A replica set is required for transaction tests.
4. **P2:** Cover 10 + 100 receipt behavior, simultaneous receipts, duplicate requests, mixed reservations and transaction rollback.
5. **P2:** Test whole dona/qop, three-decimal metr/kg, whole-so‘m validation and half-up line rounding.
6. **P2:** Test customer order/debt isolation; agent sales permissions; admin-only intake; partial payments and overpayment rejection; fulfillment with outstanding approved debt.
7. **P2:** Test cancellation release once, handover stock deduction once, free delivery/address validation and no completed-sale return endpoint.
8. **P3:** Run the frontend repository's own lint/typecheck/build and behavior tests once available. Snapshot actual GraphQL schema/contracts before and after cutover.

Do not interpret the current blocked lint run or undiscovered unit tests as passing checks.

## Documentation

1. **P0:** Confirm whether Quwat is an intentional frontend name or a typo; update the naming note consistently.
2. **P1:** Promote only implemented work into [COMPLETED_TASKS.md](COMPLETED_TASKS.md), recording commands, outcomes and limitations.
3. **P1:** Add final API/model contracts and actual frontend path mappings after code inspection.
4. **P2:** Document new-database setup, SKU/quantity rules, stock intake, offline receipt/debt behavior and rollout/rollback constraints.
5. **P2:** Keep [DECISIONS.md](DECISIONS.md) current and retire superseded defaults explicitly. Update next-session prompts to match the implementation stage.
