import type { Instrument, LikertItem } from "@/lib/instruments/types";

/**
 * Career interests on Holland's six types (Realistic, Investigative, Artistic, Social, Enterprising, Conventional). The items are original
 * activity statements written for this platform (six per type); the six-type model itself is public and widely used in career guidance.
 */
const bank: Record<string, string[]> = {
  R: ["Repair a machine or gadget that has stopped working", "Work with tools, wiring or hardware", "Build or assemble something with my hands", "Work outdoors or in a workshop rather than at a desk", "Set up and test electronic equipment", "Operate machines or vehicles"],
  I: ["Analyse data to find out why something happens", "Carry out an experiment and record what I find", "Read research papers to learn how something works", "Solve a hard logic or maths puzzle", "Investigate the cause of a technical fault", "Work out a better method by testing different ideas"],
  A: ["Design a poster, logo or app screen", "Write a story, article or script", "Make a short video or animation", "Sketch, paint or take photographs", "Compose or perform music", "Come up with an original idea for an event or product"],
  S: ["Help a classmate understand a difficult topic", "Volunteer for a community or charity activity", "Listen to someone's problem and support them", "Teach or train other people", "Organise a group activity so everyone feels included", "Work in a role where I look after other people's needs"],
  E: ["Lead a team towards a goal", "Persuade people to back my idea", "Start and run my own small business", "Negotiate a deal or a better price", "Pitch a plan to a panel", "Take charge of a project and make the decisions"],
  C: ["Keep records and files neat and accurate", "Check a spreadsheet for mistakes", "Follow a clear step-by-step procedure", "Plan a schedule or a budget in detail", "Make sure documents meet every rule and format", "Work in an organised office with clear routines"],
};
const items: LikertItem[] = Object.entries(bank).flatMap(([scale, texts]) => texts.map((text, i): LikertItem => ({ id: `ri-${scale}${i + 1}`, kind: "likert", scale, text })));
// Interleave the six types so no type's questions come in a block.
const order = (i: LikertItem) => `${Number(i.id.slice(-1))}${"RIASEC".indexOf(i.scale)}`;
items.sort((a, b) => order(a).localeCompare(order(b)));

const m = (high: string, moderate: string, low: string) => ({ high, moderate, low });
export const RIASEC: Instrument = {
  key: "riasec",
  version: "1.0",
  title: "Career interests (RIASEC)",
  description: "Which kinds of work you would enjoy most, on six well-known interest types.",
  category: "CAREER_INTEREST",
  private: true,
  minutes: 8,
  likertLabels: ["Strongly dislike", "Dislike", "Not sure", "Enjoy", "Strongly enjoy"],
  instructions: "For each activity, say how much you would enjoy doing it, whether or not you have done it before. There are no right or wrong answers. Do not think about money, training or whether you would be good at it.",
  caution: "Interests are about what you might enjoy, not what you are able to do. This is guidance for exploring careers and never decides eligibility or selection.",
  scales: [
    { key: "R", label: "Realistic", meaning: m("Enjoys practical, hands-on work with tools, machines and equipment.", "Some interest in practical, hands-on work.", "Little interest in hands-on, equipment-based work.") },
    { key: "I", label: "Investigative", meaning: m("Enjoys analysing, researching and solving problems.", "Some interest in analysis and problem solving.", "Little interest in research-style work.") },
    { key: "A", label: "Artistic", meaning: m("Enjoys creating, designing and expressing ideas.", "Some interest in creative work.", "Little interest in creative, open-ended work.") },
    { key: "S", label: "Social", meaning: m("Enjoys helping, teaching and working with people.", "Some interest in helping and teaching others.", "Little interest in work centred on helping people.") },
    { key: "E", label: "Enterprising", meaning: m("Enjoys leading, persuading and taking initiative.", "Some interest in leading and persuading.", "Little interest in leading or selling roles.") },
    { key: "C", label: "Conventional", meaning: m("Enjoys organised, detailed, rule-based work.", "Some interest in organised, detail-focused work.", "Little interest in routine, rule-based work.") },
  ],
  items,
};

/** Roles to explore for each Holland letter. Suggestions for exploration only. */
export const RIASEC_ROLES: Record<string, string[]> = {
  R: ["Hardware or embedded engineer", "Network or systems engineer", "Field or support engineer"],
  I: ["Data analyst or data scientist", "Software engineer", "QA or research engineer"],
  A: ["UI/UX designer", "Front-end developer", "Content or product designer"],
  S: ["Technical trainer", "Customer success or support", "HR or talent roles"],
  E: ["Product or project manager", "Business development", "Technical sales or consulting"],
  C: ["Database or operations analyst", "ERP or systems administrator", "Quality, audit or compliance roles"],
};
