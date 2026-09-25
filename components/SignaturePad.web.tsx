import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTT } from '@/lib/i18n';

export interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

let counter = 0;

/** Web signature pad — draws on a DOM canvas injected into a nativeID host. */
export default function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const tt = useTT();
  const idRef = useRef(`sig-${++counter}`);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = document.getElementById(idRef.current);
    if (!host || host.querySelector('canvas')) return;
    const W = Math.max(280, host.clientWidth || 320);
    const H = 200;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = '100%';
    canvas.style.height = H + 'px';
    canvas.style.background = '#fff';
    canvas.style.borderRadius = '8px';
    canvas.style.border = '1px solid #d1d5db';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'crosshair';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;
    let last: { x: number; y: number } | null = null;
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (canvas.width / r.width),
        y: (e.clientY - r.top) * (canvas.height / r.height),
      };
    };
    const down = (e: PointerEvent) => { drawing = true; last = pos(e); e.preventDefault(); };
    const move = (e: PointerEvent) => {
      if (!drawing || !last) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      e.preventDefault();
    };
    const up = () => { drawing = false; last = null; };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { host.removeChild(canvas); } catch { /* ignore */ }
    };
  }, []);

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  };
  const save = () => {
    const c = canvasRef.current;
    if (!c) return;
    onSave(c.toDataURL('image/jpeg', 0.9));
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>{tt('signature', '✍️ ເຊັນຮັບ ໃບສະເໜີ')}</Text>
        <Text style={styles.hint}>{tt('signature', 'ໃຊ້ ນິ້ວ / ເມົາສ໌ ເຊັນ ໃນກອບ')}</Text>
        {/* @ts-ignore nativeID host for the DOM canvas */}
        <View nativeID={idRef.current} style={styles.canvasHost} />
        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={clear}><Text style={styles.btnText}>{tt('signature', 'ລຶບ')}</Text></Pressable>
          <Pressable style={styles.btn} onPress={onCancel}><Text style={styles.btnText}>{tt('signature', 'ຍົກເລີກ')}</Text></Pressable>
          <Pressable style={[styles.btn, styles.save]} onPress={save}><Text style={styles.saveText}>{tt('signature', '💾 ບັນທຶກ')}</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 100 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 560 },
  title: { fontSize: 15, fontWeight: '700', color: '#111' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 10 },
  canvasHost: { width: '100%', minHeight: 200 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  btn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  btnText: { color: '#374151', fontWeight: '600', fontSize: 12 },
  save: { backgroundColor: '#0066CC', borderColor: '#0066CC' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
