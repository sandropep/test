import { supabase } from './supabase';

const SIGNED_URL_TTL_SECONDS = 3600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CacheEntry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Returns a storage_path -> signedUrl map, reusing cached URLs for paths that
 * were already signed and aren't close to expiring. Signed URLs otherwise get
 * re-minted with a new token on every call, which defeats Image caching since
 * the URL string (and therefore the cache key) changes every time.
 */
export async function getSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const path of paths) {
    const entry = cache.get(path);
    if (entry && entry.expiresAt - REFRESH_MARGIN_MS > now) {
      result[path] = entry.url;
    } else {
      missing.push(path);
    }
  }

  if (missing.length) {
    const { data } = await supabase.storage
      .from('photos')
      .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);

    const expiresAt = now + SIGNED_URL_TTL_SECONDS * 1000;
    (data ?? []).forEach(s => {
      if (s.signedUrl && s.path) {
        cache.set(s.path, { url: s.signedUrl, expiresAt });
        result[s.path] = s.signedUrl;
      }
    });
  }

  return result;
}
