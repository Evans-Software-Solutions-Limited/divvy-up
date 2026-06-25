# Structure Steering — Divvy Up

> Target repository layout once the build is complete. Specs add to this; they don't invent
> parallel structures.

```
divvy-up/
├── .kiro/
│   ├── steering/                 # product.md, tech.md, structure.md (this file)
│   └── specs/<feature>/          # requirements.md, design.md, tasks.md per feature
├── infra/
│   ├── api.ts                    # API Gateways + JWT authorizer + env links
│   ├── storage.ts                # S3 bucket for receipt images        (NEW)
│   ├── secrets.ts                # sst.Secret declarations              (NEW)
│   └── domains/                  # per-stage custom DNS                 (NEW, hardening)
│   └── web.ts                    # REMOVE (web app dropped)
├── microservices/
│   ├── core/                     # groups, members, expenses, items, balances, settle-up
│   │   └── src/application/{groups,expenses,members,settlements,activity,repositories}/
│   └── other-service/            # receipt extraction (vision/OCR)
├── packages/
│   ├── db/                       # Drizzle schema, client (getDb singleton), migrations (NEW)
│   ├── split-engine/             # shared splitPence/computeSplit (pence, exact)      (NEW)
│   ├── api-utils/                # env, jwt decode + Supabase JWKS verification
│   ├── mobile/                   # Expo app                                          (NEW)
│   │   ├── app/                  # expo-router: (auth)/ and (app)/ layout groups
│   │   ├── src/
│   │   │   ├── theme/            # Tamagui config from design tokens
│   │   │   ├── components/       # ported component kit (avatar, item-row, money, sheet…)
│   │   │   ├── adapters/         # api client (eden), supabase session, storage
│   │   │   └── features/         # screen logic per feature
│   │   └── __tests__/
│   └── web/                      # REMOVE
└── docs/                         # product, release plan, deployment docs
```

## Conventions

- **Repositories** own persistence + ownership/scoping checks; **services** own domain logic;
  **handlers** are thin (validate → call service → map result/error). Match existing
  `microservices/core` layering.
- **Tests** live in `__tests__/` next to the code under test.
- **Shared types** that cross FE/BE flow through the Elysia app's exported types (eden) and
  `packages/db` schema-inferred types — avoid duplicate hand-written type definitions.
- **Money** is always `number` in pence at the boundary; format only at the view layer. Money
  fields are named **plainly** (`amount`, `unitPrice`, `yourBalance`) with a `// pence` comment —
  **no `Pence`/`Minor` suffix** — matching the canonical schema (`amount`, `unit_price`) and
  `domain/types.ts`. One unit, one naming convention across schema, wire, and engine.
- New mobile screens belong to exactly one feature spec; shared UI primitives belong to
  `mobile-app-foundation`.
