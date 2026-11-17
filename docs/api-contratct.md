# API Contract — Stature & StatureMap

Ringkasan endpoint, payload, dan respons. Aturan di balik perilaku endpoint (idempotensi, status, lokasi, privasi) ada di `docs/domain-rules.md`. Kebutuhan produk ada di `PRD.md`.

Tanda **[Tetap]** = sudah ditetapkan oleh rancangan sistem. Tanda **[Usulan]** = bentuk yang diusulkan dan boleh disesuaikan; jika diubah, perbarui dokumen ini dan sisi mobile bersamaan.

---

## Konvensi Umum

| Hal | Ketentuan |
| --- | --- |
| Prefiks | `/api/v1` |
| Format | JSON, `Content-Type: application/json` |
| Auth | `Authorization: Bearer <access_token>` (kecuali endpoint publik dan login) |
| ID entitas | UUID (`child_id`, `screening_id`, `change_id`, `user_id`) |
| Penamaan field body | `snake_case` (konsisten dengan sync dan Room di mobile) |
| Penamaan key filter query | Nama field Prisma `camelCase` sesuai Query Contract di `AGENTS.md` (mis. `screenedAt[gte]`) |
| Waktu | ISO 8601 UTC (`2026-11-12T06:30:00Z`); tanggal lahir `YYYY-MM-DD` |
| Format respons non-sync | `apiResponse` / `paginatedResponse` / `errorResponse` (lihat `AGENTS.md`) |
| Format respons sync push | Hasil per entitas (bagian Sync) |

### Nilai domain

