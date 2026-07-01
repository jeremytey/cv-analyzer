import { Analysis } from '@prisma/client';
import * as analysisRepository from '../repositories/analysis.repository';
import { redis } from '../lib/redis';
import { AppError } from '../lib/app-error';
import { logger } from '../lib/logger';

export async function initiateAnalysis(payload: {
  originalFilename: string;
  base64Pdf: string;
  jobDescription: string;
}): Promise<Analysis> {
  const analysisRecord = await analysisRepository.createRecord({
    originalFilename: payload.originalFilename,
    jobDescription: payload.jobDescription,
  });

  try {
    const queuePayload = JSON.stringify({
      jobId: analysisRecord.jobId,
      base64Pdf: payload.base64Pdf,
      jobDescription: analysisRecord.jobDescription,
    });

    await redis.lpush('cv_analysis_queue', queuePayload);

  } catch (queueError: any) {
    logger.error({
      message: `Queue insertion failure encountered for Job ${analysisRecord.jobId}. Executing cleanup rollback...`,
      error: queueError.message,
    });

    try {
      await analysisRepository.deleteRecordById(analysisRecord.jobId);
      logger.info(`Successfully rolled back tracking footprint for Job ${analysisRecord.jobId}`);
    } catch (dbRollbackError: any) {
      logger.error({
        message: `CRITICAL DETACH: Failed to remove zombie entry record ${analysisRecord.jobId} during operational rollback!`,
        error: dbRollbackError.message,
      });
    }

    throw new AppError(
      'The analysis queue is temporarily unavailable. Please try your upload again shortly.',
      503
    );
  }

  return analysisRecord;
}

export async function getAnalysisState(jobId: string): Promise<Analysis> {
  const record = await analysisRepository.getRecordById(jobId);
  if (!record) {
    throw new AppError(`Analysis job with reference ID "${jobId}" not found.`, 404);
  }
  return record;
}