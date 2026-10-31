/**
 * Small hand-curated tables used by the matcher. Everything here is explicit and shown to the learner:
 * an alias is labelled as one, a skipped word says why, and nothing is ever matched by guesswork.
 */

/** Typed phrase -> an English gloss that exists in the dictionary. Checked before anything else. */
export const ALIASES: Record<string, string> = {
  'thank you': 'thank',
  'thank you very much': 'thank',
  'thanks': 'thank',
  'thanks a lot': 'thank',
  'bye': 'good bye',
  'bye bye': 'good bye',
  'you are welcome': "you're welcome",
  'youre welcome': "you're welcome",
};

/** Always skipped, even if the dictionary has a similarly spelled entry. */
export const ARTICLES = new Set(['a', 'an', 'the']);

/** Skipped only when the dictionary has no sign for them. */
export const COPULAS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);

export const SKIPPED_REASON = 'The dictionary has no separate sign for this word';

/**
 * Closed-class words: never matched through the synonym tier, because a content word that happens to list
 * them as a synonym is almost always a different sense (e.g. modal "will" -> the noun "volition").
 */
export const NO_SYNONYM_FALLBACK = new Set([
  'will', 'would', 'can', 'could', 'may', 'might', 'must', 'shall', 'should',
  'do', 'does', 'did', 'have', 'has', 'had', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from',
  'and', 'or', 'but', 'if', 'so', 'as', 'than', 'it', 'its', 'this', 'that', 'these', 'those',
]);

/** Words with no sign of their own, mapped to dictionary glosses worth showing as "related". Filtered to ones that exist. */
export const RELATED: Record<string, string[]> = {
  hello: ['welcome', 'greet', 'shake hands'],
  hi: ['welcome', 'greet', 'shake hands'],
  hey: ['welcome', 'greet'],
  greetings: ['welcome', 'greet'],
  'nice to meet you': ['shake hands', 'welcome'],
  'excuse me': ['sorry', 'please'],
  cheers: ['thank', 'welcome'],
};

export const IRREGULAR: Record<string, string> = {
  children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot', teeth: 'tooth', mice: 'mouse',
  went: 'go', gone: 'go', ate: 'eat', eaten: 'eat', saw: 'see', seen: 'see', came: 'come', gave: 'give',
  given: 'give', took: 'take', taken: 'take', knew: 'know', known: 'know', wrote: 'write', written: 'write',
  bought: 'buy', brought: 'bring', thought: 'think', told: 'tell', said: 'say', made: 'make', got: 'get',
  ran: 'run', sat: 'sit', stood: 'stand', slept: 'sleep', drank: 'drink', drunk: 'drink', spoke: 'speak',
};

/** Digits that have a sign of their own. Anything else is reported, not composed. */
export const NUMBER_WORDS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven',
  '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen', '14': 'fourteen',
  '15': 'fifteen', '16': 'sixteen', '17': 'seventeen', '18': 'eighteen', '19': 'nineteen', '20': 'twenty',
  '30': 'thirty', '40': 'forty', '50': 'fifty', '60': 'sixty', '70': 'seventy', '80': 'eighty', '90': 'ninety',
  '100': 'hundred', '1000': 'thousand',
};
