# DagoraApp SaaS

DagoraApp memakai satu halaman login untuk seluruh pengguna. Setelah login,
backend menentukan tenant, outlet aktif, dan role dari `OutletMembership`.
Seluruh query operasional dibatasi dengan `outletId` dari sesi, bukan dari body
request, sehingga pengguna tidak dapat memilih outlet lain secara manual.

## Navigasi per role

| Role | Navigasi |
| --- | --- |
| `SUPER_ADMIN` | Kelola outlet, merchant/tenant, fee, dan ledger fee |
| `OWNER` | Dashboard, Kasir, Dapur, Transaksi, Produk, Kategori, Pengeluaran, Laporan, Pengguna, Pengaturan |
| `MANAGER` | Dashboard, Kasir, Dapur, Transaksi, Produk, Kategori, Pengeluaran, Laporan, Pengaturan |
| `CASHIER` | Kasir dan Transaksi |
| `KITCHEN` | Dapur |

Navigasi hanya menyembunyikan menu. Otorisasi yang sebenarnya tetap dilakukan
oleh guard role pada API.

## Model fee

- `FeeConfig` menyimpan versi konfigurasi fee per outlet dengan masa berlaku.
- Tipe fee: `NONE`, `FIXED`, `PERCENTAGE`, atau `HYBRID`.
- Saat checkout, nilai fee disalin ke snapshot transaksi agar histori tidak
  berubah ketika tarif baru dibuat.
- `FeeLedger` mencatat charge dan reversal ketika transaksi di-VOID.

## Menjalankan migration

Migration `20261002130000_add_multi_tenant_saas` membuat tenant dan outlet
default lalu memindahkan seluruh data lama ke outlet tersebut. Jalankan setelah
backup database:

```bash
npm run db:deploy
npm run db:seed
```

Super Admin hanya dibuat oleh seed jika `SEED_SUPER_ADMIN_EMAIL` dan
`SEED_SUPER_ADMIN_PASSWORD` tersedia. Jangan gunakan password contoh pada
production.
