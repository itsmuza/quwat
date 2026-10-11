# QUWAT Backend Agent Instruction

Quwat is a NestJS GraphQL monorepo migrated from Real estate platform into a platform that sells construction materials

## Read First

Before changing code, read the current AI handoff docs:

- `docs/ai/BACKEND_MIGRATION.md`
- `docs/ai/DECISION.md`
- `docs/ai/COMPLETED_TASK.md`
- `docs/ai/NEXT_STEPS.md`

Use those files as the source of truth for AI Agent related migration history, accept decisions, remaining work and validation status.

## Project Shape

- Backend apps are `quwat` and `quwat-batch`.
- Keep the existing NestJS resolver/service/module pattern based on MVC and DI.
- Keep DTOs, enums, schemas under `apps/quwat/src/libs
- Keep shared modules reusable auth, member, like, view, comment and socket

## Domain Rules

- Use Quwat/product terminology for the main catalog entity.
- Do not reitroduce property or real-estate fields.
- Keep `MemberType.CLIENT`, `MemberType.AGENT` and `MemberType.ADMIN` unchanged.
- Product ownership continues to use `MemberType.AGENT` unless a later migration explicitly changes it.
- Product enum values are:
  - `ProductType`:
    - `ASBOBLAR` — Asboblar
    - `MAHKAMLASH_BUYUMLARI` — Mahkamlash buyumlari
    - `SANTEXNIKA` — Santexnika
    - `ELEKTR_MOLLARI` — Elektr mollari
    - `BOYOQ_VA_YELIMLAR` — Bo‘yoq va yelimlar
    - `ESHIK_JIHOZLARI` — Eshik jihozlari
    - `XOJALIK_BUYUMLARI` — Xo‘jalik buyumlari
  - `ProductSubtype`:
    - `BOLGA`
    - `BURAGICH`
    - `OMBUR`
    - `PARMA`
    - `SILLIQLAGICH`
    - `ARRA`
    - `ELEKTR_ARRA`
    - `GAYKA_KALITI`
    - `SOZLANUVCHI_KALIT`
    - `QUVUR_KALITI`
    - `KALITLAR_TOPLAMI`
    - `OLCHOV_LENTASI`
    - `SATH_OLCHAGICH`
    - `BURGI_UCHI`
    - `KESISH_DISKI`
    - `SILLIQLASH_DISKI`
    - `ZIMPARA`
    - `QISQICH`
    - `PICHOQ`
    - `MIX`
    - `BURAMA_MIX`
    - `BOLT`
    - `GAYKA`
    - `DYUBEL`
    - `SHAYBA`
    - `ANKER`
    - `REZBALI_TAYOQ`
    - `PARCHIN_MIX`
    - `QUVUR`
    - `QUVUR_BIRIKTIRGICH`
    - `KRAN`
    - `SHLANG`
    - `QUVUR_TIRSAGI`
    - `QUVUR_UCHLIGI`
    - `QUVUR_TIQINI`
    - `QUVUR_QISQICHI`
    - `SUV_FILTRI`
    - `SUV_HISOBLAGICH`
    - `SIFON`
    - `DUSH_KALLAGI`
    - `RAKOVINA`
    - `UNITAZ`
    - `MUHRLASH_LENTASI`
    - `KABEL`
    - `ROZETKA`
    - `ELEKTR_KALITI`
    - `LAMPOCHKA`
    - `UZAYTIRGICH`
    - `VILKA`
    - `AVTOMAT_UZGICH`
    - `ELEKTR_HISOBLAGICH`
    - `TAQSIMLASH_QUTISI`
    - `KABEL_KANALI`
    - `IZOLYATSIYA_LENTASI`
    - `KABEL_BOGICHI`
    - `FONAR`
    - `BATAREYA`
    - `BOYOQ`
    - `ASTAR`
    - `YELIM`
    - `GERMETIK`
    - `CHOTKA`
    - `VALIK`
    - `LAK`
    - `ERITUVCHI`
    - `MONTAJ_KOPIGI`
    - `YOPISHQOQ_LENTA`
    - `NIQOBLASH_LENTASI`
    - `SHPATEL`
    - `QULF`
    - `TUTQICH`
    - `OSHIQ_MOSHIQ`
    - `ESHIK_TIRGAGI`
    - `ESHIK_YOPGICHI`
    - `ESHIK_ZANJIRI`
    - `TAMBA`
    - `CHELAK`
    - `TOGORA`
    - `SUPURGI`
    - `POL_ARTGICH`
    - `ARQON`
    - `LATTA`
    - `GUBKA`
    - `CHIQINDI_QOPI`
    - `SOVUN`
    - `YUVISH_VOSITASI`
    - `QOLQOP`
    - `HIMOYA_KOZOYNAGI`
    - `NIQOB`
    - `BELKURAK`
    - `KETMON`
    - `XASKASH`
    - `NARVON`
    - `SUGORISH_PURKAGICHI`
    - `GUL_TUVAGI`

## Workflow

1. Analyze before editing.
2. Keep chagnes small and consistent with existing project patterns.
3. Do not remove working logic unless it is replaced safely.
4. Update `docs/ai/COMPLETED_TASKS.md` after major completed work.
5. Add or update focused tests when bahavior changes.

## Validation

Use these checks for backend work:

```bash
npx tsc -p apps/quwat/tsconfig.app.json --noEmit
npx tsc -p apps/quwat-batch/tsconfig.app.json --noEmit
npx run build
```

`npm run lint` runs ESLint with `--fix`, so use it only when file rewriting is acceptable!
