import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest, notFound } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { removeProjectFile } from "@/lib/projectService";
import { myTeam } from "@/lib/projectStudent";

/** Remove a file I uploaded (or any, for the leader) before the team has submitted. */
export const DELETE = studentRoute<{ tid: string; fid: string }>({ module: "LEARNING" }, async (_req, me, { tid, fid }) => {
  const { team, isLeader } = await myTeam(me, tid);
  if (team.status === "SUBMITTED" || team.status === "EVALUATED") throw badRequest("This team has already submitted its work");
  const f = await db.projectFile.findFirst({ where: { id: fid, teamId: tid } });
  if (!f || (f.uploadedByStudentId !== me.studentId && !isLeader)) throw notFound("File not found");
  await db.projectFile.delete({ where: { id: fid } });
  await removeProjectFile(f.filePath);
  return { ok: true };
});
