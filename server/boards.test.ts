import test from 'node:test'
import assert from 'node:assert/strict'
import { identifyJobLink, sameJobLink } from '../src/lib/job-links'
import { resolveListing, scopeListing } from './resolve-listing'
import { analyzePage } from './page-analysis'
import { TinyFish, type Page } from './tinyfish'
import { AppError } from './errors'

const linkedin='https://www.linkedin.com/jobs/view/4479816430/'
const text='# Machine Learning Intern\n\nCompany: Example Tech\n\nLocation: Remote\n\nThis role requires Python and data analysis skills. You will build machine learning systems and work with our engineering team. Candidates can apply using the public application form.\n\nResponsibilities include development, testing and documentation.'
const page=(url=linkedin): Page=>({url,title:'Machine Learning Intern at Example Tech — India | LinkedIn Jobs',text,links:[],fetchedAt:new Date().toISOString()})
const signal=()=>AbortSignal.timeout(5000)
test('board URLs preserve selected IDs and reject unselected search pages',()=>{
 assert.equal(identifyJobLink('https://www.linkedin.com/jobs/search-results/?currentJobId=4479816430&keywords=anything').url,linkedin)
 assert.equal(identifyJobLink('https://in.indeed.com/jobs?q=python&vjk=34797a0025b9529d').url,'https://in.indeed.com/viewjob?jk=34797a0025b9529d')
 assert.equal(identifyJobLink('https://www.linkedin.com/jobs/search/?keywords=engineer').needsSelection,true)
 assert.equal(identifyJobLink('https://www.indeed.com/jobs?q=engineer').needsSelection,true)
 assert.equal(sameJobLink(linkedin,'https://in.linkedin.com/jobs/view/machine-learning-intern-at-example-4479816430'),true)
 assert.equal(sameJobLink(linkedin,'https://www.linkedin.com/jobs/view/4479816431'),false)
 assert.equal(sameJobLink('https://a.wd5.myworkdayjobs.com/en-US/A/job/Engineer_JR-123','https://b.wd5.myworkdayjobs.com/en-US/B/job/Engineer_JR-123'),false)
})
test('selection error is returned before any provider request',async()=>{
 const provider={page:async()=>{throw new Error('Must not fetch')}} as unknown as TinyFish
 await assert.rejects(resolveListing('https://www.linkedin.com/jobs/search/',provider,()=>{},signal()),(error:unknown)=>error instanceof AppError && error.code==='SELECT_JOB')
})
test('LinkedIn metadata and Workday embedded descriptions parse without unrelated jobs',()=>{
 const selected=scopeListing({...page(),text:`${text}\n\n## Similar jobs\n\nApplicants must pay a registration fee before the interview.`})
 assert.equal(analyzePage(selected).job.employer,'Example Tech')
 assert.equal(analyzePage(selected).observations.some(o=>o.code==='upfront_fee'),false)
 const workday=scopeListing({...page('https://workday.wd5.myworkdayjobs.com/en-US/Workday/details/Director_JR-0109923'),title:'Senior Director',text:`Search for Jobs\n\n## Other job\n\nApplicants must pay a registration fee before the interview.\n\n## Senior Director\n\nApply\n\n**locations**: USA, CA, Pleasanton\n\n${text.replace('# Machine Learning Intern','Workday welcomes candidates.')}`})
 const result=analyzePage(workday)
 assert.equal(result.job.title,'Senior Director')
 assert.equal(result.job.location,'USA, CA, Pleasanton')
 assert.equal(result.observations.some(o=>o.code==='upfront_fee'),false)
})
test('failed direct access recovers only the exact job ID via Search and Fetch',async()=>{
 const candidate='https://in.linkedin.com/jobs/view/intern-at-example-4479816430'
 const calls:string[]=[]
 const provider={
  page:async(url:string)=>{calls.push(url);if(url===linkedin)throw new AppError('SOURCE_UNAVAILABLE','unavailable',422);return page(url)},
  searchListings:async()=>[{url:'https://www.linkedin.com/jobs/view/1234567890/',title:'similar',snippet:'not evidence'},{url:candidate,title:'same',snippet:'not evidence'}],
 } as unknown as TinyFish
 const result=await resolveListing(linkedin,provider,()=>{},signal())
 assert.equal(result.resolution.method,'exact-id-search')
 assert.deepEqual(calls,[linkedin,candidate])
 assert.equal(result.extraction.observations.some(o=>o.quote.includes('not evidence')),false)
})
test('Naukri cloud rendering is disclosed; provider authentication errors do not trigger recovery',async()=>{
 const url='https://www.naukri.com/job-listings-engineer-example-200520500046'
 const provider={page:async()=>{throw new AppError('SOURCE_PAGE_ERROR','site error',422)},renderedPage:async()=>({...page(url),retrieval:'browser'})} as unknown as TinyFish
 const result=await resolveListing(url,provider,()=>{},signal())
 assert.equal(result.resolution.method,'cloud-render')
 assert.match(result.extraction.limitations[0],/Browser/)
 const denied={page:async()=>{throw new AppError('PROVIDER_AUTH','key rejected')},renderedPage:async()=>{throw new Error('Must not run')}} as unknown as TinyFish
 await assert.rejects(resolveListing(url,denied,()=>{},signal()),(error:unknown)=>error instanceof AppError && error.code==='PROVIDER_AUTH')
})
test('cross-job redirects and snippets alone never produce a report',async()=>{
 const provider={page:async()=>page('https://www.linkedin.com/jobs/view/9999999999/'),searchListings:async()=>[{url:linkedin,title:'Machine Learning Intern',snippet:text}]} as unknown as TinyFish
 await assert.rejects(resolveListing(linkedin,provider,()=>{},signal()),(error:unknown)=>error instanceof AppError && error.code==='LISTING_UNAVAILABLE')
})
