// Unit tests: institution name rule and the platform list query contract. No database needed.
import { cleanName, nameKey } from "../../lib/institutionName";
import { escapeLike, institutionListQuery as q, pageInfo, SORT_KEYS } from "../../lib/platformList";
import { provisionInput } from "../../lib/provision";
let fails = 0;
const t = (n: string, ok: boolean, extra = "") => { if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : extra); };

t("cleanName trims", cleanName("  Anna College ") === "Anna College");
t("cleanName collapses spaces, tabs, newlines", cleanName("Anna \t  College\n Of  Arts") === "Anna College Of Arts");
t("nameKey ignores case", nameKey("ANNA College") === nameKey("anna COLLEGE"));
t("nameKey: whitespace and case together", nameKey("  St.  Joseph   COLLEGE ") === nameKey("st. joseph college"));
t("nameKey keeps punctuation (St Joseph is not St. Joseph)", nameKey("St Joseph College") !== nameKey("St. Joseph College"));
t("nameKey keeps different words apart", nameKey("Anna College") !== nameKey("Anna College Two"));
t("nameKey keeps other letters apart", nameKey("Anna College") !== nameKey("Anne College"));
const base = { admin: { name: "Ad Min", email: "A@X.com" } };
t("provision input stores the cleaned name", provisionInput.parse({ ...base, name: "  New   Institute " }).name === "New Institute");
t("provision input: 3-character minimum applies to the trimmed name", !provisionInput.safeParse({ ...base, name: "  ab  " }).success);
t("provision input: whitespace-only name refused", !provisionInput.safeParse({ ...base, name: "      " }).success);

t("list defaults", JSON.stringify(q.parse({})) === JSON.stringify({ status: "all", sort: "createdAt", order: "desc", page: 1, pageSize: 20 }));
t("list accepts every allowed sort key", SORT_KEYS.every((s) => q.safeParse({ sort: s }).success));
for (const bad of [{ sort: "id" }, { sort: "name; drop table" }, { sort: "isActive" }, { order: "up" }, { status: "x" }, { page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "abc" }, { page: "1000001" }, { pageSize: "0" }, { pageSize: "101" }, { pageSize: "-5" }, { pageSize: "ten" }, { q: "x".repeat(101) }])
  t(`list refuses ${JSON.stringify(bad)}`, !q.safeParse(bad).success);
t("list: pageSize 100 and page 1 are the inclusive bounds", q.safeParse({ page: "1", pageSize: "100" }).success);
t("list trims the search text", q.parse({ q: "  anna " }).q === "anna");
t("pageInfo: empty result is one page", pageInfo(0, 20) === 1);
t("pageInfo: exact multiple", pageInfo(40, 20) === 2);
t("pageInfo: remainder adds a page", pageInfo(41, 20) === 3);
t("escapeLike escapes %", escapeLike("50%") === "50\\%");
t("escapeLike escapes _", escapeLike("a_b") === "a\\_b");
t("escapeLike escapes the backslash first", escapeLike("a\\b") === "a\\\\b");
t("escapeLike leaves plain text alone", escapeLike("Anna College 2") === "Anna College 2");
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
