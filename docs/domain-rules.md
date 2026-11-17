# Domain Rules — Stature & StatureMap

Aturan domain yang tidak boleh dilanggar. Rujukan kebutuhan: `PRD.md` (ID MOB/WEB/DAT/NFR/AC).
Jika ada yang ambigu atau bertentangan dengan PRD.md, tanyakan ke user — jangan menebak.

## 1. Identitas & Idempotensi

- Profil anak: kunci idempotensi `change_id` (satu per operasi perubahan). Skrining: `screening_id`.
- `payload_hash` pada `profile_change_operations` membedakan hasil:

| Kondisi | Tindakan | receipt_status |
|---|---|---|
| `change_id` baru, `child_id` belum ada | Buat profil | `ACCEPTED` |
| `change_id` baru, `child_id` sudah ada | Perbarui profil | `ACCEPTED` |
| `change_id` sudah ada, payload sama | Tidak diterapkan ulang | `ALREADY_RECEIVED` |
| `change_id` sudah ada, payload beda | Tidak diterapkan | `CONFLICT` |
| Tidak valid / di luar kewenangan | Tidak diterapkan | `REJECTED` |

- Skrining: `screening_id` baru + valid → `ACCEPTED`; sudah ada + payload sama → `ALREADY_RECEIVED`; sudah ada + payload beda → `CONFLICT`; tidak valid, profil tidak ada, atau profil `INACTIVE` → `REJECTED`.
- Insert baris `profile_change_operations` dan penerapan perubahan `children` dilakukan dalam **satu transaksi**. `change_id` adalah primary key, sehingga permintaan bersamaan tetap aman.
- Payload yang ditolak validasi tidak dicatat di `profile_change_operations`.
- Pengiriman ulang tidak boleh menghasilkan baris duplikat.

## 2. Status Penerimaan ≠ Status Pemrosesan (NFR-REL-04)

- `receipt_status`: `ACCEPTED | ALREADY_RECEIVED | REJECTED | CONFLICT`
- `processing_status`: `NOT_REQUIRED | PENDING | PROCESSING | COMPLETED | FAILED`
- `ACCEPTED` TIDAK berarti pemrosesan selesai. Jangan pernah menggabungkan keduanya.
- Profil anak: `processing_status = NOT_REQUIRED`.
- Skrining MANUAL: `NOT_REQUIRED`. Skrining GPS: mengikuti worker (`PENDING → PROCESSING → COMPLETED/FAILED`).
- `ALREADY_RECEIVED`: `processing_status` mencerminkan kondisi entitas yang diterima sebelumnya.
- Pemetaan ke status lokal aplikasi: `ACCEPTED`/`ALREADY_RECEIVED` → `SYNCED`; `REJECTED`/`CONFLICT` → `FAILED`. `processing_status` tidak mengubah arti `SYNCED`.

## 3. Batch Sync

- Maks 50 profil dan 100 skrining per permintaan; lebih dari itu → `400`.
- Setiap entitas diproses **independen**; kegagalan satu entitas tidak menggagalkan entitas lain.
- Profil diproses lebih dulu, lalu skrining. Jika profil induk `REJECTED`, skrining yang merujuknya juga `REJECTED`. Profil baru dan skriningnya boleh dikirim dalam satu permintaan.

## 4. Profil & Skrining

- Skrining baru hanya diterima jika profil ada dan `ACTIVE`. Jika `INACTIVE` → `REJECTED` dengan `error_code = CHILD_INACTIVE`.
- Penonaktifan tidak menghapus riwayat. Tidak ada hard delete untuk akun, profil, maupun skrining.
- Profil: last-write-wins; tidak ada conflict merging. `record_status` (ACTIVE/INACTIVE) selalu ditentukan server.
- Skrining immutable setelah dibuat dan hanya menyimpan kelas akhir (tanpa probabilitas).
- Nakes hanya membuat/memperbarui profil di wilayah kerjanya. Admin dapat melihat, memperbarui, dan menonaktifkan seluruh profil (WEB-10); perubahan Admin tidak mengubah wilayah penugasan awal.
- Akun yang dinonaktifkan: tidak bisa login dan tidak bisa mengakses API (`403`), tetapi datanya dipertahankan.

## 5. Lokasi & Wilayah

- Server TIDAK mempercayai `assigned_region_code`, `created_by_user_id`, atau `updated_by_user_id` dari payload. Selalu diturunkan dari token dan akun Nakes yang terautentikasi.
- Nakes punya tepat satu `work_region_code` berlevel `VILLAGE`; Admin `NULL`. Validasi level dilakukan di backend (bukan hanya FK).
- `location_source = GPS` → `location` wajib, `manual_region_code` harus NULL. `MANUAL` → sebaliknya.
- MANUAL: wilayah wajib sama dengan wilayah kerja Nakes dan berlevel `VILLAGE`. Backend langsung mengisi `resolved_region_code` dan `region_resolution_status = RESOLVED`.
- GPS: simpan baris skrining dalam transaksi dengan `region_resolution_status = PENDING`, lalu enqueue pekerjaan **setelah transaksi commit**. Wilayah ditentukan lewat point-in-polygon PostGIS (tanpa reverse geocoding eksternal).
- Catatan yang wilayahnya belum/tidak bisa ditentukan TIDAK boleh masuk agregasi peta. Belum ada mekanisme pemrosesan ulang untuk skrining GPS yang gagal resolusi.
- `region_resolution_status`: `PENDING | RESOLVED | UNRESOLVED | FAILED`.

