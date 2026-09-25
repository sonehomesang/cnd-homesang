import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { sanitizeHtml, toHtml } from '@/lib/richtext';

/** Rich-text editor for product descriptions. Web: a contentEditable box with a
 * small formatting toolbar (bold/italic/underline/heading/lists), emitting
 * sanitized HTML. Native: a plain multiline field storing the same string. */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (!document.getElementById('hs-rte-style')) {
      const s = document.createElement('style');
      s.id = 'hs-rte-style';
      s.textContent = `.hs-rte:empty:before{content:attr(data-ph);color:#9ca3af;}
        .hs-rte ul,.hs-rte ol{margin:4px 0 8px 18px;} .hs-rte h3{font-size:15px;font-weight:700;margin:6px 0 3px;}`;
      document.head.appendChild(s);
    }
    // seed initial content once (uncontrolled thereafter to preserve the caret);
    // coerce legacy plain text (with newlines) to HTML so it shows line breaks
    if (ref.current && !ref.current.innerHTML && value) ref.current.innerHTML = toHtml(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        multiline
        style={styles.native}
      />
    );
  }

  const emit = () => { if (ref.current) onChange(sanitizeHtml(ref.current.innerHTML)); };
  const cmd = (c: string, arg?: string) => { document.execCommand(c, false, arg); emit(); };
  const BTNS: { t: string; run: () => void; s?: any }[] = [
    { t: 'B', run: () => cmd('bold'), s: { fontWeight: 800 } },
    { t: 'I', run: () => cmd('italic'), s: { fontStyle: 'italic' } },
    { t: 'U', run: () => cmd('underline'), s: { textDecoration: 'underline' } },
    { t: 'H', run: () => cmd('formatBlock', 'H3') },
    { t: '•', run: () => cmd('insertUnorderedList') },
    { t: '1.', run: () => cmd('insertOrderedList') },
    { t: '⨯', run: () => cmd('removeFormat') },
  ];
  const tb: any = { width: 34, height: 30, border: '1px solid #e5e7eb', background: '#fff', borderRadius: 6, fontSize: 13, cursor: 'pointer', color: '#111' };
  return (
    <div>
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', border: '1px solid #d1d5db', borderBottom: 'none', borderRadius: '8px 8px 0 0', padding: 6, background: '#f8fafc' }}>
        {BTNS.map((b) => (
          <button key={b.t} type="button" onMouseDown={(e) => { e.preventDefault(); b.run(); }} style={{ ...tb, ...(b.s || {}) }}>{b.t}</button>
        ))}
      </div>
      <div
        ref={ref}
        className="hs-rte"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={emit}
        onBlur={emit}
        style={{ border: '1px solid #d1d5db', borderRadius: '0 0 8px 8px', padding: 11, minHeight: 110, fontSize: 14, lineHeight: '22px', color: '#111', outline: 'none', background: '#fff' }}
      />
    </div>
  ) as any;
}

const styles = StyleSheet.create({
  native: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 14, color: '#111', backgroundColor: '#fff', minHeight: 110, textAlignVertical: 'top' },
});
