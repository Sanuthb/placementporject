import { CRITERIA_LABEL, TYPE_LABEL, type Feedback, type InterviewType, type Turn } from "@/lib/interviewEngine";
import { QTYPE_LABEL, type QType } from "@/lib/mockTest";
import { safeName, type Block, type ReportDoc } from "@/lib/reportDoc";

/** Pure builders: plain data in, a report document out. Nothing here reads the database; the service decides what each viewer may be given. */
const d = (x: Date | string | null | undefined) => (x ? new Date(x).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "-");
const mins = (s: number | null | undefined) => (s === null || s === undefined ? "-" : `${Math.floor(s / 60)} min ${s % 60} s`);
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export type Person = { name: string; enrollmentNo: string; department?: string | null; batch?: string | null };
const person = (p: Person, college: string): Block => ({ t: "kv", rows: [["Name", p.name], ["Enrolment number", p.enrollmentNo], ["Department", p.department ?? "-"], ["Batch", p.batch ?? "-"], ["College", college]] });

// ---- mock test report ----
type QRow = { type: QType; text: string; context: string | null; options: string[]; correct: number[]; acceptedAnswers: string[]; modelAnswer: string | null; mine: number[] | string | null; status: string; awarded: number; max: number; explanation: string | null; comment: string | null; markedBy: string | null };
export type TestInput = {
  college: string; student: Person; test: { title: string; category: string; kind: string | null; practice: boolean; jobTitle: string | null; attemptNumber: number; submittedAt: Date | string | null; durationMin: number }
  report: { score: number; max: number; percent: number; provisional: boolean; pending: number; passed: boolean | null; passPercent: number | null; failedSections: string[]; accuracy: { correct: number; wrong: number; partial: number; skipped: number; attempted: number } | null; time: { seconds: number | null; perQuestionSeconds: number | null }; sections: { label: string; score: number; max: number; percent: number; cutoff: number | null; passed: boolean | null }[]; topics: { topic: string; correct: number; total: number; percent: number }[]; weakTopics: { topic: string; percent: number }[]; questions: (QRow & { id: string })[] | null }
  comparison: { overallChange: number; improved: string[]; slipped: string[] } | null
  plan: { materials: { topic: string; resources: { title: string }[]; courses: { title: string }[] }[]; uncovered: string[]; exercises: { available: number; topics: string[] }; reassessAt: string | Date | null; nextTest: { title: string } | null } | null
};
const STATUS: Record<string, string> = { CORRECT: "Correct", WRONG: "Not correct", PARTIAL: "Partly correct", SKIPPED: "Not answered", PENDING: "Waiting for a mark" };
const shown = (q: QRow, v: QRow["mine"]) => (Array.isArray(v) ? (v.length ? v.map((i) => q.options[i] ?? `#${i + 1}`).join("; ") : "Not answered") : v?.trim() ? v : "Not answered");

