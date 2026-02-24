import type { SentimentLabel } from "./groq-llm";
import type { StateSentiment } from "./schemas";

export function aggregateSentiment(
  responses: Array<{ state: string; sentiment: SentimentLabel }>
): Record<string, StateSentiment> {
  const byState = new Map<
    string,
    { positive: number; neutral: number; negative: number }
  >();

  for (const r of responses) {
    if (!byState.has(r.state))
      byState.set(r.state, { positive: 0, neutral: 0, negative: 0 });
    byState.get(r.state)![r.sentiment]++;
  }

  const result: Record<string, StateSentiment> = {};

  for (const [state, counts] of byState.entries()) {
    const total = counts.positive + counts.neutral + counts.negative;
    const score = total > 0 ? (counts.positive - counts.negative) / total : 0;

    let dominant: SentimentLabel = "neutral";
    if (
      counts.positive >= counts.negative &&
      counts.positive >= counts.neutral
    ) {
      dominant = "positive";
    } else if (
      counts.negative >= counts.positive &&
      counts.negative >= counts.neutral
    ) {
      dominant = "negative";
    }

    result[state] = { ...counts, dominant, score };
  }

  return result;
}
