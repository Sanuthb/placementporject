import { route } from "@/lib/api/handler";
import { templateBuffer } from "@/lib/import/students";

export const GET = route({ roles: ["TPO_ADMIN", "PLACEMENT_OFFICER"], module: "ONBOARDING" }, async () =>
  new Response(new Uint8Array(await templateBuffer()), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="student-import-template.xlsx"',
    },
  }),
);
