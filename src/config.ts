/**
 * Runtime config. Override at build time with VITE_* env vars, or at runtime by defining
 * `window.UNSTIR_CONFIG = {...}` before the app script runs.
 */
export interface UnstirConfig {
  publicUrl: string; // canonical URL for share/challenge links ('' = current page)
  features: {
    premium: boolean; // UNSTIR+ upsell: full archive of past pictures
    ads: boolean; // ad slot on the results sheet
  };
}
declare global {
  interface Window {
    UNSTIR_CONFIG?: Partial<UnstirConfig>;
  }
}
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const runtime = (typeof window !== 'undefined' && window.UNSTIR_CONFIG) || {};
export const CONFIG: UnstirConfig = {
  publicUrl: runtime.publicUrl ?? env.VITE_PUBLIC_URL ?? '',
  features: {
    premium: runtime.features?.premium ?? env.VITE_FEATURE_PREMIUM !== '0',
    ads: runtime.features?.ads ?? env.VITE_FEATURE_ADS !== '0',
  },
};
export function baseUrl(): string {
  if (CONFIG.publicUrl) return CONFIG.publicUrl.replace(/#.*$/, '');
  if (typeof location === 'undefined' || location.protocol === 'file:') return 'https://unstir.app/';
  return location.href.replace(/[?#].*$/, '');
}
