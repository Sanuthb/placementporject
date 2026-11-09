import type { Instrument } from "@/lib/instruments/types";

const m = (high: string, moderate: string, low: string) => ({ high, moderate, low });

/** A short workplace email, marked 0-10 on four published criteria by the AI (Groq), with a short comment on each. */
export const COMMUNICATION_WRITING: Instrument = {
  key: "communication-writing",
  version: "1.0",
  title: "Written communication",
  description: "Write one short professional email. It is marked on clarity, tone, structure and language.",
  category: "COMMUNICATION",
  private: false,
  minutes: 15,
  instructions: "Write the email described below in 80 to 150 words. Use your own words. Your answer is marked by an AI against four criteria and the marks come with a short comment on each.",
  caution: "AI marking is a guide and can be wrong. Your placement office may look at your writing as well. The result describes this one piece of writing, not your ability in general.",
  scales: [
    { key: "clarity", label: "Clarity", meaning: m("The message and the request are clear on first reading.", "The main point is clear, with some unclear parts.", "The reader would struggle to see what is being asked.") },
    { key: "tone", label: "Tone and professionalism", meaning: m("Polite, respectful and suitable for a recruiter.", "Mostly appropriate, with a few slips in tone.", "Tone is too casual, abrupt or otherwise unsuitable.") },
    { key: "structure", label: "Structure", meaning: m("Subject, greeting, body and closing are all in place and well ordered.", "Most parts of an email are present.", "Missing key parts such as subject, greeting or closing.") },
    { key: "language", label: "Grammar and vocabulary", meaning: m("Accurate and natural English.", "Some errors that do not block understanding.", "Frequent errors that make reading difficult.") },
    { key: "overall", label: "Overall", meaning: m("Strong written communication for a workplace email.", "Adequate, with clear room to improve.", "Needs focused practice on the basics of workplace writing.") },
  ],
  items: [{
    id: "cw-1", kind: "writing", minWords: 80, maxWords: 150,
    prompt: "You have an interview with a company on Tuesday at 10 am, but your university has just scheduled an exam at the same time. Write an email to the recruiter, Ms Rao, asking politely to move the interview to Thursday. Include a subject line.",
    criteria: [
      { key: "clarity", label: "Clarity", hint: "Is it clear who you are, which interview, and what you are asking?" },
      { key: "tone", label: "Tone and professionalism", hint: "Polite, respectful, no slang." },
      { key: "structure", label: "Structure", hint: "Subject, greeting, short body, polite closing and name." },
      { key: "language", label: "Grammar and vocabulary", hint: "Spelling, grammar and word choice." },
    ],
  }],
};
