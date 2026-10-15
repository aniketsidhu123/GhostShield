import { lookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'
import { AppError } from './errors'

export function canonicalUrl(input: string): string {
  let url: URL
  try { url = new URL(input) } catch { throw new AppError('INVALID_URL','Use a full public http or https job URL.',400) }
  const host = url.hostname.toLowerCase().replace(/\.$/,'')
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port || input.length > 2048 ||
    !host.includes('.') || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) || host === 'metadata.google.internal' ||
    (ipaddr.isValid(host) && ipaddr.process(host).range() !== 'unicast')) {
    throw new AppError('INVALID_URL','Only public job URLs without credentials or custom ports are supported.',400)
  }
  url.hostname = host
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
  }
  return url.toString()
}
export async function assertPublicUrl(input: string, resolve = lookup): Promise<string> {
  const normalized = canonicalUrl(input)
  let addresses
  try { addresses = await resolve(new URL(normalized).hostname, {all:true,verbatim:true}) }
  catch { throw new AppError('DNS_FAILED','The job site could not be resolved. Check the URL and try again.',400) }
  if (!addresses.length || addresses.some(item => !ipaddr.isValid(item.address) || ipaddr.process(item.address).range() !== 'unicast')) {
    throw new AppError('PRIVATE_URL','Private and reserved network destinations are not supported.',400)
  }
  return normalized
}
