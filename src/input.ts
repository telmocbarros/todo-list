/** Size limits for request input. String lengths count characters (code points), not bytes. */
export const LIMITS = {
  titleLength: 200,
  descriptionLength: 5000,
  labelNameLength: 50,
  labelsPerTodo: 50,
  idLength: 64,
  bodyBytes: 64 * 1024,
  emailLength: 254,
  usernameMinLength: 3,
  usernameMaxLength: 32,
  personNameLength: 100,
  passwordMinLength: 12,
  // An upper bound stops a huge password from making argon2 burn memory and CPU
  passwordMaxLength: 128,
} as const;

// JSON Schema `pattern`s, matched as Unicode regular expressions.
/** One line of text with at least one visible character: no control characters at all, line breaks included. */
export const SINGLE_LINE_TEXT = '^(?=.*\\S)[^\\p{Cc}]+$';
/** Free text that may span lines: tabs and line breaks are fine, other control characters are not. */
export const MULTI_LINE_TEXT = '^[\\n\\r\\t\\P{Cc}]*$';
/** Letters in any script (with their accents), digits, dot, dash and underscore. No spaces. */
export const USERNAME = '^[\\p{L}\\p{M}\\p{N}._-]+$';

/**
 * Canonical Unicode form (NFC), so "é" typed as one character or as "e" plus an accent is the same text.
 * Without it, unique-name checks can be bypassed with look-alike spellings.
 */
export const normalizeText = (text: string): string => text.normalize('NFC');

/** Normalized and trimmed, for single-line values such as titles and names. */
export const cleanText = (text: string): string => normalizeText(text).trim();
