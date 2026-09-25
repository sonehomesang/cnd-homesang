import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { ttKey } from '../i18n';
import { CND_MOJIBAKE_FIXES } from './mojibakeFixes';

/**
 * ONE-TIME migration after Thai-in-Lao mojibake was cleaned from the CND tt()
 * source strings. Translation overrides are keyed by `page.slug(source)`, so
 * changing a source string changes its key — any override the owner saved under
 * the OLD (mojibake) key would be orphaned. This copies each old override to the
 * NEW (clean) key and deletes the stale old doc, so NO translation is lost.
 *
 * Idempotent: re-running finds nothing to move. Never overwrites a translation
 * that already exists on the new key.
 */
export async function migrateCndMojibake(): Promise<{ moved: number; skipped: number }> {
  // 1) read phase — find old keys that have an override and whose new key is free
  const todo: { newKey: string; oldKey: string; data: any }[] = [];
  let skipped = 0;
  for (const fx of CND_MOJIBAKE_FIXES) {
    const oldKey = ttKey(fx.page, fx.from);
    const newKey = ttKey(fx.page, fx.to);
    if (oldKey === newKey) { skipped++; continue; }
    const oldSnap = await getDoc(doc(db, 'translations', oldKey));
    if (!oldSnap.exists()) { skipped++; continue; }          // nothing translated under old key
    const newSnap = await getDoc(doc(db, 'translations', newKey));
    if (newSnap.exists()) { skipped++; continue; }           // keep an existing new-key translation
    todo.push({ newKey, oldKey, data: oldSnap.data() });
  }
  // 2) write phase — chunked batches (each move = 2 ops; stay under the 500 cap)
  for (let i = 0; i < todo.length; i += 200) {
    const batch = writeBatch(db);
    for (const t of todo.slice(i, i + 200)) {
      batch.set(doc(db, 'translations', t.newKey), { ...t.data, updatedAt: Date.now() });
      batch.delete(doc(db, 'translations', t.oldKey));
    }
    await batch.commit();
  }
  return { moved: todo.length, skipped };
}
