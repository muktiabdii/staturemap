# Product Requirements Document (PRD) — Stature & StatureMap

| Atribut | Keterangan |
|---|---|
| **Nama Proyek** | Stature (Mobile) \| StatureMap (Web) |
| **Versi** | 1.2 — penyelarasan dengan draft skripsi terbaru |
| **Tanggal** | 9 November 2026 |
| **Basis revisi** | PRD v1.1 serta penyesuaian terhadap draft skripsi terbaru, khususnya Bab 4 (rekayasa kebutuhan) dan Bab 5 (perancangan arsitektur, data, dan kontrak API) |
| **Status** | Draf kerja terkonsolidasi; detail implementasi yang belum dipastikan tetap ditandai sebagai terbuka |
| **Prinsip akademik** | Draft skripsi terbaru menjadi acuan ruang lingkup dan rancangan sistem. PRD menjabarkan kebutuhan produk yang selaras dengan rancangan tersebut |

## Informasi Proyek

### Tech Stack

| Komponen | Teknologi |
|---|---|
| Mobile | Kotlin, Jetpack Compose |
| On-Device AI | XGBoost Model & ONNX Runtime |
| Local Storage | Room Database (SQLite) |
| Fullstack Web | Next.js |
| Database | PostgreSQL, PostGIS |
| Message Queue | Redis + BullMQ |
| DevOps | AWS EC2, RDS, S3 |

### Target URL

| Jenis | URL |
|---|---|
| Public | <https://staturemap.com> |
| Dashboard | <https://staturemap.com/hq-admin> |

### Tautan Terkait

- **Dokumentasi API:** <https://documenter.getpostman.com/view/41537989/2sBY4Mu1rP>
- **Figma:** <https://www.figma.com/design/LTyMb07ksDZ6i1dfkCA8oc/Stature?node-id=0-1&t=EBPqNe1pCwAEAUUP-1>

### Deskripsi

**Stature** adalah aplikasi mobile Android yang ditujukan bagi tenaga kesehatan untuk mendukung skrining dini stunting berbasis data antropometri. Aplikasi menjalankan inferensi model secara lokal pada perangkat, menyimpan profil dan catatan skrining di penyimpanan lokal, serta menyinkronkan data ketika koneksi tersedia.

**StatureMap** merupakan komponen web pendukung untuk memantau data skrining dan memvisualisasikan sebaran hasil berdasarkan wilayah administratif.

### Target Audience

| Produk | Pengguna |
|---|---|
| Stature | Tenaga Kesehatan |
| StatureMap | Dinas Kesehatan Kabupaten/Kota sebagai admin |
| StatureMap | Masyarakat umum sebagai publik viewer (akses terbatas, tanpa login, data teragregasi) |

## Cara Membaca Dokumen

- **P0 — Inti:** diperlukan agar alur utama produk berjalan.
- **P1 — Pendukung penting:** diperlukan untuk mendukung pengelolaan, akses, sinkronisasi, atau pemetaan dasar.
- **P2 — Opsional/ditunda:** tidak menjadi baseline versi ini.
- **Status terbuka:** kebutuhan telah dirumuskan, tetapi detail implementasi belum boleh dianggap final tanpa verifikasi.

## Daftar Isi

