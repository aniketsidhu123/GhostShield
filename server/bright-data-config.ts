import { resolve } from 'node:path'
import { BrightData } from './bright-data'
import { IndeedState } from './indeed-state'
import { digest } from './store'

export function configuredBrightData(key: string, directory = process.env.DATA_DIR || '.data') {
  // Separate account state without writing the credential into the filename or contents.
  return new BrightData(
    key,
    fetch,
    undefined,
    undefined,
    new IndeedState(resolve(directory, `indeed-${digest(key)}.json`)),
  )
}
