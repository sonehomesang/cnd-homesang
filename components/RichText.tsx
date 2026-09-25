import { useEffect } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { htmlToPlain, sanitizeHtml, toHtml } from '@/lib/richtext';

const CSS = `
.hs-rt{font-size:14px;line-height:22px;color:#374151;}
.hs-rt h3,.hs-rt h4{font-size:14px;font-weight:700;color:#111;margin:10px 0 4px;}
.hs-rt p{margin:0 0 8px;}
.hs-rt ul,.hs-rt ol{margin:6px 0 10px 18px;}
.hs-rt li{margin-bottom:3px;}
.hs-rt b,.hs-rt strong{color:#111;}
.hs-rt a{color:#0066CC;text-decoration:underline;}
`;

/** Render a rich-text HTML string. Web: sanitized HTML with list/heading
 * styling; native: flattened plain text. */
export default function RichText({ html, style }: { html: string; style?: any }) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('hs-rt-style')) return;
    const s = document.createElement('style');
    s.id = 'hs-rt-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);

  if (Platform.OS === 'web') {
    return <div className="hs-rt" dangerouslySetInnerHTML={{ __html: sanitizeHtml(toHtml(html)) }} /> as any;
  }
  return <Text style={[styles.plain, style]}>{htmlToPlain(html)}</Text>;
}

const styles = StyleSheet.create({
  plain: { fontSize: 14, lineHeight: 22, color: '#374151' },
});
