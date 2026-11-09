import type { ForcedItem, Instrument } from "@/lib/instruments/types";

/**
 * Behavioural style on the four-factor Dominance / Influence / Steadiness / Conscientiousness model. "DISC" is a trademark of its owners:
 * the statements here are original, and this is a self-description tool for guidance, not a licensed DISC assessment.
 * Twelve sets of four statements, one per style in each set. The student picks the statement MOST like them and the one LEAST like them.
 */
const S: Record<"D" | "I" | "S" | "C", string[]> = {
  D: ["I take charge when nothing is moving", "I make decisions quickly", "I enjoy a challenge or a contest", "I say what I think directly", "I push hard to get results", "I am not afraid to disagree", "I like to be in control of the outcome", "I set ambitious goals for myself", "I act first and adjust later", "I like to compete and win", "I take risks to move ahead", "I prefer to lead rather than follow"],
  I: ["I enjoy meeting new people", "I keep the mood light in a group", "I persuade others with enthusiasm", "I like to be at the centre of a discussion", "I make friends easily", "I tell stories to make my point", "I get excited by new possibilities", "I speak up in a group without hesitation", "I like to motivate other people", "I enjoy being around people most of the day", "I look for the bright side of a setback", "I like it when my work is noticed"],
  S: ["I stay calm when others are stressed", "I listen patiently", "I prefer a steady routine", "I help teammates quietly behind the scenes", "I am loyal to my team", "I like change to come gradually", "I keep the peace and avoid conflict", "I finish what I start at a steady pace", "I am a dependable friend", "I take my time before deciding", "I support other people's ideas", "I like working in a stable, familiar setting"],
  C: ["I check my work for mistakes", "I like clear rules and procedures", "I analyse the facts before I decide", "I plan carefully before I begin", "I want to understand exactly how things work", "I keep my work accurate and organised", "I ask detailed questions", "I set high standards for quality", "I prefer instructions in writing", "I compare the options before choosing", "I notice small details others miss", "I stay objective and logical"],
};
const SCALES = ["D", "I", "S", "C"] as const;
const items: ForcedItem[] = Array.from({ length: 12 }, (_, k): ForcedItem => {
  // Rotate which style appears first, so position gives no clue.
  const order = [...SCALES.slice(k % 4), ...SCALES.slice(0, k % 4)];
  return { id: `bs-${k + 1}`, kind: "forced", prompt: "Choose the statement that is MOST like you and the one that is LEAST like you.", options: order.map((s) => ({ id: `bs-${k + 1}${s}`, text: S[s][k], scale: s })) };
});

const m = (high: string, moderate: string, low: string) => ({ high, moderate, low });
export const BEHAVIOURAL_STYLE: Instrument = {
  key: "behavioural-style",
  version: "1.0",
  title: "Behavioural style (DISC model)",
  description: "How you tend to approach work and people: driving results, influencing, supporting, or being careful and precise.",
  category: "BEHAVIOURAL_STYLE",
  private: true,
  minutes: 8,
  instructions: "In each set, pick the statement that is MOST like you and the one that is LEAST like you. All the statements may be true of you; choose the closest and the furthest. Answer as you usually are, not as you would like to be.",
  caution: "This compares your own styles with each other, so a high score in one style means it stands out for you, not that you are better or worse than others. No style is better than another, and it never decides eligibility or selection.",
  scales: [
    { key: "D", label: "Dominance (driving results)", meaning: m("Direct and decisive; pushes for results and likes a challenge.", "Takes the lead when needed.", "Prefers a less forceful, more cooperative way of getting things done.") },
    { key: "I", label: "Influence (engaging people)", meaning: m("Outgoing and persuasive; energised by people and new ideas.", "Comfortable with people when the situation calls for it.", "More reserved; prefers to let work speak for itself.") },
    { key: "S", label: "Steadiness (supporting others)", meaning: m("Patient, dependable and supportive; values stability and teamwork.", "Steady when needed, and adapts to change.", "Comfortable with fast change and less need for routine.") },
    { key: "C", label: "Conscientiousness (accuracy)", meaning: m("Careful and analytical; sets high standards and checks details.", "Attentive to detail when it matters.", "Prefers the big picture and is less focused on fine detail.") },
  ],
  items,
};
