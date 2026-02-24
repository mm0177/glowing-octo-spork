import Groq from "groq-sdk";
import type { Persona } from "./persona-store";

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface PersonaReply {
  answer: string;
  reasoning: string;
  sentiment: SentimentLabel;
  confidence: number;
}

function buildSystemPrompt(persona: Persona): string {
  // Extract a concise identity from the persona description
  const identity = persona.persona
    ? persona.persona.slice(0, 120).replace(/\s+/g, " ").trim()
    : `a ${persona.age}-year-old ${persona.sex} ${persona.occupation}`;

  return `You are ${identity}. You are ${persona.age} years old, ${persona.sex.toLowerCase()}, working as ${persona.occupation}, living in ${persona.state}, India.

Education: ${persona.education_level || "Not specified"}
Marital status: ${persona.marital_status || "Not specified"}
Cultural background: ${persona.cultural_background || "Not specified"}
Skills: ${persona.skills_and_expertise || "Not specified"}
Hobbies: ${persona.hobbies_and_interests || "Not specified"}
Life goals: ${persona.career_goals_and_ambitions || "Not specified"}

Respond to the question authentically as this person. Be natural and brief (2-3 sentences). Stay true to your background, values, and lived experience in ${persona.state}.

After your response, on a new line output exactly:
SENTIMENT: <positive|neutral|negative> CONFIDENCE: <0.0-1.0> REASONING: <one sentence>`;
}

function parseSentimentLine(raw: string): {
  answer: string;
  sentiment: SentimentLabel;
  confidence: number;
  reasoning: string;
} {
  const sentimentIdx = raw.search(/\nSENTIMENT:/i);
  const answer = (
    sentimentIdx > -1 ? raw.slice(0, sentimentIdx) : raw
  ).trim();

  const sentimentMatch = raw.match(/SENTIMENT:\s*(positive|neutral|negative)/i);
  const confidenceMatch = raw.match(/CONFIDENCE:\s*([0-9.]+)/i);
  const reasoningMatch = raw.match(/REASONING:\s*(.+)/i);

  const sentiment =
    ((sentimentMatch?.[1]?.toLowerCase() ?? "neutral") as SentimentLabel) ||
    "neutral";

  const confidence = confidenceMatch
    ? Math.min(1, Math.max(0, parseFloat(confidenceMatch[1]!)))
    : 0.7;

  return {
    answer: answer || raw.trim(),
    sentiment,
    confidence,
    reasoning: reasoningMatch?.[1]?.trim() ?? "",
  };
}

export async function generatePersonaReply({
  apiKey,
  question,
  persona,
  model,
}: {
  apiKey: string;
  question: string;
  persona: Persona;
  model: string;
}): Promise<PersonaReply> {
  const client = new Groq({ apiKey });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(persona) },
      { role: "user", content: question },
    ],
    temperature: 0.85,
    max_tokens: 300,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const parsed = parseSentimentLine(raw);

  return {
    answer: parsed.answer,
    reasoning: parsed.reasoning,
    sentiment: parsed.sentiment,
    confidence: parsed.confidence,
  };
}
