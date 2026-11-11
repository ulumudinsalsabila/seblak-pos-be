# DagoraApp Backend

NestJS REST API multi-tenant untuk DagoraApp. Setiap merchant/outlet memiliki
data, pengguna, branding, dan fee platform yang terisolasi. Dokumentasi setup utama tersedia
di `../README.md` dan kontrak bisnis lengkap di `../SEBLAK_POS_BRD_ERD.md`.

Endpoint base: `/api/v1`.

## Inventory foundation

The additive hybrid-inventory foundation exposes:

- `GET /inventory/overview`
- `GET/POST/PATCH /inventory/locations`
- `GET/POST /inventory/units`
- `GET/POST/PATCH /inventory/items`
- `POST /inventory/items/:id/conversions`
- `GET /inventory/balances`
- `GET /inventory/movements`
- `POST /inventory/opening-balances` (owner or explicit permission)
- `GET/PUT /inventory/recipes`
- `GET/POST /inventory/purchases` (receiving; weighted-average cost)
- `GET /inventory/reconciliation` (balance vs ledger drift)
- `GET /inventory/adjustments`, `POST /inventory/waste`, `POST /inventory/adjustments`
  (mandatory reason; adjustments also require notes)
- `GET/POST /inventory/stocktakes`, `GET /inventory/stocktakes/:id`,
  `PUT /inventory/stocktakes/:id/counts`, `DELETE /inventory/stocktakes/:id/counts/:itemId`,
  `POST /inventory/stocktakes/:id/{submit,reopen,approve,cancel}`

Stocktakes run COUNTING -> REVIEW -> POSTED (or CANCELLED before posting), one
open session per location. Each count snapshots the ledger balance when it is
recorded; approval posts only `counted - expected`, so sales during counting are
kept instead of being overwritten. Approval requires
`APPROVE_INVENTORY_STOCKTAKE` (owner by default).

Inventory data is tenant-scoped. Costs and the immutable ledger require their
own inventory permissions; a super admin never receives tenant inventory access
implicitly. List endpoints use the existing `page`, `limit`, `search`,
`sortBy`, and `sortOrder` response convention.

Migration `20261110193000_add_inventory_foundation` only adds inventory tables,
canonical units, and default outlet locations. It deliberately does not copy
`Product.stock`, alter checkout, or enable stock posting for sales. Opening
balances and cutover require a separate reconciled rollout.

Perintah utama:

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run start:dev
npm test
npm run lint
npm run build
```

## Deploy ke Vercel

Backend menyediakan entrypoint serverless di `api/index.ts`. Set environment
variables `DATABASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `JWT_ACCESS_SECRET`, dan
`JWT_REFRESH_SECRET` pada project Vercel. Gunakan Neon pooled connection string
untuk `DATABASE_URL`.
