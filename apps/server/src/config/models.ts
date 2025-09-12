// apps/server/src/config/models.ts
export type ModelInfo = { id: string; name: string };

export const MODEL_CATALOG: ReadonlyArray<ModelInfo> = [
  { id: 'anthropic.claude-sonnet-4-20250514-v1:0',  name: 'Claude 4 Sonnet' },
  { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet' },
  { id: 'anthropic.claude-3-haiku-20240307-v1:0',    name: 'Claude 3 Haiku' },
  { id: 'meta.llama-3.1-405b-instruct-v1:0',         name: 'Llama 3.1 405B' },
];

export const SUPPORTED_MODEL_IDS: ReadonlySet<string> = new Set(
  MODEL_CATALOG.map((m) => m.id)
);  