export function testDoc(i: TestInput): ReportDoc {
  const r = i.report, b: Block[] = [];
  b.push({ t: "h", text: "Student" }, person(i.student, i.college));
  b.push({ t: "h", text: "Test" }, { t: "kv", rows: [["Test", i.test.title], ["Job role", i.test.jobTitle ?? "Not linked to a job"], ["Category", i.test.kind ?? i.test.category], ["Type", i.test.practice ? "Practice test" : "Scheduled test"], ["Attempt", String(i.test.attemptNumber)], ["Taken on", d(i.test.submittedAt)], ["Duration allowed", `${i.test.durationMin} minutes`]] });
  b.push({ t: "h", text: "Overall result" }, { t: "kv", rows: [["Score", `${r.score} of ${r.max} (${r.percent}%)`], ["Result", r.provisional ? "Provisional: some answers are still being marked" : r.passed === null ? "No pass mark set" : r.passed ? "Passed" : "Not passed"], ...(r.passPercent !== null ? [["Pass mark", `${r.passPercent}%`] as [string, string]] : []), ...(r.failedSections.length ? [["Below the minimum in", r.failedSections.join(", ")] as [string, string]] : [])] });
  if (r.accuracy) b.push({ t: "h", text: "Accuracy and time" }, { t: "kv", rows: [["Correct", String(r.accuracy.correct)], ["Not correct", String(r.accuracy.wrong)], ["Partly correct", String(r.accuracy.partial)], ["Not answered", String(r.accuracy.skipped)], ["Time taken", mins(r.time.seconds)], ["Average per question", r.time.perQuestionSeconds === null ? "-" : `${r.time.perQuestionSeconds} s`]] });
  if (r.sections.length) b.push({ t: "h", text: "Section-wise performance" }, { t: "table", head: ["Section", "Score", "Percent", "Minimum", "Met"], rows: r.sections.map((s) => [s.label, `${s.score} / ${s.max}`, `${s.percent}%`, s.cutoff === null ? "-" : `${s.cutoff}%`, s.passed === null ? "-" : s.passed ? "Yes" : "No"]) });
  if (r.topics.length) b.push({ t: "h", text: "Topic-wise performance" }, { t: "table", head: ["Topic", "Correct", "Percent"], rows: r.topics.map((t) => [t.topic, `${t.correct} of ${t.total}`, `${t.percent}%`]) });
  if (i.comparison) b.push({ t: "h", text: "Compared with the previous attempt" }, { t: "p", text: `${signed(i.comparison.overallChange)} points overall.${i.comparison.improved.length ? ` Better in ${i.comparison.improved.join(", ")}.` : ""}${i.comparison.slipped.length ? ` Lower in ${i.comparison.slipped.join(", ")}.` : ""}`, source: "SYSTEM" });
  if (r.weakTopics.length) b.push({ t: "h", text: "Learning gaps" }, { t: "list", items: r.weakTopics.map((t) => `${t.topic} (${t.percent}%)`), source: "SYSTEM" });
  if (i.plan) {
    const rec = i.plan.materials.flatMap((m) => [...m.resources.map((x) => `${m.topic}: ${x.title}`), ...m.courses.map((x) => `${m.topic}: ${x.title} (course)`)]);
    if (rec.length || i.plan.uncovered.length) b.push({ t: "h", text: "Recommended materials" }, ...(rec.length ? [{ t: "list", items: rec, source: "SYSTEM" } as Block] : []), ...(i.plan.uncovered.length ? [{ t: "p", text: `No study material found yet for: ${i.plan.uncovered.join(", ")}.` } as Block] : []));
    b.push({ t: "h", text: "Improvement plan" }, { t: "list", items: [...(i.plan.exercises.available ? [`Practise ${i.plan.exercises.available} targeted questions on ${i.plan.exercises.topics.join(", ")}`] : []), ...(i.plan.reassessAt ? [`Take the test again from ${d(i.plan.reassessAt)}`] : []), ...(i.plan.nextTest ? [`Next test: ${i.plan.nextTest.title}`] : [])], source: "SYSTEM" });
  }
  if (r.questions) {
    b.push({ t: "h", text: "Correct and incorrect answers" }, { t: "table", head: ["#", "Question", "Result", "Marks"], rows: r.questions.map((q, n) => [n + 1, q.text.slice(0, 90), STATUS[q.status] ?? q.status, `${q.awarded} / ${q.max}`]) });
    b.push({ t: "h", text: "Question-wise answers" });
    r.questions.forEach((q, n) => {
      b.push({ t: "p", text: `${n + 1}. ${q.text}  [${QTYPE_LABEL[q.type]}, ${STATUS[q.status] ?? q.status}, ${q.awarded} of ${q.max}]` });
      if (q.context) b.push({ t: "response", label: "Given with the question", text: q.context, source: "STAFF" });
      b.push({ t: "response", label: "Answer given", text: shown(q, q.mine), source: "STUDENT" });
      const correct = q.options.length ? q.correct.map((k) => q.options[k]).join("; ") : q.acceptedAnswers.join("; ") || q.modelAnswer;
      if (correct) b.push({ t: "response", label: q.options.length || q.acceptedAnswers.length ? "Correct answer" : "Model answer", text: correct, source: "STAFF" });
      if (q.explanation) b.push({ t: "response", label: "Explanation", text: q.explanation, source: "STAFF" });
      if (q.comment) b.push({ t: "response", label: "Marker's comment", text: q.comment, source: q.markedBy === "STAFF" ? "STAFF" : "AI" });
    });
  } else b.push({ t: "p", text: "The correct answers and explanations are not part of this report yet." });
  return { title: "Mock Test Report", subtitle: `${i.student.name} · ${i.test.title}`, blocks: b, fileBase: safeName(`test-report-${i.student.name}-${i.test.title}`) };
}

