import { studentRoute } from "@/lib/api/studentHandler";
import { syncRepo } from "@/lib/projectService";
import { myTeam } from "@/lib/projectStudent";

/** Read my team's public GitHub repository now: commits per person. At most once every five minutes. */
export const POST = studentRoute<{ tid: string }>({ module: "LEARNING", limit: { name: "project-sync", max: 30, windowSec: 3600 } }, async (_req, me, { tid }) => {
  const { team } = await myTeam(me, tid);
  return syncRepo(team);
});
