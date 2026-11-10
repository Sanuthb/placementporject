import assert from "node:assert/strict";
import { atsWarnings, buildMaster, composeDoc, docText, drift, factSummary, keywordsOf, mentions, newFacts, profileKeys, skillList, type Inputs } from "../../lib/resumeEngine";

const base: Inputs = {
  student: { name: "Asha Rao", email: "asha@x.in", phone: "999", department: "Computer Applications", batch: "2024-26", enrollmentNo: "MCA1", programme: "MCA", college: "Demo College" },
  sections: {
    SKILLS: { status: "VERIFIED", data: { skills: ["Python", "SQL", "Cooking", "Communication"] } },
    PROJECTS: { status: "DRAFT", data: { projects: [{ title: "Library App", description: "Built a library system. Used Django for the backend. Added search.", tools: "Django, Python" }, { title: "Weather Bot", description: "Telegram bot.", tools: "JavaScript" }] } },
    INTERNSHIPS: { status: "SUBMITTED", data: { internships: [{ company: "Acme", role: "Python Intern", duration: "May-Jul 2025", description: "Wrote Python scripts." }] } },
    RESUME: { status: "VERIFIED", data: { summary: "Motivated MCA student who enjoys building data tools." } },
    ACADEMICS: { status: "VERIFIED", data: { cgpa: 8.2 } },
    EDUCATION_HISTORY: { status: "VERIFIED", data: { history: [{ level: "TWELFTH", qualification: "12th", institution: "City School", board: "CBSE", year: 2022, percentage: 88 }] } },
    ACHIEVEMENTS: { status: "VERIFIED", data: { achievements: [{ title: "Hackathon winner", category: "COMPETITION", date: "2025-03-01", description: "Won a SQL hackathon." }, { title: "Team captain", category: "LEADERSHIP", date: "2024-01-01" }] } },
  },
  collegeProjects: [{ key: "t1", title: "Library App", problem: "A library needed a system.", summary: "A web app for lending books, built by a team.", skills: ["React", "Python"], role: "Backend", teammates: ["Ravi"], repo: "https://github.com/a/b", resultPercent: 82 }],
  collegeInternships: [],
  courses: [{ key: "c1", title: "Data Analysis with Python", skills: ["Python", "Pandas"], completedOn: "2026-02-10T00:00:00Z", serial: "CRS-2026-AB12" }],
  assessments: [{ key: "a1", title: "SQL fundamentals test", percent: 74 }, { key: "a2", title: "Python quiz", percent: 40 }],
};
const m = buildMaster(base);
const skill = (n: string) => m.skills.find((s) => s.name === n)!;

// helpers
assert.equal(mentions("Written in C and Go", "C"), true);
assert.equal(mentions("Cat and Cobra", "C"), false);
assert.equal(mentions("uses c++ daily", "C++"), true);
assert.deepEqual(skillList("a, B,a ,"), ["a", "B"]);
assert.deepEqual(skillList({ skills: [{ name: "X" }, "y"] }), ["X", "y"]);

// evidence levels: claimed vs evidenced vs verified
assert.equal(skill("Python").level, "VERIFIED");
assert.ok(skill("Python").evidence.some((e) => e.type === "PROJECT") && skill("Python").evidence.some((e) => e.type === "COURSE"), "evidence is listed, not only the level");
assert.equal(skill("Pandas").level, "EVIDENCED", "a skill from a course appears even if not self-listed");
assert.equal(skill("React").level, "EVIDENCED");
assert.equal(skill("SQL").evidence.some((e) => e.type === "ASSESSMENT"), true, "a passed SQL test backs SQL");
assert.equal(skill("Python").evidence.some((e) => e.type === "ASSESSMENT"), false, "a failed Python quiz (40%) does not count");
const claimed = buildMaster({ ...base, sections: { ...base.sections, SKILLS: { status: "DRAFT", data: { skills: ["Cooking", "Python"] } } } });
assert.equal(claimed.skills.find((s) => s.name === "Cooking")!.level, "CLAIMED", "an unverified, unbacked skill is only claimed");
assert.equal(claimed.skills.find((s) => s.name === "Python")!.level, "EVIDENCED");
assert.ok(claimed.skills.findIndex((s) => s.level === "CLAIMED") > claimed.skills.findIndex((s) => s.level === "EVIDENCED"), "claimed skills sort last");
assert.equal(m.skills.find((s) => s.name === "Cooking")!.level, "VERIFIED", "when staff verified the list, every listed skill is verified");

// projects merge and verification
assert.equal(m.projects.filter((p) => p.title === "Library App").length, 1, "the college record and the self-listed project are one project");
assert.equal(m.projects.find((p) => p.title === "Library App")!.source, "COLLEGE");
assert.ok(m.projects.find((p) => p.title === "Library App")!.skills.includes("Django"), "the self-listed tools are kept");
assert.equal(m.projects.find((p) => p.title === "Weather Bot")!.verified, false);
assert.equal(m.internships[0].verified, false);
assert.equal(m.education[0].bullets[0], "CGPA: 8.2");
assert.equal(m.assessments[0].label, "SQL fundamentals test");

