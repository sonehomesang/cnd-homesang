import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp,
  setDoc, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_FLAG, stampMock } from './mock';

/**
 * Technician verification quiz. Admin builds the question bank
 * (`techQuizQuestions`, holds the correct answer) referencing standards (NFPA…).
 * A PUBLIC projection (`techQuizPublic`) carries the question + options but NEVER
 * the correct answer, so an applicant can take the quiz without seeing (or
 * self-scoring) the answers. The applicant submits their answers to
 * `techQuizAttempts/{uid}`; the score is computed on the ADMIN side (who can read
 * the answers) inside the assessment — so the test can't be gamed, no Cloud
 * Function needed.
 */
export interface TechQuizQuestion {
  id: string;
  trade?: string;
  question: string;
  options: string[];
  correctIndex: number;
  standard?: string;
  active: boolean;
  order?: number;
  __mock?: boolean;
}
export type PublicQuizQuestion = Omit<TechQuizQuestion, 'correctIndex'>;

function ms(v: any): number { return v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : 0; }
function strip<T extends object>(o: T): T { const out: any = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') out[k] = v; return out; }

// ── admin: full question bank ────────────────────────────────────────────────
export function watchQuizQuestions(cb: (q: TechQuizQuestion[]) => void) {
  return onSnapshot(query(collection(db, 'techQuizQuestions')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TechQuizQuestion)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
    (e) => { console.error('watchQuizQuestions:', e); cb([]); });
}

export interface QuizInput { trade?: string; question: string; options: string[]; correctIndex: number; standard?: string; }

/** Write the private question AND its answer-free public projection (same id). */
export async function createQuizQuestion(t: QuizInput): Promise<string> {
  const ref = doc(collection(db, 'techQuizQuestions'));
  const opts = t.options.filter((o) => o.trim());
  const priv = strip({ trade: t.trade, question: t.question.trim(), options: opts, correctIndex: Math.min(t.correctIndex, opts.length - 1), standard: t.standard, active: true, order: Date.now(), createdAt: serverTimestamp() });
  const pub = strip({ trade: t.trade, question: t.question.trim(), options: opts, standard: t.standard, active: true, order: Date.now() });
  const b = writeBatch(db);
  b.set(ref, priv);
  b.set(doc(db, 'techQuizPublic', ref.id), pub);
  await b.commit();
  return ref.id;
}

export async function updateQuizQuestion(id: string, t: QuizInput & { active?: boolean }) {
  const opts = t.options.filter((o) => o.trim());
  const b = writeBatch(db);
  b.update(doc(db, 'techQuizQuestions', id), strip({ trade: t.trade, question: t.question.trim(), options: opts, correctIndex: Math.min(t.correctIndex, opts.length - 1), standard: t.standard, active: t.active }) as any);
  b.set(doc(db, 'techQuizPublic', id), strip({ trade: t.trade, question: t.question.trim(), options: opts, standard: t.standard, active: t.active !== false }), { merge: true });
  await b.commit();
}

export async function setQuizActive(id: string, active: boolean) {
  const b = writeBatch(db);
  b.update(doc(db, 'techQuizQuestions', id), { active });
  b.update(doc(db, 'techQuizPublic', id), { active });
  await b.commit();
}

export async function deleteQuizQuestion(id: string) {
  const b = writeBatch(db);
  b.delete(doc(db, 'techQuizQuestions', id));
  b.delete(doc(db, 'techQuizPublic', id));
  await b.commit();
}

export async function seedQuizIfEmpty(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'techQuizQuestions')));
  if (!snap.empty) return 0;
  const rows: QuizInput[] = [
    { trade: 'ໄຟຟ້າ', question: 'ກ່ອນ ແຕະ ສາຍ ໄຟ ຕ້ອງ ເຮັດ ຫຍັງ ກ່ອນ?', options: ['ຕັດ ໄຟ + ວັດ ວ່າ ບໍ່ ມີ ໄຟ', 'ໃສ່ ຖົງ ມື ຢ່າງ ດຽວ', 'ແຕະ ເລີຍ ຖ້າ ຟ້າວ'], correctIndex: 0, standard: 'NFPA 70E' },
    { trade: 'ໄຟຟ້າ', question: 'ຖັງ ດັບ ເພີງ ປະ ເພດ ໃດ ໃຊ້ ກັບ ໄຟ ໄຟຟ້າ?', options: ['ປະ ເພດ A', 'ປະ ເພດ C', 'ນ້ຳ ທຳ ມະ ດາ'], correctIndex: 1, standard: 'NFPA 10' },
    { trade: 'ປະປາ', question: 'ທໍ່ ນ້ຳ ຮົ່ວ ຄວນ ປິດ ຫຍັງ ກ່ອນ?', options: ['ວາວ ນ້ຳ ຫຼັກ', 'ໄຟ ບ້ານ', 'ບໍ່ ຕ້ອງ ປິດ'], correctIndex: 0 },
  ];
  for (const r of rows) {
    const ref = doc(collection(db, 'techQuizQuestions'));
    const b = writeBatch(db);
    b.set(ref, stampMock(strip({ ...r, active: true, order: Date.now(), createdAt: serverTimestamp() })));
    b.set(doc(db, 'techQuizPublic', ref.id), stampMock(strip({ trade: r.trade, question: r.question, options: r.options, standard: r.standard, active: true, order: Date.now() })));
    await b.commit();
  }
  return rows.length;
}

