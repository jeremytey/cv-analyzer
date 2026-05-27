import { Request, Response, NextFunction } from 'express';
import { env } from '../env';
import { logger } from '../lib/logger';
import { AppError } from '../lib/app-error';

/**
 * Centralized error handling middleware. 
 * Express detects this specifically as an error boundary due to its 4-argument signature.
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If it's our typed AppError, extract its status; otherwise default to a 500 infrastructure crash
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const isOperational = err instanceof AppError ? err.isOperational : false;

  // Log full diagnostics internally via our shared infrastructure logger
  logger.error({
    message: err.message,
    statusCode,
    isOperational,
    // Only expose stack traces when running locally in development mode
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // 1. Safe Operational Failures (Zod exceptions, 404s, Multer threshold rejections)
  if (isOperational) {
    return res.status(statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // 2. Dangerous/Unanticipated Programmer Failures (DB deadlock, syntax crashes, network dropouts)
  return res.status(500).json({
    status: 'error',
    message: 'An internal server infrastructure failure occurred.',
  });
};