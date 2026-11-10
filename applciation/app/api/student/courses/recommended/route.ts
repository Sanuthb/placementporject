import { studentRoute } from "@/lib/api/studentHandler";
import { db } from "@/lib/db";
import { gatherEvidence } from "@/lib/intelligence/evidence";
import { recommend } from "@/lib/careerRecommendations";
import { rankCourses, wants } from "@/lib/lmsRecommend";
import { visibleTo } from "@/lib/lmsService";

/** Courses that fit my roadmap goal and the areas my assessments say to improve, with the reason for each. Nothing is joined automatically. */
export const GET = studentRoute({ module: "LEARNING" }, async (_req, me) => {
  const [roadmap, evidence, courses] = await Promise.all([
    db.studentRoadmap.findUnique({ where: { studentId: me.studentId }, select: { targetRole: true, careerGoal: true } }),
    gatherEvidence(me.collegeId, me.studentId, { asStudent: true }),
    db.course.findMany({ where: { collegeId: me.collegeId, status: "PUBLISHED", enrolments: { none: { studentId: me.studentId, status: { not: "WITHDRAWN" } } } }, select: { id: true, title: true, summary: true, category: true, level: true, skills: true, departmentId: true, batchId: true, selfEnrol: true } }),
  ]);
  const improveAreas = recommend(evidence.dimensions, evidence.signals, "student").filter((r) => r.kind === "improve").map((r) => r.id.split(":")[1]).filter(Boolean);
  const open = courses.filter((c) => visibleTo(c, me));
  const ranked = rankCourses(open, wants({ targetRole: roadmap?.targetRole, careerGoal: roadmap?.careerGoal, improveAreas }));
  return ranked.map((r) => { const c = open.find((x) => x.id === r.id)!; return { id: c.id, title: c.title, summary: c.summary, category: c.category, level: c.level, selfEnrol: c.selfEnrol, why: r.why }; });
});
