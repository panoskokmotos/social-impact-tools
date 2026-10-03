/**
 * conduct.js — the Explorer of Purpose. Pure logic, no DOM. Tested by test.mjs.
 *
 * The Explorer sets the North Star and decides what deserves to exist;
 * AI agents do the building. This module turns an "expedition" (one thing
 * the Explorer wants to exist) into a brief and a set of role prompts that
 * can be pasted into any capable AI system.
 *
 * Expedition: { id, problemId, what, forWhom, change, measure, never,
 *               checks: { [usefulnessId]: bool }, stage, outcomes: [{date,text}], created }
 * Context:    { northStar: { statement, vision }, problem }
 */
import { USEFULNESS, READY_AT, ROLES, STAGES } from './data.js';

export function newExpedition(problem, what = '', now = new Date()) {
  return {
    id: `x${now.getTime().toString(36)}`,
    problemId: problem.id,
    what, forWhom: '', change: '', measure: '', never: '',
    checks: {}, stage: 'chart', outcomes: [], created: now.toISOString(),
  };
}

/**
 * Usefulness gate. Ready means: we know what and for whom, and at least
 * READY_AT of the usefulness checks are honestly ticked.
 */
export function readiness(exp) {
  const ticked = USEFULNESS.filter((u) => exp.checks?.[u.id]);
  const missing = [];
  if (!exp.what?.trim()) missing.push('Say what should exist.');
  if (!exp.forWhom?.trim()) missing.push('Say who it is for.');
  for (const u of USEFULNESS) if (!exp.checks?.[u.id]) missing.push(u.q);
  return {
    score: ticked.length,
    total: USEFULNESS.length,
    ready: !!exp.what?.trim() && !!exp.forWhom?.trim() && ticked.length >= READY_AT,
    missing,
  };
}

export function nextStage(stageId) {
  const i = STAGES.findIndex((s) => s.id === stageId);
  return STAGES[Math.min(i + 1, STAGES.length - 1)].id;
}

const or = (v, fallback) => (v && String(v).trim()) || fallback;

/** The shared context every agent receives. */
function contextBlock(exp, ctx) {
  const p = ctx.problem;
  return [
    `NORTH STAR: ${or(ctx.northStar?.statement, '(not yet written)')}`,
    ctx.northStar?.vision?.trim() ? `VISION: In ten years the world is different because ${ctx.northStar.vision.trim()}` : null,
    `PROBLEM: ${p.name} — ${p.why}`,
    `WHAT SHOULD EXIST: ${or(exp.what, '(undecided)')}`,
    `FOR WHOM: ${or(exp.forWhom, '(undecided)')}`,
    `WHAT CHANGES FOR THEM: ${or(exp.change, '(undecided)')}`,
    `HOW WE WILL KNOW IT HELPED: ${or(exp.measure, '(undecided)')}`,
    `IT MUST NEVER: ${or(exp.never, '(not specified — ask me)')}`,
  ].filter(Boolean).join('\n');
}

const ROLE_INSTRUCTIONS = {
  scout: [
    'List what already exists that tries to do this (types of tools, programmes or services — say when you are unsure whether something exists).',
    'For each, say who it serves and where it falls short for the people above.',
    'Name the 3 most important things to learn from real users before building, and 5 interview questions to learn them.',
    'Recommend: build, adapt something existing, or do not build — and why.',
  ],
  architect: [
    'Define the smallest version that would genuinely help one real person within a week.',
    'Describe the user’s journey in 5–8 steps, and what is deliberately left out.',
    'Choose the simplest technology that works for these users (connectivity, devices, language, cost).',
    'Break the build into ordered tasks an AI coding agent can complete one at a time, each with a clear “done when”.',
  ],
  builder: [
    'Using the plan the Explorer gives you (ask for it if missing), build the first version.',
    'Prefer boring, well-understood technology. Keep it accessible, fast on cheap devices, and private by default.',
    'Write tests for the core logic, and a short README explaining how to run and change it.',
    'Stop and ask the Explorer before making any decision that affects users’ data, money or safety.',
  ],
  critic: [
    'Argue as strongly as you can that this is not useful — then say what would change your mind.',
    'List the ways it could hurt someone (privacy, safety, dependency, exclusion, misinformation), most serious first, each with a mitigation.',
    'Check it against the “must never” line above and flag anything that violates its spirit.',
    'Give a verdict: proceed, proceed with changes (list them), or stop.',
  ],
  measurer: [
    'Define one primary outcome that shows a real change for the people above — not just usage.',
    'Propose the cheapest credible way to measure it in the first month, and what result would mean “this is not working”.',
    'List 2–3 leading indicators we can see within a week.',
    'Draft the exact questions or log fields needed, keeping data collection minimal.',
  ],
  storyteller: [
    'Write a one-sentence description the people above would use themselves.',
    'Write a short launch message for where they actually are (e.g. a WhatsApp group, a notice board, a teacher’s inbox).',
    'Write a 100-word honest explanation of what it does, what it does not do, and how their data is treated.',
    'Avoid hype, jargon and saviour framing. Centre their agency.',
  ],
};