## 6. Worker / Antrean

- Payload job BullMQ wajib membawa `sync_log_id`, agar worker memperbarui baris `sync_logs` yang tepat.
- Gagal enqueue → `processing_status` dan `region_resolution_status` = `FAILED`, `error_code = QUEUE_ENQUEUE_FAILED`. Respons penerimaan tetap `ACCEPTED`.
- Gagal diproses worker → keduanya `FAILED`, `error_code = WORKER_PROCESSING_FAILED`.
- `PENDING` hanya dipakai jika job berhasil masuk antrean; berubah `PROCESSING` saat worker mulai.
- Baris `sync_logs` ditulis SETELAH percobaan enqueue agar mencerminkan hasil akhir.
- Satu baris `sync_logs` = satu upaya pengiriman satu entitas (pengiriman ulang = baris baru). Log tidak menyimpan salinan payload atau data pribadi anak.
- Tidak ada panggilan jaringan (termasuk enqueue ke Redis) di dalam transaksi database.

## 7. Privasi & Otorisasi

- Public API HANYA mengembalikan agregat per wilayah (jumlah skrining, distribusi klasifikasi). Tidak ada identitas anak, koordinat individual, atau catatan individual.
- Agregasi dihitung langsung dari `screenings` berdasarkan `resolved_region_code` (tanpa tabel agregat terpisah).
- Pembatasan akses diterapkan di service/repository saat data diambil, bukan hanya di UI.
- Nakes hanya mengakses profil di wilayah kerjanya. Admin mengakses seluruh wilayah sesuai kewenangan.
- Masa tenggang offline 7 hari hanya untuk fungsi lokal di aplikasi; **backend tidak pernah menerima token kedaluwarsa** (`401`).

## 8. Endpoint Sinkronisasi

Prefiks `/api/v1`. Format JSON, bearer access token.

| Endpoint | Fungsi |
|---|---|
| `POST /api/v1/sync/push` | Kirim profil + skrining dalam satu permintaan |
| `GET /api/v1/sync/pull?cursor={cursor}` | Tarik perubahan profil sesuai wilayah kerja Nakes (tanpa riwayat skrining) |
| `GET /api/v1/reference/regions?version={version}` | Data wilayah relevan + penanda versi |

- Respons push: HTTP `200` dengan hasil **per entitas**: `entity_id`, `change_id` (khusus profil), `receipt_status`, `processing_status`, `error_code`, `error_message`.
- Payload push — profil: `child_id`, `change_id`, `name`, `date_of_birth`, `gender`, `address`. Skrining: `screening_id`, `child_id`, `age_months`, `gender`, `height_cm`, `classification`, `screened_at`, `location_source`, `location` (hanya GPS), `manual_region_code` (hanya MANUAL).
- Pull: `next_cursor` dan `has_more` dikelola backend. Hanya profil di wilayah kerja Nakes (baru, diperbarui, dan perubahan `record_status`).
- Regions: jika `version` berbeda dari versi server, kembalikan daftar wilayah relevan (wilayah kerja Nakes + wilayah induknya) beserta penanda versi.

| HTTP | Kondisi |
|---|---|
| `200` | Diproses, hasil per entitas tersedia |
| `400` | Struktur tidak valid / batas batch terlampaui |
| `401` | Token tidak ada atau kedaluwarsa |
| `403` | Akun nonaktif atau tidak berwenang |
| `5xx` | Gangguan backend |

## 9. Prisma + PostGIS

- Prisma tidak mendukung `geometry` secara native: gunakan `Unsupported("geometry(Point, 4326)")` untuk `screenings.location` dan tipe geometry untuk `administrative_regions.boundary`.
- Ekstensi PostGIS dan indeks GiST dibuat lewat **migrasi SQL manual**, bukan dari `schema.prisma`.
- Query spasial raw (`$queryRaw`) HANYA di `SpatialRepository` (`src/server/repositories/spatial.repository.ts`) dan WAJIB parameterized (tagged template), tidak boleh string-concatenate.
- Foreign key memakai `onDelete: Restrict`. Tidak memakai `deletedAt`; penonaktifan via `record_status`/`account_status`.
- Nilai domain: `gender` (`MALE|FEMALE`), `classification` (`SEVERELY_STUNTED|STUNTED|NORMAL|TALL`), `location_source` (`GPS|MANUAL`), `age_months` 0–60, `height_cm` > 0.

## 10. Skenario Test Wajib

- Kirim ulang `change_id`/`screening_id` yang sama → `ALREADY_RECEIVED`, tanpa duplikasi
- ID sama dengan payload berbeda → `CONFLICT`
- Skrining untuk profil `INACTIVE` → `REJECTED` (`CHILD_INACTIVE`)
- Kegagalan satu entitas dalam batch tidak menggagalkan entitas lain
- Batas batch (50/100) → `400`
- Lokasi MANUAL di luar wilayah kerja Nakes → `REJECTED`
- Akses per role: Nakes (wilayah lain), Admin, Publik (agregat tanpa identitas/koordinat)
- Akun `INACTIVE` → `403`
- Gagal enqueue → `ACCEPTED` + `processing_status = FAILED`
- Pull tidak menyertakan skrining dan hanya mengembalikan profil di wilayah kerja Nakes
