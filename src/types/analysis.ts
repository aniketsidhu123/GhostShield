export type SignalKind = 'ghost' | 'scam' | 'verified'
export type Scenario = 'ghost' | 'scam' | 'active'

export interface Signal {
  id: string
  kind: SignalKind
  title: string
  description: string
  observedAt: string
  source: string
  sourceUrl?: string
  weight: number
  quote?: string
  rule?: string
}

export interface RiskScore {
  value: number | null
  label: string
  summary: string
  confidence: 'Low' | 'Medium' | 'High'
}

export interface JobAnalysis {
  id: string
  mode: 'demo' | 'live'
  scenario: Scenario
  requestedUrl: string | null
  analyzedUrl: string | null
  checkedAt: string
  job: { title: string; employer: string; location: string; employment: string }
  ghost: RiskScore
  scam: RiskScore
  signals: Signal[]
  recommendation: string
  coverage: { careerPage: boolean; history: boolean; applyFlow: boolean }
  limitations?: string[]
  sources?: { url: string; title: string; fetchedAt: string }[]
  history?: { observedAt: string; contentHash: string; postedDate: string | null }[]
  cached?: boolean
  scoringVersion?: string
  providerRunId?: string
}

export interface JobAnalysisProps {
  analysis: JobAnalysis
}

export interface SavedListing {
  id: string
  scenario: Scenario
  title: string
  employer: string
  savedAt: string
  mode: 'demo' | 'live'
  report?: JobAnalysis
}
