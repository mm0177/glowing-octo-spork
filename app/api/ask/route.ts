import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { NextRequest, NextResponse } from "next/server";
import { generatePersonaReply, type SentimentLabel } from "@/lib/groq-llm";
import {
  getAvailableModelOptions,
  getModelOption,
  getDefaultModelId,
} from "@/lib/model-catalog";
import { getPersonaStore } from "@/lib/persona-store";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { filterPersonas, sampleFromCandidates } from "@/lib/sampling";
import { AskRequestSchema } from "@/lib/schemas";
import { aggregateSentiment } from "@/lib/sentiment";

const MAX_CONCURRENCY = 8;

interface PersonaResult {
  uuid: string;
  state: string;
  profile: {
    age: number;
    sex: string;
    occupation: string;
    education_level: string;
  };
  answer: string;
  reasoning: string;
  sentiment: SentimentLabel;
  confidence: number;
}

function minimumRequired(total: number): number {
  return Math.max(3, Math.min(5, Math.ceil(total * 0.2)));
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  try {
    // Rate limiting
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment.", request_id: requestId },
        { status: 429 }
      );
    }

    // Parse + validate body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body.", request_id: requestId },
        { status: 400 }
      );
    }

    const parsed = AskRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request.", request_id: requestId },
        { status: 400 }
      );
    }

    const body = parsed.data;

    // Check API key
    const groqApiKey = process.env.GROQ_API_KEY;
    const availableModels = getAvailableModelOptions(groqApiKey);

    if (!groqApiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured on the server.", request_id: requestId },
        { status: 500 }
      );
    }

    // Resolve model
    const model = body.model ?? getDefaultModelId();
    const isModelAvailable = availableModels.some((m) => m.id === model && m.available);
    if (!isModelAvailable) {
      return NextResponse.json(
        {
          error: `Model "${model}" is not available.`,
          available_models: availableModels.filter((m) => m.available).map((m) => m.id),
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    // Load personas
    const store = getPersonaStore();
    const ageMin = Math.min(body.age_min, body.age_max);
    const ageMax = Math.max(body.age_min, body.age_max);

    const filters = {
      age_min: ageMin,
      age_max: ageMax,
      sample_size: body.sample_size,
      sex: body.sex?.trim() || undefined,
      states:
        body.states && body.states.length > 0
          ? [...new Set(body.states.map((s) => s.trim()).filter(Boolean))]
          : undefined,
      occupations:
        body.occupations && body.occupations.length > 0
          ? [...new Set(body.occupations.map((o) => o.trim()).filter(Boolean))]
          : undefined,
    };

    const candidates = filterPersonas(store.personas, filters);
    const sampled = sampleFromCandidates(
      candidates,
      Math.min(filters.sample_size, candidates.length)
    );

    if (sampled.length === 0) {
      return NextResponse.json(
        {
          error: "No personas match these filters. Try widening the cohort criteria.",
          request_id: requestId,
        },
        { status: 404 }
      );
    }

    // Fire parallel LLM calls
    const limit = pLimit(MAX_CONCURRENCY);
    const modelOption = getModelOption(model);

    const settled = await Promise.allSettled(
      sampled.map((persona) =>
        limit(async (): Promise<PersonaResult> => {
          const reply = await generatePersonaReply({
            apiKey: groqApiKey,
            question: body.question,
            persona,
            model: modelOption.id,
          });
          return {
            uuid: persona.uuid,
            state: persona.state,
            profile: {
              age: persona.age,
              sex: persona.sex,
              occupation: persona.occupation,
              education_level: persona.education_level,
            },
            answer: reply.answer,
            reasoning: reply.reasoning,
            sentiment: reply.sentiment,
            confidence: reply.confidence,
          };
        })
      )
    );

    const responses: PersonaResult[] = settled
      .filter((r): r is PromiseFulfilledResult<PersonaResult> => r.status === "fulfilled")
      .map((r) => r.value);

    const minRequired = minimumRequired(sampled.length);
    if (responses.length < minRequired) {
      return NextResponse.json(
        {
          error: "Too many model responses failed. Please try again.",
          request_id: requestId,
        },
        { status: 502 }
      );
    }

    // Aggregate
    const state_sentiments = aggregateSentiment(
      responses.map((r) => ({ state: r.state, sentiment: r.sentiment }))
    );

    const positive = responses.filter((r) => r.sentiment === "positive").length;
    const negative = responses.filter((r) => r.sentiment === "negative").length;

    return NextResponse.json(
      {
        responses,
        state_sentiments,
        summary: {
          total: responses.length,
          positive,
          neutral: responses.length - positive - negative,
          negative,
        },
        request_id: requestId,
      },
      { status: 200, headers: { "X-Request-Id": requestId } }
    );
  } catch (err) {
    console.error("[/api/ask] unhandled error", err);
    return NextResponse.json(
      { error: "Internal server error.", request_id: requestId },
      { status: 500 }
    );
  }
}
