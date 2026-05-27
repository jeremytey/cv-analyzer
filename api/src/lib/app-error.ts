export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    
    this.statusCode = statusCode;
    this.isOperational = true; // Every instance of AppError is inherently operational

    // Capture the clean stack trace, excluding the constructor call itself
    Error.captureStackTrace(this, this.constructor);
  }
}