// ---- mock interview report ----
export type InterviewInput = {
  college: string; student: Person; interview: { role: string; type: InterviewType; mode: string; difficulty: string; language: string; durationMin: number; startedAt: Date | string; completedAt: Date | string | null; jobTitle: string | null }
  transcript: Turn[]; feedback: Feedback | null; comparison: { overallChange: number; improved: string[]; slipped: string[]; categories: { label: string; before: number; now: number }[] } | null
};
export function interviewDoc(i: InterviewInput): ReportDoc {
  const f = i.feedback, b: Block[] = [], t = i.interview;
  const took = t.completedAt ? Math.round((new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()) / 1000) : null;
  b.push({ t: "h", text: "Student" }, person(i.student, i.college));
  b.push({ t: "h", text: "Interview" }, { t: "kv", rows: [["Job role", i.interview.jobTitle ?? t.role], ["Interview type", TYPE_LABEL[t.type] ?? t.type], ["Mode", t.mode === "ASSESSMENT" ? "Assessment" : "Learning"], ["Difficulty", t.difficulty.toLowerCase()], ["Language", t.language], ["Date", d(t.startedAt)], ["Planned duration", `${t.durationMin} minutes`], ["Time taken", mins(took)]] });
  if (f) {
    b.push({ t: "h", text: "Overall score" }, { t: "kv", rows: [["Score", `${f.score} of 10`]] }, { t: "p", text: f.summary, source: "AI" });
    if (f.categories.length) b.push({ t: "h", text: "Category-wise scores" }, { t: "table", head: ["Area", "Score", "Comment"], rows: f.categories.map((c) => [CRITERIA_LABEL[c.key] ?? c.label, `${c.score} / 10`, c.comment]) });
    if (f.strengths.length) b.push({ t: "h", text: "Strengths" }, { t: "list", items: f.strengths, source: "AI" });
    if (f.improvements.length) b.push({ t: "h", text: "Areas to improve" }, { t: "list", items: f.improvements, source: "AI" });
    if (f.technicalFeedback) b.push({ t: "h", text: "Technical feedback" }, { t: "p", text: f.technicalFeedback, source: "AI" });
  } else b.push({ t: "h", text: "Overall score" }, { t: "p", text: "This interview was not finished, so there is no evaluation." });
  b.push({ t: "h", text: "Questions and answers" });
  let n = 0;
  for (const turn of i.transcript) {
    if (turn.role === "interviewer") { n++; b.push({ t: "response", label: `Question ${n}`, text: turn.text, source: "AI" }); }
    else if (turn.role === "student") b.push({ t: "response", label: `Answer ${n}${turn.voice ? " (spoken, written down by speech-to-text)" : ""}`, text: turn.text, source: "STUDENT" });
    else b.push({ t: "response", label: turn.kind === "hint" ? `Hint for question ${n}` : `Coach's note on answer ${n}`, text: turn.text, source: "AI" });
  }
  if (f?.perAnswer.some((p) => p.suggested)) { b.push({ t: "h", text: "Suggested answer improvements" }); for (const p of f.perAnswer) { b.push({ t: "p", text: p.question }); if (p.comment) b.push({ t: "p", text: p.comment, source: "AI" }); if (p.suggested) b.push({ t: "response", label: "A stronger answer", text: p.suggested, source: "AI" }); } }
  if (f?.practice.length) b.push({ t: "h", text: "Practice recommendations" }, { t: "list", items: f.practice, source: "AI" });
  if (i.comparison) b.push({ t: "h", text: "Previous attempt comparison" }, { t: "p", text: `${signed(i.comparison.overallChange)} overall.${i.comparison.improved.length ? ` Better: ${i.comparison.improved.join(", ")}.` : ""}${i.comparison.slipped.length ? ` Lower: ${i.comparison.slipped.join(", ")}.` : ""}`, source: "SYSTEM" });
  b.push({ t: "p", text: "Scores and comments are AI practice feedback on the words in the transcript. Nothing is inferred from voice, accent or appearance, and the report does not predict any selection result." });
  return { title: "Mock Interview Report", subtitle: `${i.student.name} · ${t.role}`, blocks: b, fileBase: safeName(`interview-report-${i.student.name}-${t.role}`) };
}

