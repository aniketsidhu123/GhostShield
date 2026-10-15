import type { JobAnalysis, Scenario } from '../types/analysis'

const base = {
  mode: 'demo' as const,
  requestedUrl: null,
  analyzedUrl: null,
  checkedAt: '2026-10-14T10:30:00+05:30',
  coverage: { careerPage: true, history: true, applyFlow: false },
}

// All employers, events, and scores below are fictional fixtures, not findings.
export const mockAnalyses: Record<Scenario, JobAnalysis> = {
  ghost: {
    ...base,
    id: 'demo-ghost-001',
    scenario: 'ghost',
    job: {
      title: 'Product Designer',
      employer: 'Northstar Labs',
      location: 'Bengaluru, India',
      employment: 'Full-time',
    },
    ghost: {
      value: 78,
      label: 'Strong ghost signals',
      summary: 'The listing is visible. Hiring intent is less clear.',
      confidence: 'Medium',
    },
    scam: {
      value: 12,
      label: 'Few scam signals',
      summary: 'No payment requests in the sampled listing.',
      confidence: 'Low',
    },
    signals: [
      {
        id: 'g1',
        kind: 'ghost',
        title: 'The same role. A new date.',
        description: 'An unchanged description appeared in three sample snapshots over 68 days.',
        observedAt: '2026-10-14',
        source: 'Posting history · 3 sample snapshots',
        weight: 28,
      },
      {
        id: 'g2',
        kind: 'ghost',
        title: 'Missing from the careers page',
        description:
          'No matching role appears in the fictional employer’s latest career-page snapshot. A missing match alone is not proof.',
        observedAt: '2026-10-12',
        source: 'Employer careers page · sample',
        weight: 32,
      },
      {
        id: 'g3',
        kind: 'ghost',
        title: 'Applications open for 68 days',
        description: 'The sample listing has remained open longer than its stated hiring window.',
        observedAt: '2026-10-10',
        source: 'First seen 08 Aug · sample',
        weight: 18,
      },
      {
        id: 'g4',
        kind: 'scam',
        title: 'Recruiter identity unconfirmed',
        description:
          'The sample listing provides no named recruiter. This is a weak signal, not evidence of fraud.',
        observedAt: '2026-10-10',
        source: 'Listing contact details · sample',
        weight: 12,
      },
      {
        id: 'g5',
        kind: 'verified',
        title: 'No fee mentioned in the listing',
        description:
          'The sample text has no payment request. The full application flow has not been inspected.',
        observedAt: '2026-10-10',
        source: 'Listing text only · limited coverage',
        weight: 0,
      },
    ],
    recommendation:
      'Check that the role is still open on the employer’s own careers page before investing time in an application.',
  },
  scam: {
    ...base,
    id: 'demo-scam-001',
    scenario: 'scam',
    job: {
      title: 'Remote Operations Associate',
      employer: 'Orbit Works (fictional)',
      location: 'Remote, India',
      employment: 'Contract',
    },
    ghost: {
      value: 20,
      label: 'Limited ghost signals',
      summary: 'There is too little history to establish hiring intent.',
      confidence: 'Low',
    },
    scam: {
      value: 88,
      label: 'Strong scam signals',
      summary: 'Payment and identity signals deserve a closer look.',
      confidence: 'High',
    },
    signals: [
      {
        id: 's1',
        kind: 'scam',
        title: 'A fee before an interview',
        description:
          'The fictional listing asks for a ₹2,500 “refundable registration fee” before scheduling an interview.',
        observedAt: '2026-10-14',
        source: 'Listing text · sample',
        weight: 40,
      },
      {
        id: 's2',
        kind: 'scam',
        title: 'Recruiter domain does not match',
        description:
          'The sample contact domain differs from the employer domain. Ownership has not been verified.',
        observedAt: '2026-10-14',
        source: 'Contact domain comparison · sample',
        weight: 28,
      },
      {
        id: 's3',
        kind: 'scam',
        title: 'WhatsApp is the only contact',
        description:
          'The fictional listing has no employer email or careers-page application path.',
        observedAt: '2026-10-14',
        source: 'Contact details · sample',
        weight: 20,
      },
      {
        id: 's4',
        kind: 'ghost',
        title: 'No matching employer listing',
        description:
          'No corresponding role appears in the sample careers-page snapshot. Available history is limited.',
        observedAt: '2026-10-14',
        source: 'Employer careers page · sample',
        weight: 20,
      },
    ],
    recommendation:
      'Pause before sharing personal information or paying a fee. Verify the recruiter through the employer’s official contact details.',
  },
  active: {
    ...base,
    id: 'demo-active-001',
    scenario: 'active',
    job: {
      title: 'Frontend Engineer',
      employer: 'Fern Studio (fictional)',
      location: 'Pune, India',
      employment: 'Full-time',
    },
    ghost: {
      value: 8,
      label: 'Few ghost signals',
      summary: 'Recent, consistent activity across the sampled sources.',
      confidence: 'Medium',
    },
    scam: {
      value: 4,
      label: 'Few scam signals',
      summary: 'Employer contact details match in this sample.',
      confidence: 'Medium',
    },
    signals: [
      {
        id: 'a1',
        kind: 'verified',
        title: 'Found on the employer’s website',
        description:
          'The sample role matches the title, location, and description on the fictional employer careers page.',
        observedAt: '2026-10-14',
        source: 'Employer careers page · sample',
        weight: 0,
      },
      {
        id: 'a2',
        kind: 'verified',
        title: 'A recent, consistent posting',
        description:
          'The fictional role was first seen 4 days ago, with matching dates across two sources.',
        observedAt: '2026-10-13',
        source: 'Cross-source comparison · sample',
        weight: 0,
      },
      {
        id: 'a3',
        kind: 'verified',
        title: 'Employer contact details match',
        description: 'The sample recruiter uses the same domain as the fictional employer.',
        observedAt: '2026-10-13',
        source: 'Recruiter domain · sample',
        weight: 0,
      },
      {
        id: 'a4',
        kind: 'ghost',
        title: 'Hiring intent remains unconfirmed',
        description:
          'Consistent posting data does not confirm an employer’s internal hiring decision.',
        observedAt: '2026-10-14',
        source: 'Coverage limitation · sample',
        weight: 8,
      },
      {
        id: 'a5',
        kind: 'scam',
        title: 'Application flow not inspected',
        description:
          'A small uncertainty score remains because the complete apply flow has not been checked.',
        observedAt: '2026-10-14',
        source: 'Coverage limitation · sample',
        weight: 4,
      },
    ],
    recommendation:
      'The sample signals are encouraging. Use the employer’s official application page and review requests for personal information carefully.',
  },
}