/** A ready-to-paste prompt for one role in the orchestra. */
export function rolePrompt(roleId, exp, ctx) {
  const role = ROLES.find((r) => r.id === roleId);
  if (!role) throw new Error(`unknown role ${roleId}`);
  return [
    `You are the ${role.name} on a small team building something useful for the world. Your job: ${role.job}`,
    `I am the Explorer: I set the direction and make the final calls. You do the work, and you tell me plainly when something is a bad idea.`,
    '',
    contextBlock(exp, ctx),
    '',
    'YOUR TASK:',
    ...ROLE_INSTRUCTIONS[roleId].map((t, i) => `${i + 1}. ${t}`),
    '',
    'Be concrete and brief. Mark any factual claim you are not sure of as uncertain. Finish with the single most important question you need me to answer.',
  ].join('\n');
}

/** The whole brief as Markdown — for sharing, saving, or handing to a team. */
export function briefMarkdown(exp, ctx) {
  const r = readiness(exp);
  const stage = STAGES.find((s) => s.id === exp.stage);
  const lines = [
    `# ${or(exp.what, 'Untitled expedition')}`,
    '',
    `**North Star:** ${or(ctx.northStar?.statement, '—')}`,
    ctx.northStar?.vision?.trim() ? `**Vision:** In ten years the world is different because ${ctx.northStar.vision.trim()}` : null,
    `**Problem:** ${ctx.problem.emoji} ${ctx.problem.name}`,
    `**Stage:** ${stage ? stage.name : exp.stage}`,
    '',
    '## The brief',
    `- **For whom:** ${or(exp.forWhom, '—')}`,
    `- **What changes for them:** ${or(exp.change, '—')}`,
    `- **How we’ll know it helped:** ${or(exp.measure, '—')}`,
    `- **It must never:** ${or(exp.never, '—')}`,
    '',
    `## Usefulness test (${r.score}/${r.total}${r.ready ? ' — ready' : ''})`,
    ...USEFULNESS.map((u) => `- [${exp.checks?.[u.id] ? 'x' : ' '}] ${u.q}`),
    '',
    '## The orchestra',
    ...ROLES.map((role) => `- ${role.emoji} **${role.name}** — ${role.job}`),
  ];
  if (exp.outcomes?.length) {
    lines.push('', '## What changed', ...exp.outcomes.map((o) => `- ${o.date}: ${o.text}`));
  }
  return lines.filter((l) => l !== null).join('\n') + '\n';
}

/** System + user message for the in-app "sharpen my brief" AI critique. */
export function critiqueRequest(exp, ctx) {
  return {
    systemPrompt: 'You are a warm but rigorous advisor to someone who directs AI agents to build things that help people. '
      + 'Your only goal is usefulness to real people. Reply in under 180 words, in plain text with short "- " bullets: '
      + '1) the single biggest risk that this is not useful, 2) a sharper, smaller version of "what should exist", '
      + '3) one question they should ask a real user this week. Never invent statistics.',
    userMessage: contextBlock(exp, ctx),
  };
}
