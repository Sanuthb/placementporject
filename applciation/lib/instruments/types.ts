import type { AssessmentCategory } from "@/lib/reassessment";

/**
 * One engine for every profile-style test. An instrument is data (items plus how to score them); `scoring.ts` turns answers into scores
 * and the same screens run every instrument. Four ways of answering:
 *  - likert:      "how much do you agree / would you enjoy" on a 1-5 scale, each item feeds one scale
 *  - forced:      a set of statements; pick the one MOST like you and the one LEAST like you (compares styles with each other)
 *  - situational: a workplace scenario; pick what you would actually do; every option scores 0-3 on the skills it tests
 *  - writing:     a short written answer, scored 0-10 per criterion by an AI against a published rubric
 */
export type Scale = { key: string; label: string; meaning: Record<"high" | "moderate" | "low", string> };
export type LikertItem = { id: string; kind: "likert"; text: string; scale: string; reversed?: boolean };
export type ForcedItem = { id: string; kind: "forced"; prompt: string; options: { id: string; text: string; scale: string }[] };
export type SituationalItem = { id: string; kind: "situational"; text: string; options: { id: string; text: string; scores: Record<string, number> }[] };
export type WritingItem = { id: string; kind: "writing"; prompt: string; minWords: number; maxWords: number; criteria: { key: string; label: string; hint: string }[] };
export type Item = LikertItem | ForcedItem | SituationalItem | WritingItem;

export type Instrument = {
  key: string;
  version: string;
  title: string;
  description: string;
  category: AssessmentCategory;
  /** Private instruments (personality-style) need the student's consent and are shown to staff only if the student shares them. */
  private: boolean;
  minutes: number;
  scales: Scale[];
  items: Item[];
  /** Shown above the questions. */
  instructions: string;
  /** Always shown with the result. */
  caution: string;
  /** Likert labels, 1 to 5. */
  likertLabels?: string[];
};

export type ScaleResult = { score: number; band: "high" | "moderate" | "low"; meaning: string };
export type Result = {
  scales: Record<string, ScaleResult>;
  /** Scale keys, highest first. For RIASEC this is the Holland code. */
  ranking: string[];
  /** Plain words about the top scales. Never a verdict. */
  headline: string;
  /** Writing instruments keep the AI's short comments per criterion. */
  comments?: Record<string, string>;
};

export type Answers = Record<string, unknown>;
export const band = (n: number): "high" | "moderate" | "low" => (n >= 70 ? "high" : n >= 40 ? "moderate" : "low");
