/**
 * Academy curriculum — static, authored content (not LLM-generated).
 *
 * Each chapter pairs a real trader/strategy with one of the exact setup tags
 * the trading engine actually uses (see trading-signals.ts). The scenario
 * check at the end of every chapter keys its correct answer off the engine's
 * real guard conditions, not a textbook generality, so the explanation always
 * traces back to code that's actually running.
 */

export interface ScenarioOption {
  id: string
  label: string
  correct: boolean
}

export interface ScenarioCheck {
  prompt: string
  options: ScenarioOption[]
  explanation: string
}

export interface CurriculumChapter {
  id: string
  order: number
  trader: string
  title: string
  coreIdea: string
  visualDescription: string
  body: string[]
  mappedSetupTags: string[]
  scenarioCheck: ScenarioCheck
}

export const ACADEMY_CURRICULUM: CurriculumChapter[] = [
  {
    id: 'tape-reading-momentum',
    order: 1,
    trader: 'Jesse Livermore',
    title: 'Tape Reading & Momentum',
    coreIdea: 'Trade with the trend, not against it — the money is in the sitting, not the predicting.',
    visualDescription:
      'A stock breaks above a flat ceiling it tested 3-4 times, on a volume bar visibly taller than the 20 bars before it. EMA9 (fast) is already riding above EMA21 (slow) before the breakout — the trend was already forming, the breakout just confirmed it.',
    body: [
      `Livermore's most famous line about his own trading wasn't about picking the right stock — it was "it never was my thinking that made the big money for me, it was always my sitting." He lost fortunes more than once by getting clever: trying to out-think a move instead of riding it. The strategy that actually made him rich was simpler and harder: wait for a clear "pivotal point" — a level where the stock proves it wants to keep going — then get in and stay in while the trend does the work.`,
      `He didn't buy hope. He bought confirmation: price breaking a real level, on real volume, with the trend already pointed the right way. That's the exact discipline MOMENTUM_LONG enforces. The setup requires the asset already up a meaningful amount (≥1.5% in 24h for crypto, ≥2.0% for stocks — not a guess, a confirmed move), backed by a volume spike of at least 1.3-1.5× the recent average (real participation, not a quiet drift), with RSI sitting between 42 and 75 (there's still room to run — above 75 you're chasing, not following) and EMA9 above EMA21 (the trend itself agrees with the move).`,
      `Notice what's deliberately excluded: there's no "is this cheap" check, no prediction about where it stops. Like Livermore, the setup only cares whether the tape is already confirming a move — and once it does, it gets a guaranteed score floor of 5.5, high enough to clear every entry threshold on its own.`,
    ],
    mappedSetupTags: ['MOMENTUM_LONG'],
    scenarioCheck: {
      prompt: 'AAPL is up 6% today on 2.1× average volume. RSI is 58, EMA9 is above EMA21. Textbook entry or red flag?',
      options: [
        { id: 'a', label: 'Textbook MOMENTUM_LONG — volume confirms the move, RSI has room before overbought, trend is aligned', correct: true },
        { id: 'b', label: 'Skip it — RSI 58 is already too overbought to buy', correct: false },
        { id: 'c', label: 'Skip it — a 6% day is too extended, wait for a pullback', correct: false },
        { id: 'd', label: 'Short it — anything up this much in a day is due to reverse', correct: false },
      ],
      explanation: 'This is exactly the MOMENTUM_LONG pattern: the 24h move clears the momentum floor, the volume spike confirms real participation, RSI 58 sits comfortably inside the 42-75 window (room to run, not exhausted), and EMA9 > EMA21 confirms the trend agrees. In this system RSI doesn\'t become disqualifying until it\'s past 75.',
    },
  },
  {
    id: 'mean-reversion-oversold',
    order: 2,
    trader: 'Linda Raschke',
    title: 'Mean Reversion & Oversold Bounces',
    coreIdea: 'Fear gets overdone — but only buy the fear when several independent signals agree it\'s overdone, not because "it went down so it must bounce."',
    visualDescription:
      'A sharp red drop pulls price well under its volume-weighted average for the day. An oscillator pinned near its floor starts to curl — not yet turning up, but no longer making new lows alongside price. The drop has outpaced the indicators, which is the tell.',
    body: [
      `Raschke built her career on short-term setups (documented with Laurence Connors in "Street Smarts") that catch the snap-back after a market overreacts — but she was insistent that oversold-by-itself is not a trade. The edge only exists when the stretch is real and multiple things confirm it together. Fading strength is usually a losing game; buying confirmed, statistically extreme fear is a different game entirely.`,
      `OVERSOLD_BOUNCE requires three independent confirmations to all line up before it fires: RSI below 35 (the oscillator itself is stretched), price more than 1.0% below VWAP (not just down — meaningfully below the day's real volume-weighted fair value), and a 24-hour change worse than -5% (an actual drawdown, not noise). Any one of these alone happens constantly and means nothing. All three together is rare enough to be a real signal.`,
      `Because catching a falling asset is inherently riskier than riding a rising one, this setup also carries a wider stop-to-target ratio than most (a 4:1 R:R, TP 2.0% / SL 0.5%) — the system is honest that it's taking on more risk per attempt, and prices it accordingly.`,
    ],
    mappedSetupTags: ['OVERSOLD_BOUNCE'],
    scenarioCheck: {
      prompt: 'XYZ is down 6.5% today, RSI is 31, and price is 1.4% below VWAP. Bounce candidate?',
      options: [
        { id: 'a', label: 'Yes — RSI<35, more than 1% below VWAP, and a real (>5%) drawdown all line up independently', correct: true },
        { id: 'b', label: 'No — a 6.5% drop in one day means the news is bad, stay away regardless of indicators', correct: false },
        { id: 'c', label: 'Yes, but only if volume is also spiking', correct: false },
        { id: 'd', label: 'No — RSI needs to be below 20, not 31, to count as oversold', correct: false },
      ],
      explanation: 'OVERSOLD_BOUNCE needs RSI<35 AND VWAP deviation worse than -1.0% AND 24h change worse than -5% together — no single condition is sufficient alone, but here all three independently confirm the same thing: a real, statistically stretched dip rather than a soft red day.',
    },
  },
  {
    id: 'vwap-institutional-flow',
    order: 3,
    trader: 'Institutional execution theory',
    title: 'VWAP — Where the Big Money Is Measured',
    coreIdea: 'VWAP isn\'t a personal strategy — it\'s the actual benchmark trading desks are graded against, which is exactly why it behaves like real support and resistance.',
    visualDescription:
      'A rising volume-weighted line cuts through the middle of the candles. Price dips just under it, hovers, then lifts back above — like a magnet that occasionally lets go but always pulls back. On the way down, the same line repels price from above instead.',
    body: [
      `Institutional execution desks are measured on whether their fills beat the volume-weighted average price for the day — it's a literal performance metric. Because of that, large buy and sell programs cluster their activity around VWAP: buying below it looks like "getting value," selling above it looks like "getting a premium." That clustering is what turns VWAP from a lagging average into a level that actually holds.`,
      `VWAP_LONG fires in two distinct modes. Mode A is a dip-buy: price sits more than 0.1% below VWAP while still trading above EMA50 — a pullback inside an intact uptrend, not a falling knife. Mode B is a support-test: price sits within 0.15% of VWAP itself, RSI is in the 42-60 band, and EMA9 is just clearing EMA21 — buying the level holding, not a dip below it. Both modes require volume spike between 0.7× and 6× — too quiet means nobody is actually defending the level, too wild means panic rather than orderly accumulation.`,
      `VWAP_SHORT is the mirror image: price extended more than 1.5% above VWAP (paying a real premium), RSI 68-80, EMA9 already below EMA21 (momentum already turning), and the regime not already HIGH_VOL — fading an extension during high volatility is a good way to get run over, since extended momentum can keep extending in chop.`,
    ],
    mappedSetupTags: ['VWAP_LONG', 'VWAP_SHORT'],
    scenarioCheck: {
      prompt: 'Price is 0.05% below VWAP, RSI is 50, EMA9 is 1.002× EMA21, volume is 1.1×. Mode A, Mode B, or neither?',
      options: [
        { id: 'a', label: 'Mode B — price is essentially at VWAP (within 0.15%), RSI 50 sits in the 42-60 band, EMA9 clears the 1.001× minimum over EMA21', correct: true },
        { id: 'b', label: 'Mode A — it\'s a dip below VWAP', correct: false },
        { id: 'c', label: 'Neither — the EMA9/EMA21 gap is too small to count as a trend', correct: false },
        { id: 'd', label: 'Both modes fire at once', correct: false },
      ],
      explanation: 'Mode A needs price meaningfully below VWAP (worse than -0.1%) AND above EMA50 — a real dip in an uptrend. Here price is only 0.05% below VWAP, too close to call a "dip" — that\'s exactly Mode B\'s support-test signature instead.',
    },
  },
  {
    id: 'macd-momentum-confirmation',
    order: 4,
    trader: 'Gerald Appel',
    title: 'MACD as Confirmation, Never Alone',
    coreIdea: 'Appel invented MACD explicitly as a momentum-confirmation tool — never a standalone trigger.',
    visualDescription:
      'Two lines converge, cross, and pull apart below a histogram of bars growing taller above the zero line — each new bar slightly higher than the last, showing acceleration, not just direction.',
    body: [
      `Gerald Appel built MACD (Moving Average Convergence Divergence) in the late 1970s, and his own writing on it was consistent: use it alongside trend and volume, never read it in isolation. A crossing line means little on its own — what matters is whether the move is actually accelerating and whether the broader trend agrees.`,
      `MACD_CROSS_LONG enforces that "never alone" principle literally in code. It requires the histogram to be both positive AND growing versus the prior bar (real acceleration, not a single tick), the MACD line itself above zero (the faster average has already overtaken the slower one, not just brushed it), RSI between 40 and 70 (room to run), EMA9 effectively above EMA21 (trend agrees), 24-hour change better than -8% (not catching a falling knife), and at least some volume participation. Five independent checks have to agree before MACD gets credited with anything.`,
      `That stack is why MACD_CROSS_LONG carries one of the best risk/reward ratios in the system (4.5:1 — TP 1.8% against a 0.4% stop): when this many confirmations line up at once, the setup has more to lean on than the indicator's name suggests.`,
    ],
    mappedSetupTags: ['MACD_CROSS_LONG'],
    scenarioCheck: {
      prompt: 'MACD line just crossed above zero. The histogram is positive but smaller than the prior bar. RSI is 55, EMA9>EMA21. Buy the cross?',
      options: [
        { id: 'a', label: 'No — bullish MACD requires the histogram to be growing, not just positive; a shrinking histogram means momentum is already fading even with the line above zero', correct: true },
        { id: 'b', label: 'Yes — MACD is above zero, that\'s the signal', correct: false },
        { id: 'c', label: 'Yes, but only because RSI is exactly 55', correct: false },
        { id: 'd', label: 'No — MACD needs to be below zero to buy', correct: false },
      ],
      explanation: 'The bullish flag requires histogram > 0 AND histogram > the previous bar\'s histogram — a positive-but-shrinking histogram fails the second half. This is Appel\'s "never alone" rule enforced in code: the line crossing zero isn\'t enough without confirmed acceleration behind it.',
    },
  },
  {
    id: 'bollinger-bands-dynamic-support',
    order: 5,
    trader: 'John Bollinger',
    title: 'Bollinger Bands — Tags Are Not Signals',
    coreIdea: 'Touching a band means "statistically stretched," not "automatically buy" — Bollinger always paired a band tag with a second, independent confirmation.',
    visualDescription:
      'Price threads down to lightly touch a lower curved band that\'s been hugging the candles all session. It doesn\'t pierce far through — it kisses the band and the very next candle has a smaller body and a longer lower wick, the first hint of buyers stepping in.',
    body: [
      `John Bollinger has repeated for decades that a band touch by itself is not a trading signal — it just means price is statistically far from its recent average. He always insisted on pairing a band tag with an independent second indicator (he built %B and BandWidth specifically to be used alongside oscillators like RSI for this reason) before treating it as anything actionable.`,
      `BB_LOWER_BOUNCE follows that rule exactly: price must be within 0.8% of the lower band (the "tag") AND RSI between 15 and 38 (Bollinger's required second, independent confirmation) AND 24-hour change better than -20% (a band touch during an actual crash isn't a bounce signal, it's a falling knife) AND some real volume (≥0.5×, someone is still trading it) AND EMA9 not deeply below EMA21 (not already in a confirmed strong downtrend).`,
      `Because this setup demands the most confirmations stacked together of any long setup in the system, it also carries the highest conviction floor of all of them — a guaranteed score of 6.0, the strongest the engine ever assigns to a single entry condition.`,
    ],
    mappedSetupTags: ['BB_LOWER_BOUNCE'],
    scenarioCheck: {
      prompt: 'RSI is 22, price is 0.5% below the lower Bollinger Band — but the stock is down 28% this week on no real volume. Bounce or knife-catch?',
      options: [
        { id: 'a', label: 'Knife-catch — a 24h/weekly change worse than -20% explicitly disqualifies this setup no matter how oversold RSI looks', correct: true },
        { id: 'b', label: 'Bounce — RSI 22 and a band tag is the textbook signal', correct: false },
        { id: 'c', label: 'Bounce, but size it smaller', correct: false },
        { id: 'd', label: 'Can\'t tell without checking MACD', correct: false },
      ],
      explanation: 'This is the system\'s exact guard: BB_LOWER_BOUNCE requires change24h better than -20%. A stock down 28% with a band tag isn\'t "stretched" — it\'s in freefall. Bollinger\'s own warning that a band touch alone is never a signal applies doubly here.',
    },
  },
  {
    id: 'breakout-confirmation',
    order: 6,
    trader: 'Nicolas Darvas & William O\'Neil',
    title: 'Breakout Confirmation & The Box',
    coreIdea: 'Buy the confirmed breakout with volume, not the prediction of one — and risk small on every attempt.',
    visualDescription:
      'A stock chops sideways inside a tight horizontal channel for days — a "box." Then one candle closes clean above the top of the box with a volume bar that dwarfs everything inside the box. That\'s the only candle that matters.',
    body: [
      `Nicolas Darvas's "box theory" came from a dancer touring the world who traded by telegram and could only check prices once a day: stocks consolidate into a tight box, and the only trade worth taking is the volume-confirmed break OUT of that box — never a guess that one is coming. William O'Neil's CANSLIM later formalized the same instinct with more structure: buy fundamentally strong stocks breaking out of a proper base on above-average volume, and protect every position with a hard stop (O'Neil's own rule: never let a single loss exceed 7-8%).`,
      `The same MOMENTUM_LONG setup from Chapter 1 fires here in a different role — not as the first confirmation of a new trend, but as a continuation signal mid-move. The volume-spike requirement (1.3-1.5× average) is the system's version of Darvas's "breakout volume," and the EMA9>EMA21 condition is the system's version of "still inside the box's upward structure."`,
      `O'Neil's strict-stop discipline shows up directly in the risk numbers: MOMENTUM_LONG risks a tight 0.4% stop against a 1.5% target — a defined, small loss on every attempt, in exchange for a real shot at the big continuation move.`,
    ],
    mappedSetupTags: ['MOMENTUM_LONG'],
    scenarioCheck: {
      prompt: 'A stock flat for two weeks suddenly moves 4% on 1.6× average volume. RSI climbs to 62. EMA9 crosses above EMA21 for the first time in days. Darvas/O\'Neil would call this...',
      options: [
        { id: 'a', label: 'A breakout from the base — a volume-confirmed move out of consolidation, exactly what both traders waited for', correct: true },
        { id: 'b', label: 'A trap — any move after two weeks flat is automatically suspect', correct: false },
        { id: 'c', label: 'Too early — wait for 10%+ before acting', correct: false },
        { id: 'd', label: 'Irrelevant — both traders only used fundamentals, never price action', correct: false },
      ],
      explanation: 'This is MOMENTUM_LONG firing in its continuation form: the volume spike confirms genuine breakout participation rather than drift, and the fresh EMA9/EMA21 cross is the structural "box breakout" both traders insisted on seeing before committing capital.',
    },
  },
  {
    id: 'fading-extremes-shorts',
    order: 7,
    trader: 'Fading parabolic extremes',
    title: 'Shorting Blow-Off Tops — Timing the Roll, Not the Top',
    coreIdea: 'Parabolic moves end, but shorting WHILE something is still pumping is how accounts blow up — wait for proof the roll-over has already started.',
    visualDescription:
      'A nearly vertical green candle stack with volume bars climbing each bar. Then, on the very next bars, the fast moving-average line — which had been pulling away above the slow one this whole time — bends over and crosses back beneath it. That cross is the only thing that licenses a short.',
    body: [
      `The instinct to fade a parabolic move is as old as markets — but the entire difficulty is timing. Shorting purely because something feels "too high, too fast" is how accounts get destroyed, because overextended moves can keep extending far longer than seems rational. The discipline that actually works is waiting for confirmation that the move has already started rolling over before betting against it.`,
      `PUMP_SHORT requires a 24-hour move over 15%, RSI at least 72, and a volume spike of at least 2× — a confirmed pump. But the deciding condition is EMA9 below EMA21. The engine's own internal notes describe exactly the failure mode this guards against: "RSI 70+ but EMA9 still above EMA21 = still pumping." Without that EMA cross already having happened, a short here is fighting a trend that's still intact, not catching one that's turned.`,
      `SUPERNOVA_SHORT is the more extreme cousin — 24h change over 25%, volume spike at least 5×, RSI at least 80 — reserved for genuinely vertical, near-parabolic moves. This chapter doubles as the most important warning in the whole curriculum: the EMA9<EMA21 requirement is the line between a disciplined fade and simply fighting the tape, which is the fastest way to lose a trading account.`,
    ],
    mappedSetupTags: ['PUMP_SHORT', 'SUPERNOVA_SHORT'],
    scenarioCheck: {
      prompt: 'A stock is up 18% today, RSI is 75, volume is 3× average — but EMA9 is still above EMA21. Short it now?',
      options: [
        { id: 'a', label: 'No — EMA9 is still above EMA21, meaning short-term momentum hasn\'t rolled over yet; PUMP_SHORT specifically requires EMA9<EMA21 to avoid this trap', correct: true },
        { id: 'b', label: 'Yes — RSI 75 and 18% in a day is the definition of overextended', correct: false },
        { id: 'c', label: 'Yes, but wait for volume to hit 5× first', correct: false },
        { id: 'd', label: 'Short half, just in case', correct: false },
      ],
      explanation: 'This is the exact failure mode the setup is built to avoid — RSI 70+ with EMA9 still above EMA21 means the move is still intact. Shorting here is fighting an uptrend. PUMP_SHORT explicitly waits for EMA9<EMA21 — proof the move has already started rolling over — before authorizing a short.',
    },
  },
  {
    id: 'risk-management-never-give-back',
    order: 8,
    trader: 'Paul Tudor Jones & Mark Minervini',
    title: 'Risk Management — Defense Before Offense',
    coreIdea: '"Play great defense, not great offense" — small, defined losses let a handful of big winners do all the compounding.',
    visualDescription:
      'A price line climbs in a stair-step. Below it, a stop-loss line starts flat under the entry, then jumps up once to just above entry (the break-even lock), then begins climbing in lockstep just half a step behind the price peak (the trailing stop) — always rising, never falling back.',
    body: [
      `Paul Tudor Jones's most repeated rule is blunt: "play great defense, not great offense" — protecting capital comes before trying to grow it. Mark Minervini built an entire methodology (documented in his "Stock Market Wizard" books) around the same instinct with hard numbers: cut losers small and fast — often at -3% to -5%, never letting one trade exceed about -10% — so that a handful of large winners can do the compounding work.`,
      `This isn't a single setup tag — it's the system that sits underneath every setup in this curriculum. Once a trade clears +0.6% profit, the stop ratchets up to entry+0.1% (the break-even lock): from that point on, the trade mathematically cannot produce a real loss, only a fee-sized one at worst. Once a trade clears +1.2% profit, a trailing stop takes over, trailing 0.5% behind the price peak — it only ever moves in your favor, never backward, so winners are allowed to run while most of the gain stays locked in.`,
      `This is also the actual math behind why the system doesn't need a high win rate to be profitable. MACD_CROSS_LONG, for example, risks 0.4% to make 1.8% — a 4.5:1 reward-to-risk ratio. At that ratio, a strategy that's only right 30% of the time is still profitable overall. That's the real punchline of "defense first": you don't need to be right often, you need to lose small every time you're wrong.`,
    ],
    mappedSetupTags: [],
    scenarioCheck: {
      prompt: 'A trade is up 0.8% right now. Has it already crossed into "cannot really lose money anymore" territory?',
      options: [
        { id: 'a', label: 'Yes — the break-even stop fires at +0.6%, so by +0.8% the stop has already moved to entry+0.1%; worst case from here is a fee-sized loss', correct: true },
        { id: 'b', label: 'No — break-even protection doesn\'t kick in until take-profit is hit', correct: false },
        { id: 'c', label: 'No — only the trailing stop protects profit, and that needs +1.2%', correct: false },
        { id: 'd', label: 'Can\'t tell without knowing the setup tag', correct: false },
      ],
      explanation: 'This is "defense first" encoded directly: once a trade clears +0.6% profit, the stop ratchets to entry+0.1%, locking out any real loss. The trailing stop (kicking in at +1.2%) is a second, later layer on top of this protection — not a replacement for it.',
    },
  },
]

export function getChapter(id: string): CurriculumChapter | undefined {
  return ACADEMY_CURRICULUM.find((c) => c.id === id)
}
