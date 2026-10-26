/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to allow the `?as=<username>` preview link in production builds. */
  readonly VITE_DEMO_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
