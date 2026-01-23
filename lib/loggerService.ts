/**
 * Unified Logger Service for DevFreelancer Production
 */
const IS_PROD = window.location.hostname !== 'localhost';

export const logger = {
  error: (message: string, context: Record<string, any> = {}) => {
    console.error(`[ERROR] ${message}`, context);
    if (IS_PROD) {
      // Placeholder para Sentry.captureException()
      // fetch('/api/log-to-sentry', { method: 'POST', body: JSON.stringify({ message, context }) });
    }
  },
  warn: (message: string, context: Record<string, any> = {}) => {
    console.warn(`[WARN] ${message}`, context);
  },
  info: (message: string, context: Record<string, any> = {}) => {
    if (!IS_PROD) console.info(`[INFO] ${message}`, context);
  }
};