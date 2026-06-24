/**
 * The life-intake — Jalayu's front door.
 *
 * Five categories that cover a whole human life. Each asks a short, scenario-
 * based question ("what actually happened lately?"), and every answer quietly
 * maps to the modules it should switch on. The output is the seed for a user's
 * assembled Jalayu — a starting point, not a verdict: it stays transparent
 * (we can always show WHY a module was turned on) and fully resettable.
 *
 * Questions are behavioural on purpose — "think about last week" beats "rate
 * yourself 1-10," which everyone fudges. Pure data + a pure mapping function;
 * safe to import anywhere.
 */
import type { SidebarView } from '@/lib/types'
import type { LifeCategory } from '@/lib/modules-registry'
import { alwaysOnModuleIds } from '@/lib/modules-registry'

export interface IntakeOption {
  id: string
  /** The human, real-life answer the user picks. */
  label: string
  /** Modules this answer switches on. */
  enables: SidebarView[]
}

export interface IntakeQuestion {
  id: string
  prompt: string
  /** Can more than one answer be true at once? */
  multi: boolean
  options: IntakeOption[]
}

export interface IntakeCategory {
  id: LifeCategory
  title: string
  questions: IntakeQuestion[]
}

export const LIFE_INTAKE: IntakeCategory[] = [
  {
    id: 'body',
    title: 'Body & Health',
    questions: [{
      id: 'body_state',
      prompt: 'When it comes to your body lately, what rings most true?',
      multi: true,
      options: [
        { id: 'medical',  label: "I'm juggling real medical stuff — meds, appointments, records", enables: ['health'] },
        { id: 'monitor',  label: 'Mostly fine — I just want to keep an eye on sleep, energy, habits', enables: ['wellness'] },
        { id: 'neglect',  label: 'Honestly, I ignore it until something breaks', enables: ['health', 'reminders'] },
        { id: 'skip',     label: "Not where my focus is right now", enables: [] },
      ],
    }],
  },
  {
    id: 'mind',
    title: 'Mind & Feelings',
    questions: [{
      id: 'mind_state',
      prompt: 'Think about your headspace this past week.',
      multi: true,
      options: [
        { id: 'heavy',    label: "It's been heavy — I could use somewhere to vent and track my mood", enables: ['wellness', 'mind'] },
        { id: 'patterns', label: "I'm okay, but I'd like to see my patterns over time", enables: ['progress', 'wellness'] },
        { id: 'cluttered',label: 'My head is just cluttered — too many open loops', enables: ['mind', 'notes'] },
        { id: 'steady',   label: 'Steady — not something I need help with', enables: [] },
      ],
    }],
  },
  {
    id: 'work',
    title: 'Work & Money',
    questions: [{
      id: 'work_state',
      prompt: "What's your relationship with work and money right now?",
      multi: true,
      options: [
        { id: 'markets',  label: 'I actively trade or invest (or want to learn how)', enables: ['trading', 'academy', 'strategylab'] },
        { id: 'building', label: "I'm building something — projects, ideas, a business", enables: ['notes', 'meetings'] },
        { id: 'meetings', label: 'Meetings and follow-ups eat my days', enables: ['meetings'] },
        { id: 'secure',   label: 'I want important accounts and documents kept safe', enables: ['vault'] },
        { id: 'skip',     label: 'Not a focus right now', enables: [] },
      ],
    }],
  },
  {
    id: 'people',
    title: 'People & Love',
    questions: [{
      id: 'people_state',
      prompt: 'When you think about the people in your life…',
      multi: true,
      options: [
        { id: 'losetrack',label: 'I lose track — I forget to check in, I miss birthdays', enables: ['people', 'reminders'] },
        { id: 'intentional', label: 'I want to be more intentional about who matters', enables: ['people'] },
        { id: 'network',  label: 'I have a lot of professional relationships to manage', enables: ['people', 'meetings'] },
        { id: 'good',     label: "I'm good here", enables: [] },
      ],
    }],
  },
  {
    id: 'time',
    title: 'Time & Direction',
    questions: [{
      id: 'time_state',
      prompt: 'Think about last week — the things you meant to do. What happened?',
      multi: false,
      options: [
        { id: 'slipped',  label: 'Most of it slipped — I kept meaning to but didn’t', enables: ['calendar', 'reminders'] },
        { id: 'scattered',label: 'I did them, but felt scattered and reactive all day', enables: ['calendar', 'notes'] },
        { id: 'onplan',   label: 'I had a plan and mostly hit it', enables: ['progress', 'calendar'] },
        { id: 'byfeel',   label: "I don't really plan — I go by feel", enables: ['reminders'] },
      ],
    }],
  },
]

/** Answers shape: question id → the option ids the user chose. */
export type IntakeAnswers = Record<string, string[]>

/**
 * Maps a completed intake to the set of modules to switch on. Always includes
 * the always-on system modules so a user who skips everything still has a
 * working home. Deterministic and transparent — the same answers always yield
 * the same Jalayu, and you can trace any module back to the answer that lit it.
 */
export function assembleFromIntake(answers: IntakeAnswers): SidebarView[] {
  const enabled = new Set<SidebarView>(alwaysOnModuleIds())
  for (const category of LIFE_INTAKE) {
    for (const q of category.questions) {
      const chosen = answers[q.id] ?? []
      for (const opt of q.options) {
        if (chosen.includes(opt.id)) opt.enables.forEach((m) => enabled.add(m))
      }
    }
  }
  return [...enabled]
}

/** For the "why is this on?" transparency view: which answers lit a module. */
export function reasonsForModule(moduleId: SidebarView, answers: IntakeAnswers): string[] {
  const reasons: string[] = []
  for (const category of LIFE_INTAKE) {
    for (const q of category.questions) {
      const chosen = answers[q.id] ?? []
      for (const opt of q.options) {
        if (chosen.includes(opt.id) && opt.enables.includes(moduleId)) reasons.push(opt.label)
      }
    }
  }
  return reasons
}
