import type { Tool } from "./tool";

/**
 * Lexical tool pre-selection — port of lib/agent/tools/tool_selector.dart.
 * Cloud models get the full toolbox; small local models get only the top-K
 * tools whose *name* matches the query (after synonym expansion), to keep the
 * prompt small and avoid hallucinated calls.
 */

const STOPWORDS = new Set(
  "a an and are as at be by for from has have i in is it its me my of on or that this to was we were will with you your do does did so if but not no yes how what when where why who whom whose can could should would may might shall just please hi hello hey thanks thank".split(
    " ",
  ),
);

const GENERIC_VERBS = new Set(
  "read write get set open list show search find fetch create delete update send add".split(" "),
);

const SYNONYMS: Record<string, string[]> = {
  email: ["gmail", "mail", "inbox", "message"],
  mail: ["gmail", "inbox"],
  inbox: ["gmail", "mail"],
  meeting: ["calendar", "event", "schedule"],
  event: ["calendar", "meeting", "schedule"],
  schedule: ["calendar", "event"],
  calendar: ["event", "meeting"],
  channel: ["slack"],
  message: ["slack", "gmail"],
  dm: ["slack"],
  pr: ["github", "pull"],
  pull: ["github", "pr"],
  issue: ["github", "tickets"],
  repo: ["github"],
  commit: ["github"],
  page: ["notion"],
  doc: ["notion"],
  database: ["notion"],
  note: ["notion", "memory"],
  remember: ["memory"],
  weather: ["weather"],
  convert: ["unit", "currency", "calculator"],
  calculate: ["math", "compute", "calculator"],
  math: ["calculator"],
  translate: ["translate"],
  web: ["search", "fetch"],
  wikipedia: ["wiki"],
  time: ["current"],
  location: ["location", "maps"],
  map: ["maps"],
  clipboard: ["clipboard"],
};

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 2 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

export function selectRelevantTools(query: string, tools: Tool[], maxK = 7): Tool[] {
  if (tools.length === 0 || maxK <= 0) return [];
  if (tools.length <= maxK) return tools;

  const qTokens = tokenize(query);
  if (qTokens.size === 0) return [];

  const expanded = new Set(qTokens);
  for (const t of qTokens) for (const s of SYNONYMS[t] ?? []) expanded.add(s);

  const scored: Array<{ tool: Tool; score: number }> = [];
  for (const t of tools) {
    const nameTokens = tokenize(t.name);
    const descTokens = tokenize(t.description);
    const domainName = new Set([...nameTokens].filter((n) => !GENERIC_VERBS.has(n)));
    if (![...domainName].some((n) => expanded.has(n))) continue;

    let score = 0;
    for (const qt of expanded) {
      if (domainName.has(qt)) score += 3;
      if (descTokens.has(qt)) score += 1;
    }
    if (score > 0) scored.push({ tool: t, score });
  }

  scored.sort((a, b) => (b.score - a.score) || a.tool.name.localeCompare(b.tool.name));
  return scored.slice(0, maxK).map((s) => s.tool);
}
