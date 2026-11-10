import { studentRoute } from "@/lib/api/studentHandler";
import { leaderOnly, myTeam } from "@/lib/projectStudent";
import { startTeam } from "@/lib/projectTeams";

/** The leader starts the team once it has the right number of members (and, for an interdisciplinary project, from two departments). */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING" }, async (_req, me, { tid }) => {
  const { isLeader } = await myTeam(me, tid);
  leaderOnly(isLeader);
  const t = await startTeam(tid);
  return { status: t.status };
});
