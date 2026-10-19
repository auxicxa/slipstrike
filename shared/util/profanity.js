// Nickname sanitizing and a simple profanity filter (school-safe defaults).
// Text is normalized first (lowercase, leetspeak → letters, repeated letters collapsed), then checked
// against two lists: words blocked anywhere inside a name, and short words blocked only as whole words.

const ANYWHERE = [
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'nigg', 'niga', 'fagot', 'retard', 'asshole', 'whore',
  'slut', 'penis', 'vagina', 'porn', 'pussy', 'dildo', 'wank', 'twat', 'nazi', 'hitler', 'jizz', 'boob', 'bastard',
  'kysel', 'killyourself', 'molest', 'pedophil', 'horny', 'nude', 'naked', 'blowjob', 'handjob', 'masturb', 'orgasm',
  'erection', 'testicle', 'scrotum', 'butthole', 'kkk', 'swastika', 'genocide', 'suicide',
];
const WHOLE = ['ass', 'cum', 'sex', 'tit', 'tits', 'dick', 'cock', 'fag', 'kys', 'hoe', 'hoes', 'piss', 'arse', 'bum', 'lesbo', 'spic', 'chink', 'gook', 'dyke', 'tranny', 'nonce', 'prick', 'thot', 'milf', 'rape', 'rapist', 'pedo', 'anus', 'heil'];

const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't', '€': 'e' };

function normalize(s) {
  return s.toLowerCase().split('').map((c) => LEET[c] ?? c).join('');
}

export function isProfane(text) {
  const n = normalize(text);
  const letters = n.replace(/[^a-z]/g, '');
  const collapsed = letters.replace(/(.)\1+/g, '$1');
  for (const w of ANYWHERE) {
    const cw = w.replace(/(.)\1+/g, '$1');
    if (letters.includes(w) || (cw.length >= 4 && collapsed.includes(cw))) return true;
  }
  const words = n.split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    const c = w.replace(/(.)\1+/g, '$1');
    if (WHOLE.includes(w) || WHOLE.includes(c)) return true;
  }
  // Names written as one blob, e.g. "BigDick99": check camel-case parts of the original text too
  const parts = text.replace(/[^A-Za-z]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/).filter(Boolean);
  for (const p of parts) if (WHOLE.includes(p)) return true;
  return false;
}

/** Returns a safe nickname: allowed characters only, max 16 chars, never empty, never profane. */
export function sanitizeName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.normalize('NFKC').replace(/[^A-Za-z0-9 _\-.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16).trim();
  if (!s || s.length < 2 || isProfane(s)) s = 'Player' + Math.floor(1000 + Math.random() * 9000);
  return s;
}

const CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels: random codes can't spell words

export function makeRoomCode(taken) {
  for (let i = 0; i < 1000; i++) {
    let c = '';
    for (let k = 0; k < 4; k++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken.has(c)) return c;
  }
  throw new Error('no free room codes');
}
