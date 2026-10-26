const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

const NAMES = {
  Mod: mac ? '⌘' : 'Ctrl',
  Alt: mac ? '⌥' : 'Alt',
  Shift: mac ? '⇧' : 'Shift',
  Enter: mac ? '⏎' : 'Enter',
};

/** Label a shortcut for the current platform: k('B') -> "⌘B" on a Mac, "Ctrl+B" elsewhere. */
export function k(...keys) {
  const parts = ['Mod', ...keys].map((x) => NAMES[x] || x);
  return mac ? parts.join('') : parts.join('+');
}

/** True while the user is typing somewhere a bare-key shortcut like `?` must not fire. */
export function isTyping(target) {
  if (!target || !target.closest) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"], .xterm, .cm-editor');
}
