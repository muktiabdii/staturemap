/*
  Warnings:

  - The primary key for the `administrative_regions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `parent_code` on the `administrative_regions` table. All the data in the column will be lost.
  - You are about to drop the column `assigned_region_code` on the `children` table. All the data in the column will be lost.
  - You are about to drop the column `manual_region_code` on the `screenings` table. All the data in the column will be lost.
  - You are about to drop the column `resolved_region_code` on the `screenings` table. All the data in the column will be lost.
  - You are about to drop the column `work_region_code` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[region_code]` on the table `administrative_regions` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `administrative_regions` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `updated_at` to the `administrative_regions` table without a default value. This is not possible if the table is not empty.
  - Made the column `boundary` on table `administrative_regions` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "administrative_regions" DROP CONSTRAINT "administrative_regions_parent_code_fkey";

-- DropForeignKey
ALTER TABLE "children" DROP CONSTRAINT "children_assigned_region_code_fkey";

-- DropForeignKey
ALTER TABLE "screenings" DROP CONSTRAINT "screenings_manual_region_code_fkey";

-- DropForeignKey
ALTER TABLE "screenings" DROP CONSTRAINT "screenings_resolved_region_code_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_work_region_code_fkey";

-- DropIndex
DROP INDEX "administrative_regions_parent_code_idx";

-- DropIndex
DROP INDEX "children_assigned_region_code_record_status_idx";

-- DropIndex
DROP INDEX "children_assigned_region_code_updated_at_child_id_idx";

-- DropIndex
DROP INDEX "screenings_resolved_region_code_screened_at_idx";

-- DropIndex
DROP INDEX "users_work_region_code_idx";

-- AlterTable
ALTER TABLE "administrative_regions" DROP CONSTRAINT "administrative_regions_pkey",
DROP COLUMN "parent_code",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id" UUID NOT NULL,
ADD COLUMN     "parent_id" UUID,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL,
ALTER COLUMN "boundary" SET NOT NULL,
ADD CONSTRAINT "administrative_regions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "children" DROP COLUMN "assigned_region_code",
ADD COLUMN     "assigned_region_id" UUID;

-- AlterTable
ALTER TABLE "screenings" DROP COLUMN "manual_region_code",
DROP COLUMN "resolved_region_code",
ADD COLUMN     "manual_region_id" UUID,
ADD COLUMN     "resolved_region_id" UUID;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "work_region_code",
ADD COLUMN     "work_region_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "administrative_regions_region_code_key" ON "administrative_regions"("region_code");

-- CreateIndex
CREATE INDEX "administrative_regions_parent_id_idx" ON "administrative_regions"("parent_id");

-- CreateIndex
CREATE INDEX "children_assigned_region_id_record_status_idx" ON "children"("assigned_region_id", "record_status");

-- CreateIndex
CREATE INDEX "children_assigned_region_id_updated_at_child_id_idx" ON "children"("assigned_region_id", "updated_at", "child_id");

-- CreateIndex
CREATE INDEX "screenings_resolved_region_id_screened_at_idx" ON "screenings"("resolved_region_id", "screened_at");

-- CreateIndex
CREATE INDEX "users_work_region_id_idx" ON "users"("work_region_id");

-- AddForeignKey
ALTER TABLE "administrative_regions" ADD CONSTRAINT "administrative_regions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "administrative_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_work_region_id_fkey" FOREIGN KEY ("work_region_id") REFERENCES "administrative_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_assigned_region_id_fkey" FOREIGN KEY ("assigned_region_id") REFERENCES "administrative_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_manual_region_id_fkey" FOREIGN KEY ("manual_region_id") REFERENCES "administrative_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_resolved_region_id_fkey" FOREIGN KEY ("resolved_region_id") REFERENCES "administrative_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
