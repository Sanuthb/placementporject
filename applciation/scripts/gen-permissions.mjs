// Generates lib/permissionMatrix.data.json from the route files, so the read-only role and permission matrix can never drift from the code.   npm run docs:permissions
// tests/unit/permissions.test.mts fails if the committed file is out of date.
import { writeFileSync } from "node:fs";
import { buildMatrix } from "./lib/routeScan.mjs";

const m = buildMatrix();
writeFileSync("lib/permissionMatrix.data.json", JSON.stringify(m) + "\n");
console.log(`wrote lib/permissionMatrix.data.json (${m.count} endpoints)`);
