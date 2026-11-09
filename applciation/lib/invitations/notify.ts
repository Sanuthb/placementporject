import { db } from "@/lib/db";
import { fromAddress, mailer } from "@/lib/mailer";
import { notifyStudent } from "@/lib/notify";

/** Tells a student something about their onboarding: always in the app, and by email when mail is configured. Mail trouble never fails the action. */
export async function tellStudent(collegeId: string, studentId: string, note: { type: string; title: string; body?: string }) {
  await notifyStudent(collegeId, studentId, { ...note, link: "/student/onboarding" });
  try {
    const st = await db.student.findUnique({ where: { id: studentId }, select: { name: true, email: true, college: { select: { name: true } } } });
    if (!st) return;
    const text = `Dear ${st.name},\n\n${note.title}.${note.body ? `\n\n${note.body}` : ""}\n\nSign in to the portal to continue.\n\nRegards,\n${st.college.name}`;
    await mailer().sendMail({ from: fromAddress(), to: st.email, subject: `${note.title} – ${st.college.name}`, text });
  } catch { /* in-app notification is already stored */ }
}
