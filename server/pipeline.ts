import { randomUUID } from 'node:crypto'
import { TinyFish } from './tinyfish'
import { Store, digest } from './store'
import { buildReport, SCORING_VERSION } from './scoring'
import { resolveListing } from './resolve-listing'
import { liveAnalysisSchema } from '../src/lib/api-schema'

export function cacheKey(url: string, probe: boolean) {
  return `${SCORING_VERSION}|${probe}|${url}`
}
export async function analyze(
  url: string,
  probe: boolean,
  provider: TinyFish,
  store: Store,
  stage: (message: string) => void,
  signal: AbortSignal,
) {
  const limitations: string[] = []
  stage('Reading the public job posting…')
  const {
    page: primary,
    extraction,
    resolution,
  } = await resolveListing(url, provider, stage, signal)
  stage('Extracting quoted observations from the fetched job page…')
  if (probe)
    limitations.push(
      'Application-flow inspection is unavailable in page-text mode. This report covers the public listing text only.',
    )
  const pages = [primary]
  stage('Calculating independent signal scores…')
  const snapshot = {
    observedAt: new Date().toISOString(),
    contentHash: digest(primary.text),
    postedDate: null,
  }
  let history = await store.snapshots(primary.url)
  if (!history.some((item) => item.observedAt.slice(0, 10) === snapshot.observedAt.slice(0, 10)))
    history = [...history, snapshot].slice(-90)
  const report = liveAnalysisSchema.parse({
    ...buildReport({
      id: randomUUID(),
      url,
      primary,
      pages,
      extraction,
      history,
      probe,
      limitations,
    }),
    resolution,
  })
  await store.addSnapshot(
    primary.url,
    report.history?.find((item) => item.observedAt === snapshot.observedAt) ?? snapshot,
  )
  await store.save(cacheKey(url, probe), report)
  return report
}
