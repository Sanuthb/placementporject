-- CreateEnum
CREATE TYPE "ProspectStage" AS ENUM ('PROSPECT', 'IN_CONVERSATION', 'DRIVE_SCHEDULED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "InternshipStatus" AS ENUM ('ALLOTTED', 'ONGOING', 'COMPLETED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvaluatorType" AS ENUM ('COMPANY', 'FACULTY');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CAREER_FAIR', 'HACKATHON', 'CODING_CONTEST', 'CASE_CHALLENGE', 'WORKSHOP');

-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('VIRTUAL', 'ONSITE', 'HYBRID');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CANCELLED', 'ATTENDED');

-- CreateEnum
CREATE TYPE "ProgrammeDelivery" AS ENUM ('IN_HOUSE', 'PARTNER');

-- CreateEnum
CREATE TYPE "ProgrammeStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED');

-- CreateEnum
CREATE TYPE "SlotState" AS ENUM ('OPEN', 'BOOKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResourceCategory" AS ENUM ('APTITUDE', 'CODING', 'INTERVIEW', 'SOFT_SKILLS', 'OTHER');

-- CreateEnum
CREATE TYPE "RecruiterJobStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Prospect" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "industry" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "stage" "ProspectStage" NOT NULL DEFAULT 'PROSPECT',
    "ownerId" UUID NOT NULL,
    "companyId" UUID,
    "driveId" UUID,
    "notes" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastReminderAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectActivity" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Internship" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "companyId" UUID,
    "companyName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "mentorName" TEXT,
    "mentorEmail" TEXT,
    "status" "InternshipStatus" NOT NULL DEFAULT 'ALLOTTED',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Internship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" UUID NOT NULL,
    "internshipId" UUID NOT NULL,
    "weekStart" DATE NOT NULL,
    "hours" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "LogStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewComment" TEXT,
    "reviewedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternshipEvaluation" (
    "id" UUID NOT NULL,
    "internshipId" UUID NOT NULL,
    "evaluatorType" "EvaluatorType" NOT NULL,
    "evaluatorName" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternshipEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "EventMode" NOT NULL,
    "venue" TEXT,
    "joinUrl" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "registrationDeadline" TIMESTAMP(3),
    "capacity" INTEGER,
    "targetDepartmentIds" UUID[],
    "targetBatchIds" UUID[],
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "rank" INTEGER,
    "score" DECIMAL(8,2),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningJourney" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProgramme" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "delivery" "ProgrammeDelivery" NOT NULL DEFAULT 'IN_HOUSE',
    "partnerName" TEXT,
    "journeyId" UUID,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" "ProgrammeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningMember" (
    "id" UUID NOT NULL,
    "programmeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningProgress" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "bankId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct" INTEGER[],
    "marks" INTEGER NOT NULL DEFAULT 1,
    "negativeMarks" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "difficulty" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentPaper" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "durationMin" INTEGER NOT NULL,
    "questions" JSONB NOT NULL,
    "shuffle" BOOLEAN NOT NULL DEFAULT true,
    "proctoring" JSONB NOT NULL,
    "passPercent" INTEGER,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentSchedule" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "targetDepartmentIds" UUID[],
    "targetBatchIds" UUID[],
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL DEFAULT '{}',
    "score" DECIMAL(8,2),
    "maxScore" DECIMAL(8,2),
    "violations" INTEGER NOT NULL DEFAULT 0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "proctorEvents" JSONB NOT NULL DEFAULT '[]',
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepResource" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ResourceCategory" NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounsellingSlot" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "counsellorId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SlotState" NOT NULL DEFAULT 'OPEN',
    "studentId" UUID,
    "topic" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounsellingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewExperience" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "roundType" "RoundType",
    "experience" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderatedById" UUID,
    "moderationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recruiter" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recruiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterJob" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "recruiterId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "applyUrl" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" "RecruiterJobStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" UUID,
    "reviewNote" TEXT,
    "jobAlertId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseProfile" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "headline" TEXT,
    "showCgpa" BOOLEAN NOT NULL DEFAULT false,
    "showContact" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prospect_collegeId_stage_idx" ON "Prospect"("collegeId", "stage");

-- CreateIndex
CREATE INDEX "Prospect_nextFollowUpAt_idx" ON "Prospect"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "ProspectActivity_prospectId_createdAt_idx" ON "ProspectActivity"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "Internship_collegeId_status_idx" ON "Internship"("collegeId", "status");

-- CreateIndex
CREATE INDEX "Internship_studentId_idx" ON "Internship"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkLog_internshipId_weekStart_key" ON "WorkLog"("internshipId", "weekStart");

-- CreateIndex
CREATE INDEX "InternshipEvaluation_internshipId_idx" ON "InternshipEvaluation"("internshipId");

-- CreateIndex
CREATE INDEX "Event_collegeId_status_startsAt_idx" ON "Event"("collegeId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "EventRegistration_studentId_idx" ON "EventRegistration"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_studentId_key" ON "EventRegistration"("eventId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningJourney_collegeId_name_key" ON "LearningJourney"("collegeId", "name");

-- CreateIndex
CREATE INDEX "LearningProgramme_collegeId_status_idx" ON "LearningProgramme"("collegeId", "status");

-- CreateIndex
CREATE INDEX "LearningMember_studentId_idx" ON "LearningMember"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningMember_programmeId_studentId_key" ON "LearningMember"("programmeId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningProgress_memberId_stepIndex_key" ON "LearningProgress"("memberId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionBank_collegeId_name_key" ON "QuestionBank"("collegeId", "name");

-- CreateIndex
CREATE INDEX "Question_bankId_idx" ON "Question"("bankId");

-- CreateIndex
CREATE INDEX "AssessmentSchedule_collegeId_startsAt_idx" ON "AssessmentSchedule"("collegeId", "startsAt");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_studentId_idx" ON "AssessmentAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_scheduleId_studentId_key" ON "AssessmentAttempt"("scheduleId", "studentId");

-- CreateIndex
CREATE INDEX "PrepResource_collegeId_isActive_idx" ON "PrepResource"("collegeId", "isActive");

-- CreateIndex
CREATE INDEX "CounsellingSlot_collegeId_status_startsAt_idx" ON "CounsellingSlot"("collegeId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "InterviewExperience_collegeId_status_createdAt_idx" ON "InterviewExperience"("collegeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Recruiter_companyId_idx" ON "Recruiter"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Recruiter_collegeId_email_key" ON "Recruiter"("collegeId", "email");

-- CreateIndex
CREATE INDEX "RecruiterJob_collegeId_status_idx" ON "RecruiterJob"("collegeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseProfile_studentId_key" ON "ShowcaseProfile"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseProfile_token_key" ON "ShowcaseProfile"("token");

-- CreateIndex
CREATE INDEX "ShowcaseProfile_collegeId_isEnabled_idx" ON "ShowcaseProfile"("collegeId", "isEnabled");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_driveId_fkey" FOREIGN KEY ("driveId") REFERENCES "Drive"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectActivity" ADD CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Internship" ADD CONSTRAINT "Internship_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "Internship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternshipEvaluation" ADD CONSTRAINT "InternshipEvaluation_internshipId_fkey" FOREIGN KEY ("internshipId") REFERENCES "Internship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgramme" ADD CONSTRAINT "LearningProgramme_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LearningJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMember" ADD CONSTRAINT "LearningMember_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "LearningProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningMember" ADD CONSTRAINT "LearningMember_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningProgress" ADD CONSTRAINT "LearningProgress_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LearningMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSchedule" ADD CONSTRAINT "AssessmentSchedule_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "AssessmentPaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AssessmentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounsellingSlot" ADD CONSTRAINT "CounsellingSlot_counsellorId_fkey" FOREIGN KEY ("counsellorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounsellingSlot" ADD CONSTRAINT "CounsellingSlot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewExperience" ADD CONSTRAINT "InterviewExperience_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recruiter" ADD CONSTRAINT "Recruiter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterJob" ADD CONSTRAINT "RecruiterJob_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "Recruiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseProfile" ADD CONSTRAINT "ShowcaseProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
