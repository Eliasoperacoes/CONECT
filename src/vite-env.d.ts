/// <reference types="vite/client" />

/** Variáveis de ambiente do CONECTA, tipadas para o TypeScript conferir. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
