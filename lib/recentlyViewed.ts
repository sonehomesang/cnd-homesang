import { Platform } from 'react-native';

/** Minimal product snapshot persisted locally for recent / compare. */
export interface MiniProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  image?: string;
  shopName?: string;
  category?: string;
}

const RECENT_KEY = 'hs_recent';
const COMPARE_KEY = 'hs_compare';
const RECENT_MAX = 12;
const COMPARE_MAX = 3;

function read(key: string): MiniProduct[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as MiniProduct[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, list: MiniProduct[]) {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore quota / private mode */
  }
}

// ---- recently viewed ----
export function pushRecent(p: MiniProduct) {
  const list = read(RECENT_KEY).filter((x) => x.id !== p.id);
  list.unshift(p);
  write(RECENT_KEY, list.slice(0, RECENT_MAX));
}

export function getRecent(): MiniProduct[] {
  return read(RECENT_KEY);
}

// ---- compare ----
export function getCompare(): MiniProduct[] {
  return read(COMPARE_KEY);
}

export function inCompare(id: string): boolean {
  return read(COMPARE_KEY).some((x) => x.id === id);
}

/** Toggle a product in the compare list (max 3). Returns the new list. */
export function toggleCompare(p: MiniProduct): MiniProduct[] {
  const list = read(COMPARE_KEY);
  const exists = list.some((x) => x.id === p.id);
  const next = exists ? list.filter((x) => x.id !== p.id) : [...list, p].slice(0, COMPARE_MAX);
  write(COMPARE_KEY, next);
  return next;
}

export function clearCompare() {
  write(COMPARE_KEY, []);
}
