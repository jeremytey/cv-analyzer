import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './env';
import { logger } from './lib/logger';

const app = express();

// -------------------------------------------------------------------------
// 1 & 2. SECURITY LAYERS
// -------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  // Consistently enforce the validated, strictly-typed runtime environments
  origin: env.NODE_ENV === 'production' ? env.FRONTEND_URL : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// -------------------------------------------------------------------------
// 3. OBSERVABILITY LAYER: HTTP LIFE-CYCLE TELEMETRY
// -------------------------------------------------------------------------
// Placed before routes to ensure absolute observability (capturing 404s and 500s)
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
// Standard JSON parser. Multi-part streams (Multer) are bound at route-level.
app.use(express.json());

// -------------------------------------------------------------------------
// 5. PLATFORM ENDPOINT REGISTRATION BOUNDARY
// -------------------------------------------------------------------------
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// -------------------------------------------------------------------------
// 6. RESOURCE CATCH-ALL LAYER (404 ERROR NET)
// -------------------------------------------------------------------------
// Fires sequentially only if the incoming verb/path fails to match the routing matrix above
app.use((req: Request, res: Response, next: NextFunction) => {
  const error: any = new Error(`Resource boundary not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  error.isOperational = true; // Classified as a predictable user input state
  next(error);
});

// -------------------------------------------------------------------------
// 7. TERMINAL LAYER: CENTRALIZED EXCEPTION DISPATCHER
// -------------------------------------------------------------------------
// Must strictly maintain the 4-argument signature to be parsed by Express as an error middleware.
// File cleanup has been systematically extracted; the worker maintains absolute file lifecycle authority.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // Log full failure diagnostics internally via our shared infrastructure logger
  logger.error({
    message: err.message,
    statusCode,
    isOperational,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  if (isOperational) {
    return res.status(statusCode).json({
      status: 'error',
      message: err.message
    });
  }

  // Obfuscate strict database deadlocks or runtime infrastructure crashes from client view
  return res.status(500).json({
    status: 'error',
    message: 'An internal server infrastructure failure occurred.'
  });
});

export { app };