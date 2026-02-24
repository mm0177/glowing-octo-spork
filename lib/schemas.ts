import { z } from "zod";

export const AskRequestSchema = z.object({
  question: z.string().min(1).max(280),
  age_min: z.number().int().min(18).max(120).default(18),
  age_max: z.number().int().min(18).max(120).default(80),
  sample_size: z.number().int().min(5).max(100).default(30),
  sex: z.string().optional(),
  states: z.array(z.string()).optional(),
  occupations: z.array(z.string()).optional(),
  model: z.string().optional(),
});

export type AskRequest = z.infer<typeof AskRequestSchema>;

export const PersonaResponseSchema = z.object({
  uuid: z.string(),
  state: z.string(),
  profile: z.object({
    age: z.number(),
    sex: z.string(),
    occupation: z.string(),
    education_level: z.string().optional(),
  }),
  answer: z.string(),
  reasoning: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  confidence: z.number().min(0).max(1),
});

export type PersonaResponse = z.infer<typeof PersonaResponseSchema>;

export const StateSentimentSchema = z.object({
  positive: z.number(),
  neutral: z.number(),
  negative: z.number(),
  dominant: z.enum(["positive", "neutral", "negative"]),
  score: z.number(), // -1 (all negative) to 1 (all positive)
});

export type StateSentiment = z.infer<typeof StateSentimentSchema>;

export const AskResponseSchema = z.object({
  responses: z.array(PersonaResponseSchema),
  state_sentiments: z.record(z.string(), StateSentimentSchema),
  summary: z.object({
    total: z.number(),
    positive: z.number(),
    neutral: z.number(),
    negative: z.number(),
  }),
  request_id: z.string(),
});

export type AskResponse = z.infer<typeof AskResponseSchema>;
