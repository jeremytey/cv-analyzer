import { Request, Response, NextFunction } from 'express';
import 'multer';
import { AppError } from '../lib/app-error';
import { logger } from '../lib/logger';
import { initiateAnalysis, getAnalysisState } from '../services/analyze.service';

type AuthenticatedMemoryRequest = Request & { file: Express.Multer.File };

export const triggerAnalysis = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const multerReq = req as AuthenticatedMemoryRequest;
    const { originalname: originalFilename, buffer } = multerReq.file;

    const { jobDescription } = req.body;
    if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length === 0) {
      next(new AppError('A valid target job description string is required.', 400));
      return;
    }

    const base64Pdf = buffer.toString('base64');

    const analysisJob = await initiateAnalysis({
      originalFilename,
      base64Pdf,
      jobDescription: jobDescription.trim()
    });

    logger.info({
      message: 'Analysis job processing pipeline initialized successfully via in-memory transport',
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

export const getAnalysisStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { jobId } = req.params;
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