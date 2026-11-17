# Stature & StatureMap — Arsitektur Backend & Web

Arsitektur berlapis berbasis Next.js App Router, Prisma ORM, dan validasi Zod. Pola kode mengikuti boilerplate PIS, disesuaikan untuk kebutuhan Stature: sinkronisasi offline-first, PostGIS, antrean BullMQ, dan pembatasan akses berbasis peran.

Dokumen ini menjelaskan **cara menulis kode**. Aturan domain (idempotensi, status sync, lokasi, privasi) ada di `docs/domain-rules.md`; kebutuhan produk ada di `PRD.md`.

---

## Daftar Isi

1. [Tech Stack](#tech-stack)
2. [Quick Start](#quick-start)
3. [Struktur Folder](#struktur-folder)
4. [Environment Variables](#environment-variables)
5. [Prisma & Database](#prisma--database)
6. [Pattern: Repository](#pattern-repository)
7. [Pattern: Service](#pattern-service)
8. [Pattern: Validator (Zod)](#pattern-validator-zod)
9. [Pattern: API Route](#pattern-api-route)
10. [API Response Contract](#api-response-contract)
11. [Query & Filter Contract](#query--filter-contract)
12. [Pattern: Antrean & Worker (BullMQ)](#pattern-antrean--worker-bullmq)
13. [Pattern: Query Spasial (PostGIS)](#pattern-query-spasial-postgis)
14. [Pattern: Client Service](#pattern-client-service)
15. [Pattern: Hook (React Query)](#pattern-hook-react-query)
16. [Auth Middleware](#auth-middleware)
17. [Menambah Domain Baru](#menambah-domain-baru)
18. [Scripts](#scripts)
19. [Untuk Agent AI](#untuk-agent-ai)

---

## Tech Stack

| Layer         | Library / Layanan                                      |
| ------------- | ------------------------------------------------------ |
| Framework     | Next.js (App Router) — versi sesuai `package.json`     |
| Database      | PostgreSQL + ekstensi PostGIS                          |
| ORM           | Prisma v6                                              |
| Antrean       | Redis + BullMQ                                         |
| Validasi      | Zod v4                                                 |
| Data Fetching | TanStack React Query v5                                |
| Form          | React Hook Form + @hookform/resolvers                  |
| Auth          | Jose (JWT) + bcryptjs                                  |
| State         | Zustand                                                |
| Notifikasi    | Sonner                                                 |
| Icons         | React Bootstrap Icons                                  |
| CSS Utility   | clsx + tailwind-merge                                  |
| Date          | date-fns                                               |
| Peta (web)    | <!-- TODO: isi library peta yang dipilih (mis. Leaflet / MapLibre) --> |

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Jalankan PostgreSQL+PostGIS dan Redis

```bash
docker compose up -d
```

Contoh `docker-compose.yml` minimal:

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: staturemap
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
volumes:
  pgdata:
```

### 3. Buat file environment

```bash
cp .env.example .env
```

### 4. Generate Prisma Client

```bash
npx prisma generate
```

> **Wajib dijalankan setiap kali `schema.prisma` berubah.** Tidak membutuhkan koneksi database.

### 5. Buat tabel di database

```bash
npm run db:migrate
```

> Migrasi pertama harus memuat `CREATE EXTENSION IF NOT EXISTS postgis;` (migrasi SQL manual, lihat bagian Prisma & Database). Jangan memakai `db:push` untuk project ini karena indeks GiST dan ekstensi tidak ikut terbuat.

### 6. Jalankan development server dan worker

```bash
npm run dev      # Next.js
npm run worker   # BullMQ worker (proses terpisah)
```

### 7. Prisma Studio (opsional)

```bash
npm run db:studio
```

---

## Struktur Folder

```
stature-backend/                  ← nama repo menyesuaikan
├── prisma/
│   ├── schema.prisma             ← definisi model database
│   ├── migrations/               ← migration SQL (termasuk migrasi manual PostGIS)
│   └── seeds/                    ← seed data (akun Admin awal, import wilayah)
│
├── src/
│   ├── app/
│   │   ├── api/v1/               ← API routes (server-side), prefiks /api/v1
│   │   │   ├── auth/login/route.ts
│   │   │   ├── sync/push/route.ts
│   │   │   ├── sync/pull/route.ts
│   │   │   ├── reference/regions/route.ts
│   │   │   ├── admin/…           ← endpoint Admin (peta detail, akun Nakes, profil, log)
│   │   │   └── public/…          ← endpoint publik (agregat saja)
│   │   ├── (public)/             ← halaman peta publik StatureMap
│   │   ├── hq-admin/             ← halaman dashboard Admin StatureMap
│   │   └── layout.tsx
│   │
│   ├── server/                   ← pure server-side code
│   │   ├── repositories/
│   │   │   ├── base.repository.ts
│   │   │   ├── spatial.repository.ts   ← SATU-SATUNYA tempat $queryRaw spasial
│   │   │   ├── index.ts
│   │   │   ├── user/user.repository.ts
│   │   │   ├── child/child.repository.ts
│   │   │   ├── screening/screening.repository.ts
│   │   │   ├── region/region.repository.ts
│   │   │   └── sync/sync-log.repository.ts
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   ├── auth/auth.service.ts
│   │   │   ├── user/user.service.ts
│   │   │   ├── child/child.service.ts
│   │   │   ├── sync/sync.service.ts
│   │   │   ├── region/region.service.ts
│   │   │   └── map/map.service.ts      ← peta Admin & agregat publik
│   │   ├── validators/
│   │   │   ├── index.ts
│   │   │   ├── auth.validator.ts
│   │   │   ├── sync.validator.ts
│   │   │   └── user.validator.ts
│   │   ├── queues/               ← definisi Queue BullMQ (producer)
│   │   │   └── region-resolution.queue.ts
│   │   └── workers/              ← Worker BullMQ (proses terpisah)
│   │       ├── index.ts          ← entry point `npm run worker`
│   │       └── region-resolution.worker.ts
│   │
│   ├── services/                 ← client-side API caller
│   ├── hooks/                    ← React Query hooks
│   ├── types/                    ← TypeScript types (rawan conflict)
│   ├── lib/
│   │   ├── prisma.ts             ← Prisma singleton
│   │   ├── redis.ts              ← koneksi Redis (ioredis) untuk BullMQ
│   │   ├── api-middleware.ts     ← jwtAuth / role
│   │   ├── api-utils.ts          ← response helpers + query parsers
│   │   ├── api-client.ts         ← fetch wrapper (Bearer token)
│   │   ├── auth-utils.ts         ← JWT sign/verify (jose)
│   │   └── utils.ts              ← cn(), formatDate(), hashPayload(), dll.
│   │
│   ├── constants/                ← konstanta (role, status, error code) — rawan conflict
│   ├── context/
│   ├── components/
│   │   ├── ui/                   ← reusable UI components
│   │   └── providers.tsx         ← QueryClientProvider + Toaster
│   │
│   └── middleware.ts             ← Next.js middleware (route guard halaman)
│
├── docs/
│   ├── architecture.md           ← file ini
│   ├── domain-rules.md
│   └── api-contract.md
├── PRD.md
├── AGENTS.md
├── docker-compose.yml
├── .env.example
└── package.json
```

> Struktur di atas adalah usulan awal; nama folder/endpoint boleh disesuaikan selama urutan layer tetap dijaga.

---

## Environment Variables

```env
# Database (PostgreSQL + PostGIS)
DATABASE_URL="postgresql://user:password@localhost:5432/staturemap"

# Redis (BullMQ)
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="minimum-32-karakter-acak-dan-aman"
# TODO: tambahkan masa berlaku token (mis. JWT_EXPIRES_IN) setelah diputuskan

# App
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## Prisma & Database

### Konvensi

- ID entitas memakai **UUID** (`@db.Uuid`), bukan cuid. `child_id`, `screening_id`, dan `change_id` dibuat oleh aplikasi mobile; server menerima apa adanya (setelah validasi format UUID).
- Nama tabel dan kolom di database **snake_case** (`@@map`, `@map`), field Prisma **camelCase**.
- **Tidak ada `deletedAt`.** Penonaktifan lewat `record_status` (profil) dan `account_status` (akun). Foreign key memakai `onDelete: Restrict`.
- Tipe geometry memakai `Unsupported(...)`. Ekstensi PostGIS dan indeks GiST dibuat lewat **migrasi SQL manual**.

### Contoh Schema

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"] // opsional, jika ingin mendeklarasikan ekstensi
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Child {
  id                 String   @id @map("child_id") @db.Uuid
  name               String
  dateOfBirth        DateTime @map("date_of_birth") @db.Date
  gender             String   // MALE | FEMALE
  address            String
  assignedRegionCode String   @map("assigned_region_code")
  createdByUserId    String   @map("created_by_user_id") @db.Uuid
  updatedByUserId    String?  @map("updated_by_user_id") @db.Uuid
  recordStatus       String   @default("ACTIVE") @map("record_status") // ACTIVE | INACTIVE
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz

  region     AdministrativeRegion @relation(fields: [assignedRegionCode], references: [regionCode], onDelete: Restrict)
  screenings Screening[]

  @@index([assignedRegionCode, recordStatus])
  @@map("children")
}

model Screening {
  id                     String   @id @map("screening_id") @db.Uuid
  childId                String   @map("child_id") @db.Uuid
  createdByUserId        String   @map("created_by_user_id") @db.Uuid
  ageMonths              Int      @map("age_months")
  gender                 String
  heightCm               Decimal  @map("height_cm")
  classification         String   // SEVERELY_STUNTED | STUNTED | NORMAL | TALL
  screenedAt             DateTime @map("screened_at") @db.Timestamptz
  locationSource         String   @map("location_source") // GPS | MANUAL
  location               Unsupported("geometry(Point, 4326)")?
  manualRegionCode       String?  @map("manual_region_code")
  resolvedRegionCode     String?  @map("resolved_region_code")
  regionResolutionStatus String   @map("region_resolution_status") // PENDING | RESOLVED | UNRESOLVED | FAILED

  child Child @relation(fields: [childId], references: [id], onDelete: Restrict)

  @@index([childId, screenedAt])
  @@index([resolvedRegionCode, screenedAt])
  @@index([classification])
  @@map("screenings")
}

// User, AdministrativeRegion, SyncLog, ProfileChangeOperation:
// ikuti struktur kolom pada rancangan data (lihat docs/domain-rules.md dan PRD.md).
```

> Karena `location` bertipe `Unsupported`, kolom ini **tidak bisa** dibaca/ditulis lewat Prisma Client biasa. Penulisan dan pembacaannya lewat `$queryRaw`/`$executeRaw` di repository (lihat bagian Query Spasial).

### Migrasi manual PostGIS

Buat migrasi kosong lalu isi SQL:

```bash
npx prisma migrate dev --create-only --name enable_postgis
```

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
-- (setelah tabel terbentuk, di migrasi berikutnya)
CREATE INDEX IF NOT EXISTS idx_regions_boundary ON administrative_regions USING GIST (boundary);
CREATE INDEX IF NOT EXISTS idx_screenings_location ON screenings USING GIST (location);
```

### Alur kerja database

```
Edit schema.prisma
      ↓
npx prisma generate       ← update TypeScript types
      ↓
npm run db:migrate        ← buat + apply migration
      ↓ (jika perlu ekstensi/indeks spasial)
migrate --create-only     ← tulis SQL manual, lalu apply
```

### Prisma Singleton (`src/lib/prisma.ts`)

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

> Jangan membuat instance `PrismaClient` baru di tempat lain (worker juga memakai singleton ini).

---

## Pattern: Repository

Repository adalah lapisan akses database. Semua query Prisma ada di sini. **Satu-satunya pengecualian** adalah query spasial raw di `SpatialRepository`.

### BaseRepository (`src/server/repositories/base.repository.ts`)

| Method                          | Keterangan                                                   |
| ------------------------------- | ------------------------------------------------------------ |
| `findMany(options)`             | List dengan pagination, sort, filter                         |
| `findAll(options)`              | Ambil semua (tanpa pagination)                               |
| `findById(id)`                  | Ambil satu berdasarkan ID                                    |
| `findFirst(where)`              | Ambil record pertama yang cocok                              |
| `create(data)`                  | Buat record baru                                             |
| `update(id, data)`              | Update record                                                |
| `count(where)`                  | Hitung record                                                |
| `upsert(where, create, update)` | Create or update                                             |

> **Penyesuaian dari boilerplate:** hapus `softDelete` dan jangan menambahkan filter `deletedAt` di mana pun. Method `delete` (hard delete) tidak dipakai untuk entitas domain (akun, profil, skrining).

### Membuat Repository baru

```typescript
// src/server/repositories/child/child.repository.ts
import { BaseRepository } from "@/server/repositories/base.repository";
import type { Child } from "@prisma/client";

export class ChildRepository extends BaseRepository<Child> {
  protected modelName = "child"; // nama model Prisma (camelCase)

  async findActiveByRegion(regionCode: string, page: number, limit: number) {
    return this.findMany({
      page,
      limit,
      where: { assignedRegionCode: regionCode, recordStatus: "ACTIVE" },
    });
  }
}
```

### Operasi atomik (transaksi)

Operasi yang harus atomik ditulis sebagai method repository dengan `prisma.$transaction`. **Jangan** melakukan panggilan jaringan (termasuk enqueue ke Redis) di dalam transaksi.

```typescript
// Di ChildRepository — idempotensi perubahan profil (aturan: docs/domain-rules.md bagian 1)
async applyChange(input: ApplyChangeInput): Promise<"ACCEPTED" | "ALREADY_RECEIVED" | "CONFLICT"> {
  try {
    return await prisma.$transaction(async (tx) => {
      // change_id adalah primary key: insert gagal jika sudah pernah ada
      await tx.profileChangeOperation.create({
        data: {
          changeId: input.changeId,
          childId: input.childId,
          submittedByUserId: input.userId,
          payloadHash: input.payloadHash,
        },
      });
      await tx.child.upsert({
        where: { id: input.childId },
        create: { /* ...profil, assignedRegionCode dari akun, createdByUserId dari token */ },
        update: { /* ...profil, updatedByUserId dari token; assignedRegionCode TIDAK diubah */ },
      });
      return "ACCEPTED" as const;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await prisma.profileChangeOperation.findUnique({
        where: { changeId: input.changeId },
      });
      return existing?.payloadHash === input.payloadHash ? "ALREADY_RECEIVED" : "CONFLICT";
    }
    throw err;
  }
}
```

> `isUniqueViolation` mengecek `PrismaClientKnownRequestError` dengan `code === "P2002"`. Taruh helper-nya di `src/lib/utils.ts`.

### Daftarkan di index

```typescript
// src/server/repositories/index.ts
export { UserRepository } from "./user/user.repository";
export { ChildRepository } from "./child/child.repository";
export { ScreeningRepository } from "./screening/screening.repository";
export { RegionRepository } from "./region/region.repository";
export { SyncLogRepository } from "./sync/sync-log.repository";
export { SpatialRepository } from "./spatial.repository";
```

---

## Pattern: Service

Service berisi **business logic**: memanggil repository, mengambil keputusan berdasarkan aturan domain, dan mengembalikan hasil. Semua method adalah `static`.

Prinsip khusus project ini:

- Identitas pengguna dan wilayah **selalu dari token/akun**, bukan dari payload.
- Pembatasan akses (wilayah kerja Nakes, peran Admin) diterapkan di service saat data diambil.
- Untuk sync, kegagalan per entitas dikembalikan sebagai **hasil** (`REJECTED`/`CONFLICT` + `error_code`), tidak dilempar sebagai exception.

### Contoh Service (sync profil)

```typescript
// src/server/services/sync/sync.service.ts
import { ChildRepository } from "@/server/repositories";
import { hashPayload } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";
import type { PushChildInput } from "@/server/validators";

const childRepo = new ChildRepository();

export class SyncService {
  static async processChild(user: AuthUser, item: PushChildInput) {
    // Authorization: Nakes may only write profiles in its own work region
    const existing = await childRepo.findById(item.child_id);
    if (user.role === "NAKES" && existing && existing.assignedRegionCode !== user.workRegionCode) {
      return SyncService.result(item.child_id, item.change_id, "REJECTED", "FORBIDDEN_REGION");
    }

    const status = await childRepo.applyChange({
      changeId: item.change_id,
      childId: item.child_id,
      userId: user.id,
      regionCode: user.workRegionCode,
      payloadHash: hashPayload(item), // hash of canonical payload without change_id
      data: item,
    });

    return SyncService.result(item.child_id, item.change_id, status, null);
  }

  private static result(
    entityId: string,
    changeId: string | null,
    receiptStatus: string,
    errorCode: string | null,
  ) {
    return {
      entity_id: entityId,
      change_id: changeId,
      receipt_status: receiptStatus,
      processing_status: "NOT_REQUIRED",
      error_code: errorCode,
      error_message: null,
    };
  }
}
```

### Daftarkan di index

```typescript
// src/server/services/index.ts
export { AuthService } from "./auth/auth.service";
export { UserService } from "./user/user.service";
export { ChildService } from "./child/child.service";
export { SyncService } from "./sync/sync.service";
export { RegionService } from "./region/region.service";
export { MapService } from "./map/map.service";
```

---

## Pattern: Validator (Zod)

Validator hanya memeriksa **bentuk dan format** input sebelum masuk ke service. Aturan bisnis (status profil, kecocokan wilayah, idempotensi) ada di service.

```typescript
// src/server/validators/sync.validator.ts
import { z } from "zod/v4"; // ← selalu gunakan "zod/v4"

export const pushChildSchema = z.object({
  child_id: z.uuid(),
  change_id: z.uuid(),
  name: z.string().min(1).max(200),
  date_of_birth: z.iso.date(),
  gender: z.enum(["MALE", "FEMALE"]),
  address: z.string().min(1),
});

export const pushScreeningSchema = z.object({
  screening_id: z.uuid(),
  child_id: z.uuid(),
  age_months: z.number().int().min(0).max(60),
  gender: z.enum(["MALE", "FEMALE"]),
  height_cm: z.number().positive(),
  classification: z.enum(["SEVERELY_STUNTED", "STUNTED", "NORMAL", "TALL"]),
  screened_at: z.iso.datetime(),
  location_source: z.enum(["GPS", "MANUAL"]),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
  manual_region_code: z.string().optional(),
});

// Batch limit: 50 children, 100 screenings (violation → 400)
export const pushSyncSchema = z.object({
  children: z.array(z.unknown()).max(50).default([]),
  screenings: z.array(z.unknown()).max(100).default([]),
});

export type PushChildInput = z.infer<typeof pushChildSchema>;
export type PushScreeningInput = z.infer<typeof pushScreeningSchema>;
```

> Pada sync, item di dalam array divalidasi **satu per satu** di service/route (`pushChildSchema.safeParse(item)`), sehingga satu item tidak valid hanya menghasilkan `REJECTED` untuk item itu. Skema batch hanya memeriksa struktur dan batas jumlah.
>
> Kombinasi `location_source` dengan `location`/`manual_region_code` (GPS → location wajib, manual_region_code harus kosong; MANUAL → sebaliknya) boleh divalidasi dengan `.refine()`; kesesuaian wilayah manual dengan wilayah kerja tetap di service.

```typescript
// src/server/validators/index.ts — daftarkan di sini
export * from "./auth.validator";
export * from "./sync.validator";
export * from "./user.validator";
```

> **Ingat:** `import { z } from "zod/v4"`, bukan `from "zod"`.

---

## Pattern: API Route

API Route adalah entry point server. Dia **hanya** bertugas: parse input → validasi → panggil service → kembalikan response.

### Helper Response (`src/lib/api-utils.ts`)

| Fungsi                                          | Kapan dipakai                                              |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `apiResponse(data, message, statusCode)`        | Response sukses single item                                |
| `paginatedResponse(data, total, page, perPage)` | Response list dengan pagination                            |
| `errorResponse(message, statusCode, errors?)`   | Response error                                             |
| `parseQueryParams(req)`                         | Parse `page`, `limit`, `sort`, `search`, `filter` dari URL |

### Contoh API Route biasa (Admin: daftar akun Nakes)

```typescript
// src/app/api/v1/admin/users/route.ts
import { NextRequest } from "next/server";
import { UserService } from "@/server/services";
import { paginatedResponse, errorResponse, parseQueryParams } from "@/lib/api-utils";
import { role, ADMIN_ROLES } from "@/lib/api-middleware";

// GET /api/v1/admin/users — hanya Admin
export const GET = role(ADMIN_ROLES, async (req: NextRequest) => {
  try {
    const { page, limit, sort, search } = parseQueryParams(req);
    const searchStr = typeof search === "string" ? search : search?.value;

    const result = await UserService.getAll({ page, limit, sort, search: searchStr });
    return paginatedResponse(result.data, result.total, result.page, result.limit);
  } catch (err) {
    console.error("[GET /api/v1/admin/users]", err);
    return errorResponse("Gagal mengambil data", 500);
  }
});
```

### Contoh API Route sync (pengecualian format)

Endpoint sync mengembalikan **hasil per entitas** dengan HTTP `200`, bukan format `apiResponse` biasa. Kontrak lengkap ada di `docs/domain-rules.md` bagian 8.

```typescript
// src/app/api/v1/sync/push/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SyncService } from "@/server/services";
import { pushSyncSchema } from "@/server/validators";
import { errorResponse } from "@/lib/api-utils";
import { role, NAKES_ROLES } from "@/lib/api-middleware";

export const POST = role(NAKES_ROLES, async (req: NextRequest, _ctx, authUser) => {
  try {
    const parsed = pushSyncSchema.safeParse(await req.json());
    if (!parsed.success) return errorResponse("Struktur permintaan tidak valid", 400);

    // Profiles first, then screenings; each entity is processed independently
    const results = await SyncService.push(authUser, parsed.data);
    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/v1/sync/push]", err);
    return errorResponse("Gangguan pada server", 500);
  }
});
```

> Pengecualian `NextResponse.json()` langsung hanya untuk endpoint sync. Rancangan bentuk body (`results` / `data`) mengikuti `docs/api-contract.md`.

---

## API Response Contract

Semua API route **non-sync** menggunakan helper dari `src/lib/api-utils.ts`. Frontend harus menggunakan struktur ini secara konsisten.

### Success — Single Item

```json
{
  "data": { "id": "…", "name": "…" },
  "message": "OK",
  "statusCode": 200
}
```

```typescript
return apiResponse(user, "Akun berhasil dibuat", 201);
```

### Success — Paginated List

```json
{
  "data": [{ "id": "…" }],
  "page": 1,
  "total": 42,
  "perPage": 10,
  "lastPage": 5,
  "nextPage": 2,
  "previousPage": null,
  "statusCode": 200,
  "message": "OK"
}
```

### Error — General

```json
{ "message": "Data tidak ditemukan", "statusCode": 404 }
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

```typescript
// Di route.ts — selalu format Zod issues seperti ini
if (!parsed.success) {
  const errors = parsed.error.issues.map((issue) => ({
    rule: issue.code,
    field: issue.path.join("."),
    message: issue.message,
  }));
  return errorResponse("Validasi gagal", 422, errors);
}
```

### Status HTTP yang dipakai

| Status | Kapan                                                           |
| ------ | --------------------------------------------------------------- |
| `200`  | Sukses (termasuk sync push: hasil per entitas)                  |
| `201`  | Resource dibuat                                                 |
| `400`  | Struktur permintaan salah / batas batch terlampaui              |
| `401`  | Token tidak ada, tidak valid, atau kedaluwarsa                  |
| `403`  | Akun `INACTIVE` atau tidak berwenang (peran/wilayah)            |
| `404`  | Data tidak ditemukan                                            |
| `422`  | Validasi Zod gagal (endpoint non-sync)                          |
| `5xx`  | Gangguan server                                                 |

### TypeScript Types (Frontend)

Di `src/types/api.ts`:

```typescript
type PaginatedResponse<T> = {
  data: T[];
  page: number;
  total: number;
  perPage: number;
  lastPage: number;
  nextPage: number | null;
  previousPage: number | null;
  statusCode: number;
  message: string;
};

type ApiSingleResponse<T> = {
  data: T;
  statusCode: number;
  message: string;
};

type ApiValidationError = {
  statusCode: number;
  message: string;
  errors: { rule: string; field: string; message: string }[];
};
```

---

## Query & Filter Contract

Semua query URL params diparse oleh `parseQueryParams()` dari `src/lib/api-utils.ts`.

### Params yang Didukung

| Parameter        | Format                   | Default               |
| ---------------- | ------------------------ | --------------------- |
| Pagination       | `?page=2&limit=20`       | page=1, limit=10      |
| Sort ASC         | `?sort=name`             | `createdAt DESC`      |
| Sort DESC        | `?sort=-createdAt`       | Prefix `-` untuk DESC |
| Search           | `?search=keyword`        | —                     |
| Search per field | `?search[email]=keyword` | —                     |
| Filter           | `?field[operator]=value` | —                     |

### Filter Operators

| Operator     | SQL               | Contoh URL                         |
| ------------ | ----------------- | ---------------------------------- |
| `[eq]`       | `= value`         | `?classification[eq]=STUNTED`      |
| `[ne]`       | `!= value`        | `?recordStatus[ne]=INACTIVE`       |
| `[gt]`       | `> value`         | `?screenedAt[gt]=2026-01-01`       |
| `[gte]`      | `>= value`        | `?screenedAt[gte]=2026-01-01`      |
| `[lt]`       | `< value`         | `?ageMonths[lt]=24`                |
| `[lte]`      | `<= value`        | `?screenedAt[lte]=2026-12-31`      |
| `[contains]` | `ILIKE '%value%'` | `?name[contains]=budi`             |
| `[in]`       | `IN (v1, v2)`     | `?resolvedRegionCode[in]=a,b`      |

Filter wilayah administratif dan rentang tanggal untuk StatureMap (WEB-05) dibangun dari operator di atas (`[eq]`/`[in]` untuk wilayah, `[gte]`/`[lte]` untuk tanggal).

> Untuk endpoint publik, whitelist field yang boleh difilter. Jangan membuka filter pada field sensitif (identitas/koordinat).

### Contoh di Route

```typescript
// GET /api/v1/admin/screenings?page=1&limit=10&classification[eq]=STUNTED&screenedAt[gte]=2026-01-01
const { page, limit, sort, search, filter } = parseQueryParams(req);

const sortObj = parseSortParam(sort);
const filterObj = parseFilterConditions(filter);
const searchObj = buildSearchCondition(
  typeof search === "string" ? search : search?.value,
  ["child.name"], // fields yang disearch
);

const where = { ...filterObj, ...(searchObj ?? {}) };
const result = await screeningRepo.findMany({ page, limit, sort: sortObj, where });
return paginatedResponse(result.data, result.total, result.page, result.limit);
```

### Contoh di Client Service

```typescript
const data = await api.get("/api/v1/admin/screenings", {
  page: 1,
  limit: 10,
  sort: "-screenedAt",
  filter: {
    classification: { eq: "STUNTED" },
    screenedAt: { gte: "2026-01-01" },
  },
});
```

---

## Pattern: Antrean & Worker (BullMQ)

Resolusi wilayah untuk skrining GPS berjalan **asinkron**. Backend hanya menerima dan mengantre; worker menentukan wilayah. Aturan lengkap (status, error code, urutan commit → enqueue → tulis log) ada di `docs/domain-rules.md` bagian 6.

### Koneksi Redis (`src/lib/redis.ts`)

```typescript
import IORedis from "ioredis";

// BullMQ Worker requires maxRetriesPerRequest = null
export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});
```

### Queue (producer)

```typescript
// src/server/queues/region-resolution.queue.ts
import { Queue } from "bullmq";
import { redisConnection } from "@/lib/redis";

export const REGION_RESOLUTION_QUEUE = "region-resolution";

export type RegionResolutionJob = {
  syncLogId: string; // links job to the sync_logs row
  screeningId: string;
};

export const regionResolutionQueue = new Queue<RegionResolutionJob>(
  REGION_RESOLUTION_QUEUE,
  { connection: redisConnection },
);
```

### Worker (proses terpisah)

```typescript
// src/server/workers/region-resolution.worker.ts
import { Worker } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { REGION_RESOLUTION_QUEUE, type RegionResolutionJob } from "@/server/queues/region-resolution.queue";
import { SyncService } from "@/server/services";

export const regionResolutionWorker = new Worker<RegionResolutionJob>(
  REGION_RESOLUTION_QUEUE,
  async (job) => {
    // No business logic here: delegate to service
    await SyncService.resolveScreeningRegion(job.data.syncLogId, job.data.screeningId);
  },
  { connection: redisConnection },
);

regionResolutionWorker.on("failed", (job, err) => {
  console.error("[region-resolution]", job?.id, err.message);
});
```

```typescript
// src/server/workers/index.ts — entry point `npm run worker`
import "./region-resolution.worker";
```

### Urutan di service (ringkas)

```
1. Simpan skrining (transaksi) → region_resolution_status = PENDING
2. Commit transaksi
3. Enqueue job (membawa syncLogId)
4. Tulis baris sync_logs SETELAH hasil enqueue diketahui
   - enqueue gagal → FAILED + QUEUE_ENQUEUE_FAILED (respons tetap ACCEPTED)
```

> Worker berjalan sebagai proses Node terpisah (`npm run worker`), bukan di dalam Next.js. Pastikan alias `@/` ter-resolve di runner yang dipakai (mis. `tsx` dengan `tsconfig-paths`).

---

## Pattern: Query Spasial (PostGIS)

Query spasial raw **hanya** boleh ada di `SpatialRepository`, selalu parameterized (tagged template), tidak boleh string-concatenate.

```typescript
// src/server/repositories/spatial.repository.ts
import { prisma } from "@/lib/prisma";

export class SpatialRepository {
  // Point-in-polygon: find the VILLAGE containing the coordinate (note: longitude first)
  async findVillageByPoint(latitude: number, longitude: number): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ region_code: string }[]>`
      SELECT region_code
      FROM administrative_regions
      WHERE region_level = 'VILLAGE'
        AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
      LIMIT 1
    `;
    return rows[0]?.region_code ?? null;
  }

  // Insert a screening whose location is a PostGIS point (Prisma cannot write geometry)
  async insertGpsScreening(/* params */): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO screenings (/* columns */, location)
      VALUES (/* values */, ST_SetSRID(ST_MakePoint(${0}, ${0}), 4326))
    `;
  }
}
```

> Tipe `boundary` (Polygon/MultiPolygon) dan SRID menyesuaikan data batas wilayah yang diimpor; sesuaikan deklarasi kolom di migrasi.

### Agregasi peta publik

Agregasi dihitung langsung dari `screenings` per `resolved_region_code` (tanpa tabel agregat). Catatan tanpa wilayah (`resolved_region_code IS NULL`) tidak ikut.

```typescript
// Di ScreeningRepository
async aggregateByRegion(where: Record<string, unknown>) {
  return prisma.screening.groupBy({
    by: ["resolvedRegionCode", "classification"],
    where: { ...where, resolvedRegionCode: { not: null } },
    _count: { _all: true },
  });
}
```

> Output Public API hanya berisi kode/nama wilayah, jumlah, dan distribusi klasifikasi. Jangan pernah menyertakan `child`, `location`, atau field individual lain di select.

---

## Pattern: Client Service

Client service adalah fungsi-fungsi pemanggil API dari sisi client (StatureMap).

```typescript
// src/services/map-service.ts
import { api } from "@/lib/api-client";
import type { PaginatedResponse, ApiSingleResponse } from "@/types/api";
import type { RegionAggregate, AdminScreening } from "@/types/map";

export const mapService = {
  // Public: aggregate only
  getPublicAggregates: (params?: Record<string, unknown>) =>
    api.get<ApiSingleResponse<RegionAggregate[]>>("/api/v1/public/map", params),

  // Admin: detailed data (auth required)
  getAdminScreenings: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<AdminScreening>>("/api/v1/admin/screenings", params),
};
```

### API Client (`src/lib/api-client.ts`)

```typescript
import { api } from "@/lib/api-client";

const data = await api.get("/api/v1/admin/screenings", { page: 1, limit: 10 });
await api.post("/api/v1/admin/users", { name: "…", email: "…" });
```

---

## Pattern: Hook (React Query)

Hook adalah jembatan antara client service dan komponen React (TanStack React Query v5).

```typescript
// src/hooks/use-map.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { mapService } from "@/services/map-service";

export function usePublicAggregates(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["public-map", params],
    queryFn: () => mapService.getPublicAggregates(params),
  });
}

export function useAdminScreenings(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["admin-screenings", params],
    queryFn: () => mapService.getAdminScreenings(params),
  });
}
```

### Mutation dengan toast

```typescript
// src/hooks/use-users.ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/user-service";
import { toast } from "sonner";

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => userService.createUser(data),
    onSuccess: () => {
      toast.success("Akun Nakes berhasil dibuat");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error & { data?: Record<string, unknown> }) => {
      toast.error((error.data?.message as string) || "Gagal membuat akun");
    },
  });
}
```

---

## Auth Middleware

Middleware auth ada di `src/lib/api-middleware.ts`. Autentikasi memakai **email + password** dan **JWT** (Jose); password di-hash dengan bcryptjs. Tidak ada SSO.

### Perilaku yang wajib

1. Token tidak ada / tidak valid / kedaluwarsa → `401`.
2. Setelah token valid, middleware memuat akun dan memeriksa `account_status`. Akun `INACTIVE` → `403`.
3. Peran tidak sesuai → `403`.
4. `authUser` yang diteruskan ke handler berisi `{ id, email, role, workRegionCode }`; `workRegionCode` diambil dari akun (database), bukan dari payload klien.
5. Backend **tidak pernah menerima token kedaluwarsa**. Masa tenggang offline 7 hari hanya berlaku di aplikasi mobile untuk fungsi lokal.

### Wrapper

```typescript
// Wajib login (peran apa pun yang valid)
export const GET = jwtAuth(async (req, _ctx, authUser) => { /* … */ });

// Wajib login + cek peran
import { role, ADMIN_ROLES, NAKES_ROLES } from "@/lib/api-middleware";

export const POST = role(NAKES_ROLES, async (req, _ctx, authUser) => {
  // authUser.workRegionCode tersedia untuk Nakes
});

export const DELETE = role(ADMIN_ROLES, async (req, _ctx, authUser) => { /* … */ });
```

Endpoint publik (peta agregat) **tanpa wrapper**, tetapi hanya boleh memanggil service yang mengembalikan data agregat.

### Role Constants (`src/constants/common.ts`)

```typescript
export const ROLES = { ADMIN: "ADMIN", NAKES: "NAKES" } as const;

export const ADMIN_ROLES = [ROLES.ADMIN];
export const NAKES_ROLES = [ROLES.NAKES];
export const ALL_ROLES = [ROLES.ADMIN, ROLES.NAKES];

export const RECORD_STATUS = { ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" } as const;
```

### Sign & Verify JWT

```typescript
import { signToken, verifyToken } from "@/lib/auth-utils";

// Sign token (saat login)
const token = await signToken({ sub: user.id, role: user.role });

// Verify token
const payload = await verifyToken(token);
if (!payload) throw new Error("Token tidak valid");
```

> Isi minimal token cukup `sub` dan `role`. Data lain (email, wilayah kerja, status akun) dibaca dari database pada setiap request agar perubahan oleh Admin berlaku segera.

---

## Menambah Domain Baru

Contoh: domain **Screening**. Ikuti urutan ini:

### 1. Tambah model di `prisma/schema.prisma`

UUID sebagai ID, `@map` snake_case, tanpa `deletedAt`, FK `onDelete: Restrict`.

```bash
npx prisma generate
npm run db:migrate
# jika ada kolom/indeks spasial: npx prisma migrate dev --create-only
```

### 2. Buat Repository

```
src/server/repositories/screening/screening.repository.ts
```

Daftarkan di `src/server/repositories/index.ts`.

### 3. Buat Service

```
src/server/services/screening/screening.service.ts
```

Daftarkan di `src/server/services/index.ts`.

### 4. Buat Validator

```
src/server/validators/screening.validator.ts
```

Daftarkan di `src/server/validators/index.ts`.

### 5. Buat API Routes

```
src/app/api/v1/admin/screenings/route.ts
```

### 6. Buat TypeScript Types

```
src/types/screening.ts
```

### 7. Buat Client Service, Hook, lalu UI

```
src/services/screening-service.ts
src/hooks/use-screenings.ts
```

### 8. Tulis test

Skenario yang relevan dengan aturan domain (lihat `docs/domain-rules.md` bagian 10).

### 9. Cantumkan ID persyaratan PRD

Di PR/commit (mis. `WEB-04a`, `DAT-R5`).

---

## Scripts

```bash
npm run dev          # development server
npm run build        # prisma generate + next build
npm run start        # production server
npm run worker       # BullMQ worker
npm run lint         # eslint check
npm run test         # test

npm run db:generate  # generate Prisma client
npm run db:migrate   # buat + apply migration
npm run db:studio    # buka Prisma Studio
```

> Hindari `db:push` — ekstensi PostGIS dan indeks GiST dibuat lewat migrasi SQL manual.
> <!-- TODO: sesuaikan script dengan package.json aktual -->

---

## Untuk Agent AI

Bagian ini khusus untuk agent AI yang bekerja di project ini.

### File yang Wajib Dibaca Agent

| File                   | Isi                                                                            |
| ---------------------- | ------------------------------------------------------------------------------ |
| `AGENTS.md`            | Aturan umum, response contract, query contract                                 |
| `PRD.md`               | Kebutuhan produk, ID persyaratan, kriteria penerimaan                          |
| `docs/domain-rules.md` | Aturan domain (idempotensi, status, lokasi, worker, privasi, endpoint sync)    |
| `docs/architecture.md` | Pola kode dan contoh (file ini)                                                |
| `docs/api-contract.md` | Ringkasan endpoint dan payload                                                 |

> Jika project memakai `CLAUDE.md`, isinya cukup `@AGENTS.md` agar `AGENTS.md` ikut dimuat otomatis.

### Cara Prompt yang Benar untuk Project Ini

```
// Contoh prompt yang baik:
Implementasikan endpoint POST /api/v1/sync/push untuk entitas children (WEB-01).
Ikuti urutan arsitektur: repository → service → validator → API route.
Baca docs/domain-rules.md bagian 1–3 dan 8. Idempotensi lewat change_id + payload_hash.
Tulis test untuk ALREADY_RECEIVED dan CONFLICT.
```

```
// Contoh prompt yang kurang baik:
Buatkan API sync.
```

### Checklist Setelah Menambah Domain Baru

- [ ] Model ada di `prisma/schema.prisma` (UUID, snake_case `@map`, tanpa `deletedAt`, FK `Restrict`)
- [ ] `npx prisma generate` dan migrasi sudah dijalankan (migrasi manual jika ada kolom/indeks spasial)
- [ ] Repository extends `BaseRepository`, `modelName` benar (camelCase Prisma)
- [ ] Tidak ada query Prisma di luar repository (kecuali raw spasial di `SpatialRepository`, parameterized)
- [ ] Service hanya punya static methods; identitas dan wilayah dari token/akun, bukan payload
- [ ] Validator memakai `import { z } from "zod/v4"` dan di-export dari `server/validators/index.ts`
- [ ] Repository dan service di-export dari `index.ts` masing-masing
- [ ] API route non-sync memakai `apiResponse`/`paginatedResponse`/`errorResponse`; sync mengikuti kontraknya
- [ ] API route terproteksi dengan `jwtAuth`/`role`; endpoint publik hanya mengembalikan agregat
- [ ] Tidak ada operasi jaringan (enqueue, HTTP) di dalam transaksi database
- [ ] Constants role/status dipakai (tidak ada hardcoded string)
- [ ] Client service memakai `api.get`/`api.post`; hook memakai `useQuery`/`useMutation` dengan invalidasi cache benar
- [ ] Test untuk skenario domain terkait sudah ada
- [ ] TypeScript compile tanpa error (`npx tsc --noEmit`)

---
