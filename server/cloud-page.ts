import { chromium } from 'playwright-core'
import { z } from 'zod'
import { assertPublicUrl } from './urls'
import { AppError } from './errors'
import type { Page } from './tinyfish'

/** A read-only rendered-page fallback in TinyFish infrastructure. No forms, clicks or authentication. */
export async function readCloudPage(url: string, key: string, signal?: AbortSignal): Promise<Page> {
  await assertPublicUrl(url)
  const sessionResponse = await fetch('https://api.browser.tinyfish.ai', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, timeout_seconds: 60 }),
    signal: AbortSignal.any([AbortSignal.timeout(75000), ...(signal ? [signal] : [])]),
    redirect: 'error',
  }).catch(() => {
    throw new AppError(
      'BROWSER_UNAVAILABLE',
      'TinyFish cloud rendering was unavailable. No scores were generated.',
    )
  })
  if (!sessionResponse.ok) {
    await sessionResponse.body?.cancel()
    throw new AppError(
      'BROWSER_UNAVAILABLE',
      `TinyFish cloud rendering is unavailable for this request (HTTP ${sessionResponse.status}).`,
    )
  }
  const session = z
    .object({ session_id: z.string().regex(/^[a-zA-Z0-9-]+$/), cdp_url: z.string().url() })
    .parse(await sessionResponse.json())
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined
  try {
    const cdp = new URL(session.cdp_url)
    if (cdp.protocol !== 'wss:')
      throw new AppError('BROWSER_UNAVAILABLE', 'Unexpected cloud connection protocol.')
    await assertPublicUrl(`https://${cdp.hostname}`)
    browser = await chromium.connectOverCDP(session.cdp_url, { timeout: 25000 })
    const context = browser.contexts()[0]
    const tab = context?.pages()[0]
    if (!tab) throw new AppError('BROWSER_UNAVAILABLE', 'TinyFish did not provide a browser page.')
    await tab.waitForURL((value) => !['about:blank', 'about:newtab'].includes(value.toString()), {
      timeout: 25000,
    })
    await tab.waitForLoadState('domcontentloaded', { timeout: 25000 })
    // Allow ordinary client rendering to complete; never interact with sign-in or CAPTCHA controls.
    await tab
      .waitForFunction(() => document.body?.innerText.length > 500, { timeout: 15000 })
      .catch(() => {})
    signal?.throwIfAborted()
    const final = await assertPublicUrl(tab.url())
    const data = await tab.evaluate(() => {
      const root = document.querySelector('main') ?? document.body
      const headings = Array.from(root.querySelectorAll('h1,h2'))
        .map((e) => e.textContent?.trim())
        .filter(Boolean)
      return {
        title: document.title,
        text: root instanceof HTMLElement ? root.innerText : '',
        headings,
        links: Array.from(root.querySelectorAll('a[href]')).map(
          (e) => (e as HTMLAnchorElement).href,
        ),
      }
    })
    if (
      data.text.length < 240 ||
      /^(?:\s*)(?:Access Denied|Verify you are human|Just a moment|Security check)/i.test(data.text)
    )
      throw new AppError(
        'SOURCE_UNAVAILABLE',
        'The cloud browser reached an access check or an unreadable page. No access check was bypassed.',
        422,
      )
    // Headings come from visible DOM text and are retained as Markdown structure, not inferred content.
    let text = data.text
    for (const heading of data.headings.slice(0, 15)) {
      if (heading && !heading.includes('\n'))
        text = text.replace(
          new RegExp(`(^|\\n)${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\n|$)`),
          `$1## ${heading}`,
        )
    }
    return {
      url: final,
      requestedUrl: url,
      title: data.title.slice(0, 500),
      text: text.slice(0, 160000),
      links: data.links.slice(0, 300),
      fetchedAt: new Date().toISOString(),
      retrieval: 'browser',
    }
  } finally {
    await browser?.close().catch(() => {})
    // Terminate even when extraction fails; the inactivity timeout is an additional bound.
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(`https://api.browser.tinyfish.ai/${session.session_id}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': key },
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      }).catch(() => null)
      if (response?.ok || response?.status === 404) break
      await response?.body?.cancel()
    }
  }
}
