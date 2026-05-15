/**
 * Language detection for Jalayu
 *
 * Uses Unicode block heuristics + high-frequency function words
 * to identify the language from recent user messages.
 * Returns a BCP-47 language tag (e.g. 'en', 'es', 'hi', 'ar').
 *
 * No external library needed — the heuristic is accurate enough for
 * routing AI responses to the correct language.
 */

type LangTag =
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it'
  | 'hi' | 'ar' | 'zh' | 'ja' | 'ko' | 'ru'
  | 'tr' | 'pl' | 'nl' | 'id' | 'vi' | 'th'

interface LangRule {
  tag: LangTag
  /** Regex tested against the full text */
  script?: RegExp
  /** High-frequency function words to look for (min 2 hits = detect) */
  words?: string[]
}

const RULES: LangRule[] = [
  // Script-based (unambiguous)
  { tag: 'ar', script: /[؀-ۿ]/ },
  { tag: 'hi', script: /[ऀ-ॿ]/ },
  { tag: 'zh', script: /[一-鿿]/ },
  { tag: 'ja', script: /[぀-ヿ]/ },
  { tag: 'ko', script: /[가-힯]/ },
  { tag: 'ru', script: /[Ѐ-ӿ]/ },
  { tag: 'th', script: /[฀-๿]/ },
  { tag: 'vi', script: /[Ạ-ỹ]/ },

  // Latin-script languages — function word frequency
  { tag: 'es', words: ['de', 'la', 'el', 'en', 'es', 'que', 'y', 'no', 'se', 'lo', 'un', 'una', 'con', 'por', 'para'] },
  { tag: 'fr', words: ['de', 'la', 'le', 'les', 'est', 'en', 'que', 'et', 'un', 'une', 'je', 'tu', 'il', 'nous', 'pas'] },
  { tag: 'pt', words: ['de', 'da', 'do', 'que', 'em', 'uma', 'um', 'os', 'as', 'para', 'não', 'mais', 'por', 'isso'] },
  { tag: 'de', words: ['die', 'der', 'das', 'ist', 'und', 'in', 'ein', 'eine', 'ich', 'nicht', 'zu', 'mit', 'auf', 'für'] },
  { tag: 'it', words: ['di', 'la', 'il', 'è', 'che', 'in', 'un', 'una', 'non', 'per', 'con', 'ho', 'hai', 'sono'] },
  { tag: 'nl', words: ['de', 'het', 'een', 'is', 'en', 'van', 'in', 'dat', 'te', 'voor', 'op', 'niet', 'zijn'] },
  { tag: 'pl', words: ['i', 'w', 'z', 'nie', 'to', 'na', 'się', 'jest', 'jak', 'co', 'że', 'do', 'po', 'za'] },
  { tag: 'tr', words: ['bir', 've', 'bu', 'için', 'ile', 'da', 'de', 'mi', 'var', 'ben', 'sen', 'ne', 'olan'] },
  { tag: 'id', words: ['yang', 'dan', 'ini', 'itu', 'di', 'dengan', 'tidak', 'untuk', 'ada', 'saya', 'akan', 'sudah'] },
  // English is the fallback
  { tag: 'en', words: ['the', 'a', 'is', 'are', 'was', 'i', 'you', 'and', 'to', 'of', 'in', 'it', 'my', 'me', 'have'] },
]

/**
 * Detect the dominant language from an array of recent messages.
 * @param messages  Last N user messages (newest first is fine — we join them all)
 * @returns BCP-47 tag, defaulting to 'en' when uncertain
 */
export function detectLanguage(messages: string[]): LangTag {
  if (!messages.length) return 'en'

  const text = messages.join(' ')

  // Script check first — unambiguous
  for (const rule of RULES) {
    if (rule.script && rule.script.test(text)) return rule.tag
  }

  // Count function-word hits for Latin-script languages
  const lower = text.toLowerCase()
  const tokens = lower.split(/\s+/)
  const tokenSet = new Set(tokens)

  let bestTag: LangTag = 'en'
  let bestScore = 0

  for (const rule of RULES) {
    if (!rule.words) continue
    const score = rule.words.filter((w) => tokenSet.has(w)).length
    if (score > bestScore) {
      bestScore = score
      bestTag = rule.tag
    }
  }

  // Require at least 2 matching words before overriding English
  return bestScore >= 2 ? bestTag : 'en'
}

/**
 * Returns the language instruction line to inject into AI system prompts.
 * @param lang BCP-47 tag from detectLanguage or profile.preferred_language
 */
export function langInstruction(lang: string | null | undefined): string {
  const tag = (lang || 'en').split('-')[0].toLowerCase()
  if (tag === 'en') return ''
  const names: Record<string, string> = {
    es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    it: 'Italian', hi: 'Hindi', ar: 'Arabic', zh: 'Chinese (Simplified)',
    ja: 'Japanese', ko: 'Korean', ru: 'Russian', tr: 'Turkish',
    pl: 'Polish', nl: 'Dutch', id: 'Indonesian', vi: 'Vietnamese', th: 'Thai',
  }
  const name = names[tag] || tag
  return `LANGUAGE: Respond entirely in ${name}. Match the user's language naturally.`
}
