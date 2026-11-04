export interface SavedTreasury {
  id: string;
  name: string;
}

/** The part of `localStorage` this module uses, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "treasury-app:treasuries";

function browserStore(): KeyValueStore | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    // Some browsers throw when storage is blocked.
    return undefined;
  }
}

/** Treasuries this browser has opened or created. Never throws. */
export function loadSaved(store: KeyValueStore | undefined = browserStore()): SavedTreasury[] {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedTreasury =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SavedTreasury).id === "string" &&
        typeof (item as SavedTreasury).name === "string",
    );
  } catch {
    return [];
  }
}

/** Add a treasury, or rename it if it is already saved. Returns the new list. */
export function saveTreasury(
  treasury: SavedTreasury,
  store: KeyValueStore | undefined = browserStore(),
): SavedTreasury[] {
  const current = loadSaved(store);
  const others = current.filter((t) => t.id !== treasury.id);
  const next = [...others, treasury];
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the treasury still opens, it just isn't remembered.
  }
  return next;
}

export function removeTreasury(id: string, store: KeyValueStore | undefined = browserStore()): SavedTreasury[] {
  const next = loadSaved(store).filter((t) => t.id !== id);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // See saveTreasury.
  }
  return next;
}
