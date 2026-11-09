import type { Dimension, Signals } from "@/lib/intelligence/evidence";
import { RIASEC_ROLES } from "@/lib/instruments/riasec";

/**
 * Personalised recommendations from a student's assessment results. Rules, not AI: the same results always give the same advice, and every
 * recommendation says which result it comes from. Nothing here is a verdict on the student or affects eligibility.
 */
export type Recommendation = { id: string; kind: "improve" | "take" | "explore" | "strength"; area: string; title: string; why: string; action: string; href: string | null; priority: number };

const SKILLS = ["aptitude", "technical", "digital", "communication"] as const;
const LOW = 60, STRONG = 75;
/** Who is reading: the student (second person) or staff (third person). Same facts either way. */
export type Audience = "student" | "staff";
const STYLE_TIP: Record<Audience, Record<string, string>> = {
  student: {
    D: "Your answers lean towards driving results. In team rounds, pause to hear others before deciding.",
    I: "Your answers lean towards engaging people. In interviews, back your enthusiasm with specific examples.",
    S: "Your answers lean towards steady support. In group discussions, practise speaking first at least once.",
    C: "Your answers lean towards accuracy. In timed rounds, practise deciding with good-enough information.",
  },
  staff: {
    D: "Answers lean towards driving results. In team rounds, it may help to practise hearing others before deciding.",
    I: "Answers lean towards engaging people. In interviews, it may help to back enthusiasm with specific examples.",
    S: "Answers lean towards steady support. In group discussions, it may help to practise speaking first at least once.",
    C: "Answers lean towards accuracy. In timed rounds, it may help to practise deciding with good-enough information.",
  },
};
const RIASEC_LABEL: Record<string, string> = { R: "Realistic", I: "Investigative", A: "Artistic", S: "Social", E: "Enterprising", C: "Conventional" };
const link = (key: string) => (key === "aptitude" || key === "technical" || key === "digital" ? "/student/assessments" : "/student/tests");

export function recommend(dimensions: Dimension[], signals?: Signals, audience: Audience = "student"): Recommendation[] {
  const me = audience === "student";
  const own = me ? "Your" : "The student's", profile = me ? "your profile" : "the profile";
  const out: Recommendation[] = [];
  for (const d of dimensions.filter((x) => (SKILLS as readonly string[]).includes(x.key))) {
    if (d.score != null && d.score < LOW) {
      out.push({ id: `improve:${d.key}`, kind: "improve", area: d.label, title: `Strengthen ${d.label.toLowerCase()}`, why: `${own} ${d.label.toLowerCase()} result is ${d.score}%, below ${LOW}%.`, action: me ? "Take the practice tests and use the preparation resources, then retake the assessment when your college allows." : "Suggest the practice tests and preparation resources, then a retake when the retake rule allows.", href: me ? "/student/prep" : null, priority: 100 - d.score });
    } else if (d.score != null && d.score >= STRONG) {
      out.push({ id: `strength:${d.key}`, kind: "strength", area: d.label, title: `${d.label} is a strength`, why: `${own} ${d.label.toLowerCase()} result is ${d.score}%.`, action: me ? "Mention it in your resume and interviews, with an example." : "A strength to bring out in the resume and in interviews.", href: null, priority: 0 });
    } else if (d.score == null && d.kind === "none") {
      out.push({ id: `take:${d.key}`, kind: "take", area: d.label, title: me ? `Take the ${d.label.toLowerCase()} assessment` : `No ${d.label.toLowerCase()} result yet`, why: `No result yet, so this part of ${profile} is empty.`, action: me ? (d.key === "communication" ? "Take the written communication test and a practice interview." : "Take it when it is scheduled for your batch.") : (d.key === "communication" ? "Ask the student to take the written communication test and a practice interview." : "Include it when scheduling assessments for this batch."), href: me ? link(d.key) : null, priority: 40 });
    }
  }
  const team = dimensions.find((d) => d.key === "teamwork");
  if (team?.kind === "none") out.push({ id: "take:teamwork", kind: "take", area: team.label, title: me ? "Take the teamwork and leadership scenarios" : "No teamwork and leadership result yet", why: "No result yet, and group rounds look at exactly this.", action: me ? "It takes about 12 minutes." : "Ask the student to take the teamwork and leadership scenarios (about 12 minutes).", href: me ? "/student/tests" : null, priority: 35 });
  else if (team?.score != null && team.score < LOW) out.push({ id: "improve:teamwork", kind: "improve", area: team.label, title: "Practise teamwork and leadership", why: `${own} scenario result is ${team.score}%, below ${LOW}%.`, action: me ? "Read the explanations of the stronger options and practise them in your next group activity." : "Encourage practice in group activities and mock group discussions.", href: me ? "/student/tests" : null, priority: 100 - team.score });

  if (signals?.riasecRanking?.length) {
    const top = signals.riasecRanking.slice(0, 3);
    out.push({ id: "explore:riasec", kind: "explore", area: "Career interests", title: `Roles to explore for ${top.map((k) => RIASEC_LABEL[k]).join(", ")}`, why: `${own} interests are strongest in ${top.map((k) => RIASEC_LABEL[k]).join(", ")}.`, action: [...new Set(top.flatMap((k) => RIASEC_ROLES[k].slice(0, 2)))].slice(0, 5).join("; ") + ". These are ideas to explore, not a prediction.", href: me ? "/student/job-alerts" : null, priority: 20 });
  }
  if (signals?.styleRanking?.length) out.push({ id: "explore:style", kind: "explore", area: "Behavioural style", title: me ? "Using your working style in interviews" : "Working style in interviews", why: me ? "From your behavioural style answers." : "From the student's behavioural style answers.", action: STYLE_TIP[audience][signals.styleRanking[0]] ?? "", href: null, priority: 10 });
  return out.filter((r) => r.action).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** The profile at a glance: what is measured and what is still missing. */
export function coverage(dimensions: Dimension[]) {
  const measured = dimensions.filter((d) => d.kind === "measured").length;
  return { measured, total: dimensions.length, missing: dimensions.filter((d) => d.kind === "none").map((d) => d.label) };
}
