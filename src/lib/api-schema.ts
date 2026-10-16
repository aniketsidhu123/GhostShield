import { z } from 'zod'

const httpUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
  })
const score = z.object({
  value: z.number().int().min(0).max(100).nullable(),
  label: z.string().max(120),
  summary: z.string().max(1500),
  confidence: z.enum(['Low', 'Medium', 'High']),
})
export const analysisSchema = z.object({
  id: z.string().max(100),
  mode: z.enum(['demo', 'live']),
  scenario: z.enum(['ghost', 'scam', 'active']),
  requestedUrl: httpUrl.nullable(),
  analyzedUrl: httpUrl.nullable(),
  checkedAt: z.string().datetime({ offset: true }),
  job: z.object({
    title: z.string().max(500),
    employer: z.string().max(500),
    location: z.string().max(500),
    employment: z.string().max(200),
  }),
  ghost: score,
  scam: score,
  signals: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .max(100),
        kind: z.enum(['ghost', 'scam', 'verified']),
        title: z.string().max(300),
        description: z.string().max(2000),
        observedAt: z
          .string()
          .max(50)
          .refine((value) => Number.isFinite(Date.parse(value))),
        source: z.string().max(500),
        sourceUrl: httpUrl.optional(),
        weight: z.number().int().min(0).max(100),
        quote: z.string().max(1200).optional(),
        rule: z.string().max(100).optional(),
      }),
    )
    .max(40),
  recommendation: z.string().max(2000),
  coverage: z.object({ careerPage: z.boolean(), history: z.boolean(), applyFlow: z.boolean() }),
  limitations: z.array(z.string().max(1000)).max(30).optional(),
  sources: z
    .array(z.object({ url: httpUrl, title: z.string().max(500), fetchedAt: z.string().datetime() }))
    .max(10)
    .optional(),
  history: z
    .array(
      z.object({
        observedAt: z.string().datetime(),
        contentHash: z.string().max(100),
        postedDate: z.string().nullable(),
      }),
    )
    .max(90)
    .optional(),
  cached: z.boolean().optional(),
  scoringVersion: z.string().optional(),
  providerRunId: z.string().optional(),
  analysisMethod: z.enum(['agent', 'fetch-rules', 'browser-rules', 'bright-data-rules']).optional(),
  resolution: z
    .object({
      platform: z.string().max(100),
      submittedUrl: httpUrl,
      resolvedUrl: httpUrl,
      method: z.enum(['direct', 'exact-id-search', 'cloud-render', 'bright-data']),
      jobId: z.string().max(100).optional(),
    })
    .optional(),
})
export const liveAnalysisSchema = analysisSchema.refine(
  (report) => report.mode === 'live' && !!report.analyzedUrl && !!report.requestedUrl,
  'Expected a live report',
)
export const jobStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  stage: z.string().max(500),
  report: liveAnalysisSchema.optional(),
  error: z
    .object({ code: z.string(), message: z.string(), retryAt: z.string().datetime().optional() })
    .optional(),
})

export type AnalysisTask = z.infer<typeof jobStatusSchema>
