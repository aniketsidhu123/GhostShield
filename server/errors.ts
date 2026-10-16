export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
    public retryAt?: string,
  ) {
    super(message)
  }
}
export function publicError(error: unknown) {
  return error instanceof AppError
    ? {
        code: error.code,
        message: error.message,
        ...(error.retryAt ? { retryAt: error.retryAt } : {}),
      }
    : {
        code: 'ANALYSIS_FAILED',
        message: 'The analysis could not finish. Please try again. No scores were generated.',
      }
}
