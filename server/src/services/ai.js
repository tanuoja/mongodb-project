// AI service abstraction. Routes call ai.xxx() and never know which provider is behind it.
import { config } from '../config.js';
import { ApiError } from '../utils/helpers.js';

const STOP = new Set('the a an and or but of to in on for with is are was were be been it its this that as at by from not have has had will would can could should about into your you we they their our more most than then them these those there which what when who how also very just over such only other some any each'.split(' '));
const BAD = ['idiot', 'stupid', 'hate you', 'kill yourself', 'shut up', 'scam', 'moron', 'trash'];

const words = (t) => (t.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);
const keywords = (text, n = 5) => {
  const freq = {};
  words(text).filter((w) => w.length > 3 && !STOP.has(w)).forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
};
const sentences = (t) => t.replace(/[#>*_`]/g, '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- Offline mock provider: lets you demo every AI button with no API key ---------- */
const mock = {
  async summarize(text) { return sentences(text).slice(0, 2).join(' ').slice(0, 300) || 'Add some content first.'; },
  async titles(text) {
    const k = keywords(text, 3).map(cap);
    const [a = 'Ideas', b = 'Insights', c = 'Trends'] = k;
    return [`${a} and ${b}: What You Need to Know`, `A Practical Guide to ${a}`, `Why ${a} Matters More Than Ever`, `${a}, ${b} & ${c}: A Deep Dive`, `Understanding ${a} in 2026`];
  },
  async tags(text) { return keywords(text, 6); },
  async improve(text, mode) {
    let out = text.replace(/[ \t]+/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
    if (mode === 'concise') out = out.replace(/\b(very|really|basically|actually|just|quite)\s+/gi, '');
    if (mode === 'professional') out = out.replace(/\bdon't\b/g, 'do not').replace(/\bcan't\b/g, 'cannot').replace(/\bwon't\b/g, 'will not');
    return out;
  },
  async seo(text) { return sentences(text).slice(0, 2).join(' ').slice(0, 155); },
  async translate(text, lang) { return `[${lang} draft translation — connect a real AI provider for production quality]\n\n${text}`; },
  async moderate(text) {
    const reasons = [];
    const lower = text.toLowerCase();
    if (BAD.some((w) => lower.includes(w))) reasons.push('Possibly abusive language');
    if ((text.match(/https?:\/\//g) || []).length >= 2) reasons.push('Multiple links (possible spam)');
    if (text.length > 20 && text === text.toUpperCase()) reasons.push('All caps');
    return { flagged: reasons.length > 0, reason: reasons.join('; ') };
  },
};

/* ---------- OpenAI-compatible provider (works with OpenAI, Groq, OpenRouter, local servers…) ---------- */
async function chat(system, user) {
  const r = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
    body: JSON.stringify({ model: config.ai.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new ApiError(502, 'The AI service is unavailable right now.');
  return (await r.json()).choices[0].message.content.trim();
}
const json = (s) => { try { return JSON.parse(s.replace(/```json|```/g, '')); } catch { return null; } };

const llm = {
  summarize: (t) => chat('Summarize the article in at most 2 sentences.', t),
  titles: async (t) => json(await chat('Return ONLY a JSON array of 5 catchy article titles.', t)) || [],
  tags: async (t) => json(await chat('Return ONLY a JSON array of 6 lowercase single-word tags.', t)) || [],
  improve: (t, mode) => chat(`Rewrite the Markdown text to: ${mode}. Keep Markdown formatting. Return only the text.`, t),
  seo: (t) => chat('Write a meta description under 155 characters.', t),
  translate: (t, lang) => chat(`Translate to ${lang}. Keep Markdown formatting. Return only the translation.`, t),
  moderate: async (t) => json(await chat('Moderate this comment. Return ONLY JSON {"flagged":boolean,"reason":string}.', t)) || { flagged: false, reason: '' },
};

const provider = () => (config.ai.provider === 'openai' && config.ai.apiKey ? llm : mock);
export const ai = new Proxy({}, { get: (_, name) => (...args) => provider()[name](...args) });
