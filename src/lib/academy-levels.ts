/**
 * Experience-level curriculum branching — kept separate from academy-curriculum.ts
 * so the authored content and its canonical `order` field never change. This is a
 * render-time resequencing only, keyed by chapter `id` (stable) rather than `order`,
 * so it survives any future re-numbering of ACADEMY_CURRICULUM.
 *
 * academy_chapter_progress is keyed by chapter_id, never by order or level — a
 * chapter completed under one level's sequence stays completed if the user's
 * stated level later changes. Nothing to migrate, nothing to reconcile.
 */

export type ExperienceLevel = 'new' | 'basics' | 'experienced'

export interface LevelOption {
  id: ExperienceLevel
  label: string
  blurb: string
}

export const EXPERIENCE_LEVELS: LevelOption[] = [
  { id: 'new', label: 'Brand new to trading', blurb: "I've never placed a trade before." },
  { id: 'basics', label: 'Know the basics, want real skill', blurb: 'I understand what a stock is, ready to learn the actual edge.' },
  { id: 'experienced', label: 'Already trade elsewhere, sharpen my edge', blurb: 'I trade already — show me what\'s different here.' },
]

/** Chapter ids in the order to present them, per level. */
export const LEVEL_CHAPTER_SEQUENCE: Record<ExperienceLevel, string[]> = {
  // Defense before offense — a beginner needs the "why small losses are fine" lesson
  // before any setup, and shorting (the highest-risk concept) waits until last.
  new: [
    'risk-management-never-give-back',
    'tape-reading-momentum',
    'mean-reversion-oversold',
    'vwap-institutional-flow',
    'macd-momentum-confirmation',
    'bollinger-bands-dynamic-support',
    'breakout-confirmation',
    'fading-extremes-shorts',
  ],
  // Natural difficulty progression through the setups; risk-management reinforced at
  // the end once they've seen the setups it actually protects.
  basics: [
    'tape-reading-momentum',
    'vwap-institutional-flow',
    'mean-reversion-oversold',
    'macd-momentum-confirmation',
    'breakout-confirmation',
    'bollinger-bands-dynamic-support',
    'fading-extremes-shorts',
    'risk-management-never-give-back',
  ],
  // Most nuanced/advanced concepts first — respects existing skill instead of
  // re-teaching the basics before getting to what's actually different here.
  experienced: [
    'fading-extremes-shorts',
    'risk-management-never-give-back',
    'macd-momentum-confirmation',
    'bollinger-bands-dynamic-support',
    'tape-reading-momentum',
    'vwap-institutional-flow',
    'mean-reversion-oversold',
    'breakout-confirmation',
  ],
}
