import { studentRoute } from "@/lib/api/studentHandler";
import { readForm } from "@/lib/api/parse";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { storeProjectFile } from "@/lib/projectService";
import { myTeam } from "@/lib/projectStudent";
import { LIMITS } from "@/lib/resources";

/** Upload documentation or a presentation (multipart: "file", "kind" = DOCUMENT or PRESENTATION, "title"). PDF, Word or PowerPoint up to 20 MB. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING", limit: { name: "project-upload", max: 40, windowSec: 3600 } }, async (req, me, { tid }) => {
  const { team } = await myTeam(me, tid);
  if (team.status === "FORMING") throw badRequest("The team has not started yet");
  if (team.status === "EVALUATED") throw badRequest("The result is published; the team can no longer change");
  const form = await readForm(req, LIMITS.DOCUMENT);
  const file = form.get("file");
  const kind = form.get("kind") === "PRESENTATION" ? "PRESENTATION" : "DOCUMENT";
  if (!(file instanceof File)) throw badRequest('Send the file as multipart field "file"');
  if ((await db.projectFile.count({ where: { teamId: tid } })) >= 30) throw badRequest("A team can have at most 30 files");
  const saved = await storeProjectFile(me.collegeId, tid, file);
  const f = await db.projectFile.create({ data: { ...saved, teamId: tid, kind, title: String(form.get("title") ?? "").trim().slice(0, 120) || saved.fileName, uploadedByStudentId: me.studentId } });
  return { id: f.id };
});
