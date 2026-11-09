"use client"

import { Wizard, type WizardData } from "@/components/onboarding/wizard"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/web/api"
import { useApi } from "@/lib/web/use-api"

const reload = () => api<WizardData>("/api/student/onboarding")

export default function OnboardingPage() {
  const { data, error } = useApi<WizardData>("/api/student/onboarding")
  if (error) return <p className="text-sm text-destructive">{error instanceof Error ? error.message : "Could not load your profile"}</p>
  if (!data) return <Skeleton className="h-96 rounded-xl" />
  // The wizard keeps its own copy of what the student is typing. Only this first load seeds that copy.
  return <Wizard initial={data} reload={reload} />
}
