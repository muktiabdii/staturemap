<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code (if the folder exists). Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

---

# Stature & StatureMap — Agent Instructions

Repo ini berisi backend (Next.js API) dan web StatureMap (Next.js). Aplikasi mobile Stature (Android) ada di repo terpisah. Baca file ini sebelum menulis kode apapun.

## Sumber Rujukan

Hanya tiga sumber ini yang dipakai:

1. `PRD.md` (root repo) — kebutuhan produk, ID persyaratan (MOB/WEB/DAT/NFR), dan kriteria penerimaan (AC)
2. `AGENTS.md` (file ini) — aturan umum pengerjaan
3. `docs/` — aturan dan ringkasan teknis:
   - `docs/domain-rules.md` — aturan domain (idempotensi, status sync, lokasi, worker, privasi, endpoint sync). **Wajib dibaca sebelum mengerjakan sync, profil, skrining, wilayah, worker, atau akses data.**
   - `docs/architecture.md` — layer dan struktur folder
   - `docs/api-contract.md` — ringkasan endpoint dan payload

Jika dokumen-dokumen tersebut ambigu, saling bertentangan, atau menandai sesuatu sebagai "terbuka": **tanyakan ke user, jangan menebak atau mengarang.**

Setiap fitur harus bisa ditelusuri ke ID persyaratan di PRD.md (mis. WEB-01, DAT-R4). Cantumkan ID tersebut di PR/commit message.

## Stack Wajib

- **Prisma v6** — jangan upgrade ke v7, ada breaking change pada datasource `url`
- **Zod v4** — selalu `import { z } from "zod/v4"`, bukan `from "zod"`
- **React Query v5** — untuk semua data fetching di client
- **sonner** — untuk semua toast notifikasi, bukan `react-hot-toast` atau library lain
- **PostgreSQL + PostGIS** — penyimpanan relasional dan operasi spasial
- **Redis + BullMQ** — antrean pemrosesan asinkron
- Auth: email + password, JWT bearer, role `ADMIN` dan `NAKES`

## Scope Guard

Jangan menambah fitur di luar cakupan PRD.md, walaupun terlihat berguna. Non-goals ada di PRD.md bagian 2.3 (mis. tidak ada diagnosis/rekomendasi intervensi, tidak ada pendaftaran mandiri Nakes, tidak ada reverse geocoding eksternal, tidak ada ekspor laporan lanjutan).

## Arsitektur — Urutan Layer

Setiap domain baru WAJIB mengikuti urutan ini dari bawah ke atas:

```
prisma/schema.prisma          (1) Definisi model
    ↓
server/repositories/          (2) Akses database, extends BaseRepository
    ↓
server/services/              (3) Business logic, static methods
    ↓
server/validators/            (4) Zod schema validasi input
    ↓
app/api/[domain]/route.ts     (5) API route — parse → validasi → service → response
    ↓
services/[domain]-service.ts  (6) Client-side fetch wrapper
    ↓
hooks/use-[domain].ts         (7) React Query hooks
    ↓
components / pages            (8) UI
```

Worker BullMQ berada di `src/server/workers/` dan hanya memanggil service/repository (tidak ada logic bisnis di file worker).

## Aturan API Route

- Gunakan middleware auth dari `@/lib/api-middleware` untuk proteksi route (token JWT wajib, cek role `ADMIN`/`NAKES`). Endpoint publik tanpa auth hanya untuk data agregat. <!-- TODO: sesuaikan nama middleware dengan implementasi aktual -->
- Gunakan `apiResponse`, `paginatedResponse`, `errorResponse` dari `@/lib/api-utils` — **jangan** return `NextResponse.json()` langsung. Pengecualian: endpoint sync, yang kontrak responsnya ada di `docs/domain-rules.md`.
- Selalu parse input dengan Zod sebelum masuk ke service.
- Format error validasi: `{ rule, field, message }[]`.
- Prefiks semua endpoint: `/api/v1`.

