/** Only checks an existing collection. It cannot submit a new Bright Data scrape. */
import { configuredBrightData } from '../server/bright-data-config'
import { AppError } from '../server/errors'
const [url, snapshotId] = process.argv.slice(2)
const key = process.env.BRIGHT_DATA_API_KEY?.trim()
if (!key || !url || !snapshotId)
  throw new Error(
    'Configure BRIGHT_DATA_API_KEY, then supply the Indeed URL and existing snapshot ID.',
  )
try {
  const result = await configuredBrightData(key).resumeSnapshot(url, snapshotId)
  console.log(
    JSON.stringify({
      snapshotId,
      job: result.extraction.job,
      observations: result.extraction.observations.length,
      message: 'Existing snapshot validated and saved. Paste this job URL in the app to reuse it.',
    }),
  )
} catch (error) {
  console.error(
    JSON.stringify(
      error instanceof AppError
        ? { code: error.code, message: error.message, retryAt: error.retryAt }
        : { message: 'Snapshot recovery failed; no new collection was started.' },
    ),
  )
  process.exitCode = 1
}
