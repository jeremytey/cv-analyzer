import { Request, Response, NextFunction } from 'express';
import 'multer'; // Guarantees global Express namespace definition merging under Node16 resolution
import { AppError } from '../lib/app-error';
import { logger } from '../lib/logger';
import { initiateAnalysis, getAnalysisState } from '../services/analyze.service';

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
    if (!req.file) {
      next(new AppError('No CV file provided. Please upload a valid document.', 400));
      return;
    }

    const multerReq = req as AuthenticatedUploadRequest;
    const { originalname: originalFilename, path: cvPath } = multerReq.file;

    const { jobDescription } = req.body;
    if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length === 0) {
      next(new AppError('A valid target job description string is required.', 400));
      return;
    }

    // Single source of truth handles DB transaction + Redis queue emission + compensating rollbacks
    const analysisJob = await initiateAnalysis({
      originalFilename,
      cvPath,
      jobDescription: jobDescription.trim()
    });

    logger.info({
      message: 'Analysis job processing pipeline initialized successfully',
      jobId: analysisJob.jobId,
      filename: originalFilename,
    });

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

/**
 * @route   GET /api/v1/analyze/:jobId
 * @desc    Fetches the current processing state and evaluation results of a specific CV job
 * @access  Public
 */
export const getAnalysisStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { jobId } = req.params;

    // Service layer handles resource querying and safely throws an explicit 404 AppError internally if missing
    const analysisJob = await getAnalysisState(jobId);

    res.status(200).json({
      status: 'success',
      data: {
        jobId: analysisJob.jobId,
        status: analysisJob.status,
        matchScore: analysisJob.matchScore,
        analysisResults: analysisJob.analysisResults,
        errorMessage: analysisJob.errorMessage,
        startedAt: analysisJob.startedAt,
        completedAt: analysisJob.completedAt,
        createdAt: analysisJob.createdAt,
      },
    });
  } catch (error: any) {
    logger.error({
      message: `Controller execution failure inside getAnalysisStatus for ID: ${req.params.jobId}`,
      error: error.message,
    });
    next(error);
  }
};