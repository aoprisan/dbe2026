/**
 * Copy text to the clipboard, with the old `execCommand` path behind the modern
 * one. The Clipboard API is missing or blocked often enough on the phones this
 * app runs on — an insecure origin, an older iOS, a permission prompt the user
 * dismissed — that the fallback is not decoration.
 *
 * Returns whether the text actually made it, so callers can say so on the
 * button rather than claiming a copy that never happened.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy copy */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