// documents
const master = composeDoc(m, { kind: "MASTER" });
assert.deepEqual(master.sections.map((s) => s.id).slice(0, 3), ["summary", "education", "skills"]);
assert.deepEqual(composeDoc(m, { kind: "TECHNICAL" }).sections.map((s) => s.id).slice(0, 3), ["summary", "skills", "projects"]);
assert.equal(composeDoc(m, { kind: "FRESHER" }).sections[0].id, "education");
assert.equal(composeDoc(m, { kind: "PROJECT_BASED" }).sections[1].id, "projects");
assert.ok(!composeDoc(m, { kind: "FRESHER" }).sections.some((s) => s.id === "assessments"));
const proj = master.sections.find((s) => s.id === "projects")!.items!;
assert.ok(proj[0].bullets.length <= 4 + 3, "bullets are capped");
assert.ok(proj[0].bullets.some((b) => b.startsWith("College evaluation")));

// the strict version leaves out what nobody has checked
const strict = composeDoc(m, { kind: "MASTER", claims: "VERIFIED_ONLY" });
assert.ok(!strict.sections.find((s) => s.id === "projects")!.items!.some((i) => i.heading === "Weather Bot"), "an unverified project is dropped");
assert.equal(strict.sections.find((s) => s.id === "internships"), undefined);
const sk = strict.sections.find((s) => s.id === "skills")!.skills!.map((x) => x.name);
assert.ok(sk.includes("Python") && !composeDoc(buildMaster({ ...base, sections: { ...base.sections, SKILLS: { status: "DRAFT", data: { skills: ["Cooking"] } } } }), { kind: "MASTER", claims: "VERIFIED_ONLY" }).sections.some((s) => s.skills?.some((k) => k.name === "Cooking")));

// edits
const ed = composeDoc(m, { kind: "MASTER", edits: { summary: "My own words.", hide: ["project:p1:weather-bot", "skill:cooking"], text: { "project:c:t1": "Led the database design. Wrote the tests." } } });
assert.equal(ed.sections[0].text, "My own words.");
assert.ok(!ed.sections.find((s) => s.id === "projects")!.items!.some((i) => i.heading === "Weather Bot"));
assert.ok(!ed.sections.find((s) => s.id === "skills")!.skills!.some((k) => k.name === "Cooking"));
assert.equal(ed.sections.find((s) => s.id === "projects")!.items![0].bullets[0], "Led the database design.");

// tailoring
const jd = "We need a React developer with strong JavaScript and Node. Build web apps. React experience required.";
assert.ok(keywordsOf(jd).includes("react") && keywordsOf(jd).includes("javascript") && !keywordsOf(jd).includes("with"));
const tail = composeDoc(m, { kind: "COMPANY_SPECIFIC", target: { company: "Globex", role: "Web Developer", text: "React JavaScript web apps" } });
assert.equal(tail.headline, "Application for Web Developer at Globex");
assert.deepEqual(tail.sections.find((s) => s.id === "skills")!.skills!.slice(0, 2).map((k) => k.name).sort(), ["JavaScript", "React"], "skills the job asks for come first");
assert.equal(tail.sections.find((s) => s.id === "projects")!.items![0].heading, "Library App", "the project matching most of the job words (React, web apps) is first");

// plain summary only states what exists
assert.match(factSummary(m), /MCA student \(2024-26\) at Demo College/);
assert.ok(!/\d+ internship/.test(factSummary({ ...m, internships: [] })));
assert.equal(composeDoc(buildMaster({ ...base, sections: { ...base.sections, RESUME: undefined } }), { kind: "MASTER" }).sections[0].text!.startsWith("MCA student"), true);
assert.equal(composeDoc(buildMaster({ ...base, sections: { ...base.sections, RESUME: undefined } }), { kind: "MASTER", claims: "VERIFIED_ONLY" }).sections[0].id === "summary", false, "no checked summary, no invented one");

// drift
const saved = profileKeys(m).map((x) => x.key);
assert.deepEqual(drift(saved, m), { added: [], removed: 0 });
const later = buildMaster({ ...base, courses: [...base.courses, { key: "c2", title: "Cloud Basics", skills: ["AWS"], completedOn: "2026-05-01T00:00:00Z", serial: null }] });
const dr = drift(saved, later);
assert.deepEqual(dr.added.map((x) => x.label).sort(), ["Course: Cloud Basics", "Skill: AWS"]);
assert.equal(drift([...saved, "project:gone"], m).removed, 1);

// the AI may not add facts
assert.deepEqual(newFacts("Built a library system with Django and added search.", docText(master)), []);
assert.deepEqual(newFacts("Built a system that served 10,000 users.", docText(master)), ["10,000"]);
assert.deepEqual(newFacts("Improved speed by 40%", "Improved speed by 40%"), []);
assert.ok(newFacts("Deployed it on Kubernetes for Globex.", docText(master)).includes("Kubernetes"));

// ATS hints
assert.ok(atsWarnings(composeDoc(m, { kind: "MASTER" }), "MODERN").some((w) => /ATS/.test(w)));
assert.equal(atsWarnings(composeDoc(m, { kind: "MASTER" }), "ATS").length, 0);
assert.ok(atsWarnings({ ...master, contact: [] }, "ATS").some((w) => /email/.test(w)));
console.log("resumeengine ok");
