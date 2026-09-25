/** Tiny CSV helper for admin report exports (web download). */
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((cell) => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

/** Parse CSV text → rows of cells (handles quotes, escaped "", CRLF). */
export function parseCsv(text: string): string[][] {
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Web file picker → resolves the chosen .csv file's text (null if cancelled/off-web). */
export function pickCsvFile(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,text/csv,text/plain';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) { resolve(null); return; }
      const rd = new FileReader();
      rd.onload = () => resolve(String(rd.result || ''));
      rd.onerror = () => resolve(null);
      rd.readAsText(f);
    };
    inp.click();
  });
}

/** Trigger a browser download of a CSV string (no-op off-web). */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch { return false; }
}
