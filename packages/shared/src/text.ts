/** Control characters and direction overrides, but not the joiners that emoji and Persian need. */
const INVISIBLE = /(?![‌‍])[\p{Cc}\p{Cf}]/gu;
/** Three marks are enough for any real script. Past that it's zalgo. */
const TOO_MANY_MARKS = /(\p{M}{3})\p{M}+/gu;
const VISIBLE = /[^\s\p{M}‌‍]/u;

/** Names and messages on one line, with nothing hidden in them. Text with nothing to see comes back empty. */
export function cleanText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').replace(INVISIBLE, '').replace(TOO_MANY_MARKS, '$1').trim();
  return VISIBLE.test(clean) ? clean : '';
}
