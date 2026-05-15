/**
 * JALAYU LIFE SCENARIO TAXONOMY
 *
 * The full map of human experience that Jalayu understands and holds space for.
 * Every person is navigating one or more of these at any given moment.
 * The AI uses this to detect where someone is, what they need, and what comes next.
 *
 * Organized into 18 domains × 28–55 scenarios each = 600+ named scenarios.
 * Each scenario includes: what it feels like, what people typically need,
 * common mistakes made, and what tends to happen next (pattern prediction).
 */

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 1: IDENTITY & SELF (the question of who you are)
// ─────────────────────────────────────────────────────────────────────────────
export const IDENTITY_SCENARIOS = [
  // IMMIGRATION & CULTURAL
  'Newly immigrated — finding footing in a completely unfamiliar place',
  'Immigrated as a child — grew up between two cultures, fully belonging to neither',
  'Second-generation immigrant — parents\' world vs the world you actually live in',
  'Cultural shame — the life your family wants vs the life pulling at you',
  'Accent and language identity — feeling less intelligent in second language',
  'Going back to your home country and feeling like a stranger there too',
  'Being the "representative" of your entire culture in every room',
  'Mixed cultural identity — which parts of you are "real" when they contradict',
  'Assimilation guilt — succeeding by becoming less of where you came from',
  'First-generation professional in a family of laborers or working class',

  // GENDER & SEXUALITY
  'Coming out as gay, lesbian, or bisexual — to yourself first, then others',
  'Coming out as trans or nonbinary — navigating body, identity, and others\' reactions',
  'Questioning your gender or sexuality for the first time',
  'Being out in some places, closeted in others — the exhaustion of code-switching',
  'Family rejection after coming out',
  'Religious community rejection after coming out',
  'Dating while navigating identity — who knows, who doesn\'t, when to tell',

  // FAITH & BELIEF
  'Religious faith crisis — the belief system you were raised in no longer holds',
  'Losing faith after tragedy or unanswered prayer',
  'Deconstructing religion you were raised in — grief, relief, and confusion',
  'Converting to a new religion or spiritual path',
  'Finding spirituality after years of rejecting it',
  'Atheism or agnosticism in a religious family',
  'Spirituality without religion — building your own framework from scratch',

  // RACE & BELONGING
  'Navigating racism in predominantly white spaces',
  'Code-switching fatigue — being different people in different rooms',
  'Racial identity in a family that doesn\'t discuss race',
  'Colorism within your own community',
  'Being "not enough" of your race/culture for your own community',
  'Multiracial identity — not fully claimed by any group',

  // SELF-CONCEPT
  'Imposter syndrome — convinced you\'re about to be exposed as a fraud',
  'Chronic people-pleasing — no one knows the real you because you hide it',
  'Perfectionism as self-protection — if I\'m perfect, nothing can hurt me',
  'Discovering who you are after years of being who others needed you to be',
  'Identity built on a role that\'s now gone (parent, spouse, employee)',
  'Rebuilding identity after major failure or public humiliation',
  'Realizing the person you\'ve been is not who you want to be',
  'Self-hatred that looks like ambition from the outside',
  'Seeking validation constantly and never feeling like enough',
  'The gap between who you are privately and who you appear publicly',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 2: CAREER & WORK
// ─────────────────────────────────────────────────────────────────────────────
export const CAREER_SCENARIOS = [
  // EARLY CAREER
  'First real job — exciting and terrifying, no idea what professional life actually is',
  'Job you took just for money — survival mode work that slowly hollows you out',
  'Overqualified and underemployed — you have degrees and experience and you\'re still here',
  'First promotion — suddenly managing people who were your peers',
  'Being the youngest person in the room by 20 years',
  'Being the oldest person in the room by 20 years',
  'First performance review that wasn\'t what you expected',

  // LAYOFFS & JOB LOSS
  'First layoff — the shock that competence doesn\'t protect you',
  'Repeated layoffs — wondering if something is wrong with you',
  'Mass layoff from a company you believed in and gave everything to',
  'Laid off from a big-name company (Google, Samsung, etc.) — identity tied to the brand',
  'Fired for cause — real or perceived — and processing what actually happened',
  'Choosing to quit before being pushed out',
  'Job loss that unravels your whole financial and personal structure',
  'Unemployment as an immigrant — visa tied to employment',

  // BURNOUT & TOXIC ENVIRONMENTS
  'Burnout — you hit the wall and can\'t explain why you can\'t just push through',
  'Toxic boss — managing up while managing your own survival',
  'Workplace that is quietly racist, sexist, or exclusionary',
  'Being gaslit at work — your perception of events undermined repeatedly',
  'Whistleblowing and the cost of it',
  'Quiet quitting — still showing up but you\'ve already left emotionally',
  'Hustle culture burnout — you bought into it and it broke you',
  'Working in a job that contradicts your values',

  // CAREER CHANGE
  'Career change at 30 — feels late but it\'s not',
  'Career change at 40 — the identity crisis of starting over',
  'Career change at 50+ — what the workforce doesn\'t tell you',
  'Leaving a stable job for something that matters — the financial terror of it',
  'Leaving a creative path for stability and carrying the grief of it',
  'Pursuing a second career after retirement',

  // ENTREPRENEURSHIP
  'Starting your first business — the gap between idea and reality',
  'Side hustle that\'s becoming the main thing — the terrifying pivot moment',
  'Business failing — money gone, identity shaken, what now',
  'Business partner conflict — the most painful professional breakup',
  'Scaling a business and it becoming something you no longer recognize',
  'Selling a business and feeling the empty space after',
  'Running a business while no one in your family understands what you do',
  'Entrepreneur who can\'t turn off — the business that consumed your life',

  // PURPOSE IN WORK
  'Career that pays well and means nothing — golden handcuffs',
  'Passion that became a job and lost its meaning',
  'The dream job that turned out to be a nightmare',
  'Doing meaningful work with no financial stability',
  'Finding out what you actually want to do — in your 30s, 40s, or 50s',
  'Being good at something you don\'t love and not knowing how to escape',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 3: FINANCIAL
// ─────────────────────────────────────────────────────────────────────────────
export const FINANCIAL_SCENARIOS = [
  // CRISIS
  'Genuinely broke — not "tight" but actually nothing, counting days to payday',
  'Credit card debt spiral — minimum payments, accumulating interest, shame',
  'Student loan burden — debt that outlasts the degree\'s value',
  'Medical debt — bills from being sick becoming a second illness',
  'Bankruptcy — the nuclear option and what it actually means for your life',
  'Financial abuse in relationship — money controlled as power',
  'Living paycheck to paycheck with a good salary — something is wrong',
  'Secret debt you haven\'t told your partner about',

  // LEARNING & BUILDING
  'Learning basic personal finance for the first time (no one ever taught you)',
  'Building first emergency fund — the psychological difference it makes',
  'First investment — terrified of losing it, terrified of not starting',
  'Trying to buy first home in a market that wasn\'t built for you',
  'Renting indefinitely and making peace with it, or not',
  'Negotiating salary for the first time — the discomfort and the stakes',
  'Asking for a raise — what you deserve vs what you\'ve been told to accept',
  'Building credit from nothing',
  'Repairing credit after damage',

  // WEALTH & COMPLEXITY
  'Sudden wealth — inheritance, windfall, business exit — and not knowing what to do',
  'Generational wealth vs first generation building from nothing',
  'Inheritance conflict in family',
  'Money changing your relationships when you have more than your friends',
  'Money changing your relationships when your friends have more than you',
  'Retirement anxiety — wondering if you\'ll ever be able to stop',
  'Supporting your parents financially — the reversal',
  'Adult children who need financial help — the endless drain',

  // BEHAVIOR & PSYCHOLOGY
  'Overspending as emotional regulation — shopping, eating, gambling, entertainment',
  'Financial anxiety when the numbers are actually fine',
  'Avoidance — not opening bills, not checking accounts, hoping it goes away',
  'The shame of financial failure in a family or culture that values money',
  'First-generation wealth guilt — having more than your parents and not knowing how to feel',
  'Gambling addiction and the financial destruction',
  'Financial decisions made from fear rather than wisdom',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 4: PHYSICAL HEALTH
// ─────────────────────────────────────────────────────────────────────────────
export const PHYSICAL_HEALTH_SCENARIOS = [
  // DIAGNOSIS & ILLNESS
  'First major diagnosis — the moment everything divides into before and after',
  'Chronic illness — managing something that has no end, just management',
  'Cancer diagnosis — your own',
  'Cancer diagnosis — someone close to you',
  'Autoimmune disease — the immune system turned against itself',
  'Chronic pain — invisible, exhausting, and often disbelieved',
  'Rare disease — few resources, little community, hard to explain',
  'Terminal diagnosis — yours or someone you love',
  'Recovery from major surgery',
  'Long COVID and post-viral conditions — feeling sick when tests say you\'re fine',

  // DISABILITY
  'Acquiring a disability — learning a new relationship with your body',
  'Lifelong disability — the world designed around people who aren\'t you',
  'Invisible disability — the exhaustion of looking "fine" when you\'re not',
  'Managing disability in a demanding career',
  'Disability and relationships — what you need, what others can give',

  // BODY & WEIGHT
  'Body image — chronic dissatisfaction with how you look',
  'Eating disorder — restriction, bingeing, purging, orthorexia',
  'Weight gain from illness, medication, stress, or age',
  'Weight loss that others celebrate but you\'re ambivalent about',
  'Body changes from pregnancy, surgery, or aging',

  // ADDICTION (PHYSICAL)
  'Alcohol addiction — recognizing it, often years after it started',
  'Drug addiction — prescription or recreational',
  'Recovery — the daily work of staying well',
  'Relapse — the shame and the restart',
  'Addiction in recovery while rebuilding everything else',

  // REPRODUCTIVE & SEXUAL HEALTH
  'Pregnancy — planned, navigated with hope and fear',
  'Unplanned pregnancy — the full spectrum of decisions',
  'Miscarriage — the grief that often goes unseen',
  'Infertility — the medical and emotional marathon',
  'IVF — the hope, the expense, the toll',
  'Postpartum depression — the story that gets hidden',
  'Sexual health concerns — the shame that keeps people from getting help',
  'STI diagnosis and navigating relationships and disclosure',
  'Menopause — the transition that medicine and culture both underserve',

  // LIFESTYLE & FITNESS
  'Wanting to get healthy but not knowing how to start',
  'Fitness plateau — doing everything "right" and not moving',
  'Injury that takes you out of something you loved',
  'Aging body — the gradual loss of things you took for granted',
  'Caregiver burnout — giving all your health to sustain someone else\'s',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 5: MENTAL HEALTH & PSYCHOLOGY
// ─────────────────────────────────────────────────────────────────────────────
export const MENTAL_HEALTH_SCENARIOS = [
  // DEPRESSION
  'First depressive episode — not knowing what\'s happening to you',
  'Chronic depression — it\'s always been there at some level',
  'High-functioning depression — fine on the outside, disappearing on the inside',
  'Seasonal depression — the annual descent and return',
  'Postpartum depression — after birth, after a loss, after a major change',
  'Treatment-resistant depression — tried things, nothing holds',

  // ANXIETY
  'Generalized anxiety — worry that attaches to everything and nothing',
  'Social anxiety — the terror of being seen and judged',
  'Panic attacks — the body screaming what the mind can\'t articulate',
  'Health anxiety — convinced something is wrong that no test will find',
  'Performance anxiety in work, relationships, sex',
  'OCD — the loop that won\'t stop',

  // TRAUMA
  'PTSD — from war, abuse, accident, medical trauma, or anything that rewired you',
  'Complex PTSD from childhood — not a single event but years of being shaped wrong',
  'Childhood trauma surfacing in adult life — in relationships, in reactions',
  'Trauma from racism, homophobia, or other systemic violence',
  'Medical trauma — what happened in hospitals that no one talks about',
  'Sexual assault and its aftermath',
  'Domestic violence — during and after',

  // PERSONALITY & NEURODIVERGENCE
  'ADHD diagnosis in childhood — the label and what it means',
  'ADHD diagnosis in adulthood — finally understanding why everything was hard',
  'Autism spectrum — diagnosis, self-recognition, navigating the world differently',
  'Bipolar disorder — the cycles and what they cost',
  'Borderline personality — the intensity, the relationships, the work',
  'Being neurodivergent in a neurotypical world without support',

  // CRISIS
  'Suicidal ideation — passive, the wish to not exist',
  'Suicidal ideation — active, with plan or intent',
  'After a suicide attempt — surviving and not knowing what comes next',
  'Supporting someone who is suicidal — the weight of it',
  'Losing someone to suicide — the particular grief',

  // THERAPY & TREATMENT
  'Starting therapy for the first time — not knowing what to expect or say',
  'Bad therapy experiences — being failed by someone who was supposed to help',
  'Starting psychiatric medication — the hope and the fear',
  'Medication not working — the search for what does',
  'Stigma around mental health — especially in families or cultures that deny it',
  'Mental health in the workplace — what to disclose, what to hide',

  // EMOTIONAL PATTERNS
  'Emotional numbness — not sad, not happy, just flat',
  'Rage that you can\'t explain or control',
  'Codependency — you lose yourself in other people\'s needs and crises',
  'Chronic loneliness — surrounded by people and utterly alone',
  'Burnout that looks like laziness to everyone including yourself',
  'Existential dread — what is the point of any of this',
  'Anhedonia — things you loved mean nothing now',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 6: ROMANTIC RELATIONSHIPS
// ─────────────────────────────────────────────────────────────────────────────
export const ROMANTIC_SCENARIOS = [
  // EARLY
  'First love — the intensity and innocence before you know how to protect yourself',
  'First heartbreak — learning that love doesn\'t protect you from loss',
  'Unrequited love — investing in someone who isn\'t investing back',
  'Love that came at the wrong time',

  // FINDING PARTNERSHIP
  'Dating apps — the volume, the fatigue, the hope',
  'Dating after a bad relationship — trust issues you can\'t just decide away',
  'Dating after divorce — starting over when you thought you were done starting',
  'Dating as a single parent — the logistics and the emotional complexity',
  'Dating after 40, after 50 — the market has changed, so have you',
  'Cultural or family opposition to your partner',
  'Long distance relationship — the maintenance and the risk',
  'Online relationship becoming real — navigating the gap between digital and physical',

  // COMMITMENT
  'Moving in together — the romance meeting the logistics',
  'Engagement — the joy and the sudden weight of it',
  'Wedding planning — the event becoming a referendum on your relationship',
  'First year of marriage — nothing is what the movies said',
  'Choosing to not get married — defending a life that others don\'t understand',
  'Choosing to not have children — the decision that others treat as permanent incompleteness',

  // DIFFICULTY
  'Falling out of love — it happened slowly and now you can\'t find your way back',
  'Falling back in love — the work of choosing each other again',
  'Sexual incompatibility — desire that doesn\'t match',
  'Emotional disconnection — living together but not connecting',
  'One partner growing faster than the other',
  'Career ambition fracturing a relationship',

  // TRUST & BETRAYAL
  'Being cheated on — the fracture and what to do with it',
  'Cheating — the choice, the aftermath, what it means about you',
  'Emotional affair — the betrayal that doesn\'t have a clear name',
  'Rebuilding trust after betrayal — possible but never the same',
  'The relationship where you stayed too long',

  // ABUSE & ESCAPE
  'Toxic relationship — you know it\'s bad but leaving is harder than it looks',
  'Emotional abuse — the kind that leaves no marks',
  'Physical abuse — the cycle, the hope, the danger of leaving',
  'Coercive control — your reality slowly shaped by someone else',
  'Leaving an abusive relationship — the logistics and the danger',
  'Staying in something that isn\'t working because of fear, not love',

  // ENDING
  'Divorce you initiated — the grief of ending something you chose',
  'Being left — the particular helplessness of not having chosen this',
  'Divorce with children — the permanence of co-parenting with someone you used to love',
  'Custody battle — your child becoming contested territory',
  'Dating after divorce — who you are now vs who you were',
  'Being widowed — grief mixed with logistical collapse',
  'Widowed young — the particular isolation of losing a partner before anyone expects it',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 7: FAMILY
// ─────────────────────────────────────────────────────────────────────────────
export const FAMILY_SCENARIOS = [
  // PARENTS & ORIGIN FAMILY
  'Parents who expected everything and gave you the tools for nothing',
  'Parents who gave you everything and left you without resilience',
  'Immigrant parents — their sacrifice as pressure, their love as control',
  'Absent parent — the hole that shapes everything without being named',
  'Parent who was there physically but never emotionally present',
  'Abusive parent — the reckoning of naming it',
  'Toxic parent you still love — the impossible contradiction',
  'Estranged parent — cutting off vs maintaining minimal contact',
  'Attempting to reconnect with estranged parent',
  'Parent\'s mental illness — growing up managing their reality',
  'Parent\'s addiction — the chaos and your role in it',
  'Parent\'s death before any resolution — the grief without closure',
  'Death of a parent you had a good relationship with',
  'Death of a parent you had a complicated relationship with',
  'Becoming a caregiver for an aging parent',
  'Parent with dementia — losing them while they\'re still alive',
  'Moving a parent into a care facility — the guilt',
  'Being sandwiched between your children and your aging parents',

  // SIBLINGS
  'Sibling who got more — favoritism and its long shadow',
  'Sibling rivalry that never resolved into adult friendship',
  'Estranged sibling',
  'Sibling with addiction or mental illness — your life shaped by managing theirs',
  'Golden child / scapegoat dynamic in family',
  'Sibling who is more successful — comparison and its weight',
  'Sibling who is less successful — guilt and responsibility',

  // BECOMING A PARENT
  'Deciding to have children — certainty, ambivalence, or pressure',
  'Deciding not to have children — the choice and its defense',
  'Pregnancy loss — miscarriage, stillbirth, the grief with no funeral',
  'Infertility and what it does to your body, your relationship, your identity',
  'IVF — the medical marathon and emotional toll',
  'Unplanned pregnancy — every direction of that decision',
  'Postpartum depression and anxiety',
  'The shock of parenthood — love beyond explanation and exhaustion beyond imagination',
  'Raising a child with special needs',
  'Parenting a teenager — the relationship transforming',
  'Empty nest — who are you when your main role steps back',
  'Adoption — giving a child a home, or being the child given one',
  'Finding biological family after adoption',

  // FAMILY DYNAMICS
  'Blended family — stepparents, stepsiblings, competing loyalties',
  'Being a stepparent — loving someone else\'s child without a script',
  'Chosen family — the people who replaced or supplemented origin family',
  'Family that doesn\'t approve of your life choices — career, partner, values',
  'Being the one who "made it" in a family of struggle — and what that costs',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 8: FRIENDSHIP & SOCIAL CONNECTION
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_SCENARIOS = [
  'Making friends as an adult — harder than anyone tells you it will be',
  'Moving to a new city and starting social life from zero',
  'Growing apart from friends you thought you\'d have forever',
  'Friends choosing sides after your divorce or breakup',
  'One-sided friendship — you give, they take, you finally notice',
  'Toxic friendship — the person who leaves you feeling worse',
  'Ending a friendship — the grief that doesn\'t have a ritual',
  'Making friends when you\'re neurodivergent',
  'Social anxiety that keeps you from showing up',
  'The loneliness of being surrounded by people but not known by any',
  'Finding community — the search for people who actually get you',
  'Losing community (leaving a religion, a group, a neighborhood)',
  'Friend group that doesn\'t know the real you',
  'Having very different politics or values from your friends',
  'Money gaps in friendship — the person who can\'t afford what others can',
  'Success creating distance — they knew you before, and now it\'s different',
  'Online friendships — real but without physical presence',
  'Social media comparison — watching everyone\'s highlight reel',
  'Introversion in a world that rewards extroversion',
  'Being the "strong" friend everyone leans on — and having no one to lean on',
  'The imposter in your own friend group',
  'Mentorship — finding it, being it, the relationship it requires',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 9: GRIEF & LOSS
// ─────────────────────────────────────────────────────────────────────────────
export const GRIEF_SCENARIOS = [
  'Death of a parent — expected',
  'Death of a parent — sudden',
  'Death of a partner',
  'Death of a child — the loss that inverts the natural order',
  'Death of a sibling',
  'Death of a close friend — young, unexpected',
  'Death by suicide — the particular grief, the particular questions',
  'Pregnancy loss — miscarriage, stillbirth',
  'Pet loss — grief that others minimize but is real',
  'Grief while being strong for others who need you',
  'Anticipatory grief — mourning someone who is still alive but leaving',
  'Complicated grief — the relationship was painful and the loss still breaks you',
  'Disenfranchised grief — a loss others don\'t recognize or validate',
  'Grief that never resolved — carried silently for years',
  'Anniversary grief — the yearly return of loss',
  'Loss of a friendship — grief without a funeral',
  'Loss of a relationship — the death of a possible future',
  'Loss of a career or identity — mourning who you were',
  'Loss of a home — the place that held your history',
  'Loss of physical ability — grieving what your body could do',
  'Loss of a dream — the version of life that won\'t happen',
  'Supporting someone dying — the long goodbye',
  'Hospice decisions — when to let go and how',
  'After the death — the logistics and the void',
  'Grief and others expecting you to be over it',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 10: ADDICTION & RECOVERY
// ─────────────────────────────────────────────────────────────────────────────
export const ADDICTION_SCENARIOS = [
  'Recognizing you have a problem — the moment before it changes everything',
  'Trying to quit alone and failing — the shame cycle',
  'Rock bottom — the specific moment or the long slow descent',
  'Seeking help for the first time — the courage and the fear',
  'Detox and the physical reality of addiction',
  'Rehab — what it is and isn\'t, what comes after',
  'AA/NA/support groups — the community and its complexity',
  'Sobriety milestones — and the loneliness sometimes attached',
  'Years sober and still the thoughts',
  'Relapse — the shame, the restart, the question of whether you can do this',
  'Relapse after years — and not letting it become the end',
  'Addiction to alcohol — the legal drug that destroys lives quietly',
  'Addiction to prescription medication — it started as prescribed',
  'Opioid addiction — the epidemic that touches every community',
  'Cocaine, methamphetamine, harder drugs',
  'Cannabis dependence — the one people minimize',
  'Gambling addiction — financial and relational wreckage',
  'Sex and pornography addiction',
  'Food addiction and binge eating',
  'Screen and social media addiction — the new one',
  'Workaholism — the addiction that gets applauded',
  'Codependency — being addicted to fixing others',
  'Being the child of an addict — the family system',
  'Being the partner of an addict — loving someone in destruction',
  'Enabling — what you think is helping',
  'Rebuilding life in recovery — relationships, career, self-trust',
  'Recovery and spirituality — the complicated relationship',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 11: PURPOSE, MEANING & SPIRITUALITY
// ─────────────────────────────────────────────────────────────────────────────
export const PURPOSE_SCENARIOS = [
  'Quarter-life crisis — everything is possible and nothing feels right',
  'Midlife crisis — half your life is gone and you don\'t recognize yours',
  'What am I doing with my life — the recurring question with no answer',
  'Success without meaning — the arrival that felt like nothing',
  'The life you planned falling apart — and finding something better or worse',
  'Dream deferred — the thing you wanted to do that keeps getting pushed back',
  'Choosing passion over stability — and what that actually costs',
  'Choosing stability over passion — and what that costs differently',
  'Wanting to make a difference but not knowing how from where you stand',
  'Existential dread — the universe is vast and your life is small',
  'Climate anxiety — grief for the future of the world',
  'Political despair — watching things go wrong that you can\'t stop',
  'Searching for God — the genuine seeker',
  'Losing God — the genuine mourner',
  'Spirituality without religion — building your own framework',
  'Near-death experience and the priorities that shift after it',
  'Legacy — what you will leave, who will remember you, does it matter',
  'The second half of life — what it means to live toward an end',
  'Radical simplification — letting go of the life others said was success',
  'Following a calling that makes no financial sense',
  'Reconciling faith and science, faith and suffering, faith and doubt',
  'When the meaning you built your life on breaks',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 12: MAJOR LIFE TRANSITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const TRANSITION_SCENARIOS = [
  'Moving to a new country as an adult — starting everything from zero',
  'Moving to a new city — new job, no network, rebuilding from scratch',
  'Moving back home after independence — the complex mix of relief and regression',
  'Starting college — freedom, identity, academic pressure all at once',
  'Dropping out of college — the decision and its long shadow',
  'Graduating with no clear path — the diploma that promised a future that isn\'t there',
  'First apartment — alone, adulting, figuring out basic things no one taught you',
  'Getting married — the life-change hiding inside the celebration',
  'Having your first child — nothing prepares you',
  'Divorce — dismantling a life you built together',
  'Losing a job that defined you',
  'Starting a business — the leap off the cliff',
  'Selling a business — the exit and the identity vacuum',
  'Retirement — the reward that nobody prepares you for psychologically',
  'Going back to school at 30, 40, 50',
  'Career reinvention — not just a new job but a new professional self',
  'Coming out — the before and after',
  'Medical diagnosis that changes your life trajectory',
  'Recovery from addiction — rebuilding everything',
  'Major accident or injury — the before and after your body',
  'Sudden wealth — and all the ways it doesn\'t fix what you thought it would',
  'Sudden loss of wealth — the identity crash with the financial one',
  'Death of a parent — becoming the adult in the family',
  'Becoming a caregiver — your life reorganized around someone else\'s needs',
  'The child leaving home — the house that now echoes',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 13: EDUCATION & LEARNING
// ─────────────────────────────────────────────────────────────────────────────
export const EDUCATION_SCENARIOS = [
  'First in family to go to college — without the map everyone else had',
  'Choosing the wrong major — and the sunk cost fallacy of staying',
  'Dropping out — the shame and sometimes the wisdom',
  'Academic failure — grades, performance, the story it tells about you',
  'Learning disability that was never diagnosed',
  'ADHD in school — called lazy when the brain works differently',
  'Giftedness without support — bored, alienated, underachieving',
  'Elite school, working-class background — the cultural whiplash',
  'Student loans that follow you for decades',
  'Going back to school as an adult — while working, parenting, living',
  'Self-taught in a world that asks for credentials',
  'Degree that didn\'t deliver what it promised',
  'Trade vs college — the false hierarchy and the real consequences',
  'Online education — the access and the isolation',
  'Language barrier in education — learning in your second language',
  'Being a slow learner in a system built for fast ones',
  'The imposter at elite institutions',
  'Mentorship — finding it or not finding it, how much it matters',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 14: RACE, JUSTICE & SOCIETY
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_JUSTICE_SCENARIOS = [
  'Experiencing racism in a workplace that denies it exists',
  'Microaggressions — the accumulated weight of small cuts',
  'Being the only one of your race in a room — the visibility and the burden',
  'Racial trauma from incidents that the world moved on from quickly',
  'Navigating systems (legal, medical, financial) that weren\'t designed for you',
  'Police interaction and the fear that comes from being who you are',
  'Immigration and legal status — the anxiety of the uncertain',
  'Deportation fear — yours or your family\'s',
  'Discrimination in housing, lending, healthcare',
  'Being a first-generation immigrant in a political climate that wants you out',
  'Raising children of color and the conversations you have to have',
  'Social justice activism and the burnout it brings',
  'Ally fatigue — the emotional labor of being the educator',
  'Watching the news while belonging to a group being discussed as a problem',
  'Economic inequality — class in a country that pretends class doesn\'t exist',
  'Generational poverty — breaking cycles that precede you',
  'Homelessness — the acute crisis and the long climb back',
  'Housing instability — not homeless but never secure',
  'Food insecurity — not having enough while living in abundance',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 15: TECHNOLOGY & MODERN LIFE
// ─────────────────────────────────────────────────────────────────────────────
export const MODERN_LIFE_SCENARIOS = [
  'Social media and the constant comparison to curated lives',
  'Doomscrolling — the compulsion to consume distress',
  'Phone addiction — the device that runs your attention',
  'Fear of missing out vs fear of showing up',
  'Online identity vs offline identity — the gap between them',
  'Cancel culture fear — one mistake permanently defining you',
  'Building a following and what that does to your psychology',
  'Losing a following and the identity collapse',
  'Remote work and the blurring of work and home',
  'Remote work isolation — no colleagues, no context, just you and the screen',
  'AI anxiety — what your work, career, future looks like as automation accelerates',
  'Automation displacement — job that existed last year doesn\'t exist now',
  'Dating apps and the commodification of connection',
  'Parasocial relationships — deeply connected to someone who doesn\'t know you exist',
  'Online communities as primary social life',
  'The always-on expectation — never actually off work',
  'Information overload — so much to know and no capacity to process it',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 16: WEALTH, SUCCESS & THEIR SHADOWS
// ─────────────────────────────────────────────────────────────────────────────
export const SUCCESS_SCENARIOS = [
  'First real success — the surprise of it and what to do next',
  'Success that came too fast — unprepared for who it makes you',
  'The emptiness at arrival — you got there and it\'s not what you thought',
  'Success that cost your relationships',
  'Success built on sacrifice that you can\'t unremember',
  'Imposter syndrome with success — waiting to be found out',
  'Wealth that doesn\'t bring peace',
  'Being raised wealthy — and the specific disadvantages of that',
  'Inheriting wealth and the identity question',
  'Being newly wealthy in a family of struggle — the guilt and the distance',
  'Fame — the price of visibility',
  'Fame you didn\'t ask for',
  'Losing status — public failure, fall from height',
  'Success making you unrecognizable to the people who knew you before',
  'The loneliness at the top — very few people can understand your actual problems',
  'Giving it all up — the radical simplification from success back to basics',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 17: FAILURE, REBUILDING & RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────
export const RESILIENCE_SCENARIOS = [
  'Business failure — losing not just money but years of yourself',
  'Marriage failure — the self-questioning and the restart',
  'Academic failure — the door that closed',
  'Public failure — the humiliation that lives on in search results',
  'Private failure — the one you carry alone',
  'Failure after failure — the question of whether you have what it takes',
  'The comeback — slower than you hoped, more earned than you knew',
  'Starting over at 30 — it\'s not too late even though it feels late',
  'Starting over at 40 — the math of time working against you, or not',
  'Starting over at 50 — and what you know now that you didn\'t then',
  'Rebuilding credit, relationships, reputation — all at once',
  'Rebuilding trust in yourself after your own choices broke things',
  'Post-traumatic growth — what came from what broke you',
  'Finding strength you didn\'t know you had',
  'The year everything went wrong — and survived',
  'Forgiving yourself — harder than forgiving others',
  'The version of yourself that would have made different choices — letting them go',
]

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN 18: AGING, TIME & MORTALITY
// ─────────────────────────────────────────────────────────────────────────────
export const AGING_SCENARIOS = [
  'The first time you realized you are not young anymore',
  'Your body changing in ways you can\'t control',
  'Watching your parents age — the role reversal',
  'Your own mortality becoming real rather than abstract',
  'Looking at how fast time is moving and what that means',
  'Regret — the things you didn\'t do when you had the chance',
  'The unlived life — the parallel version you can imagine but not enter',
  'What you want your last chapter to look like',
  'Who you want to be when you grow old',
  'Legacy — the dent in the universe',
  'Age in the workforce — discrimination, invisibility, irrelevance fears',
  'Retiring before you\'re ready — or after you were ready long ago',
  'The things you still want to do',
  'Making peace with what won\'t happen',
  'Finding joy in the smaller, quieter things',
  'Wisdom — recognizing what you\'ve actually learned',
]

// ─────────────────────────────────────────────────────────────────────────────
// MASTER EXPORT: All scenarios flat for AI system prompt injection
// ─────────────────────────────────────────────────────────────────────────────
export const ALL_SCENARIOS = [
  ...IDENTITY_SCENARIOS,
  ...CAREER_SCENARIOS,
  ...FINANCIAL_SCENARIOS,
  ...PHYSICAL_HEALTH_SCENARIOS,
  ...MENTAL_HEALTH_SCENARIOS,
  ...ROMANTIC_SCENARIOS,
  ...FAMILY_SCENARIOS,
  ...SOCIAL_SCENARIOS,
  ...GRIEF_SCENARIOS,
  ...ADDICTION_SCENARIOS,
  ...PURPOSE_SCENARIOS,
  ...TRANSITION_SCENARIOS,
  ...EDUCATION_SCENARIOS,
  ...SOCIAL_JUSTICE_SCENARIOS,
  ...MODERN_LIFE_SCENARIOS,
  ...SUCCESS_SCENARIOS,
  ...RESILIENCE_SCENARIOS,
  ...AGING_SCENARIOS,
]

export const SCENARIO_COUNT = ALL_SCENARIOS.length

/**
 * Compressed human life map for system prompt injection.
 * Used so the AI deeply understands every scenario a person might be in.
 */
export const LIFE_SCENARIO_PROMPT = `
You understand the full map of human experience across 18 domains of life.
Every person who talks to you is navigating one or more of these. You hold space for all of them.

IDENTITY & SELF: Immigration and cultural duality | Coming out | Faith crisis | Racial identity | Imposter syndrome | People-pleasing | Rebuilding self after loss of role | Perfectionism as armor | Second-generation cultural conflict | The gap between who you are privately and who you appear publicly

CAREER & WORK: First job shock | Toxic workplaces | Burnout | Layoffs (first, repeated, from big brands) | Career change at any age | Starting/failing/scaling a business | Passion that died as a job | Golden handcuffs | The overqualified underemployed | Entrepreneurship from nothing

FINANCIAL: Being genuinely broke | Credit card spiral | Student debt | Medical debt | Bankruptcy | Never learning personal finance | Sudden wealth | Inheritance complexity | Overspending as emotional regulation | Financial secrets in relationships | Supporting parents | Retirement anxiety | First-generation wealth

PHYSICAL HEALTH: Major diagnosis | Chronic illness | Disability | Body image | Eating disorders | Addiction (alcohol, drugs, prescription) | Recovery and relapse | Pregnancy, miscarriage, infertility | Caregiver burnout | Aging body

MENTAL HEALTH: Depression (first, chronic, high-functioning) | Anxiety (generalized, social, panic) | Trauma and PTSD | ADHD and autism | Bipolar and personality disorders | Suicidal ideation | Therapy beginning and failure | Medication search | Emotional numbness | Codependency | Loneliness in a crowd | Burnout vs laziness

ROMANTIC: First love and heartbreak | Dating apps and fatigue | Dating after divorce | Long distance | Falling out of love | Affair and rebuilding trust | Toxic and abusive relationships | Divorce (initiating and being left) | Widowed | Sexual incompatibility | Partner with mental illness

FAMILY: Immigrant parent expectations | Absent or abusive parents | Estrangement | Parental death (before and after resolution) | Becoming a caregiver | Sibling dynamics | Becoming a parent | Pregnancy loss | Raising special needs children | Empty nest | Blended families | Chosen family

FRIENDSHIP & SOCIAL: Making friends as an adult | Moving and social reset | Growing apart | Toxic friendships | Loneliness with people around | Social anxiety | Money and friendship gaps | The "strong friend" with no one to lean on | Community loss

GRIEF: Death of every relationship (parent, child, partner, friend) | Suicide loss | Pregnancy loss | Disenfranchised grief | Complicated grief | Loss of career/identity/dream/relationship | Anticipatory grief | Grief others want you to be over

ADDICTION: Recognition | Rock bottom | Seeking help | Sobriety | Relapse | Alcohol, drugs, prescription, gambling, food, screens, sex, work | Being family of addict | Enabling | Rebuilding in recovery

PURPOSE: Quarter-life and midlife crisis | Success without meaning | Dream deferred | Passion vs stability | Existential dread | Climate and political grief | Searching for or losing God | Legacy questions | The second half of life

MAJOR TRANSITIONS: Immigration | Moving cities | Starting/dropping out of college | Marriage, divorce, having children | Job loss | Business start/failure/exit | Coming out | Major diagnosis | Sudden wealth or loss | Death of parent | Retirement | Caregiving

EDUCATION: First in family to college | Wrong major | Dropout | Undiagnosed learning disabilities | Student loans | Self-taught vs credentialed | School as a second-language learner | Elite school, working-class background

RACE & SOCIETY: Workplace racism | Microaggressions | Immigration status anxiety | Discrimination in systems | Police fear | Raising children of color | Generational poverty | Housing and food insecurity | Economic inequality | Homelessness

MODERN LIFE: Social media comparison | Phone addiction | Remote work isolation | AI/automation anxiety | Dating apps | Always-on work culture | Online identity vs real self | Parasocial relationships

SUCCESS & ITS SHADOWS: First real success | Emptiness at arrival | Success at relational cost | Fame | Losing status | Inherited wealth | Loneliness at the top | Radical simplification from success

FAILURE & REBUILDING: Business, marriage, academic, public failure | Starting over at 30, 40, 50 | Rebuilding trust in yourself | Post-traumatic growth | Forgiving yourself | The comeback

AGING & MORTALITY: First awareness of aging | Role reversal with parents | Mortality becoming real | Regret | The unlived life | Legacy | Age discrimination | Wisdom and what you've actually learned
`
