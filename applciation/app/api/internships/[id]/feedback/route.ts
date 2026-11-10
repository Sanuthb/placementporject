import { z } from "zod";
import { route } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/parse";
import { db } from "@/lib/db";
import { notifyStudent } from "@/lib/notify";
import { hasRole } from "@/lib/auth/session";
import { internshipOf } from "@/lib/internshipService";

/** Mentor feedback on the internship, shown to the student. Written as faculty when you are this student's faculty mentor, otherwise as staff. */
export const POST = route<{ id: string }>({ module: "INTERNSHIPS", facultyOk: true }, async (req, s, { id }) => {
  const i = await internshipOf(s, id);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(3).max(3000) }));
  const me = await db.user.findUniqueOrThrow({ where: { id: s.userId }, select: { name: true } });
  const f = await db.internshipFeedback.create({ data: { internshipId: id, authorType: i.facultyMentorId === s.userId ? "FACULTY" : hasRole(s, "TPO_ADMIN", "PLACEMENT_OFFICER") ? "STAFF" : "FACULTY", authorName: me.name, authorUserId: s.userId, text } });
  await notifyStudent(s.collegeId, i.studentId, { type: "internship.feedback", title: "New feedback on your internship", body: text.slice(0, 140), link: "/student/internships" });
  return { id: f.id };
});
