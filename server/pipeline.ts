import { randomUUID } from 'node:crypto'
import { TinyFish } from './tinyfish'
import { Store,digest } from './store'
import { buildReport,SCORING_VERSION } from './scoring'
import { canonicalUrl } from './urls'
import { liveAnalysisSchema } from '../src/lib/api-schema'

export function cacheKey(url:string,probe:boolean) {return `${SCORING_VERSION}|${probe}|${url}`}
export async function analyze(url:string,probe:boolean,provider:TinyFish,store:Store,stage:(message:string)=>void,signal:AbortSignal) {
  const limitations:string[]=[]
  stage('Reading the public job posting…')
  const primary=await provider.page(url,signal)
  stage('Finding supporting careers-page sources…')
  let candidates:string[]=[]
  try {candidates=await provider.search(primary.title,signal)} catch {limitations.push('Supporting web search was unavailable. The inspection used links available from the posting.')}
  stage(probe?'Inspecting the listing and public application steps…':'Inspecting the listing and employer sources…')
  const {extraction,runId}=await provider.inspect(primary.url,candidates,probe,signal)
  stage('Verifying quoted evidence against fetched sources…')
  const pages=[primary]
  const urls=new Set<string>()
  for(const observation of extraction.observations) {
    try {const source=canonicalUrl(observation.sourceUrl);if(source!==primary.url) urls.add(source)} catch { /* Unsafe sources never become citations. */ }
  }
  for(const source of [...urls].slice(0,4)) {
    try {const page=await provider.page(source,signal);if(!pages.some(existing=>existing.url===page.url)) pages.push(page)} catch {limitations.push('One supporting source could not be fetched. Observations requiring it were excluded.')}
  }
  if(urls.size>4) limitations.push('Only four supporting source pages were fetched for this check; additional unverified claims were excluded.')
  stage('Calculating independent signal scores…')
  const snapshot={observedAt:new Date().toISOString(),contentHash:digest(primary.text),postedDate:null}
  let history=await store.snapshots(primary.url)
  if(!history.some(item=>item.observedAt.slice(0,10)===snapshot.observedAt.slice(0,10))) history=[...history,snapshot].slice(-90)
  const report=liveAnalysisSchema.parse(buildReport({id:randomUUID(),url,primary,pages,extraction,history,probe,runId,limitations}))
  await store.addSnapshot(primary.url,report.history?.find(item=>item.observedAt===snapshot.observedAt)??snapshot)
  await store.save(cacheKey(url,probe),report)
  return report
}
