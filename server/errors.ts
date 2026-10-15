export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message)
  }
}
export function publicError(error: unknown) {
  return error instanceof AppError
    ? { code: error.code, message: error.message }
    : {
        code: 'ANALYSIS_FAILED',
        message: 'The analysis could not finish. Please try again. No scores were generated.',
      }
}
