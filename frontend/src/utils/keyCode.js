// Named specials whose event.code doesn't follow a regular family pattern.
const NAMED = {
  ArrowRight: "KEY_RIGHT",
  ArrowLeft: "KEY_LEFT",
  ArrowUp: "KEY_UP",
  ArrowDown: "KEY_DOWN",
  Space: "KEY_SPACE",
  Enter: "KEY_ENTER",
  Escape: "KEY_ESCAPE",
  Home: "KEY_HOME",
  End: "KEY_END",
  PageUp: "KEY_PAGEUP",
  PageDown: "KEY_PAGEDOWN",
  Backspace: "KEY_BACKSPACE",
  Tab: "KEY_TAB",
  Delete: "KEY_DELETE",
  Insert: "KEY_INSERT",
};

/**
 * Normalize a browser KeyboardEvent to Calvin's KEY_* code.
 * Shared by runtime resolution (KeyboardHandler) and press-to-capture so
 * stored and resolved codes always match.
 * @param {{code?: string, key?: string}} event
 * @returns {string}
 */
export function normalizeKeyCode(event) {
  const code = event?.code || event?.key || "";
  if (NAMED[code]) return NAMED[code];

  const digit = code.match(/^Digit(\d)$/);
  if (digit) return `KEY_${digit[1]}`;

  const numpad = code.match(/^Numpad(\d)$/);
  if (numpad) return `KEY_${numpad[1]}`;

  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return `KEY_${letter[1]}`;

  const fkey = code.match(/^F(\d{1,2})$/);
  if (fkey) return `KEY_F${fkey[1]}`;

  // Fallback: uppercase the raw code into KEY_ form (e.g. Comma -> KEY_COMMA).
  return `KEY_${code.toUpperCase()}`;
}

/**
 * Human-friendly label for a Calvin KEY_* code (strips the KEY_ prefix).
 * Single source of truth shared by the keyboard binding tiles and the
 * reboot-combo picker so both render keys the same way.
 * @param {string} code
 * @returns {string}
 */
export function formatKeyLabel(code) {
  if (!code) return "";
  return String(code).replace(/^KEY_/, "");
}