// ---- consolidated student performance report ----
export type PerformanceInput = {
  college: string; student: Person; viewer: "STUDENT" | "STAFF"
  tests: { title: string; category: string; attempts: number; latest: number | null; sinceFirst: number | null }[]
  interviews: { role: string; type: string; date: Date | string; score: number | null; weak: string[] }[]
  weakTopics: { topic: string; percent: number }[]
};
export function performanceDoc(i: PerformanceInput): ReportDoc {
  const b: Block[] = [{ t: "h", text: "Student" }, person(i.student, i.college)];
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 10) / 10 : null);
  const tp = i.tests.flatMap((t) => (t.latest === null ? [] : [t.latest])), iv = i.interviews.flatMap((x) => (x.score === null ? [] : [x.score]));
  b.push({ t: "h", text: "At a glance" }, { t: "kv", rows: [["Tests taken", String(i.tests.length)], ["Average of latest test results", tp.length ? `${avg(tp)}%` : "-"], ["Interviews finished", String(iv.length)], ["Average interview score", iv.length ? `${avg(iv)} / 10` : "-"]] });
  b.push({ t: "h", text: "Mock tests" }, i.tests.length ? { t: "table", head: ["Test", "Category", "Attempts", "Latest", "Change since first"], rows: i.tests.map((t) => [t.title, t.category, t.attempts, t.latest === null ? "-" : `${t.latest}%`, t.sinceFirst === null ? "-" : `${signed(t.sinceFirst)} pts`]) } : { t: "p", text: "No finished tests." });
  b.push({ t: "h", text: "Mock interviews" }, i.interviews.length ? { t: "table", head: ["Role", "Type", "Date", "Score", "Weakest areas"], rows: i.interviews.map((x) => [x.role, x.type, d(x.date), x.score === null ? "-" : `${x.score} / 10`, x.weak.join(", ") || "-"]) } : { t: "p", text: i.viewer === "STAFF" ? "No interviews set up by the placement office have been finished. A student's own practice interviews are private." : "No finished interviews." });
  if (i.weakTopics.length) b.push({ t: "h", text: "Topics to work on" }, { t: "list", items: i.weakTopics.map((t) => `${t.topic} (${t.percent}%)`), source: "SYSTEM" });
  b.push({ t: "p", text: "Personality and aptitude results are private to the student and are not part of this report. Results are practice evidence and do not guarantee any selection outcome." });
  return { title: "Student Performance Report", subtitle: `${i.student.name} · ${i.student.enrollmentNo}`, blocks: b, fileBase: safeName(`performance-${i.student.name}`) };
}

// ---- batch or department report ----
export type CohortInput = {
  college: string; scope: string; generatedFor: string
  students: { name: string; enrollmentNo: string; testsTaken: number; averagePercent: number | null; interviews: number; averageInterview: number | null }[]
  topics: { topic: string; averagePercent: number; students: number }[]
};
const avgOf = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, c) => a + c, 0) / xs.length) * 10) / 10 : null);

/** Topic averages across a cohort: each student counts once per topic (their mean on it), so one student with many attempts cannot dominate. Weakest first; topics with fewer than `minStudents` students are left out. */
export function cohortTopics(perStudent: { topic: string; percent: number }[][], minStudents = 1) {
  const m = new Map<string, number[]>();
  for (const rows of perStudent) {
    const own = new Map<string, number[]>();
    for (const r of rows) own.set(r.topic, [...(own.get(r.topic) ?? []), r.percent]);
    for (const [t, ps] of own) m.set(t, [...(m.get(t) ?? []), ps.reduce((a, c) => a + c, 0) / ps.length]);
  }
  return [...m.entries()].filter(([, v]) => v.length >= minStudents).map(([topic, v]) => ({ topic, averagePercent: Math.round(avgOf(v)!), students: v.length })).sort((a, b) => a.averagePercent - b.averagePercent || a.topic.localeCompare(b.topic));
}

export function cohortDoc(i: CohortInput): ReportDoc {
  const tested = i.students.filter((s) => s.testsTaken > 0), iv = i.students.filter((s) => s.interviews > 0);
  const b: Block[] = [{ t: "h", text: "Group" }, { t: "kv", rows: [["Group", i.scope], ["College", i.college], ["Prepared for", i.generatedFor], ["Students", String(i.students.length)]] }];
  b.push({ t: "h", text: "At a glance" }, { t: "kv", rows: [["Students who took a test", `${tested.length} of ${i.students.length}`], ["Average test result", tested.length ? `${avgOf(tested.map((s) => s.averagePercent ?? 0))}%` : "-"], ["Students with a finished assigned interview", `${iv.length} of ${i.students.length}`], ["Average interview score", iv.length ? `${avgOf(iv.map((s) => s.averageInterview ?? 0))} / 10` : "-"]] });
  b.push({ t: "h", text: "Topics the group finds hardest" }, i.topics.length ? { t: "table", head: ["Topic", "Group average", "Students"], rows: i.topics.slice(0, 20).map((t) => [t.topic, `${t.averagePercent}%`, t.students]) } : { t: "p", text: "No topic results yet." });
  b.push({ t: "h", text: "Students" }, { t: "table", head: ["Name", "Enrolment", "Tests", "Test average", "Interviews", "Interview average"], rows: i.students.map((s) => [s.name, s.enrollmentNo, s.testsTaken, s.averagePercent === null ? "-" : `${s.averagePercent}%`, s.interviews, s.averageInterview === null ? "-" : `${s.averageInterview} / 10`]) });
  b.push({ t: "p", text: "Only finished, fully marked tests and interviews set up by the placement office are counted. Students' own practice interviews are private and not included." });
  return { title: "Group Performance Report", subtitle: i.scope, blocks: b, fileBase: safeName(`group-report-${i.scope}`) };
}
