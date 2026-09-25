// Minimal HTML handling for the product rich-text description. Content is
// authored by shops/admins (semi-trusted) and rendered to buyers, so we
// whitelist a small tag set and drop scripts/handlers before rendering.

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'BR', 'UL', 'OL', 'LI', 'H3', 'H4', 'A', 'SPAN', 'DIV']);

/** Strip everything outside the whitelist. Web-only DOM path; falls back to a
 * plain-text conversion where DOMParser isn't available (native). */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') return htmlToPlain(html);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as HTMLElement;
        if (!ALLOWED.has(el.tagName)) {
          const parent = el.parentNode!;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          const keepHref = el.tagName === 'A' && attr.name === 'href' && /^https?:/i.test(attr.value.trim());
          if (!keepHref) el.removeAttribute(attr.name);
        }
        if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
        walk(el);
      } else if (child.nodeType === 8) {
        child.parentNode?.removeChild(child);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Flatten HTML to readable plain text (native fallback + card previews). */
export function htmlToPlain(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when the HTML has any visible text (ignores empty tags/whitespace). */
export function hasRichContent(html?: string): boolean {
  return !!html && htmlToPlain(html).length > 0;
}

/** Coerce a value to renderable/editable HTML. If it's already HTML, keep it;
 * if it's plain text (legacy line-based content), escape it and turn newlines
 * into <br> so it still displays with line breaks. */
export function toHtml(s?: string): string {
  if (!s) return '';
  if (/<[a-z][\s\S]*>/i.test(s)) return s; // already HTML
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\r?\n/g, '<br>');
}
