import type { JobAnalysis } from '../types/analysis'
export const emptyAnalysis: JobAnalysis = {
  id: 'unscanned',
  mode: 'live',
  scenario: 'active',
  requestedUrl: null,
  analyzedUrl: null,
  checkedAt: new Date().toISOString(),
  job: { title: 'Inspect a job listing', employer: '', location: '', employment: '' },
  ghost: {
    value: null,
    label: 'Not checked',
    summary: 'Paste a job link to inspect the evidence.',
    confidence: 'Low',
  },
  scam: {
    value: null,
    label: 'Not checked',
    summary: 'No live check has been performed yet.',
    confidence: 'Low',
  },
  signals: [],
  recommendation: 'Paste a public role URL to start a live check.',
  coverage: { careerPage: false, history: false, applyFlow: false },
}
