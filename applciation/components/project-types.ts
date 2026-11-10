export type TeamView = {
  id: string; name: string; status: string; leaderId: string; summary: string | null; repoUrl: string | null; repoSyncedAt: string | null; startedAt: string | null; submittedAt: string | null
  repoStats: { fullName: string; pushedAt: string | null; totalCommits: number; contributors: { login: string; commits: number }[]; fetchedAt: string } | null
  project: { id: string; title: string; problemStatement: string; type: string; skills: string[]; dueAt: string | null; minTeamSize: number; maxTeamSize: number; status: string }
  progress: { milestonesDone: number; milestonesTotal: number; tasksDone: number; tasksTotal: number; overdue: number; percent: number }
  members: { studentId: string; name: string; enrollmentNo: string; department: string; githubUsername: string | null; role: string | null; showInPortfolio: boolean; isLeader: boolean; isMe: boolean }[]
  contributions: { studentId: string; name: string; tasksDone: number; tasksAssigned: number; updates: number; files: number; commits: number; sharePercent: number; lowContribution?: boolean }[]
  milestones: { id: string; title: string; dueAt: string | null; doneAt: string | null }[]
  tasks: { id: string; title: string; description: string | null; assigneeId: string | null; assigneeName: string | null; milestoneId: string | null; status: string; dueAt: string | null }[]
  updates: { id: string; text: string; createdAt: string; byStaff: boolean; author: string }[]
  files: { id: string; kind: string; title: string; fileName: string; url: string | null; createdAt: string }[]
  reviews: { id: string; reviewerType: string; reviewerName: string; comments: string | null; scores: Record<string, number>; individualMarks: Record<string, number>; percent: number; isFinal: boolean; createdAt: string }[]
  invites: { id: string; name: string; email: string; expiresAt: string; usedAt: string | null }[]
  result: { teamPercent: number | null; preview?: boolean; mine: number | null; members: Record<string, number> | null } | null
  resultPublished: boolean
}
export const CRITERIA = [{ key: "problem", label: "Understanding of the problem" }, { key: "technical", label: "Technical depth and quality" }, { key: "documentation", label: "Documentation" }, { key: "presentation", label: "Presentation" }, { key: "teamwork", label: "Teamwork and process" }]
