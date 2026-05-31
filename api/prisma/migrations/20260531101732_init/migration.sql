-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "analyses" (
    "job_id" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "cv_path" TEXT NOT NULL,
    "job_description" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "match_score" DECIMAL(5,2),
    "analysis_results" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("job_id")
);
