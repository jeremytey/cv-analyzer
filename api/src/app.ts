import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { logger } from './lib/logger';
import { AppError } from './lib/app-error';
import { errorHandler } from './middlewares/error.middleware';

const app = express();

// -------------------------------------------------------------------------
// 0. INFRASTRUCTURE TOPOLOGY CONFIGURATION
// -------------------------------------------------------------------------
// Instructs Express to trust X-Forwarded-* upstream headers so req.ip 
// evaluates to the authentic client remote address instead of the reverse proxy.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); 
}

// -------------------------------------------------------------------------
// 1 & 2. SECURITY LAYERS
// -------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// -------------------------------------------------------------------------
// 3. OBSERVABILITY LAYER: HTTP LIFE-CYCLE TELEMETRY
// -------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      type: 'http',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip, 
    });
  });
  
  next();
});

// -------------------------------------------------------------------------
// 4. DATA TRANSFORMATION LAYER
// -------------------------------------------------------------------------
app.use(express.json());

// -------------------------------------------------------------------------
// 5. PLATFORM ENDPOINT REGISTRATION BOUNDARY
// -------------------------------------------------------------------------
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// -------------------------------------------------------------------------
// 6. RESOURCE CATCH-ALL LAYER (SINGLE 404 ERROR NET)
// -------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Resource boundary not found: ${req.method} ${req.originalUrl}`, 404));
});

// -------------------------------------------------------------------------
// 7. TERMINAL LAYER: CENTRALIZED EXCEPTION DISPATCHER
// -------------------------------------------------------------------------
app.use(errorHandler);

export { app };