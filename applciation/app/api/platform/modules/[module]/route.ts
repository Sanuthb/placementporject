import { platformRoute } from "@/lib/api/platformHandler";
import { parseBody } from "@/lib/api/parse";
import { setGlobalSwitch, switchInput } from "@/lib/platformModules";

/** The platform-wide emergency switch. It can only reduce access, never grant it, and every change is audited. */
export const PUT = platformRoute<{ module: string }>({ limit: { name: "platform-module-switch", max: 30, windowSec: 3600 } }, async (req, admin, { module }) => setGlobalSwitch(admin, module, await parseBody(req, switchInput)));
