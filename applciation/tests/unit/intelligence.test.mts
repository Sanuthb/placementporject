// The AI reading: what is sent to the model, and how its answer is checked before staff see it. fetch is replaced, so no key or network is used.
import { createAiResolver, setAiResolverForTests } from "../../lib/ai/config";
import assert from "node:assert/strict";
import type { Evidence } from "../../lib/intelligence/evidence";
import { writeNarrative } from "../../lib/intelligence/narrative";

let fails = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { try { await fn(); console.log("PASS", name); } catch (e) { fails++; console.log("FAIL", name, (e as Error).message.split("\n")[0]); } };

const ev: Evidence = {
  personalityShared: true,
  context: { programme: "MCA", department: "Computer Applications", batch: "MCA 2026–2028", graduationYear: 2028, profileStatus: "SUBMITTED", academicsVerified: false, documents: { verified: 0, pending: 2, rejected: 0 } },
  jobFit: [{ driveId: "d1", role: "Developer", company: "Acme", tier: "DREAM", met: ["CGPA 8 meets minimum 7"], unmet: [], unknown: [] }],
  dimensions: [
    { key: "academics", label: "Academic performance", kind: "measured", score: 80, confidence: "medium", items: [{ label: "CGPA (out of 10)", value: 8, source: "ACADEMICS section", verified: false }], gaps: [] },
    { key: "personality", label: "Personality (Big Five)", kind: "measured", score: null, confidence: "low", items: [{ label: "openness", value: 90, source: "Career assessment", verified: true }], gaps: [] },
    { key: "technical", label: "Technical competencies", kind: "declared", score: null, confidence: "low", items: [{ label: "Skills and languages listed", value: "SQL", source: "SKILLS section", verified: false }], gaps: [] },
  ],
};

let sent: { body: string } | null = null;
let answer: unknown = {};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { sent = { body: String(init?.body) }; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 }); }) as typeof fetch;
process.env.GROQ_API_KEY = "test-key";
// The narrative writer asks the central AI resolver for its provider and key. A unit test must not read a database, so it uses an isolated resolver that finds nothing configured and falls back to the environment (GROQ_API_KEY above), as before.
setAiResolverForTests(createAiResolver({ load: async () => null, env: () => process.env }));

await t("no name, email or contact details are sent to the model", async () => {
  answer = { summary: "A careful summary of the evidence." };
  await writeNarrative(ev);
  const b = sent!.body;
  assert.ok(!/@|phone|"name"/i.test(JSON.parse(b).messages[1].content.replace("No name, email or contact details are included on purpose.", "")));
  assert.match(JSON.parse(b).messages[0].content, /never as the reason a student does or does not fit a job/);
});
await t("an answer that decides eligibility or hiring is withheld", async () => {
  answer = { summary: "The student is not eligible for any drive.", strengths: [{ text: "Should be hired immediately", basis: "inferred", evidence: ["academics"] }, { text: "Solid CGPA", basis: "measured", evidence: ["academics"] }], careerPathways: [], recommendations: [{ title: "Reject the student", action: "reject the student now", priority: "high", area: "x" }] };
  const n = await writeNarrative(ev);
  assert.match(n.summary, /withheld/); assert.equal(n.strengths.length, 1); assert.equal(n.strengths[0].text, "Solid CGPA"); assert.equal(n.recommendations.length, 0);
});
await t("a pathway resting only on personality is downgraded and flagged", async () => {
  answer = { summary: "Summary of what the evidence shows.", careerPathways: [{ role: "Team lead", fit: "strong", rationale: "High openness", basis: "measured", evidence: ["personality: openness"] }] };
  const n = await writeNarrative(ev);
  assert.equal(n.careerPathways[0].fit, "stretch"); assert.equal(n.careerPathways[0].basis, "inferred"); assert.ok(n.cautions.some((c) => /personality/i.test(c)));
});
await t("self-declared evidence can never be labelled measured", async () => {
  answer = { summary: "Summary of what the evidence shows.", strengths: [{ text: "Knows SQL", basis: "measured", evidence: ["technical"] }] };
  assert.equal((await writeNarrative(ev)).strengths[0].basis, "inferred");
});
await t("every reading carries the guidance-only caution", async () => {
  answer = { summary: "Summary of what the evidence shows." };
  assert.ok((await writeNarrative(ev)).cautions.some((c) => /does not decide eligibility/.test(c)));
});
await t("an incomplete answer is retried once, then reported", async () => {
  let calls = 0; answer = {};
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 }); }) as typeof fetch;
  await assert.rejects(() => writeNarrative(ev), /incomplete/);
  assert.equal(calls, 2);
});
globalThis.fetch = realFetch;
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
