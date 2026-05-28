// winston structured logging for better log management and analysis
import winston from 'winston';

export const logger = winston.createLogger({
  // Isolated completely from env.ts to prevent premature evaluation traps
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json() 
  ),
  transports: [
    new winston.transports.Console()
  ],
});