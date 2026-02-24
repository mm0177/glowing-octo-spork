export interface ModelOption {
  id: string;
  label: string;
  provider: "groq";
  available: boolean;
}

// Groq-hosted model catalogue
// See https://console.groq.com/docs/models for the latest list
export const MODEL_CATALOG: Omit<ModelOption, "available">[] = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", provider: "groq" },
  { id: "llama-3.1-8b-instant",    label: "Llama 3.1 8B Instant (Groq)", provider: "groq" },
  { id: "gemma2-9b-it",            label: "Gemma 2 9B (Groq)", provider: "groq" },
  { id: "mixtral-8x7b-32768",      label: "Mixtral 8×7B (Groq)", provider: "groq" },
];

export function getAvailableModelOptions(groqApiKey?: string): ModelOption[] {
  return MODEL_CATALOG.map((m) => ({
    ...m,
    available: Boolean(groqApiKey),
  }));
}

export function getDefaultModelId(): string {
  return "llama-3.3-70b-versatile";
}

export function getModelOption(id: string): ModelOption {
  const entry = MODEL_CATALOG.find((m) => m.id === id) ?? MODEL_CATALOG[0]!;
  return { ...entry, available: true };
}