export async function clearMockQuiz(): Promise<number> {
  const snap = await getDocs(query(collection(db, 'techQuizQuestions'), where(MOCK_FLAG, '==', true)));
  const b = writeBatch(db);
  snap.docs.forEach((d) => { b.delete(d.ref); b.delete(doc(db, 'techQuizPublic', d.id)); });
  await b.commit();
  return snap.size;
}

// ── applicant: take the quiz (answer-free public questions) ───────────────────
export function watchPublicQuiz(trade: string | undefined, cb: (q: PublicQuizQuestion[]) => void) {
  return onSnapshot(query(collection(db, 'techQuizPublic')),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as PublicQuizQuestion))
      .filter((q) => q.active !== false && (!trade || !q.trade || q.trade === trade))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
    (e) => { console.error('watchPublicQuiz:', e); cb([]); });
}

export interface QuizAttempt { uid: string; answers: number[]; questionIds: string[]; trade?: string; submittedAt: number; }

export async function submitQuizAttempt(uid: string, a: { answers: number[]; questionIds: string[]; trade?: string }) {
  await setDoc(doc(db, 'techQuizAttempts', uid), strip({ uid, answers: a.answers, questionIds: a.questionIds, trade: a.trade, submittedAt: serverTimestamp() }), { merge: true });
}

export function watchMyAttempt(uid: string, cb: (a: QuizAttempt | null) => void) {
  return onSnapshot(doc(db, 'techQuizAttempts', uid),
    (s) => cb(s.exists() ? ({ uid: s.id, ...(s.data() as any), submittedAt: ms((s.data() as any).submittedAt) } as QuizAttempt) : null),
    () => cb(null));
}

// ── admin: grade an applicant's attempt (reads the answers → score) ───────────
export async function gradeAttempt(uid: string): Promise<{ score: number; correct: number; total: number } | null> {
  const attSnap = await getDoc(doc(db, 'techQuizAttempts', uid));
  if (!attSnap.exists()) return null;
  const att = attSnap.data() as any;
  const qids: string[] = att.questionIds ?? [];
  const answers: number[] = att.answers ?? [];
  if (!qids.length) return null;
  const qSnaps = await Promise.all(qids.map((id) => getDoc(doc(db, 'techQuizQuestions', id))));
  let correct = 0;
  qSnaps.forEach((s, i) => { if (s.exists() && (s.data() as any).correctIndex === answers[i]) correct++; });
  const total = qids.length;
  return { score: Math.round((correct / total) * 100), correct, total };
}
