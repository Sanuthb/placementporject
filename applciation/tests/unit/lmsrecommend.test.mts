import assert from "node:assert/strict";
import { rankCourses, wants } from "../../lib/lmsRecommend";

const c = (id: string, title: string, skills: string[] = [], category: string | null = null) => ({ id, title, summary: null, category, skills });
const courses = [c("a", "Business English and Speaking", [], "Communication"), c("b", "Python Programming", ["python", "coding"]), c("c", "Cooking basics")];

// a weak communication result points at the communication course, with the reason
let r = rankCourses(courses, wants({ improveAreas: ["communication"] }));
assert.deepEqual(r.map((x) => x.id), ["a"]);
assert.ok(r[0].why[0].includes("communication"));

// a target role matches on its meaningful words, stop words are ignored
r = rankCourses(courses, wants({ targetRole: "Python Developer", improveAreas: [] }));
assert.deepEqual(r.map((x) => x.id), ["b"]);
assert.equal(wants({ targetRole: "Senior Manager", improveAreas: [] }).length, 0);

// weak areas outrank a career-goal word; unrelated courses never show
r = rankCourses(courses, wants({ careerGoal: "coding", improveAreas: ["communication"] }));
assert.deepEqual(r.map((x) => x.id), ["a", "b"]);
assert.equal(rankCourses(courses, wants({ improveAreas: [] })).length, 0, "nothing known about the student, nothing recommended");

// one reason is counted once however many of its words match
r = rankCourses([c("x", "Programming and coding with SQL database")], wants({ improveAreas: ["technical"] }));
assert.equal(r[0].score, 3);
assert.equal(rankCourses(courses, wants({ improveAreas: ["communication"] }), 0).length, 0);
console.log("lmsrecommend ok");
