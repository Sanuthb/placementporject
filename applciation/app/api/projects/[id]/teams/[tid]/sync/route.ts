import { route } from "@/lib/api/handler";
import { PROJ_STAFF, syncRepo, teamOf } from "@/lib/projectService";

/** Reads the team's public GitHub repository now (at most once every five minutes per team). */
export const POST = route<{ id: string; tid: string }>(PROJ_STAFF, async (_req, s, { id, tid }) => {
  const { team } = await teamOf(s, id, tid);
  return syncRepo(team);
});
