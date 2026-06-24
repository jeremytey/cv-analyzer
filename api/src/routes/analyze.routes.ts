import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { triggerAnalysis, getAnalysisStatus } from '../controllers/analyze.controller';
import { AppError } from '../lib/app-error';

const router = Router();

// -------------------------------------------------------------------------
// MULTIPART STREAM CONFIGURATION (SHARED VOLUME MOUNT)
// -------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.NODE_ENV === 'test'
      ? path.join(__dirname, '../../uploads-test')
      : '/app/uploads';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniquePrefix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniquePrefix}-${path.basename(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Strict 5MB ceiling constraint
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

// -------------------------------------------------------------------------
// RESOURCE ENTRYPOINT REGISTRATION
// -------------------------------------------------------------------------

/**
 * @route   POST /api/v1/analyze
 * @desc    Accepts PDF resume documents and triggers down to the execution engine
 */
router.post(
  '/analyze',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('cv')(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File size exceeds the rigid 5MB restriction limit.', 400));
          }
          return next(new AppError(`File upload transmission failure: ${err.message}`, 400));
        }
        // Plain Error from fileFilter
        if (err.message === 'INVALID_FILE_TYPE') {
          return next(new AppError(
            'Invalid file format. Only machine-readable PDF documents (.pdf) are permitted.',
            400
          ));
        }
        return next(err);
      }
      next();
    });
  },
  triggerAnalysis
);

/**
 * @route   GET /api/v1/analyze/:jobId
 * @desc    Fetches the current processing state and evaluation results of a specific CV job
 */
router.get('/analyze/:jobId', getAnalysisStatus);

export default router;