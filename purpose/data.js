/**
 * data.js — the content behind Purpose.
 *
 * Editorial rules (same spirit as the Impact Compass atlas):
 *  - Figures are approximate and phrased that way. They are context, not
 *    citations; sources are named per problem.
 *  - No real organisations are named — org types only.
 *  - Every problem offers a way in at three sizes (an hour, a month, a
 *    year) so nobody is told "quit your job or do nothing".
 *  - `goal` completes the sentence "I use … to help ___" in the purpose
 *    statement, so it must read naturally there.
 *  - Ratings are coarse editorial judgements (1 = low, 3 = high) on the
 *    scale / neglect / solvability frame, not precise scores.
 */

export const THEMES = {
  health:    { name: 'Health & disease',        emoji: '🩺' },
  poverty:   { name: 'Poverty & opportunity',   emoji: '🌾' },
  climate:   { name: 'Climate & nature',        emoji: '🌱' },
  education: { name: 'Learning & education',    emoji: '📚' },
  mind:      { name: 'Mental health & connection', emoji: '🫂' },
  justice:   { name: 'Justice & rights',        emoji: '⚖️' },
  animals:   { name: 'Animal welfare',          emoji: '🐾' },
  community: { name: 'Your local community',    emoji: '🏘️' },
  future:    { name: 'The long-term future',    emoji: '🔭' },
};

// Each value nudges the themes it most often leads people towards.
export const VALUES = [
  { id: 'compassion',  name: 'Compassion',   hint: 'Easing suffering when you see it', themes: ['health', 'mind', 'animals'] },
  { id: 'fairness',    name: 'Fairness',     hint: 'Everyone deserves a real shot',    themes: ['justice', 'poverty'] },
  { id: 'curiosity',   name: 'Curiosity',    hint: 'Understanding how things work',    themes: ['education', 'future'] },
  { id: 'freedom',     name: 'Freedom',      hint: 'People choosing their own lives',  themes: ['justice', 'poverty'] },
  { id: 'creativity',  name: 'Creativity',   hint: 'Making something new',             themes: ['education', 'community'] },
  { id: 'stewardship', name: 'Stewardship',  hint: 'Leaving things better than you found them', themes: ['climate', 'animals', 'future'] },
  { id: 'belonging',   name: 'Belonging',    hint: 'Nobody left on the outside',       themes: ['community', 'mind'] },
  { id: 'service',     name: 'Service',      hint: 'Showing up for others',            themes: ['community', 'poverty', 'health'] },
  { id: 'courage',     name: 'Courage',      hint: 'Standing up when it is hard',      themes: ['justice'] },
  { id: 'growth',      name: 'Growth',       hint: 'Becoming more than you were',      themes: ['education', 'mind'] },
  { id: 'family',      name: 'Family',       hint: 'The people closest to you',        themes: ['community', 'education', 'health'] },
  { id: 'truth',       name: 'Truth',        hint: 'Seeing the world as it really is', themes: ['future', 'justice'] },
  { id: 'impact',      name: 'Effectiveness', hint: 'Doing the most good per hour or euro', themes: ['poverty', 'health', 'future'] },
  { id: 'nature',      name: 'Love of nature', hint: 'Wild places and living things',  themes: ['climate', 'animals'] },
  { id: 'security',    name: 'Safety',       hint: 'A world where people are protected', themes: ['future', 'health', 'community'] },
  { id: 'dignity',     name: 'Dignity',      hint: 'Every person treated as a person', themes: ['justice', 'poverty', 'mind'] },
  { id: 'craft',       name: 'Craft',        hint: 'Doing a thing really well',        themes: [] },
  { id: 'faith',       name: 'Faith',        hint: 'Living out what you believe',      themes: ['community', 'poverty'] },
];

export const STRENGTHS = [
  { id: 'teach',     name: 'Teaching & explaining' },
  { id: 'code',      name: 'Building software' },
  { id: 'organize',  name: 'Organising people & events' },
  { id: 'write',     name: 'Writing' },
  { id: 'care',      name: 'Caring for people' },
  { id: 'data',      name: 'Analysing data' },
  { id: 'design',    name: 'Design & visuals' },
  { id: 'fundraise', name: 'Selling & fundraising' },
  { id: 'research',  name: 'Research & deep reading' },
  { id: 'build',     name: 'Hands-on making & fixing' },
  { id: 'lead',      name: 'Leading teams' },
  { id: 'listen',    name: 'Listening & counselling' },
  { id: 'science',   name: 'Science & medicine' },
  { id: 'policy',    name: 'Law & policy' },
  { id: 'finance',   name: 'Money & operations' },
  { id: 'media',     name: 'Storytelling & media' },
];

