const STORAGE_KEY = 'cfr_demo_mode';

const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => fn());
}

export function isDemoModeActive(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function setDemoMode(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
  emit();
}

export function subscribeToDemoMode(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
