export type JobPlatform = 'LinkedIn' | 'Naukri' | 'Indeed' | 'Workday' | 'ATS / careers'
export function identifyJobLink(input: string) {
  const url = new URL(input)
  const host = url.hostname.toLowerCase()
  let platform: JobPlatform = 'ATS / careers'
  let jobId: string | undefined
  let needsSelection = false
  const inDomain = (domain: string) => host === domain || host.endsWith(`.${domain}`)
  if (inDomain('linkedin.com')) {
    platform = 'LinkedIn'
    jobId =
      url.pathname.match(/\/jobs\/view\/(?:[^/?]*-)?(\d+)\/?$/)?.[1] ??
      url.searchParams.get('currentJobId') ??
      undefined
    if (jobId && /^\d{6,16}$/.test(jobId)) {
      // Keep the job ID; discard search filters and tracking, not the selected vacancy.
      url.pathname = `/jobs/view/${jobId}/`
      url.search = ''
    } else {
      jobId = undefined
      needsSelection = true
    }
  } else if (inDomain('naukri.com')) {
    platform = 'Naukri'
    jobId = url.pathname.match(/\/job-listings-[^/]+-(\d{8,16})\/?$/i)?.[1]
    needsSelection = !jobId
    if (jobId) url.search = ''
  } else if (
    [
      'indeed.com',
      'indeed.co.uk',
      'indeed.co.in',
      'indeed.ca',
      'indeed.com.au',
      'indeed.de',
      'indeed.fr',
    ].some(inDomain)
  ) {
    platform = 'Indeed'
    jobId = url.searchParams.get('jk') ?? url.searchParams.get('vjk') ?? undefined
    if (jobId && /^[a-f0-9]{16}$/i.test(jobId)) {
      url.pathname = '/viewjob'
      url.search = ''
      url.searchParams.set('jk', jobId.toLowerCase())
      jobId = jobId.toLowerCase()
    } else {
      jobId = undefined
      needsSelection = true
    }
  } else if (inDomain('myworkdayjobs.com')) {
    platform = 'Workday'
    jobId = url.pathname.match(/_([^/]+)\/?$/)?.[1]
    needsSelection = !/\/(?:job|details)\//i.test(url.pathname) || !jobId
    for (const key of [...url.searchParams.keys()])
      if (/^(source|jobFamilyGroup|locations|locationCountry)$/i.test(key))
        url.searchParams.delete(key)
  }
  url.hash = ''
  return { url: url.toString(), platform, jobId, needsSelection }
}

export function sameJobLink(a: string, b: string) {
  const left = identifyJobLink(a),
    right = identifyJobLink(b)
  if (left.platform !== right.platform) return false
  if (left.jobId && right.jobId) {
    if (left.platform === 'Workday' && new URL(left.url).hostname !== new URL(right.url).hostname)
      return false
    return left.jobId === right.jobId
  }
  return left.url === right.url
}
