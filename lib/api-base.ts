export const HOST_STORAGE_KEY = 'sabacc:serverUrl';

export function normalizeBaseUrl(raw?: string | null): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

export function getConfiguredServerUrl(): string {
  if (process.env.NEXT_PUBLIC_SERVER_URL) {
    return normalizeBaseUrl(process.env.NEXT_PUBLIC_SERVER_URL);
  }
  if (typeof window === 'undefined') return '';
  try {
    return normalizeBaseUrl(window.localStorage.getItem(HOST_STORAGE_KEY));
  } catch {
    return '';
  }
}

export function apiUrl(path: string): string {
  const base = getConfiguredServerUrl();
  return base ? `${base}${path}` : path;
}

export function isLoopbackOrPackagedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return !h || h === 'localhost' || h === '127.0.0.1' || h === '::1';
}
