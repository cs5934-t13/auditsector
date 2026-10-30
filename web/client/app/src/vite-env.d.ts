/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Add optional VITE_* variables here when the app needs them.
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