export const CAPACITY = [
  { id: 'hour',  name: 'An hour here and there', hours: 1 },
  { id: 'week',  name: 'A few hours a week',      hours: 4 },
  { id: 'side',  name: 'A serious side project (~10h/week)', hours: 10 },
  { id: 'career', name: 'My career — I want this to be my work', hours: 40 },
];

// Lenses for the free-text "energy" questions in discovery.
export const PROMPTS = [
  { id: 'flow',  q: 'When do you lose track of time?', ph: 'e.g. explaining things to my niece, fixing old bikes, digging into a spreadsheet…' },
  { id: 'anger', q: 'What injustice or waste makes you angry — or breaks your heart?', ph: 'e.g. kids who never learn to read, people sleeping on my street…' },
  { id: 'lived', q: 'What have you lived through that others are going through now?', ph: 'e.g. caring for a parent with dementia, growing up poor, burnout…' },
];

// Words in free text that hint at a theme. Kept small and obvious on purpose.
export const KEYWORDS = {
  health:    ['health', 'disease', 'malaria', 'doctor', 'nurse', 'hospital', 'medicine', 'sick', 'cancer', 'vaccine'],
  poverty:   ['poor', 'poverty', 'money', 'debt', 'jobs', 'unemploy', 'income', 'hunger', 'hungry'],
  climate:   ['climate', 'carbon', 'nature', 'forest', 'ocean', 'pollution', 'plastic', 'energy', 'wild'],
  education: ['teach', 'learn', 'school', 'read', 'kids', 'student', 'explain', 'tutor'],
  mind:      ['lonely', 'loneliness', 'anxiety', 'depress', 'burnout', 'mental', 'grief', 'suicide', 'therapy'],
  justice:   ['injustice', 'racism', 'rights', 'prison', 'discrimination', 'refugee', 'corrupt', 'equal'],
  animals:   ['animal', 'dog', 'cat', 'farm', 'meat', 'wildlife', 'species', 'pet'],
  community: ['neighbour', 'neighbor', 'street', 'local', 'town', 'homeless', 'elderly', 'parent', 'dementia'],
  future:    ['ai', 'pandemic', 'future', 'risk', 'technology', 'misinformation', 'nuclear', 'truth'],
};

