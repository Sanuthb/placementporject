import { platformRoute } from "@/lib/api/platformHandler";
import { overview } from "@/lib/ai/admin";

/** The platform AI configuration as an administrator may see it: providers, models, switches, masked keys, who changed what and when, and warnings. Read-only; never a key or ciphertext. */
export const GET = platformRoute({}, async () => overview());
