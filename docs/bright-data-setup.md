# Bright Data: optional Indeed fallback

TinyFish Fetch, Browser and exact-ID Search remain the primary retrieval path. Only an exhausted Indeed content/access failure activates Bright Data. TinyFish authentication, billing, rate-limit and policy errors are surfaced rather than hidden. Naukri, LinkedIn and direct ATS scans stay on TinyFish.

## Get the key

1. Open https://brightdata.com/products/web-scraper/indeed and choose **Start free**. Create an account and complete its onboarding.
2. Check **Billing Overview → Free Tier Credits**. As verified on 2026-10-16, new accounts receive 5,000 shared monthly credits automatically, without a payment card or promo code. Web Scraper API uses one credit per delivered record. This is a shared allowance, not 5,000 credits for each product. For free-only operation, do not deposit funds or enable auto-recharge. The dashboard is authoritative for your account's allowance.
3. Open https://brightdata.com/cp/setting/users. Under **API keys**, use **Add API key**, choose **User** API usage permissions, select an expiration, save and copy the key. A newly generated key is shown once. If a key already exists, use your securely saved copy; refreshing it invalidates its old value.
4. Edit `D:\GhostShield\.env`, retaining your existing TinyFish key. Add:

   ```env
   BRIGHT_DATA_API_KEY=your_actual_key
   ```

5. Restart the backend with `npm run dev:api`. Never use a `VITE_` prefix or put this key into frontend source, chat, screenshots or Git.

Official references: [free tier](https://docs.brightdata.com/general/account/billing-and-pricing/free-tier), [API keys](https://docs.brightdata.com/api-reference/authentication), [Indeed scraper](https://brightdata.com/products/web-scraper/indeed).

## Integration behavior

- Uses the dedicated Indeed dataset `gd_l4dx9j9sscpvs7no2` through `POST /datasets/v3/scrape?format=json&include_errors=true`. One selected job URL per request; no broad discovery or crawling.
- For HTTP 202, polls the returned snapshot's progress and downloads JSON when ready. POST is never automatically retried because a timed-out request might already be collecting a record.
- The adapter accepts exactly one complete description whose `jobid` matches the submitted `jk`/`vjk`. If a result URL is present, it must match too. Partial, login, error and mismatched records fail without scores.
- Returned title/company metadata and description feed the existing conservative scoring rules. Quotes are checked against Bright Data's returned text. Provider-parsed dates are not used as proof of original posting age. Application flows and employer identity remain unverified.
- Reports display **Bright Data · Indeed fallback**, a matching listing link and the retrieval limitation. They are uncalibrated signal indices, not proof of fraud or hiring intent.
- Existing one-hour caching, in-flight deduplication and per-client limits still apply. Bright Data is limited to 20 new collection requests per process per hour and 190 seconds per fallback. These application limits do not replace account billing limits.
- No Bright Data response body or credential is exposed in upstream error messages. No account login or application is submitted.

Supported endpoints: [synchronous scrape](https://docs.brightdata.com/api-reference/scrapers/synchronous-requests), [progress](https://docs.brightdata.com/api-reference/scrapers/management-apis/monitor-progress), [snapshot download](https://docs.brightdata.com/api-reference/scrapers/delivery-apis/download-snapshot).

## Verify after configuration

Run the API and frontend, then paste a specific Indeed URL containing a `jk` or `vjk` ID. The progress message identifies when Bright Data is used. The report must show the selected title, employer, independent scores and source quotes. An unavailable or inaccessible listing must show an error instead of a zero-risk report.

For repeatable real-provider verification with the API running:

```powershell
npm run test:live -- "https://www.indeed.com/viewjob?jk=REAL_JOB_ID"
```

The live script validates the report schema, recomputes totals, independently retrieves the same record to check quotes, and verifies the cache. This verification may consume an additional provider record. Multiple URLs are supported. JSON results are stored under ignored `.qa/`.

Fixture tests (`npm test`) cover routing, record validation, async snapshots, sanitized failures, score independence and caching. Passing fixture tests does not establish that the account or a real Indeed listing works. Live verification requires your configured key and a readable job record.
