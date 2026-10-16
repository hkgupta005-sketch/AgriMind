/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin, e.g. https://agrimind-api-u7f6.onrender.com (empty = same origin / Vite proxy) */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