## API Response Contract

**PENTING:** Frontend mengharapkan format berikut — jangan ubah strukturnya.

### Success — Single Item

```json
{ "data": {}, "message": "OK", "statusCode": 200 }
```

### Success — Paginated List

```json
{
  "data": [],
  "page": 1,
  "total": 100,
  "perPage": 10,
  "lastPage": 10,
  "nextPage": 2,
  "previousPage": null,
  "statusCode": 200,
  "message": "OK"
}
```

### Error — General

```json
{ "message": "Pesan error", "statusCode": 400 }
```

### Error — Validation (422)

```json
{
  "message": "Validasi gagal",
  "statusCode": 422,
  "errors": [
    { "rule": "too_small", "field": "name", "message": "Nama wajib diisi" }
  ]
}
```

## Query/Filter Contract

URL query params yang didukung oleh `parseQueryParams()` dari `@/lib/api-utils`:

| Parameter       | Format                   | Contoh                                 |
| --------------- | ------------------------ | -------------------------------------- |
| Pagination      | `?page=1&limit=10`       | Default page=1, limit=10               |
| Sort ASC        | `?sort=name`             | `ORDER BY name ASC`                    |
| Sort DESC       | `?sort=-name`            | `ORDER BY name DESC`, awali dengan `-` |
| Search simple   | `?search=keyword`        | Match di field default                 |
| Search spesifik | `?search[email]=keyword` | Match di field `email`                 |
| Filter operator | `?field[operator]=value` | Lihat tabel operator di bawah          |

### Filter Operators

| Operator     | SQL Equivalent    | Contoh                 |
| ------------ | ----------------- | ---------------------- |
| `[eq]`       | `= value`         | `?status[eq]=active`   |
| `[ne]`       | `!= value`        | `?status[ne]=banned`   |
| `[gt]`       | `> value`         | `?age[gt]=18`          |
| `[gte]`      | `>= value`        | `?age[gte]=18`         |
| `[lt]`       | `< value`         | `?price[lt]=100`       |
| `[lte]`      | `<= value`        | `?price[lte]=100`      |
| `[contains]` | `ILIKE '%value%'` | `?name[contains]=john` |
| `[in]`       | `IN (values)`     | `?id[in]=1,2,3`        |

### Contoh Penggunaan di Repository/Service

```typescript
// Di route.ts
const { page, limit, sort, search, filter } = parseQueryParams(req);
const sortObj = parseSortParam(sort); // { name: "asc" }
const filterObj = parseFilterConditions(filter); // { status: "active" }
const searchObj = buildSearchCondition(
  // { OR: [...] }
  typeof search === "string" ? search : search?.value,
  ["name", "email"],
);

const where = {
  ...filterObj,
  ...searchObj,
};
```

## Aturan Repository

- Semua query Prisma ada di repository — **tidak ada** Prisma query langsung di service atau route.
- Satu-satunya pengecualian: query spasial raw (`$queryRaw`) hanya di `SpatialRepository`, wajib parameterized. Detail di `docs/domain-rules.md`.
- Extend `BaseRepository<ModelType>` dan set `protected modelName = "namaModelPrisma"` (camelCase sesuai nama model di Prisma client, mis. `"user"`, `"children"`).
- **Tidak memakai soft delete `deletedAt`.** Penonaktifan memakai `record_status` (profil) dan `account_status` (akun) = `ACTIVE | INACTIVE`. Jangan hard delete akun, profil, atau skrining.
- Operasi yang harus atomik memakai `prisma.$transaction`, tanpa panggilan jaringan di dalamnya.

## Aturan Service

- Semua method adalah `static`.
- Business logic (cek duplikasi, validasi antar relasi, aturan domain) ada di service, **bukan** di validator.
- Validator hanya untuk shape & format input, service untuk business rules.
- Lempar `new Error("pesan")` untuk business error umum — route akan tangkap dan return `errorResponse`.

