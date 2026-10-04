// "Product deleted · Undo" (owner Step 60): the edit screen records the deleted product and
// goes back; the Shop tab shows the snackbar for ~5 seconds. The server keeps the restore
// open for 10 minutes (PRODUCT_UNDO_MINUTES), so a slow tap still works.

export const UNDO_SECONDS = 5;

export interface Deleted {
  id: string;
  name: string;
  at: number;
}

let pending: Deleted | null = null;
const listeners = new Set<(deleted: Deleted | null) => void>();

export function announceDeleted(id: string, name: string) {
  pending = { id, name, at: Date.now() };
  for (const listener of listeners) listener(pending);
}

export function clearDeleted() {
  pending = null;
  for (const listener of listeners) listener(null);
}

export function currentDeleted(): Deleted | null {
  return pending && Date.now() - pending.at < UNDO_SECONDS * 1000 ? pending : null;
}

export function onDeleted(listener: (deleted: Deleted | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