export const PROBLEMS = [
  {
    id: 'extreme-poverty', name: 'Extreme poverty', emoji: '🌍', themes: ['poverty'],
    goal: 'end extreme poverty',
    why: 'Roughly 1 in 10 people live on less than about $3 a day. The share has fallen dramatically since 1990 — this is a problem humanity is actually beating, and money goes unusually far.',
    rating: { scale: 3, neglect: 2, solvable: 3 },
    sources: ['World Bank', 'Our World in Data'],
    roles: {
      fundraise: 'Run a giving campaign or giving circle for direct cash transfer programmes.',
      data: 'Help evaluators and NGOs measure what works (monitoring & evaluation roles).',
      finance: 'Operations and finance roles at high-impact development organisations.',
      code: 'Build payment, targeting or mobile-money tools for cash transfer organisations.',
      media: 'Tell the true story — that poverty is beatable — to counter fatalism.',
    },
    missions: {
      hour: ['Read one evaluation of a direct cash transfer programme and write down what surprised you.', 'Set up a small recurring donation to a cash-transfer org type you have vetted.'],
      month: ['Start a 4-week giving circle with 3–5 friends: research, debate, give together.', 'Volunteer a skill (accounting, translation, design) to a development nonprofit for one project.'],
      year: ['Pledge a fixed share of income to the most cost-effective poverty programmes you can find.', 'Move into an operations, data or field role in global development.'],
    },
  },
  {
    id: 'child-deaths', name: 'Preventable child deaths', emoji: '🦟', themes: ['health', 'poverty'],
    goal: 'stop children dying of preventable causes',
    why: 'Around 5 million children under five die each year, mostly from causes like malaria, pneumonia and diarrhoea that are cheap to prevent or treat.',
    rating: { scale: 3, neglect: 2, solvable: 3 },
    sources: ['UNICEF', 'WHO', 'GiveWell'],
    roles: {
      science: 'Clinical, epidemiology or lab work on diseases of poverty.',
      fundraise: 'Raise money for bed nets, vaccines or seasonal malaria medicine programmes.',
      data: 'Support health-system data: supply chains, disease surveillance, cost-effectiveness.',
      research: 'Help charity evaluators review evidence on health interventions.',
      media: 'Make the invisible visible — explain why these deaths are preventable.',
    },
    missions: {
      hour: ['Learn the top three killers of children under five and how each is prevented.', 'Make one donation to a highly rated child-health programme.'],
      month: ['Run a birthday or sports fundraiser for a malaria or vaccination programme.', 'Write a short explainer for friends on why a few dollars can matter so much here.'],
      year: ['Retrain or apply toward global health roles (supply chain, data, clinical).', 'Lead a workplace giving drive focused on proven health programmes.'],
    },
  },
  {
    id: 'climate', name: 'Climate change', emoji: '🔥', themes: ['climate', 'future'],
    goal: 'slow climate change',
    why: 'Emissions are still near record highs, but clean energy is now the cheapest new power in most of the world. The decisive decades are this one and the next.',
    rating: { scale: 3, neglect: 1, solvable: 2 },
    sources: ['IPCC', 'IEA', 'Our World in Data'],
    roles: {
      code: 'Software for grids, batteries, carbon accounting or climate risk.',
      science: 'Research or engineering in clean energy, materials or agriculture.',
      policy: 'Work on energy policy, permitting reform or carbon pricing.',
      organize: 'Organise locally for better transit, heat pumps or community solar.',
      finance: 'Climate finance: getting capital into clean projects in developing countries.',
      build: 'Become an installer, electrician or retrofitter — the transition needs hands.',
    },
    missions: {
      hour: ['Find your own three biggest emission sources and pick one to cut.', 'Write to a local representative about one specific climate policy.'],
      month: ['Join or start a local campaign (bike lanes, heat pumps, community solar).', 'Take a short course on climate solutions in your field.'],
      year: ['Move to a climate role — technical, policy, finance or trades.', 'Lead your workplace through a credible emissions plan.'],
    },
  },
  {
    id: 'mental-health', name: 'Untreated mental illness', emoji: '🧠', themes: ['mind', 'health'],
    goal: 'get people the mental health care they need',
    why: 'Roughly 1 in 8 people live with a mental disorder, and in many countries most get no treatment at all. Low-cost, lay-delivered therapy is a growing, evidence-backed answer.',
    rating: { scale: 3, neglect: 3, solvable: 2 },
    sources: ['WHO', 'The Lancet Psychiatry'],
    roles: {
      listen: 'Train as a crisis-line volunteer or peer supporter.',
      care: 'Peer support, caregiving or lay-counsellor programmes.',
      science: 'Clinical psychology, psychiatry or research on scalable therapies.',
      code: 'Build tools that make evidence-based support cheaper and easier to reach.',
      write: 'Write honestly about your own experience to reduce stigma.',
      organize: 'Run peer-support or walk-and-talk groups in your community.',
    },
    missions: {
      hour: ['Learn the warning signs of crisis and save your local crisis line number.', 'Check in properly with one person you have been meaning to call.'],
      month: ['Complete a mental health first-aid course.', 'Volunteer for a crisis text or helpline (most provide full training).'],
      year: ['Train as a counsellor, peer-support worker or psychologist.', 'Start a support group around something you have lived through.'],
    },
  },
  {
    id: 'loneliness', name: 'Loneliness & isolation', emoji: '🫂', themes: ['mind', 'community'],
    goal: 'make sure nobody is left alone',
    why: 'A large share of adults in many countries say they often feel lonely, with older people and young adults hit hardest. Chronic isolation carries health risks comparable to well-known ones like smoking.',
    rating: { scale: 2, neglect: 3, solvable: 2 },
    sources: ['WHO Commission on Social Connection', 'US Surgeon General advisory'],
    roles: {
      organize: 'Host recurring gatherings: dinners, walks, repair cafés, clubs.',
      care: 'Befriend an isolated older person through a visiting programme.',
      listen: 'Phone-befriending lines for people living alone.',
      design: 'Design spaces and events that make it easy for strangers to connect.',
      lead: 'Build a volunteer network that keeps a neighbourhood connected.',
    },
    missions: {
      hour: ['Invite a neighbour or someone you have lost touch with for coffee.', 'Learn the names of three people on your street.'],
      month: ['Sign up for a weekly befriending visit or call with an older person.', 'Host a monthly open dinner or walk and keep it going for 4 weeks.'],
      year: ['Build a lasting community ritual — a club, supper, or skill-share — that runs without you.', 'Work in social prescribing or community development.'],
    },
  },
  {
    id: 'learning-poverty', name: 'Children who can’t read', emoji: '📖', themes: ['education', 'poverty'],
    goal: 'get every child reading',
    why: 'In low- and middle-income countries, a majority of 10-year-olds cannot read a simple story. Structured teaching methods and teaching at the right level have strong evidence behind them.',
    rating: { scale: 3, neglect: 2, solvable: 3 },
    sources: ['World Bank (learning poverty)', 'UNESCO'],
    roles: {
      teach: 'Tutor children who are behind — locally or online.',
      code: 'Build adaptive learning tools that work offline on cheap phones.',
      research: 'Help programmes test what actually improves learning.',
      write: 'Write simple, joyful early-reading books in under-served languages.',
      lead: 'Lead a school or education nonprofit.',
    },
    missions: {
      hour: ['Read with a child in your life — and notice how they decode words.', 'Learn what “teaching at the right level” means and why it works.'],
      month: ['Volunteer as a weekly reading tutor at a local school or library.', 'Translate or illustrate a free early-reader book.'],
      year: ['Train as a teacher, or join an education nonprofit in a delivery role.', 'Build or improve an open learning tool used by real classrooms.'],
    },
  },
  {
    id: 'factory-farming', name: 'Factory farming', emoji: '🐔', themes: ['animals', 'climate'],
    goal: 'end the suffering of factory-farmed animals',
    why: 'Tens of billions of land animals, plus far more fish, are farmed each year, most in intensive conditions. Corporate welfare campaigns and alternative proteins have won real changes.',
    rating: { scale: 3, neglect: 3, solvable: 2 },
    sources: ['FAO', 'Our World in Data'],
    roles: {
      science: 'Food science for alternative proteins (plant-based, fermentation, cultivated).',
      policy: 'Animal welfare law and corporate campaign work.',
      media: 'Investigations and storytelling that show what happens on farms.',
      fundraise: 'Fundraise for effective animal advocacy groups.',
      research: 'Research which interventions spare the most animals.',
    },
    missions: {
      hour: ['Try replacing one animal product you eat often for a week.', 'Read a summary of the evidence on corporate cage-free campaigns.'],
      month: ['Volunteer for an online corporate-welfare campaign action.', 'Cook a plant-based dinner for friends and talk about why.'],
      year: ['Work in alternative protein R&D, policy or advocacy.', 'Give regularly to the most cost-effective animal welfare groups you can find.'],
    },
  },
  {
    id: 'ai-safety', name: 'Making AI go well', emoji: '🤖', themes: ['future'],
    goal: 'make AI go well for everyone',
    why: 'AI is advancing quickly and will reshape work, science and power. Comparatively few people work on making it safe, fair and well-governed relative to the effort spent making it more capable.',
    rating: { scale: 3, neglect: 3, solvable: 2 },
    sources: ['International AI Safety Report', 'Stanford AI Index'],
    roles: {
      code: 'Technical safety, evaluations or security engineering.',
      research: 'Interpretability, alignment or societal-impact research.',
      policy: 'AI governance, standards and policy roles.',
      teach: 'Help people in your field understand and use AI responsibly.',
      write: 'Clear, honest public writing on AI risks and benefits.',
    },
    missions: {
      hour: ['Read one accessible overview of AI risks and benefits.', 'Write down how AI is already changing your own job.'],
      month: ['Take an introductory AI safety or governance course.', 'Run a session at work on responsible AI use.'],
      year: ['Transition into a technical, policy or operations role in AI safety.', 'Build expertise where AI meets your field (law, health, education).'],
    },
  },
  {
    id: 'pandemics', name: 'The next pandemic', emoji: '🦠', themes: ['future', 'health'],
    goal: 'make the next pandemic far less deadly',
    why: 'COVID showed how unprepared the world was. Better surveillance, faster vaccines, cleaner indoor air and biosecurity could make the next one far less deadly.',
    rating: { scale: 3, neglect: 2, solvable: 2 },
    sources: ['WHO', 'Johns Hopkins Center for Health Security'],
    roles: {
      science: 'Biosecurity, vaccine platforms, diagnostics or epidemiology.',
      policy: 'Public health preparedness and biosecurity policy.',
      build: 'Indoor air quality: filtration and ventilation in schools and workplaces.',
      data: 'Disease surveillance and forecasting.',
      organize: 'Emergency preparedness in your community.',
    },
    missions: {
      hour: ['Learn how indoor air filtration reduces airborne disease spread.', 'Read one post-COVID preparedness report summary.'],
      month: ['Push for better ventilation in a school or office you are part of.', 'Join a forecasting community and practise on health questions.'],
      year: ['Move into public health, biosecurity or diagnostics work.', 'Lead a preparedness plan for your organisation.'],
    },
  },
  {
    id: 'homelessness', name: 'Homelessness', emoji: '🏠', themes: ['community', 'poverty'],
    goal: 'get people into stable homes',
    why: 'Homelessness has risen in many cities as housing costs climb. “Housing First” approaches — a stable home first, support second — have good evidence for keeping people housed.',
    rating: { scale: 2, neglect: 2, solvable: 2 },
    sources: ['OECD Affordable Housing Database', 'Housing First evaluations'],
    roles: {
      care: 'Outreach, shelter or support work.',
      policy: 'Housing policy, zoning reform and tenant rights.',
      organize: 'Organise for more homes to be built where you live.',
      build: 'Volunteer in home repair or construction for affordable housing.',
      listen: 'Mentor or befriend someone moving out of homelessness.',
    },
    missions: {
      hour: ['Learn what Housing First is and whether your city uses it.', 'Speak to — and learn the name of — someone you regularly pass by.'],
      month: ['Volunteer weekly at a shelter, food run or outreach team.', 'Attend a local planning meeting and speak up for more homes.'],
      year: ['Work in housing, outreach or homelessness services.', 'Help a local Housing First or tenancy-support programme grow.'],
    },
  },
  {
    id: 'information', name: 'A broken information ecosystem', emoji: '📰', themes: ['future', 'justice', 'education'],
    goal: 'help people tell what is true',
    why: 'Trust in shared facts is eroding, local news has shrunk in many places, and synthetic media is getting cheaper. Healthy democracies depend on people being able to tell what is true.',
    rating: { scale: 2, neglect: 2, solvable: 2 },
    sources: ['Reuters Institute Digital News Report'],
    roles: {
      media: 'Local journalism, fact-checking or explainer content.',
      teach: 'Teach media literacy and lateral reading.',
      code: 'Tools for provenance, fact-checking or better recommendation systems.',
      research: 'Open-source investigation and verification.',
      write: 'Write carefully sourced, calm explainers on contested topics.',
    },
    missions: {
      hour: ['Learn the “lateral reading” technique fact-checkers use.', 'Subscribe to one local news source.'],
      month: ['Run a media-literacy session for a school, library or family group.', 'Volunteer with a fact-checking or local news project.'],
      year: ['Work in journalism, trust & safety or civic tech.', 'Start a local newsletter covering what nobody else covers.'],
    },
  },
  {
    id: 'access-to-justice', name: 'Access to justice', emoji: '⚖️', themes: ['justice', 'poverty'],
    goal: 'give everyone access to justice',
    why: 'Billions of people cannot get help with everyday legal problems — evictions, wages, family disputes, documents. Paralegal programmes and plain-language tools close part of that gap.',
    rating: { scale: 3, neglect: 3, solvable: 2 },
    sources: ['World Justice Project', 'OECD'],
    roles: {
      policy: 'Pro bono legal work, legal aid or justice reform.',
      code: 'Legal-help tools: form fillers, plain-language guides, case trackers.',
      write: 'Turn legal processes into plain-language guides.',
      listen: 'Volunteer at an advice centre helping people navigate their rights.',
      organize: 'Organise community legal clinics.',
    },
    missions: {
      hour: ['Find where people in your city can get free legal advice.', 'Rewrite one confusing official form or letter into plain language.'],
      month: ['Volunteer at a citizens’ advice or legal aid clinic.', 'Help one person through a bureaucratic process start to finish.'],
      year: ['Do sustained pro bono work or move into legal aid.', 'Build a legal-help tool with a legal aid partner.'],
    },
  },
  {
    id: 'biodiversity', name: 'Biodiversity loss', emoji: '🦋', themes: ['climate', 'animals'],
    goal: 'bring wildlife back',
    why: 'Monitored wildlife populations have declined steeply on average since 1970, driven mostly by land-use change. Protected areas and restoration work when they are well run and funded.',
    rating: { scale: 2, neglect: 2, solvable: 2 },
    sources: ['IPBES', 'WWF/ZSL Living Planet Index'],
    roles: {
      science: 'Ecology, conservation biology or restoration science.',
      data: 'Remote sensing and biodiversity monitoring.',
      build: 'Hands-on habitat restoration and rewilding.',
      organize: 'Run local nature recovery projects.',
      media: 'Nature storytelling, photography and film.',
    },
    missions: {
      hour: ['Log species around you in a citizen-science app.', 'Plant something native or leave a patch of garden wild.'],
      month: ['Join a monthly conservation volunteering day.', 'Map green spaces in your area that could be restored.'],
      year: ['Work in conservation or restoration.', 'Lead a lasting local nature project with your council or school.'],
    },
  },
  {
    id: 'water', name: 'Unsafe water & sanitation', emoji: '💧', themes: ['health', 'poverty'],
    goal: 'bring safe water to everyone',
    why: 'On the order of 2 billion people lack safely managed drinking water. Chlorination and water treatment are among the cheapest ways to save young children’s lives.',
    rating: { scale: 3, neglect: 2, solvable: 3 },
    sources: ['WHO/UNICEF JMP'],
    roles: {
      build: 'Engineering for water systems and sanitation.',
      science: 'Water quality and public health research.',
      fundraise: 'Raise funds for water treatment programmes.',
      data: 'Sensor and monitoring systems that keep water points working.',
      finance: 'Operations for water and sanitation organisations.',
    },
    missions: {
      hour: ['Learn why in-line chlorination is so cost-effective.', 'Donate to a well-evaluated water treatment programme.'],
      month: ['Run a fundraiser around World Water Day.', 'Offer engineering or data skills to a water NGO.'],
      year: ['Work in water, sanitation and hygiene (WASH).', 'Give regularly to the most cost-effective water programmes you can find.'],
    },
  },
  {
    id: 'displacement', name: 'Forced displacement', emoji: '🧳', themes: ['justice', 'poverty', 'community'],
    goal: 'help displaced people rebuild their lives',
    why: 'Over 100 million people are forcibly displaced — a record. Language, work and a welcoming community make an enormous difference to how people rebuild their lives.',
    rating: { scale: 3, neglect: 2, solvable: 2 },
    sources: ['UNHCR Global Trends'],
    roles: {
      teach: 'Teach the local language to newcomers.',
      policy: 'Asylum and immigration legal support.',
      care: 'Mentoring and practical support for resettled families.',
      organize: 'Community sponsorship and welcome groups.',
      fundraise: 'Fundraise for emergency response and integration programmes.',
    },
    missions: {
      hour: ['Learn the difference between a refugee, an asylum seeker and a migrant.', 'Find the refugee support groups active in your city.'],
      month: ['Volunteer as a language buddy or conversation partner.', 'Help a newcomer with CVs, interview practice or job leads.'],
      year: ['Join a community sponsorship group for a resettling family.', 'Work in humanitarian response or integration services.'],
    },
  },
  {
    id: 'food-insecurity', name: 'Hunger next door', emoji: '🥫', themes: ['community', 'poverty'],
    goal: 'make sure nobody near me goes hungry',
    why: 'Even in rich countries, many households skip meals to make ends meet, while a large share of food is wasted. Local food projects connect the two.',
    rating: { scale: 2, neglect: 1, solvable: 3 },
    sources: ['FAO', 'UNEP Food Waste Index'],
    roles: {
      organize: 'Coordinate food rescue routes or a community fridge.',
      build: 'Logistics and hands-on volunteering at food banks.',
      code: 'Apps that match surplus food with people who need it.',
      care: 'Community kitchens and shared meals.',
      policy: 'Push for free school meals and benefit access.',
    },
    missions: {
      hour: ['Find your nearest food bank and what it is short of this week.', 'Check whether local families can easily claim school meal support.'],
      month: ['Volunteer a weekly shift at a food bank or community kitchen.', 'Set up a food-rescue run from a local shop or bakery.'],
      year: ['Start or run a community fridge or pantry.', 'Work in food security policy or community food projects.'],
    },
  },
];
