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
- `GET /inventory/alerts` (stock outs, low stock, pending approvals, stale transfers
  and prep batches, purchase price jumps, balances without cost)
- `GET /inventory/reports/food-cost?dateFrom=&dateTo=&outletId=` (theoretical vs
  actual food cost; requires cost access)
- `GET/POST /inventory/requests`, `GET /inventory/requests/:id`,
  `POST /inventory/requests/:id/{approve,reject,cancel}` (approval creates the transfer)
- `GET/POST /inventory/transfers`, `GET /inventory/transfers/:id`,
  `POST /inventory/transfers/:id/{ship,receive,close,cancel}` (shipped stock is in
  transit until received, possibly in several receipts; closing writes off the rest as lost)
- `GET /inventory/prep-recipes`, `PUT /inventory/prep-recipes/:outputItemId`
- `GET/POST /inventory/prep-batches`, `GET /inventory/prep-batches/:id`,
  `POST /inventory/prep-batches/:id/{complete,void}` (semi-finished production;
  the actual output carries the whole input cost, so shrinkage raises its unit cost)
- `GET /inventory/menu-options`, `PUT /inventory/menu-options/:groupId/:valueId`
  (ingredients a topping/spice level consumes per portion sold)
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

Voiding a sale returns packaged (direct) goods and ingredients of dishes the
kitchen has not completed to stock. Ingredients of completed dishes are not
returned: they are reversed and re-posted as waste (reason `VOIDED_ORDER`), so
stock is unchanged but the loss is recorded.

Inventory data is tenant-scoped. Costs and the immutable ledger require their
own inventory permissions; a super admin never receives tenant inventory access
implicitly. List endpoints use the existing `page`, `limit`, `search`,
`sortBy`, and `sortOrder` response convention.

Migration `20261110193000_add_inventory_foundation` only adds inventory tables,
canonical units, and default outlet locations. It deliberately does not copy
`Product.stock`, alter checkout, or enable stock posting for sales. Opening
balances and cutover require a separate reconciled rollout.

### Inventory rollout checklist

1. Back up the database, then `npm run db:deploy`. Inventory migrations only
   add tables and enum values.
2. Units and items: check the canonical units, create items (ingredients,
   semi-finished, packaged) with base units, reorder points and conversions.
3. Locations: one location per outlet (seeded) plus any warehouse.
4. Opening balances with unit cost for every item that has stock, so food cost
   is complete (`GET /inventory/overview` reports balances without cost).
5. Mappings: recipe or direct item for each product, ingredients for menu
   options, prep recipes for semi-finished items.
6. Run sales for a day, then check `GET /inventory/reconciliation` (must be
   reconciled) and the food-cost report before relying on it.
7. Do a first stocktake per location to align physical and system stock.

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
