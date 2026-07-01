import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { triggerAnalysis, getAnalysisStatus } from '../controllers/analyze.controller';
import { AppError } from '../lib/app-error';

const router = Router();

const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('INVALID_FILE_TYPE'));
    }
  },
});

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
        if (err.message === 'INVALID_FILE_TYPE') {
          return next(new AppError('Invalid file format. Only machine-readable PDF documents (.pdf) are permitted.', 400));
        }
        return next(err);
      }

      if (!req.file) {
        return next(new AppError('Payload evaluation failure: Missing target CV file payload.', 400));
      }

      if (!req.file.buffer || req.file.buffer.length === 0) {
        return next(new AppError('Payload evaluation failure: Uploaded document payload contains empty byte sequences.', 400));
      }

      next();
    });
  },
  triggerAnalysis
);

router.get('/analyze/:jobId', getAnalysisStatus);

export default router;