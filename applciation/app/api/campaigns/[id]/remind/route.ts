import { route } from "@/lib/api/handler";
import { CAMP_ADMIN, campaignOf, remindBehind } from "@/lib/campaignService";

/** Remind students who are falling behind (at most once a day each). */
export const POST = route<{ id: string }>(CAMP_ADMIN, async (_req, s, { id }) => remindBehind(await campaignOf(s, id), s.userId));
