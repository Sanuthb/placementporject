// Unit tests: module adoption summary (pure: no database).
import { summariseAdoption } from "../../lib/platformAnalytics";

let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

const r = summariseAdoption(["A", "B", "C"], { A: 2, B: 1 }, 4);
t("every known module is listed, including one nobody uses", r.length === 3 && r[2].module === "C" && r[2].enabled === 0);
t("the share is enabled over active institutions, to one decimal", r[0].share === 50 && r[1].share === 25 && r[2].share === 0, JSON.stringify(r));
t("with no active institutions nothing is divided by zero", summariseAdoption(["A"], { A: 3 }, 0)[0].share === null && summariseAdoption(["A"], { A: 3 }, 0)[0].enabled === 0);
t("a count can never exceed the number of active institutions", summariseAdoption(["A"], { A: 9 }, 4)[0].enabled === 4);
t("modules the database does not know about are ignored", summariseAdoption(["A"], { A: 1, Z: 5 }, 2).length === 1);
t("order follows the list given", summariseAdoption(["C", "A"], {}, 1).map((x) => x.module).join() === "C,A");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
