import { route } from "@/lib/api/handler";
import { analyzeResume } from "@/lib/resume";
import { resumeSections } from "@/lib/studentResume";
import { scopedFullStudent } from "@/lib/student360";

/** Completeness score, keywords and an improvement checklist for one student's resume. */
export const GET = route<{ id: string }>({ module: "ONBOARDING" }, async (_req, s, { id }) => {
  const st = await scopedFullStudent(s, id);
  const { all, resumeVerified } = await resumeSections(id);
  return analyzeResume({ email: st.email, phone: st.phone }, all, resumeVerified);
});
