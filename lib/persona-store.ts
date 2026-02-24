import fs from "fs";
import path from "path";

export interface Persona {
  uuid: string;
  age: number;
  sex: string;
  occupation: string;
  education_level: string;
  marital_status: string;
  state: string;
  district: string;
  persona: string;
  cultural_background: string;
  skills_and_expertise: string;
  hobbies_and_interests: string;
  career_goals_and_ambitions: string;
}

interface PersonaStore {
  personas: Persona[];
  byState: Map<string, Persona[]>;
  states: string[];
  occupations: string[];
}

let _store: PersonaStore | null = null;

export function getPersonaStore(): PersonaStore {
  if (_store) return _store;

  const filePath = path.join(
    process.cwd(),
    "public",
    "data",
    "personas.compact.india.json"
  );

  if (!fs.existsSync(filePath)) {
    console.warn(
      "[persona-store] personas.compact.india.json not found. " +
        "Run: python scripts/prepare_personas_india.py"
    );
    _store = {
      personas: [],
      byState: new Map(),
      states: [],
      occupations: [],
    };
    return _store;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as { personas: Persona[] };
  const personas = data.personas;

  const byState = new Map<string, Persona[]>();
  const stateSet = new Set<string>();
  const occupationSet = new Set<string>();

  for (const p of personas) {
    if (!byState.has(p.state)) byState.set(p.state, []);
    byState.get(p.state)!.push(p);
    stateSet.add(p.state);
    if (p.occupation) occupationSet.add(p.occupation);
  }

  _store = {
    personas,
    byState,
    states: Array.from(stateSet).sort(),
    occupations: Array.from(occupationSet).sort(),
  };

  console.log(
    `[persona-store] Loaded ${personas.length.toLocaleString()} personas ` +
      `across ${_store.states.length} states.`
  );

  return _store;
}
