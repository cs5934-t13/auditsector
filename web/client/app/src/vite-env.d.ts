/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the dev server proxies `/api`. Defaults to the running pod's nginx
   * at `http://localhost:8080` (see `vite.config.ts`).
   */
  readonly VITE_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
