import { studentRoute } from "@/lib/api/studentHandler";
import { badRequest } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { myTeam } from "@/lib/projectStudent";

/** Leave a team that has not started. A leader who leaves passes leadership on; the last member leaving removes the team. After it starts, ask staff. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING" }, async (_req, me, { tid }) => {
  const { team, isLeader } = await myTeam(me, tid);
  if (team.status !== "FORMING") throw badRequest("The team has started. Ask your placement office to change it");
  const rest = await db.projectMember.findMany({ where: { teamId: tid, studentId: { not: me.studentId } }, orderBy: { joinedAt: "asc" } });
  if (!rest.length) { await db.projectTeam.delete({ where: { id: tid } }); return { removed: true }; }
  await db.$transaction([db.projectMember.deleteMany({ where: { teamId: tid, studentId: me.studentId } }), ...(isLeader ? [db.projectTeam.update({ where: { id: tid }, data: { leaderId: rest[0].studentId } })] : [])]);
  return { removed: false };
});
