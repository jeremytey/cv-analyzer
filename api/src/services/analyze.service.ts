import { Analysis } from '@prisma/client';
import * as analysisRepository from '../repositories/analysis.repository';
import { redis } from '../lib/redis';
import { AppError } from '../lib/app-error';
import { logger } from '../lib/logger';

/**
 * Orchestrates the intake of a new CV file upload.
 * Persists metadata to the database and queues the processing job atomically.
 */
export async function initiateAnalysis(payload: {
  originalFilename: string;
  cvPath: string;
  jobDescription: string;
}): Promise<Analysis> {
  // 1. Stage the initial tracking record in PostgreSQL
  const analysisRecord = await analysisRepository.createRecord({
    originalFilename: payload.originalFilename,
    cvPath: payload.cvPath,
    jobDescription: payload.jobDescription,
  });

  try {
    const queuePayload = JSON.stringify({
      jobId: analysisRecord.jobId,
      cvPath: analysisRecord.cvPath,
      jobDescription: analysisRecord.jobDescription,
    });

    // 2. Push to the head of the list (Pairing LPUSH + worker BRPOP establishes a strict FIFO pipeline)
    await redis.lpush('cv_analysis_queue', queuePayload);

  } catch (queueError: any) {
    logger.error({
      message: `Queue failure encountered for Job ${analysisRecord.jobId}. Commencing database rollback...`,
      error: queueError.message,
    });

    // 3. COMPENSATING TRANSACTION: Erase the zombie record via the repository layer boundary
    try {
      await analysisRepository.deleteRecordById(analysisRecord.jobId);
      logger.info(`Successfully rolled back zombie record for Job ${analysisRecord.jobId}`);
    } catch (dbRollbackError: any) {
      // Extreme edge-case protection: Database disconnected immediately after the write phase
      logger.error({
        message: `CRITICAL DETACH: Failed to delete zombie record ${analysisRecord.jobId} during rollback!`,
        error: dbRollbackError.message,
      });
    }

    // 4. Force failure visibility back to the client interface
    throw new AppError(
      'The analysis queue is temporarily unavailable. Please try your upload again shortly.',
      503
    );
  }

  return analysisRecord;
}

/**
 * Fetches an active or historical analysis transaction state for a client polling request.
 */
export async function getAnalysisState(jobId: string): Promise<Analysis> {
  const record = await analysisRepository.getRecordById(jobId);

  if (!record) {
    throw new AppError(`Analysis job with reference ID "${jobId}" not found.`, 404);
  }

  return record;
}