1. [Ringkasan Produk](#1-ringkasan-produk)
2. [Tujuan, Sasaran, dan Batasan](#2-tujuan-sasaran-dan-batasan)
3. [Pengguna dan Hak Akses](#3-pengguna-dan-hak-akses)
4. [Konsep Sistem dan Arsitektur Tingkat Tinggi](#4-konsep-sistem-dan-arsitektur-tingkat-tinggi)
5. [Persyaratan Fungsional Stature](#5-persyaratan-fungsional-stature)
6. [Persyaratan Fungsional Backend dan StatureMap](#6-persyaratan-fungsional-backend-dan-staturemap)
7. [Persyaratan Data dan Aturan Bisnis](#7-persyaratan-data-dan-aturan-bisnis)
8. [Persyaratan Non-Fungsional](#8-persyaratan-non-fungsional)
9. [Evaluasi dan Kriteria Penerimaan](#9-evaluasi-dan-kriteria-penerimaan)
10. [Asumsi, Dependensi, dan Risiko](#10-asumsi-dependensi-dan-risiko)
11. [Lampiran A. Ringkasan Ketertelusuran](#lampiran-a-ringkasan-ketertelusuran)

---

## 1. Ringkasan Produk

Stature adalah aplikasi mobile Android untuk tenaga kesehatan dalam mendukung skrining awal stunting berdasarkan data antropometri anak. Aplikasi menjalankan inferensi model secara lokal pada perangkat, menyimpan profil dan catatan skrining pada penyimpanan lokal, serta menyinkronkan data ke server ketika koneksi tersedia.

StatureMap adalah komponen web pendukung untuk pemantauan data skrining berdasarkan wilayah administratif. StatureMap menyediakan:

- peta internal bagi Admin Dinas Kesehatan,
- ringkasan statistik sederhana,
- fungsi penyaringan data,
- pengelolaan akun tenaga kesehatan,
- pengelolaan profil anak, dan
- peta publik yang hanya menyajikan data agregat.

PRD ini membedakan kebutuhan produk dari evaluasi akademik. Fokus evaluasi penelitian adalah:

- konsistensi prediksi model XGBoost dan model ONNX,
- performa inferensi pada perangkat Android, dan
- usability aplikasi Stature menggunakan System Usability Scale (SUS).

Penyimpanan, sinkronisasi, pengelolaan akses, dan pemetaan merupakan fungsi pendukung yang diverifikasi secara fungsional.

### 1.1 Masalah yang Hendak Dijawab

- Skrining perlu tetap dapat dilakukan ketika koneksi internet tidak tersedia atau tidak stabil, selama sesi lokal pengguna masih valid, termasuk dalam masa tenggang offline yang ditetapkan.
- Hasil prediksi model XGBoost dan model hasil konversi ONNX perlu dibandingkan pada input uji yang sama.
- Data skrining yang dibuat secara offline perlu disimpan lokal dan dikirimkan ketika koneksi tersedia, dengan penanganan pengiriman ulang yang tidak menghasilkan rekaman duplikat pada skenario yang diuji.
- Informasi lokasi pemeriksaan perlu dikaitkan dengan wilayah administratif melalui koordinat atau pilihan manual yang tervalidasi untuk mendukung visualisasi sebaran.
- Akses data individual oleh Admin harus dibedakan dari akses Publik yang hanya menerima data agregat.
- Profil anak yang dinonaktifkan tidak boleh digunakan untuk membuat skrining baru, tetapi riwayat skrining yang telah tersimpan tetap dipertahankan.

---

## 2. Tujuan, Sasaran, dan Batasan

### 2.1 Tujuan Produk

- Mendukung Nakes melakukan skrining antropometri dengan inferensi on-device tanpa memerlukan koneksi internet pada saat pemeriksaan selama sesi lokal masih valid.
- Menyediakan penyimpanan lokal untuk profil anak dan riwayat skrining.
- Menyediakan sinkronisasi data dari Stature ke server ketika koneksi tersedia.
- Mencegah rekaman duplikat akibat pengiriman ulang melalui identitas entitas dan mekanisme idempotensi.
- Menyediakan peta internal, ringkasan statistik sederhana, pengelolaan akun, pengelolaan profil anak, dan log sinkronisasi untuk Admin.
- Menyediakan peta publik berdasarkan agregasi wilayah tanpa identitas anak atau koordinat pemeriksaan individual.

### 2.2 Tujuan Evaluasi Akademik

- Mengukur *prediction agreement* antara model XGBoost asli dan model ONNX pada sampel uji serta urutan fitur yang sama.
- Melaporkan metrik klasifikasi yang ditetapkan dalam metodologi, yaitu accuracy, precision, recall, dan F1-score.
- Mengukur latensi inferensi dan penggunaan memori pada perangkat Android pengujian dengan prosedur yang konsisten.
- Memverifikasi kemampuan alur skrining inti saat offline selama sesi lokal masih valid.
- Mengevaluasi usability aplikasi Stature menggunakan SUS pada partisipan dengan pengalaman relevan.

### 2.3 Non-goals

- Stature bukan alat diagnosis klinis definitif dan tidak menggantikan penilaian tenaga kesehatan.
- Sistem tidak memberikan resep, terapi, atau rekomendasi intervensi medis secara otomatis.
- Aplikasi mobile tidak melatih model AI; pelatihan dan ekspor model dilakukan di lingkungan pengembangan.
- Sistem tidak menyediakan pendaftaran akun mandiri untuk Nakes.
- StatureMap bukan fokus utama evaluasi kuantitatif atau evaluasi usability penelitian.
- Penelitian tidak mengukur dampak kebijakan publik, efektivitas intervensi gizi, atau perubahan prevalensi stunting.
- Peta publik tidak menampilkan identitas anak, titik pemeriksaan individual, atau koordinat individual.
- Ekspor laporan lanjutan, analitik publik tingkat lanjut, navigasi rute, dan dashboard log *real-time* tidak menjadi baseline.

### 2.4 Prinsip Ruang Lingkup

Stature merupakan komponen utama penelitian. Backend dan StatureMap mendukung penyimpanan pusat, sinkronisasi, pengolahan lokasi, pengelolaan akses, dan visualisasi. Detail implementasi dapat berubah selama kebutuhan fungsional, batas privasi, dan batas evaluasi akademik tetap dipenuhi.

---

## 3. Pengguna dan Hak Akses

| Peran | Kebutuhan dan Hak Akses | Batasan |
|---|---|---|
| **Tenaga kesehatan (Nakes)** | Login menggunakan akun yang telah didaftarkan Admin; mengelola profil anak; melakukan skrining; melihat hasil dan riwayat lokal; memilih wilayah secara manual jika GPS tidak tersedia; menyinkronkan data. | Tidak melakukan pelatihan model dan tidak mengubah hasil klasifikasi model secara langsung melalui fungsi koreksi profil. Profil nonaktif tidak dapat digunakan untuk skrining baru. |
| **Admin Dinas Kesehatan** | Login ke StatureMap; melihat peta detail dan data skrining individual termasuk identitas anak sesuai kewenangan; melihat ringkasan; memfilter data; mengelola akun Nakes; melihat log sinkronisasi; memperbarui dan menonaktifkan profil anak sesuai kewenangan. | Akses dibatasi oleh autentikasi dan kewenangan yang diberikan. Hak akses tidak berarti akses tanpa pembatasan ke seluruh fungsi atau data. |
| **Publik** | Mengakses peta sebaran teragregasi tanpa login dan menggunakan filter yang disediakan untuk tampilan publik. | Tidak dapat melihat identitas anak, koordinat pemeriksaan individual, atau catatan skrining individual. |
| **Anak dan orang tua/wali** | Pihak yang datanya dicatat dalam proses skrining; kepentingannya berkaitan dengan ketepatan pencatatan, kerahasiaan, dan perlindungan data. | Bukan aktor langsung dalam cakupan sistem ini. |
| **Penyedia data wilayah** | Menyediakan data batas dan kode wilayah administratif sebagai referensi pemetaan. | Bukan aktor yang menggunakan fungsi aplikasi. |

> **Catatan:** Akun Nakes dibuat dan dikelola oleh Admin Dinas Kesehatan. Wilayah kerja Nakes ditetapkan pada tingkat desa/kelurahan (`VILLAGE`). Pemilihan wilayah pemeriksaan secara manual harus sesuai dengan wilayah kerja Nakes yang terautentikasi. Tampilan publik wajib tetap berbasis agregasi wilayah.

---

## 4. Konsep Sistem dan Arsitektur Tingkat Tinggi

### 4.1 Alur Utama

1. Nakes membuka Stature dan melakukan autentikasi ketika koneksi tersedia jika belum memiliki sesi lokal yang valid.
2. Nakes memilih atau membuat profil anak dan memasukkan data antropometri yang dibutuhkan. Profil anak yang diterima dari server beserta status aktif/nonaktif disimpan pada perangkat.
3. Stature menjalankan model ONNX menggunakan ONNX Runtime pada perangkat Android.
4. Hasil klasifikasi, data masukan, waktu skrining, dan informasi lokasi yang tersedia disimpan secara lokal.
5. Jika tidak ada koneksi, catatan tetap tersimpan lokal dan dapat ditinjau kembali selama sesi lokal masih valid. Setelah JWT kedaluwarsa, masa tenggang lokal berlangsung selama **7 hari**; setelah masa tenggang berakhir, fungsi input dan skrining dibatasi sampai autentikasi ulang ketika koneksi tersedia.
6. Ketika koneksi tersedia, sinkronisasi otomatis atau manual mengirim data yang belum tersinkronisasi ke backend. Pengiriman perubahan profil menggunakan `change_id`, sedangkan catatan skrining menggunakan `screening_id`.
7. Backend memvalidasi permintaan, menangani idempotensi, memberikan respons penerimaan, lalu menjalankan pemrosesan lanjutan secara asinkron. Respons penerimaan dibedakan dari penyelesaian pemrosesan.
8. Aplikasi dapat menarik perubahan profil anak dari server berdasarkan wilayah kerja Nakes. Perubahan yang masih tertunda atau gagal disinkronkan pada perangkat tidak boleh ditimpa oleh perubahan hasil penarikan.
9. Backend memvalidasi bahwa profil anak berstatus `ACTIVE` sebelum menerima skrining baru. Profil `INACTIVE` tetap dapat disinkronisasikan untuk peninjauan riwayat, tetapi tidak dapat digunakan untuk membuat skrining baru.
10. Backend menentukan wilayah administratif dari koordinat GPS apabila tersedia. Jika Nakes memilih wilayah secara manual, backend memvalidasi kesesuaiannya dengan wilayah kerja Nakes. Catatan tanpa wilayah yang dapat ditentukan tidak dimasukkan ke agregasi wilayah.
11. Backend menyediakan data yang sesuai untuk peta Admin serta peta publik agregat. Perubahan profil yang dilakukan Admin diteruskan ke perangkat Nakes melalui mekanisme sinkronisasi.

### 4.2 Komponen dan Teknologi

| Komponen | Teknologi/Arah Implementasi | Peran dan Status |
|---|---|---|
| Aplikasi Stature Android | Kotlin, Jetpack Compose | Antarmuka pengguna, profil anak, skrining, riwayat, penyimpanan lokal, dan sinkronisasi. |
| Penyimpanan lokal | Room Database (SQLite) | Menyimpan profil dan catatan skrining agar dapat diakses saat offline. |
| Model AI | XGBoost yang dikonversi ke ONNX; ONNX Runtime Android | Inferensi pada perangkat. Konsistensi model dan performa diuji pada lingkungan yang ditetapkan. |
| Web StatureMap | Next.js | Dashboard internal dan peta publik. |
| Basis data pusat | PostgreSQL dan PostGIS | Penyimpanan relasional dan pengolahan spasial. |
| Antrean pemrosesan | Redis dan BullMQ | Mendukung pemrosesan sinkronisasi secara asinkron sesuai rancangan implementasi. |
| Deployment dan infrastruktur | AWS EC2 sebagai server cloud pada draft skripsi terbaru | Detail topologi, layanan basis data/objek, dan konfigurasi keamanan mengikuti implementasi aktual; RDS dan S3 tidak dianggap sebagai komponen terkonfirmasi tanpa verifikasi. |

> **Catatan:** Nama teknologi di atas menggambarkan baseline yang diketahui dari rancangan sistem. Konfigurasi deployment dan detail implementasi yang belum dipastikan tidak dianggap sebagai keputusan final hanya karena pernah tercantum pada PRD lama.

---

## 5. Persyaratan Fungsional Stature

Prioritas **P0** menunjukkan kebutuhan inti, sedangkan **P1** menunjukkan kebutuhan pendukung penting. Penggunaan offline mengikuti sesi lokal yang valid. Setelah JWT kedaluwarsa, aplikasi menerapkan masa tenggang lokal selama **7 hari**. Masa tenggang tersebut hanya mengatur fungsi lokal dan tidak memberikan izin untuk mengakses API menggunakan token yang telah kedaluwarsa.

| ID | Nama | Persyaratan | Prioritas |
|---|---|---|---|
| MOB-01 | Autentikasi pengguna | Nakes dapat login menggunakan akun yang telah dibuat dan dikelola Admin. Sistem tidak menyediakan pendaftaran mandiri. | P0 |
| MOB-02 | Pengelolaan sesi offline | Aplikasi dapat digunakan secara offline selama sesi lokal masih valid. Setelah JWT kedaluwarsa, aplikasi memberikan masa tenggang lokal selama 7 hari. Selama masa tenggang, Nakes tetap dapat menggunakan fungsi lokal, termasuk pengelolaan profil dan skrining. Setelah masa tenggang berakhir, fungsi input dan skrining dibatasi sampai autentikasi ulang ketika koneksi tersedia. Masa tenggang lokal tidak memberikan akses ke API menggunakan token yang kedaluwarsa. | P0 |
| MOB-03 | Pengelolaan profil anak | Nakes dapat membuat dan menyimpan profil anak secara lokal untuk digunakan pada catatan pemeriksaan. Profil yang berstatus `INACTIVE` tetap dapat ditampilkan untuk peninjauan riwayat, tetapi tidak dapat digunakan untuk skrining baru. | P0 |
| MOB-04 | Skrining on-device | Aplikasi menerima usia dalam bulan, jenis kelamin, dan tinggi badan, lalu menjalankan model XGBoost hasil konversi ONNX menggunakan ONNX Runtime pada perangkat Android tanpa pemanggilan model ke server. Skrining baru hanya dapat dibuat untuk profil `ACTIVE`. | P0 |
| MOB-05 | Penyimpanan hasil dan lokasi | Sistem menyimpan hasil klasifikasi, waktu skrining, data masukan, dan informasi lokasi yang tersedia pada penyimpanan lokal. | P0 |
| MOB-06 | Pemilihan lokasi alternatif | Jika koordinat GPS tidak tersedia atau tidak dapat digunakan, Nakes dapat memilih wilayah administratif dari data wilayah yang tersedia pada perangkat. Wilayah manual harus sesuai dengan wilayah kerja Nakes yang terautentikasi. Sumber lokasi dibedakan antara GPS dan pilihan manual. | P0 |
| MOB-07 | Riwayat skrining lokal | Nakes dapat melihat riwayat pemeriksaan yang tersimpan pada perangkat dan keterkaitannya dengan profil anak, termasuk riwayat profil yang telah dinonaktifkan. | P0 |
| MOB-08 | Koreksi profil anak | Nakes dapat memperbaiki informasi profil anak sesuai kewenangannya. Perubahan disimpan lokal dan ditandai untuk sinkronisasi menggunakan identitas operasi perubahan yang stabil. Fungsi ini tidak mengubah hasil klasifikasi secara langsung. | P1 |
| MOB-09 | Sinkronisasi otomatis | Sistem mengirim data lokal yang belum tersinkronisasi ketika koneksi tersedia dan kebijakan sinkronisasi memungkinkan. Status diperbarui berdasarkan kriteria keberhasilan penerimaan/pemrosesan yang ditetapkan. | P0 |
| MOB-10 | Sinkronisasi manual | Sistem menyediakan fungsi untuk memulai atau mencoba kembali sinkronisasi secara manual. | P1 |
| MOB-11 | Data master wilayah | Aplikasi menyediakan data wilayah administratif lokal untuk mendukung pemilihan wilayah saat offline. | P1 |
| MOB-12 | Informasi privasi dan persetujuan | Sistem menampilkan informasi privasi serta mencatat persetujuan pengguna apabila mekanisme tersebut memang diterapkan dalam implementasi. | P1 |

---

## 6. Persyaratan Fungsional Backend dan StatureMap

| ID | Nama | Persyaratan | Prioritas |
|---|---|---|---|
| WEB-01 | Penerimaan sinkronisasi dan idempotensi | Backend menerima data skrining dan perubahan profil, memvalidasi permintaan, dan menangani pengiriman ulang menggunakan identitas entitas yang stabil. Operasi perubahan profil menggunakan `change_id`, sedangkan catatan skrining menggunakan `screening_id`. Respons penerimaan dibedakan dari penyelesaian pemrosesan lanjutan. Setiap entitas diproses secara independen. | P0 |
| WEB-02 | Kontrol akses berbasis peran | Admin harus terautentikasi untuk fungsi internal. Publik dapat mengakses informasi agregat tanpa login. Data yang dikembalikan dibatasi berdasarkan peran dan kewenangan pengguna. | P0 |
| WEB-03 | Dashboard internal | Menampilkan peta dan ringkasan statistik sederhana berdasarkan data pemeriksaan yang telah diproses. | P1 |
| WEB-04a | Pemetaan internal | Menampilkan peta hasil pemeriksaan bagi Admin, termasuk data individual dan identitas anak sesuai kewenangan serta ketersediaan informasi lokasi. | P0 |
| WEB-04b | Pemetaan publik | Menampilkan peta agregat berdasarkan wilayah administratif tanpa identitas anak atau koordinat pemeriksaan individual. | P0 |
| WEB-05 | Penyaringan data | Menyediakan filter wilayah administratif dan rentang tanggal untuk data yang sesuai dengan hak akses pengguna. | P1 |
| WEB-06 | Pengelolaan akun Nakes | Admin dapat membuat, memperbarui, menonaktifkan, atau mengelola akun Nakes sesuai tindakan administrasi yang benar-benar disediakan. | P1 |
| WEB-07 | Log sinkronisasi | Mencatat informasi teknis yang diperlukan untuk menelusuri penerimaan data, status pemrosesan, dan kegagalan sinkronisasi. Informasi pribadi dibatasi. | P1 |
| WEB-08 | Penentuan wilayah administratif | Backend menentukan wilayah administratif pemeriksaan berdasarkan koordinat GPS apabila tersedia. Jika Nakes telah memilih wilayah secara manual, sistem menggunakan wilayah tersebut setelah memvalidasi kesesuaiannya dengan wilayah kerja Nakes yang terautentikasi. Apabila informasi lokasi tidak tersedia atau wilayah tidak dapat ditentukan, catatan ditandai belum memiliki wilayah dan tidak dimasukkan ke agregasi pemetaan sampai informasi yang diperlukan tersedia. | P0 |
| WEB-09 | Data batas dan kode wilayah administratif | Sistem menggunakan data batas, kode, dan nama wilayah administratif sebagai data rujukan pemetaan. Penyiapan/import awal diperlukan; pembaruan otomatis bukan persyaratan baseline. | P0 |
| WEB-10 | Pengelolaan profil anak oleh Admin | Admin dapat memperbarui informasi dan menonaktifkan profil anak melalui StatureMap sesuai kewenangannya. Perubahan diteruskan ke perangkat Nakes melalui mekanisme sinkronisasi. Profil nonaktif tidak dapat digunakan untuk skrining baru, tetapi riwayat pemeriksaan tetap dipertahankan. | P1 |

> **Catatan:** WEB-08 mencakup penentuan wilayah berdasarkan koordinat GPS maupun penggunaan wilayah manual yang telah divalidasi. WEB-09 mencakup penyediaan data batas dan kode wilayah administratif. Keduanya dipertahankan sebagai ID berurutan.

Backend dapat menerima permintaan sinkronisasi sebelum seluruh pemrosesan selesai. Antarmuka tidak boleh menyatakan pemrosesan lengkap hanya berdasarkan respons penerimaan. Status yang ditampilkan kepada Nakes harus mengikuti perilaku aktual endpoint dan worker.

---

## 7. Persyaratan Data dan Aturan Bisnis

### 7.1 Kelompok Data

| ID | Kelompok Data | Atribut/Kegunaan |
|---|---|---|
| DAT-01 | Profil anak | Identitas atau kode anak dan informasi profil yang diperlukan untuk menghubungkan profil dengan catatan skrining, termasuk status `ACTIVE`/`INACTIVE`. |
| DAT-02 | Data antropometri | Usia dalam bulan, jenis kelamin, dan tinggi badan sebagai masukan model. |
| DAT-03 | Catatan pemeriksaan | ID pemeriksaan, waktu, data masukan, dan hasil klasifikasi. |
| DAT-04 | Data lokasi | Koordinat lintang/bujur atau wilayah administratif yang dipilih manual, termasuk sumber lokasi. |
| DAT-05 | Data wilayah administratif | Kode, nama, dan data batas wilayah yang diperlukan untuk pemilihan wilayah dan pengolahan geografis. |
| DAT-06 | Data agregasi pemetaan | Referensi wilayah dan jumlah catatan skrining yang memenuhi kriteria agregasi. |
| DAT-07 | Data pengguna dan kewenangan | Identitas akun, peran, wilayah kerja, dan cakupan kewenangan yang diperlukan untuk autentikasi dan otorisasi. |
| DAT-08 | Metadata dan status sinkronisasi | ID unik entitas, waktu pencatatan/perubahan, status sinkronisasi, identitas operasi perubahan profil, dan sumber lokasi. |

### 7.2 Aturan Bisnis

| ID | Aturan | Ketentuan |
|---|---|---|
| DAT-R1 | Identitas entitas | Setiap catatan pemeriksaan memiliki `screening_id` yang unik untuk membedakan catatan dan mendukung penanganan pengiriman ulang. Setiap operasi perubahan profil memiliki `change_id` yang stabil. |
| DAT-R2 | Relasi profil dan pemeriksaan | Satu profil anak dapat memiliki beberapa catatan pemeriksaan; setiap catatan merujuk pada profil yang sesuai. Profil `INACTIVE` tidak dapat digunakan untuk membuat skrining baru, tetapi riwayat yang telah tersimpan tetap dipertahankan. |
| DAT-R3 | Sumber lokasi | Sistem membedakan lokasi yang berasal dari koordinat GPS dan wilayah yang dipilih secara manual. Wilayah manual harus sesuai dengan wilayah kerja Nakes yang terautentikasi. |
| DAT-R4 | Status sinkronisasi | Sistem membedakan data yang masih lokal/belum tersinkronisasi dari data yang telah memenuhi kriteria keberhasilan sinkronisasi. Status penerimaan dibedakan dari status pemrosesan lanjutan. |
| DAT-R5 | Pembatasan akses dan privasi | Akses data individual dibatasi sesuai peran dan kewenangan. Publik hanya menerima data agregat tanpa identitas anak atau koordinat individual. |
| DAT-R6 | Status profil dan penghapusan | Profil anak yang berstatus `ACTIVE` dapat digunakan untuk skrining baru. Profil `INACTIVE` tidak dapat digunakan untuk skrining baru, tetapi tetap dapat ditarik ke perangkat untuk peninjauan riwayat. Penonaktifan tidak menghapus riwayat skrining. Penghapusan fisik bukan alur normal untuk profil, akun, maupun skrining. |
| DAT-R7 | Penarikan perubahan profil | Perubahan profil dari server ditarik sesuai wilayah kerja Nakes. Perubahan server tidak boleh menimpa perubahan lokal yang masih berstatus `PENDING`, `SYNCING`, atau `FAILED`. |

> **Catatan:** Data profil anak dipisahkan dari catatan pemeriksaan karena seorang anak dapat diperiksa lebih dari satu kali. Data lokasi membedakan koordinat dan pilihan manual. Catatan yang tidak memiliki wilayah yang dapat ditentukan tidak boleh dipaksakan masuk ke agregasi wilayah. Validasi status profil, kewenangan wilayah, dan akses data individual dilakukan pada backend.

---

## 8. Persyaratan Non-Fungsional

| ID | Aspek | Persyaratan |
|---|---|---|
| NFR-PER-01 | Latensi inferensi | Latensi inferensi pada perangkat Android dapat diukur dengan titik awal dan akhir pengukuran yang konsisten. Tidak ditetapkan ambang numerik sebelum pengukuran. |
| NFR-PER-02 | Penggunaan memori | Penggunaan memori selama inferensi dapat diukur dengan metode dan kondisi yang konsisten. Ambang 80 MB dari PRD lama bukan kriteria wajib. |
| NFR-REL-01 | Operasi offline | Input, inferensi, dan penyimpanan hasil dapat dilakukan tanpa koneksi internet selama sesi lokal pengguna masih valid, termasuk masa tenggang lokal 7 hari setelah JWT kedaluwarsa. |
| NFR-REL-02 | Persistensi data lokal | Data yang tersimpan secara lokal tetap tersedia setelah aplikasi ditutup dan dibuka kembali pada skenario uji. |
| NFR-REL-03 | Ketahanan sinkronisasi | Kegagalan dan pengiriman ulang ditangani agar tidak menghasilkan rekaman duplikat pada skenario pengujian yang ditetapkan. |
| NFR-REL-04 | Penerimaan dan pemrosesan asinkron | Sistem membedakan penerimaan permintaan sinkronisasi dari penyelesaian pemrosesan lanjutan. |
| NFR-SEC-01 | Autentikasi dan sesi | Fungsi terbatas hanya dapat digunakan sesuai status autentikasi dan kebijakan sesi yang diterapkan. Masa tenggang lokal tidak memberikan otorisasi untuk mengakses API dengan token kedaluwarsa. |
| NFR-SEC-02 | Otorisasi | Akses data dan fungsi dibatasi berdasarkan peran, kewenangan, dan wilayah kerja pengguna. |
| NFR-SEC-03 | Perlindungan data | Identitas anak dan koordinat individual tidak ditampilkan pada peta publik. Log hanya memuat informasi teknis yang diperlukan. |
| NFR-USA-01 | Usability | Usability aplikasi Stature dievaluasi menggunakan SUS pada partisipan dengan pengalaman relevan sesuai metodologi. |
| NFR-COM-01 | Kompatibilitas Android | Aplikasi dapat dipasang dan menjalankan fungsi yang ditetapkan pada perangkat Android yang digunakan untuk pengujian. |
| NFR-OBS-01 | Informasi teknis untuk penelusuran masalah | Sistem menyediakan informasi teknis yang diperlukan untuk menelusuri kegagalan sinkronisasi/pemrosesan tanpa mencatat data pribadi secara berlebihan. |

> **Catatan:** Konsistensi model bukan NFR aplikasi. Konsistensi dievaluasi secara terpisah dengan membandingkan hasil prediksi XGBoost asli dan ONNX pada sampel uji dan urutan fitur yang sama. Hasil latensi dan penggunaan memori dilaporkan berdasarkan pengukuran aktual; PRD ini tidak mengarang hasil atau menetapkan target numerik yang belum disepakati.

---

## 9. Evaluasi dan Kriteria Penerimaan

### 9.1 Evaluasi Akademik Utama

| Fokus | Prosedur/Indikator | Catatan Interpretasi |
|---|---|---|
| Konsistensi model | Bandingkan label prediksi XGBoost asli dan model ONNX pada input uji yang sama. *Prediction agreement* = jumlah prediksi yang sama / jumlah sampel × 100%. | Metrik utama konsistensi. Accuracy, precision, recall, dan F1-score dilaporkan sesuai metodologi. Tidak membuktikan validitas klinis. |
| Performa inferensi on-device | Ukur latensi inferensi dan penggunaan memori pada perangkat Android dengan prosedur dan kondisi konsisten. | Laporkan hasil aktual; jangan menganggap target sebagai hasil sebelum pengukuran. |
| Kemampuan offline | Jalankan alur input, inferensi, penyimpanan, dan akses riwayat tanpa koneksi internet selama sesi lokal masih valid, termasuk skenario masa tenggang dan pembatasan setelah masa tenggang berakhir. | Verifikasi perilaku sistem, bukan validitas klinis model. |
| Usability | Partisipan yang sesuai menjalankan skenario penggunaan Stature dan mengisi kuesioner SUS. | Kriteria partisipan dan prosedur mengikuti Bab 3. |

### 9.2 Verifikasi Fungsi Pendukung

- Verifikasi penyimpanan profil dan catatan skrining serta hubungan antar-data.
- Verifikasi sinkronisasi otomatis/manual, respons penerimaan, pemrosesan lanjutan, kegagalan jaringan, dan pengiriman ulang.
- Verifikasi bahwa pengiriman ulang dengan identitas catatan/operasi yang sama tidak menghasilkan duplikasi pada skenario uji.
- Verifikasi pemilihan wilayah manual ketika GPS tidak tersedia dan kesesuaiannya dengan wilayah kerja Nakes.
- Verifikasi penentuan wilayah administratif dari koordinat dan penggunaan data batas wilayah.
- Verifikasi bahwa peta internal menampilkan data sesuai kewenangan Admin dan peta publik hanya menampilkan data agregat.
- Verifikasi pengelolaan akun, autentikasi, dan otorisasi sesuai peran.
- Verifikasi bahwa kegagalan jaringan tidak menghilangkan catatan lokal pada skenario pengujian.
- Verifikasi bahwa profil `INACTIVE` tidak dapat digunakan untuk membuat skrining baru, tetapi riwayatnya tetap dapat ditinjau.
- Verifikasi pengelolaan profil anak oleh Admin dan penerusan perubahan melalui sinkronisasi.
- Verifikasi bahwa penarikan perubahan server tidak menimpa perubahan lokal yang masih tertunda atau gagal.

### 9.3 Kriteria Penerimaan Fungsional Awal

| ID | Kriteria Penerimaan Awal |
|---|---|
| AC-01 | Skrining dapat dilakukan tanpa koneksi internet setelah aplikasi, model, dan data wilayah yang diperlukan tersedia di perangkat, selama sesi lokal masih valid. Setelah JWT kedaluwarsa, masa tenggang lokal berlaku selama 7 hari. |
| AC-02 | Hasil dan masukan skrining tersimpan secara lokal dan dapat dibaca kembali. |
| AC-03 | Setiap pemeriksaan tersimpan sebagai catatan terpisah yang terhubung ke profil anak. |
| AC-04 | Data dapat dikirim ke backend dan respons penerimaan dibedakan dari penyelesaian pemrosesan asinkron. |
| AC-05 | Pengiriman ulang dengan identitas entitas yang sama tidak membuat duplikasi pada skenario uji. |
| AC-06 | Jika GPS tidak tersedia, Nakes dapat memilih wilayah administratif secara manual dan pilihan tersebut divalidasi terhadap wilayah kerja Nakes. |
| AC-07 | Admin dapat melihat peta detail dan data individual termasuk identitas anak sesuai kewenangannya. |
| AC-08 | Peta publik hanya menampilkan agregasi wilayah tanpa identitas anak atau koordinat pemeriksaan individual. |
| AC-09 | Hasil prediction agreement, latensi, penggunaan memori, dan SUS dapat ditelusuri ke prosedur pengujiannya. |
| AC-10 | Akun Nakes dikelola oleh Admin dan fungsi terbatas menerapkan pemeriksaan autentikasi serta otorisasi. |
| AC-11 | Profil anak berstatus `INACTIVE` tidak dapat digunakan untuk membuat skrining baru, tetapi riwayat skrining yang telah tersimpan tetap dapat diakses sesuai kewenangan. |
| AC-12 | Admin dapat memperbarui dan menonaktifkan profil anak sesuai kewenangan, dan perubahan dapat diteruskan ke perangkat Nakes melalui sinkronisasi. |
| AC-13 | Perubahan profil yang ditarik dari server tidak menimpa perubahan lokal yang masih berstatus `PENDING`, `SYNCING`, atau `FAILED`. |
| AC-14 | Wilayah yang dipilih secara manual harus sesuai dengan wilayah kerja Nakes yang terautentikasi. |
| AC-15 | Backend menolak pembuatan skrining baru untuk profil `INACTIVE`, termasuk ketika permintaan berasal dari proses sinkronisasi. |

---

## 10. Asumsi, Dependensi, dan Risiko

| Jenis | Pernyataan |
|---|---|
| Asumsi | Model ONNX, urutan fitur, dan cara prapemrosesan ditetapkan sebelum pengujian konsistensi. |
| Asumsi | Sesi lokal yang valid memungkinkan alur offline. Setelah JWT kedaluwarsa, masa tenggang lokal ditetapkan selama 7 hari; autentikasi ulang tetap diperlukan untuk akses API. |
| Asumsi | Data profil dan catatan skrining dapat disimpan lokal serta disinkronkan ketika kondisi jaringan memungkinkan. |
| Asumsi | Status `ACTIVE`/`INACTIVE` pada profil anak menjadi dasar validasi pembuatan skrining baru. |
| Dependensi | Data batas dan kode wilayah administratif diperlukan untuk pemetaan dan penentuan wilayah dari koordinat. |
| Dependensi | Akun Admin dan Nakes, autentikasi, otorisasi, serta penetapan wilayah kerja harus ditetapkan sebelum sistem digunakan. |
| Dependensi | Mekanisme sinkronisasi pull dan aturan konflik perubahan profil harus tersedia agar perubahan dari server dapat diteruskan ke perangkat. |
| Risiko | Perbedaan prapemrosesan, urutan fitur, atau versi model dapat menyebabkan prediksi XGBoost dan ONNX berbeda. |
| Risiko | Koordinat atau wilayah yang tidak tersedia dapat membuat catatan tidak dapat dimasukkan ke agregasi wilayah. |
| Risiko | Akses Admin ke data individual dan penyajian peta dapat mengekspos data sensitif jika otorisasi dan batas tampilan tidak diterapkan dengan benar. |
| Risiko | Pengiriman ulang tanpa identitas entitas yang stabil dapat menghasilkan duplikasi. |
| Risiko | Perubahan server yang menimpa perubahan lokal yang belum tersinkronisasi dapat menyebabkan kehilangan pembaruan profil. |
| Risiko | Menetapkan target performa tanpa dasar pengukuran dapat menyebabkan PRD menjanjikan hasil yang belum dibuktikan. |

---

## Lampiran A. Ringkasan Ketertelusuran

| Tujuan/Permasalahan | Requirement Utama | Verifikasi |
|---|---|---|
| Skrining saat offline | MOB-01, MOB-02, MOB-03, MOB-04, MOB-05, MOB-07, NFR-REL-01 | Uji mode pesawat, sesi lokal valid, masa tenggang 7 hari, inferensi, penyimpanan lokal, akses riwayat, dan pembatasan setelah masa tenggang berakhir. |
| Konsistensi model | MOB-04; evaluasi model terpisah dari NFR | *Prediction agreement* pada sampel dan urutan fitur yang sama; laporkan metrik klasifikasi sesuai metodologi. |
| Sinkronisasi setelah offline | MOB-08, MOB-09, MOB-10, WEB-01, WEB-07, DAT-R1, DAT-R4, DAT-R7, NFR-REL-03, NFR-REL-04 | Uji pengiriman, retry, idempotensi `change_id` dan `screening_id`, penarikan perubahan profil, konflik perubahan lokal, serta perbedaan status penerimaan/pemrosesan. |
| Pemetaan wilayah | MOB-05, MOB-06, MOB-11, WEB-04a, WEB-04b, WEB-08, WEB-09, DAT-R3 | Uji GPS, lokasi manual, validasi wilayah kerja, penentuan wilayah administratif, data batas, dan tampilan peta. |
| Perbedaan hak akses | MOB-01, MOB-02, WEB-02, WEB-04a, WEB-04b, WEB-06, WEB-07, WEB-10, DAT-R5, NFR-SEC-01, NFR-SEC-02, NFR-SEC-03 | Uji akses Nakes/Admin/Publik, pengelolaan profil dan akun, serta periksa data yang ditampilkan kepada tiap peran. |
| Pengelolaan status profil | MOB-03, MOB-04, MOB-07, WEB-10, DAT-R2, DAT-R6 | Uji profil `ACTIVE`/`INACTIVE`, penolakan skrining baru pada profil nonaktif, akses riwayat, penonaktifan oleh Admin, dan sinkronisasi perubahan. |
