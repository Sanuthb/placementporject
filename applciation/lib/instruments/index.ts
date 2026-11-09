import type { Instrument } from "@/lib/instruments/types";
import { RIASEC } from "@/lib/instruments/riasec";
import { BEHAVIOURAL_STYLE } from "@/lib/instruments/disc";
import { TEAMWORK } from "@/lib/instruments/teamwork";
import { COMMUNICATION_WRITING } from "@/lib/instruments/communication";

export const INSTRUMENTS: Instrument[] = [RIASEC, BEHAVIOURAL_STYLE, TEAMWORK, COMMUNICATION_WRITING];
export const instrumentByKey = (key: string) => INSTRUMENTS.find((i) => i.key === key) ?? null;

/** What the student sees: no scoring keys (which scale each option feeds, or how many points an option earns). */
export function instrumentForStudent(inst: Instrument) {
  return {
    key: inst.key, version: inst.version, title: inst.title, description: inst.description, category: inst.category, private: inst.private, minutes: inst.minutes,
    instructions: inst.instructions, caution: inst.caution, likertLabels: inst.likertLabels ?? ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
    items: inst.items.map((i) => {
      if (i.kind === "likert") return { id: i.id, kind: i.kind, text: i.text };
      if (i.kind === "forced") return { id: i.id, kind: i.kind, prompt: i.prompt, options: i.options.map(({ id, text }) => ({ id, text })) };
      if (i.kind === "situational") return { id: i.id, kind: i.kind, text: i.text, options: i.options.map(({ id, text }) => ({ id, text })) };
      return { id: i.id, kind: i.kind, prompt: i.prompt, minWords: i.minWords, maxWords: i.maxWords, criteria: i.criteria.map(({ key, label, hint }) => ({ key, label, hint })) };
    }),
  };
}
export type StudentInstrument = ReturnType<typeof instrumentForStudent>;
