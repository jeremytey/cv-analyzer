import { Request, Response, NextFunction } from 'express';
import 'multer';
import { AppError } from '../lib/app-error';
import { logger } from '../lib/logger';
import { initiateAnalysis } from '../services/analyze.service';

// TODO: Migrate this structural intersection to an external 'types/express.d.ts' 
// declaration file to natively augment the global Express namespace.
type AuthenticatedUploadRequest = Request & { file: Express.Multer.File };

/**
 * @route   POST /api/v1/analyze
 * @desc    Validates multi-part request boundaries and delegates orchestration to the domain service layer
 * @access  Public
 */
export const triggerAnalysis = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // 1. FILE EXISTENCE VALIDATION
    if (!req.file) {
      next(new AppError('No CV file provided. Please upload a valid document.', 400));
      return;
    }

    // Safely cast request now that the file guard-rail has passed execution safely
    const multerReq = req as AuthenticatedUploadRequest;
    const { originalname: originalFilename, path: cvPath } = multerReq.file;

    // 2. PAYLOAD BOUNDARY VALIDATION
    const { jobDescription } = req.body;
    if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length === 0) {
      next(new AppError('A valid target job description string is required.', 400));
      return;
    }

    // 3. SERVICE ORCHESTRATION LAYER BOUNDARY
    // Calls the verified domain service (DB Write via Repo + Redis Queue Enqueue)
    const analysisJob = await initiateAnalysis({
      originalFilename,
      cvPath,
      jobDescription: jobDescription.trim()
    });

    // 4. OBSERVABILITY: LOG ONLY AFTER ALL ASYNCHRONOUS ENGINE STEPS SECURELY RESOLVE
    logger.info({
      message: 'Analysis job processing pipeline initialized successfully',
      jobId: analysisJob.jobId,
      filename: originalFilename,
    });

    // 5. RESOURCE RESPONSE DISPATCH (202 ACCEPTED)
    res.status(202).json({
      status: 'success',
      data: {
        jobId: analysisJob.jobId,
        status: analysisJob.status,
        createdAt: analysisJob.createdAt,
      },
    });
  } catch (error: any) {
    logger.error({
      message: 'Controller execution failure inside triggerAnalysis',
      error: error.message,
    });
    next(error);
  }
};