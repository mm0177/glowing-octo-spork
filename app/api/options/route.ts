import { NextResponse } from "next/server";
import { getAvailableModelOptions, getDefaultModelId } from "@/lib/model-catalog";
import { getPersonaStore } from "@/lib/persona-store";

export async function GET() {
  const groqApiKey = process.env.GROQ_API_KEY;
  const store = getPersonaStore();
  const models = getAvailableModelOptions(groqApiKey);

  const defaultModel =
    models.find((m) => m.id === getDefaultModelId() && m.available)?.id ??
    models.find((m) => m.available)?.id ??
    null;

  return NextResponse.json({
    states: store.states,
    occupations: store.occupations,
    models,
    default_model: defaultModel,
  });
}

// Don't cache — model availability depends on runtime env vars
export const dynamic = "force-dynamic";