## Aturan Validator (Zod)

```typescript
import { z } from "zod/v4";  // ← WAJIB /v4

export const createXxxSchema = z.object({ ... });
export const updateXxxSchema = z.object({ ... });
export type CreateXxxInput = z.infer<typeof createXxxSchema>;
export type UpdateXxxInput = z.infer<typeof updateXxxSchema>;
```

Daftarkan di `src/server/validators/index.ts` dengan `export * from "./xxx.validator"`.

## Privasi & Keamanan

- Pembatasan akses diterapkan di service/repository, bukan hanya di UI.
- Jangan percaya field identitas/wilayah dari payload klien; turunkan dari token dan akun terautentikasi (detail di `docs/domain-rules.md`).
- Jangan `console.log` data anak, token, atau password. Log hanya berisi informasi teknis yang diperlukan.

## Testing

- Aturan domain di `docs/domain-rules.md` (bagian Skenario Test Wajib) harus punya test.
- Fitur baru disertai test untuk jalur sukses dan jalur gagal utamanya.

## Perintah & Lingkungan

<!-- TODO: isi dengan perintah aktual setelah project di-setup -->

```bash
# Dependencies
npm install

# Services lokal (PostgreSQL+PostGIS, Redis)
docker compose up -d

# Prisma
npx prisma generate
npx prisma migrate dev

# Dev server & worker
npm run dev
npm run worker   # BullMQ worker

# Quality
npm run lint
npm run test
```

Env var didokumentasikan di `.env.example`. Jangan commit `.env`.

## Aturan Umum

- **PENTING (Rawan Konflik)**: Folder `src/types/` dan `src/constants/` adalah area yang sangat rawan conflict. Hindari overwrite serampangan dan lakukan penggabungan/modifikasi kode secara hati-hati pada kedua folder ini.
- **Akses Kustomisasi & Berkas Skills**: Agent diizinkan dan disarankan untuk membaca berkas keahlian (*custom skills*) yang diinstal pengguna di direktori `~/.agents/skills` dan `~/.gemini/config/skills` guna menyesuaikan alur kerja dan standar penulisan kode (seperti Next.js best practices, guidelines desain, dll).
- Tidak ada `console.log` di production code — gunakan `console.error` hanya di catch block route.
- Tidak ada hardcoded string untuk role atau status — gunakan konstanta dari `src/constants/common.ts`.
- Prisma singleton ada di `src/lib/prisma.ts` — jangan buat instance PrismaClient baru.
- Setelah menambah/mengubah model di `schema.prisma`, selalu ingatkan user untuk jalankan `npx prisma generate` (dan migrate bila perlu).
- Komentar kode hanya `/* */` atau `//`, bahasa Inggris, hanya yang penting-penting saja dan kalau bisa singkat jelas (1 line) dan diposisi yang tepat agar method atau code mudah dipahami.

## Aturan Frontend / UI

- **WAJIB** cek `src/components/ui/` sebelum membuat component baru.
- Jika component yang dibutuhkan **belum ada**, buat dulu di `src/components/ui/` sebagai reusable component.
- **JANGAN** buat component inline atau one-off styling — selalu extract ke component yang proper.
- Gunakan `Button` dari `@/components/ui/button` — jangan buat `<button>` dengan styling manual.
- Gunakan `usePageHeader` hook untuk set title, back button, dan action buttons di setiap page.
- Toast notifikasi pakai `sonner` — `toast.success()`, `toast.error()`.
- Icons pakai `react-bootstrap-icons`.
- Ikuti design system StatureMap (Deep Teal / Teal Green / Warm Orange / Slate Blue). <!-- TODO: arahkan ke file design system di repo -->
- Peta publik hanya memakai Public Data API; peta/dashboard Admin memakai Admin Data API.
- Saat membuat fitur baru, jelaskan component apa yang dipakai atau yang perlu dibuat.
