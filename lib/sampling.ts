import type { Persona } from "./persona-store";

export interface SamplingFilters {
  age_min: number;
  age_max: number;
  sample_size: number;
  sex?: string;
  states?: string[];
  occupations?: string[];
}

export function filterPersonas(
  personas: Persona[],
  filters: SamplingFilters
): Persona[] {
  return personas.filter((p) => {
    if (p.age < filters.age_min || p.age > filters.age_max) return false;

    if (filters.sex && p.sex.toLowerCase() !== filters.sex.toLowerCase())
      return false;

    if (filters.states && filters.states.length > 0) {
      if (!filters.states.includes(p.state)) return false;
    }

    if (filters.occupations && filters.occupations.length > 0) {
      const pOcc = p.occupation.toLowerCase();
      const match = filters.occupations.some(
        (o) =>
          pOcc.includes(o.toLowerCase()) || o.toLowerCase().includes(pOcc)
      );
      if (!match) return false;
    }

    return true;
  });
}

export function sampleFromCandidates(
  candidates: Persona[],
  n: number
): Persona[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= n) return shuffle([...candidates]);

  // Stratify by state so map coverage is good
  const byState = new Map<string, Persona[]>();
  for (const p of candidates) {
    if (!byState.has(p.state)) byState.set(p.state, []);
    byState.get(p.state)!.push(p);
  }

  const states = Array.from(byState.keys());
  const perState = Math.max(1, Math.floor(n / states.length));
  const sampled: Persona[] = [];

  for (const state of states) {
    const pool = shuffle([...byState.get(state)!]);
    sampled.push(...pool.slice(0, perState));
  }

  // Fill remainder
  if (sampled.length < n) {
    const uuids = new Set(sampled.map((p) => p.uuid));
    const rest = shuffle(candidates.filter((p) => !uuids.has(p.uuid)));
    sampled.push(...rest.slice(0, n - sampled.length));
  }

  return shuffle(sampled).slice(0, n);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
