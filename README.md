# Seblak POS Backend

NestJS REST API untuk Seblak Prasmanan POS. Dokumentasi setup utama tersedia
di `../README.md` dan kontrak bisnis lengkap di `../SEBLAK_POS_BRD_ERD.md`.

Endpoint base: `/api/v1`.

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
variables `DATABASE_URL`, `FRONTEND_URL`, `JWT_ACCESS_SECRET`, dan
`JWT_REFRESH_SECRET` pada project Vercel. Gunakan Neon pooled connection string
untuk `DATABASE_URL`.