| Field | Nilai |
| --- | --- |
| `gender` | `MALE`, `FEMALE` |
| `classification` | `SEVERELY_STUNTED`, `STUNTED`, `NORMAL`, `TALL` |
| `location_source` | `GPS`, `MANUAL` |
| `record_status` | `ACTIVE`, `INACTIVE` |
| `account_status` | `ACTIVE`, `INACTIVE` |
| `role` | `ADMIN`, `NAKES` |
| `region_level` | `PROVINCE`, `REGENCY`, `DISTRICT`, `VILLAGE` |
| `receipt_status` | `ACCEPTED`, `ALREADY_RECEIVED`, `REJECTED`, `CONFLICT` |
| `processing_status` | `NOT_REQUIRED`, `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `region_resolution_status` | `PENDING`, `RESOLVED`, `UNRESOLVED`, `FAILED` |

### Status HTTP (seluruh API)

| Status | Kondisi |
| --- | --- |
| `200` | Sukses (sync push: hasil per entitas) |
| `201` | Resource dibuat |
| `400` | Struktur permintaan tidak valid / batas batch terlampaui |
| `401` | Token tidak ada, tidak valid, atau kedaluwarsa |
| `403` | Akun `INACTIVE` atau tidak berwenang |
| `404` | Data tidak ditemukan |
| `422` | Validasi gagal (endpoint non-sync) |
| `5xx` | Gangguan backend |

Error di level permintaan (`400`, `401`, `403`, `404`, `5xx`) selalu memakai bentuk umum:

```json
{ "message": "Pesan error", "statusCode": 401 }
```

### Matriks akses

| Kelompok endpoint | Publik | Nakes | Admin |
| --- | --- | --- | --- |
| `/auth/login` | ✔ | ✔ | ✔ |
| `/sync/*`, `/reference/regions` | — | ✔ | — |
| `/public/*` | ✔ | ✔ | ✔ |
| `/admin/*` | — | — | ✔ |

> Token kedaluwarsa tidak pernah diterima. Masa tenggang offline 7 hari hanya berlaku di aplikasi mobile untuk fungsi lokal; setiap pemanggilan API tetap memerlukan token yang berlaku (`401` → autentikasi ulang).

---

## 1. Autentikasi

### `POST /api/v1/auth/login` — [Tetap]

Dipakai Nakes (aplikasi) dan Admin (StatureMap). Tidak ada pendaftaran mandiri.

Request:

```json
{ "email": "nakes@example.com", "password": "••••••••" }
```

Respons `200` (format `apiResponse`):

```json
{
  "data": {
    "access_token": "<jwt>",
    "expires_at": "2026-11-12T13:30:00Z",
    "user": {
      "user_id": "0f6c1c1e-…",
      "name": "Siti Rahma",
      "email": "nakes@example.com",
      "role": "NAKES",
      "work_region_code": "3573010001"
    }
  },
  "message": "OK",
  "statusCode": 200
}
```

- `work_region_code`: kode wilayah kerja berlevel `VILLAGE` untuk Nakes; `null` untuk Admin. Aplikasi menyimpannya ke `local_user` dan memakainya sebagai wilayah kerja.
- `401` kredensial salah; `403` akun `INACTIVE`.
- <!-- TODO: putuskan masa berlaku token dan apakah ada refresh token; isi `expires_at` sesuai keputusan -->

---

## 2. Sinkronisasi (Nakes)

Semua endpoint di bagian ini memerlukan token Nakes yang berlaku. Akun `INACTIVE` → `403`.

### `POST /api/v1/sync/push` — [Tetap]

Mengirim profil anak dan skrining yang belum tersinkronisasi.

**Batas per permintaan:** maks 50 profil dan 100 skrining. Lebih dari itu → `400`; aplikasi memecah menjadi beberapa permintaan.

**Urutan pemrosesan:** semua profil lebih dulu, lalu skrining. Setiap entitas diproses **independen**. Jika profil induk `REJECTED`, skrining yang merujuknya ikut `REJECTED`.

Request:

```json
{
  "children": [
    {
      "child_id": "9a1f…",
      "change_id": "b7d2…",
      "name": "Budi",
      "date_of_birth": "2024-03-15",
      "gender": "MALE",
      "address": "Jl. Melati No. 3"
    }
  ],
  "screenings": [
    {
      "screening_id": "c4e8…",
      "child_id": "9a1f…",
      "age_months": 20,
      "gender": "MALE",
      "height_cm": 78.5,
      "classification": "NORMAL",
      "screened_at": "2026-11-12T03:15:00Z",
      "location_source": "GPS",
      "location": { "latitude": -7.9797, "longitude": 112.6304 }
    },
    {
      "screening_id": "d9a1…",
      "child_id": "9a1f…",
      "age_months": 20,
      "gender": "MALE",
      "height_cm": 78.4,
      "classification": "NORMAL",
      "screened_at": "2026-11-12T03:20:00Z",
      "location_source": "MANUAL",
      "manual_region_code": "3573010001"
    }
  ]
}
```

Aturan field:

| Entitas | Field | Aturan |
| --- | --- | --- |
| children | `child_id`, `change_id` | UUID dari aplikasi. `change_id` baru untuk **setiap** operasi perubahan |
| children | `name`, `address` | wajib, string |
| children | `date_of_birth` | `YYYY-MM-DD` |
| screenings | `age_months` | integer 0–60 |
| screenings | `height_cm` | angka > 0 |
| screenings | `location_source=GPS` | `location` wajib; `manual_region_code` harus kosong |
| screenings | `location_source=MANUAL` | `manual_region_code` wajib (harus wilayah kerja Nakes, level `VILLAGE`); `location` harus kosong |

**Tidak dikirim aplikasi dan diabaikan jika ada:** `created_by_user_id`, `updated_by_user_id`, `assigned_region_code`. Server menurunkannya dari token dan akun.

Respons `200`:

```json
{
  "results": {
    "children": [
      {
        "entity_id": "9a1f…",
        "change_id": "b7d2…",
        "receipt_status": "ACCEPTED",
        "processing_status": "NOT_REQUIRED",
        "error_code": null,
        "error_message": null
      }
    ],
    "screenings": [
      {
        "entity_id": "c4e8…",
        "receipt_status": "ACCEPTED",
        "processing_status": "PENDING",
        "error_code": null,
        "error_message": null
      },
      {
        "entity_id": "d9a1…",
        "receipt_status": "ACCEPTED",
        "processing_status": "NOT_REQUIRED",
        "error_code": null,
        "error_message": null
      }
    ]
  }
}
```

- Urutan hasil sama dengan urutan item pada request. `entity_id` bisa `null` jika item tidak punya ID yang valid (hasil `REJECTED` dengan `VALIDATION_FAILED`).
- `change_id` hanya ada pada hasil `children`.
- `ACCEPTED` bukan berarti pemrosesan selesai. Aplikasi memakai `receipt_status` untuk status lokal dan **tidak** mengubah arti `SYNCED` berdasarkan `processing_status`.

Pemetaan hasil ke status lokal aplikasi:

| `receipt_status` | Status lokal Room |
| --- | --- |
| `ACCEPTED` | `SYNCED` |
| `ALREADY_RECEIVED` | `SYNCED` |
| `REJECTED` | `FAILED` |
| `CONFLICT` | `FAILED` |

Aturan penentuan hasil: `docs/domain-rules.md` bagian 1–3 dan 5.

Untuk profil, aplikasi mencocokkan `change_id` pada hasil dengan `pending_change_id` lokal sebelum memproses `receipt_status`; jika berbeda (profil sudah diedit lagi), hasil diabaikan.

Contoh hasil penolakan:

```json
{
  "entity_id": "c4e8…",
  "receipt_status": "REJECTED",
  "processing_status": "NOT_REQUIRED",
  "error_code": "CHILD_INACTIVE",
  "error_message": "Profil anak tidak aktif; skrining baru tidak dapat diterima"
}
```

#### Kode error entitas

| `error_code` | Status | Keterangan | Asal |
| --- | --- | --- | --- |
| `CHILD_INACTIVE` | `REJECTED` | Profil `INACTIVE` saat skrining diterima | [Tetap] |
| `QUEUE_ENQUEUE_FAILED` | `ACCEPTED` (+ `processing_status=FAILED`) | Gagal memasukkan job resolusi wilayah ke antrean | [Tetap] |
| `WORKER_PROCESSING_FAILED` | (pada log/status pemrosesan) | Worker gagal memproses job | [Tetap] |
| `VALIDATION_FAILED` | `REJECTED` | Bentuk/nilai field tidak valid | [Tetap] |
| `CHILD_NOT_FOUND` | `REJECTED` | Profil induk skrining tidak ada | [Tetap] |
| `PARENT_REJECTED` | `REJECTED` | Profil induk dalam permintaan yang sama ditolak | [Tetap] |
| `FORBIDDEN_REGION` | `REJECTED` | Nakes menulis profil di luar wilayah kerjanya | [Tetap] |
| `INVALID_REGION` | `REJECTED` | Kode wilayah manual tidak ada / bukan `VILLAGE` / bukan wilayah kerja Nakes | [Tetap] |
| `PAYLOAD_MISMATCH` | `CONFLICT` | ID sama dengan payload berbeda | [Tetap] |

> Daftar kode disimpan sebagai konstanta di `src/constants/` (tidak ada hardcoded string).

#### Status HTTP khusus push

| Status | Kondisi | Penanganan aplikasi |
| --- | --- | --- |
| `200` | Diproses; hasil per entitas tersedia | Proses hasil tiap entitas |
| `400` | Struktur salah / batas batch terlampaui | Perbaiki permintaan sebelum kirim ulang |
| `401` | Token tidak ada / kedaluwarsa | Minta autentikasi ulang |
| `403` | Akun nonaktif / tidak berwenang | Hentikan sinkronisasi, tampilkan informasi akses |
| `5xx` | Gangguan backend | Pertahankan data lokal, coba ulang (maks 5 kali, jeda bertahap) |

Jika respons tidak diterima (koneksi putus), aplikasi **tidak** menganggap data tersinkronisasi dan mengirim ulang dengan ID yang sama.

---

### `GET /api/v1/sync/pull` — [Tetap]

Menarik perubahan **profil anak** sesuai wilayah kerja Nakes. Riwayat skrining tidak disertakan.

Query:

| Param | Keterangan |
| --- | --- |
| `cursor` | Opsional. Nilai opak dari `next_cursor` sebelumnya. Tanpa `cursor` = tarik dari awal |

Respons `200`:

```json
{
  "data": [
    {
      "child_id": "9a1f…",
      "name": "Budi",
      "date_of_birth": "2024-03-15",
      "gender": "MALE",
      "address": "Jl. Melati No. 3",
      "assigned_region_code": "3573010001",
      "record_status": "ACTIVE",
      "updated_at": "2026-11-12T03:10:00Z"
    }
  ],
  "next_cursor": "eyJ1cGRhdGVkX2F0IjoiMjAyNi0xMS0xMlQwMzoxMDowMFoifQ",
  "has_more": false,
  "message": "OK",
  "statusCode": 200
}
```

- Mencakup profil baru, profil yang diperbarui, dan perubahan `record_status` (termasuk menjadi `INACTIVE`).
- Hanya profil di wilayah kerja Nakes yang terautentikasi.
- Aplikasi menyimpan `next_cursor` ke `sync_state` **setelah** seluruh data halaman berhasil diterapkan ke Room.
- Perilaku sisi aplikasi: profil lokal berstatus `PENDING`/`SYNCING`/`FAILED` tidak ditimpa; versi server disimpan di `pending_server_changes`.
- Profil `INACTIVE` tetap ditarik agar riwayat dapat ditinjau; riwayat skrining lokal tidak dihapus.

---

### `GET /api/v1/reference/regions` — [Tetap]

Data referensi wilayah yang relevan dengan wilayah kerja Nakes: wilayah kerja tersebut beserta wilayah induknya. Tanpa geometri.

Query:

| Param | Keterangan |
| --- | --- |
| `version` | Opsional. Versi data wilayah yang dimiliki aplikasi |

Respons `200` jika versi berbeda atau `version` tidak dikirim:

```json
{
  "data": {
    "version": "2026-11-01",
    "regions": [
      { "region_code": "35", "region_name": "Jawa Timur", "region_level": "PROVINCE", "parent_code": null },
      { "region_code": "3573", "region_name": "Kota Malang", "region_level": "REGENCY", "parent_code": "35" },
      { "region_code": "357301", "region_name": "Kedungkandang", "region_level": "DISTRICT", "parent_code": "3573" },
      { "region_code": "3573010001", "region_name": "Buring", "region_level": "VILLAGE", "parent_code": "357301" }
    ]
  },
  "message": "OK",
  "statusCode": 200
}
```

Respons `200` jika `version` sama dengan versi server:

```json
{ "data": { "version": "2026-11-01", "regions": null }, "message": "OK", "statusCode": 200 }
```

- Aplikasi menyimpan `version` ke `sync_state` (kunci `ADMINISTRATIVE_REGIONS`) dan memakainya pada pemeriksaan berikutnya.
- Dipanggil pada login pertama (data master wilayah untuk mode offline, MOB-11).

---

### Urutan sinkronisasi di aplikasi — [Tetap]

1. Kirim profil yang menunggu dan skrining yang memenuhi syarat (`push`).
2. Perbarui status lokal berdasarkan hasil tiap entitas.
3. Tarik perubahan profil (`pull`).
4. Simpan cursor setelah seluruh data hasil tarik berhasil diterapkan ke Room.

---

## 3. Endpoint Publik

Tanpa autentikasi. **Hanya data agregat**; tidak pernah ada identitas anak, koordinat, atau catatan individual (WEB-04b, NFR-SEC-03).

### `GET /api/v1/public/map` — [Tetap]

Agregasi skrining per wilayah.

Query:

| Param | Keterangan |
| --- | --- |
| `regionLevel` | Level wilayah yang diagregasi. Default `REGENCY` |
| `parentCode` | Opsional. Batasi ke anak-anak wilayah induk tertentu |
| `screenedAt[gte]`, `screenedAt[lte]` | Opsional. Rentang tanggal skrining |

> Hanya parameter di atas yang diizinkan (whitelist). Filter pada field lain ditolak/diabaikan.

Respons `200`:

```json
{
  "data": [
    {
      "region_code": "3573",
      "region_name": "Kota Malang",
      "region_level": "REGENCY",
      "total_screenings": 412,
      "distribution": {
        "SEVERELY_STUNTED": 31,
        "STUNTED": 54,
        "NORMAL": 281,
        "TALL": 46
      }
    }
  ],
  "message": "OK",
  "statusCode": 200
}
```

- Catatan yang wilayahnya belum/tidak bisa ditentukan tidak ikut dihitung.
- Wilayah tanpa data boleh dikembalikan dengan `total_screenings: 0` atau dihilangkan; tampilan menangani keduanya.

### `GET /api/v1/public/regions` — [Tetap]

Daftar wilayah untuk filter peta publik (nama, level, induk). Tanpa geometri.

Query: `level`, `parentCode` (opsional). Respons: daftar `{ region_code, region_name, region_level, parent_code }`.

### `GET /api/v1/public/map/boundaries` — [Tetap]

Batas wilayah sebagai GeoJSON `FeatureCollection` untuk menggambar peta (properti: `region_code`, `region_name`, `region_level`).

Query: `regionLevel`, `parentCode`.

> <!-- TODO: putuskan apakah batas wilayah dilayani API ini atau sebagai berkas statis di frontend. Pertimbangkan ukuran respons pada level VILLAGE -->

---

## 4. Endpoint Admin

Semua memerlukan token Admin. Nakes → `403`.

### Peta dan Dashboard (WEB-03, WEB-04a, WEB-05) — [Usulan]

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/v1/admin/screenings` | Daftar/peta skrining individual (paginated) |
| `GET /api/v1/admin/dashboard/summary` | Ringkasan statistik sederhana |

`GET /admin/screenings` — query: `page`, `limit`, `sort`, `search`, plus filter Query Contract, mis. `resolvedRegionCode[in]=…`, `screenedAt[gte]=…`, `screenedAt[lte]=…`, `classification[eq]=STUNTED`.

Respons `200` (paginated):

```json
{
  "data": [
    {
      "screening_id": "c4e8…",
      "child": { "child_id": "9a1f…", "name": "Budi", "gender": "MALE", "date_of_birth": "2024-03-15" },
      "age_months": 20,
      "height_cm": 78.5,
      "classification": "NORMAL",
      "screened_at": "2026-11-12T03:15:00Z",
      "location_source": "GPS",
      "location": { "latitude": -7.9797, "longitude": 112.6304 },
      "resolved_region_code": "3573010001",
      "region_resolution_status": "RESOLVED",
      "created_by": { "user_id": "0f6c…", "name": "Siti Rahma" }
    }
  ],
  "page": 1, "total": 1, "perPage": 10, "lastPage": 1,
  "nextPage": null, "previousPage": null,
  "statusCode": 200, "message": "OK"
}
```

- `location` bernilai `null` untuk sumber `MANUAL`.
- Admin dapat melihat data individual termasuk identitas anak sesuai kewenangan. Pembatasan tetap diterapkan di service.

`GET /admin/dashboard/summary` — query: filter wilayah dan rentang tanggal yang sama. Respons: total skrining, distribusi klasifikasi, dan jumlah per wilayah (bentuk rinci mengikuti kebutuhan dashboard).

### Akun Nakes (WEB-06) — [Usulan]

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/v1/admin/users` | Daftar akun (paginated) |
| `POST /api/v1/admin/users` | Buat akun Nakes |
| `GET /api/v1/admin/users/:id` | Detail akun |
| `PATCH /api/v1/admin/users/:id` | Perbarui data akun / wilayah kerja |
| `PATCH /api/v1/admin/users/:id/status` | Aktifkan / nonaktifkan akun |

`POST /admin/users` request:

```json
{
  "name": "Siti Rahma",
  "email": "nakes@example.com",
  "password": "••••••••",
  "work_region_code": "3573010001"
}
```

- `work_region_code` wajib berlevel `VILLAGE`; divalidasi di backend. Validasi gagal → `422`.
- Akun baru berperan `NAKES` dan berstatus `ACTIVE`.
- `PATCH …/status` request: `{ "account_status": "INACTIVE" }`. Penonaktifan memblokir login dan akses API, data yang pernah dibuat dipertahankan. Tidak ada hapus fisik.
- Respons tidak pernah memuat `password_hash`.

### Profil Anak oleh Admin (WEB-10) — [Usulan]

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/v1/admin/children` | Daftar profil (paginated, filter wilayah/status) |
| `GET /api/v1/admin/children/:id` | Detail profil + ringkasan riwayat |
| `PATCH /api/v1/admin/children/:id` | Perbarui informasi profil |
| `PATCH /api/v1/admin/children/:id/status` | Aktifkan / nonaktifkan profil |

- `PATCH` mengubah `name`, `date_of_birth`, `gender`, `address`. Tidak mengubah `assigned_region_code` awal.
- `PATCH …/status` request: `{ "record_status": "INACTIVE" }`. Profil nonaktif tidak bisa dipakai untuk skrining baru; riwayat dipertahankan.
- Perubahan Admin memperbarui `updated_at` sehingga muncul pada `sync/pull` perangkat Nakes (last-write-wins).

### Log Sinkronisasi (WEB-07) — [Usulan]

`GET /api/v1/admin/sync-logs` — paginated. Query: `page`, `limit`, `sort`, serta filter seperti `receiptStatus[eq]`, `processingStatus[eq]`, `entityType[eq]`, `receivedAt[gte]`, `receivedAt[lte]`.

Item respons:

```json
{
  "sync_log_id": "…",
  "submitted_by": { "user_id": "0f6c…", "name": "Siti Rahma" },
  "entity_type": "SCREENING",
  "request_entity_id": "c4e8…",
  "change_id": null,
  "receipt_status": "ACCEPTED",
  "processing_status": "FAILED",
  "received_at": "2026-11-12T03:30:00Z",
  "processing_started_at": null,
  "processing_completed_at": null,
  "error_code": "QUEUE_ENQUEUE_FAILED",
  "error_message": "Gagal memasukkan pekerjaan ke antrean"
}
```

Log tidak berisi salinan payload maupun data pribadi anak.

---

## 5. Hal yang Masih Terbuka

- Masa berlaku token dan ada/tidaknya refresh token (`/auth/login`).
- Pelayanan batas wilayah (GeoJSON) lewat API atau berkas statis.
- Bentuk rinci `GET /admin/dashboard/summary`.
- Daftar `error_code` [Usulan] perlu dikunci bersama sisi mobile sebelum implementasi sync dimulai.

Jika ada yang berubah, perbarui dokumen ini dan `docs/domain-rules.md` secara bersamaan.
