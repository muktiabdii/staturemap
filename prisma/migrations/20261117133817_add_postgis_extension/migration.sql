-- CreateExtension
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'NAKES');

-- CreateEnum
CREATE TYPE "account_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "region_level" AS ENUM ('PROVINCE', 'REGENCY', 'DISTRICT', 'VILLAGE');

-- CreateEnum
CREATE TYPE "record_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "classification" AS ENUM ('SEVERELY_STUNTED', 'STUNTED', 'NORMAL', 'TALL');

-- CreateEnum
CREATE TYPE "location_source" AS ENUM ('GPS', 'MANUAL');

-- CreateEnum
CREATE TYPE "region_resolution_status" AS ENUM ('PENDING', 'RESOLVED', 'UNRESOLVED', 'FAILED');

-- CreateEnum
CREATE TYPE "sync_entity_type" AS ENUM ('CHILD', 'SCREENING');

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('ACCEPTED', 'ALREADY_RECEIVED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "processing_status" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "administrative_regions" (
    "region_code" VARCHAR(50) NOT NULL,
    "region_name" VARCHAR(255) NOT NULL,
    "region_level" "region_level" NOT NULL,
    "parent_code" VARCHAR(50),
    "boundary" geometry(MultiPolygon, 4326),

    CONSTRAINT "administrative_regions_pkey" PRIMARY KEY ("region_code")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "account_status" "account_status" NOT NULL DEFAULT 'ACTIVE',
    "work_region_code" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "children" (
    "child_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "date_of_birth" DATE NOT NULL,
    "gender" "gender" NOT NULL,
    "address" TEXT NOT NULL,
    "assigned_region_code" VARCHAR(50) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "updated_by_user_id" UUID,
    "record_status" "record_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "children_pkey" PRIMARY KEY ("child_id")
);

-- CreateTable
CREATE TABLE "screenings" (
    "screening_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "age_months" INTEGER NOT NULL,
    "gender" "gender" NOT NULL,
    "height_cm" DECIMAL(10,2) NOT NULL,
    "classification" "classification" NOT NULL,
    "screened_at" TIMESTAMPTZ(6) NOT NULL,
    "location_source" "location_source" NOT NULL,
    "location" geometry(Point, 4326),
    "manual_region_code" VARCHAR(50),
    "resolved_region_code" VARCHAR(50),
    "region_resolution_status" "region_resolution_status" NOT NULL,

    CONSTRAINT "screenings_pkey" PRIMARY KEY ("screening_id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "sync_log_id" UUID NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "entity_type" "sync_entity_type" NOT NULL,
    "request_entity_id" UUID NOT NULL,
    "change_id" UUID,
    "payload_hash" VARCHAR(255),
    "child_id" UUID,
    "screening_id" UUID,
    "receipt_status" "receipt_status" NOT NULL,
    "processing_status" "processing_status" NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_started_at" TIMESTAMPTZ(6),
    "processing_completed_at" TIMESTAMPTZ(6),
    "error_code" VARCHAR(100),
    "error_message" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("sync_log_id")
);

-- CreateTable
CREATE TABLE "profile_change_operations" (
    "change_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "payload_hash" VARCHAR(255) NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_change_operations_pkey" PRIMARY KEY ("change_id")
);

-- CreateIndex
CREATE INDEX "administrative_regions_parent_code_idx" ON "administrative_regions"("parent_code");

-- CreateIndex
CREATE INDEX "administrative_regions_region_level_idx" ON "administrative_regions"("region_level");

-- CreateIndex
CREATE INDEX "administrative_regions_boundary_idx" ON "administrative_regions" USING GIST ("boundary");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_work_region_code_idx" ON "users"("work_region_code");

-- CreateIndex
CREATE INDEX "children_assigned_region_code_record_status_idx" ON "children"("assigned_region_code", "record_status");

-- CreateIndex
CREATE INDEX "children_assigned_region_code_updated_at_child_id_idx" ON "children"("assigned_region_code", "updated_at", "child_id");

-- CreateIndex
CREATE INDEX "screenings_child_id_screened_at_idx" ON "screenings"("child_id", "screened_at");

-- CreateIndex
CREATE INDEX "screenings_resolved_region_code_screened_at_idx" ON "screenings"("resolved_region_code", "screened_at");

-- CreateIndex
CREATE INDEX "screenings_classification_idx" ON "screenings"("classification");

-- CreateIndex
CREATE INDEX "screenings_location_idx" ON "screenings" USING GIST ("location");

-- CreateIndex
CREATE INDEX "sync_logs_submitted_by_user_id_received_at_idx" ON "sync_logs"("submitted_by_user_id", "received_at");

-- CreateIndex
CREATE INDEX "sync_logs_entity_type_request_entity_id_idx" ON "sync_logs"("entity_type", "request_entity_id");

-- CreateIndex
CREATE INDEX "sync_logs_change_id_idx" ON "sync_logs"("change_id");

-- CreateIndex
CREATE INDEX "sync_logs_child_id_idx" ON "sync_logs"("child_id");

-- CreateIndex
CREATE INDEX "sync_logs_screening_id_idx" ON "sync_logs"("screening_id");

-- CreateIndex
CREATE INDEX "sync_logs_receipt_status_processing_status_idx" ON "sync_logs"("receipt_status", "processing_status");

-- CreateIndex
CREATE INDEX "profile_change_operations_child_id_idx" ON "profile_change_operations"("child_id");

-- CreateIndex
CREATE INDEX "profile_change_operations_submitted_by_user_id_idx" ON "profile_change_operations"("submitted_by_user_id");

-- AddForeignKey
ALTER TABLE "administrative_regions" ADD CONSTRAINT "administrative_regions_parent_code_fkey" FOREIGN KEY ("parent_code") REFERENCES "administrative_regions"("region_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_work_region_code_fkey" FOREIGN KEY ("work_region_code") REFERENCES "administrative_regions"("region_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_assigned_region_code_fkey" FOREIGN KEY ("assigned_region_code") REFERENCES "administrative_regions"("region_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("child_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_manual_region_code_fkey" FOREIGN KEY ("manual_region_code") REFERENCES "administrative_regions"("region_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_resolved_region_code_fkey" FOREIGN KEY ("resolved_region_code") REFERENCES "administrative_regions"("region_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("child_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_screening_id_fkey" FOREIGN KEY ("screening_id") REFERENCES "screenings"("screening_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_operations" ADD CONSTRAINT "profile_change_operations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("child_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_operations" ADD CONSTRAINT "profile_change_operations_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
