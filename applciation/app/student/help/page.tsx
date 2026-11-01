"use client"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/lib/web/use-api"

type Item = { id: string; kind: string; question: string; answer: string }

export default function HelpPage() {
  const { data } = useApi<Item[]>("/api/student/faqs")
  if (!data) return <Skeleton className="h-48" />
  const group = (kind: string, title: string, desc: string) => {
    const items = data.filter((i) => i.kind === kind)
    if (items.length === 0) return null
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
        <CardContent>
          <Accordion>{items.map((i) => <AccordionItem key={i.id} value={i.id}><AccordionTrigger>{i.question}</AccordionTrigger><AccordionContent className="whitespace-pre-wrap">{i.answer}</AccordionContent></AccordionItem>)}</Accordion>
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {group("RULE", "Placement rules", "What your college expects during the placement season")}
      {group("FAQ", "Frequently asked questions", "Quick answers before you raise a request")}
      {data.length === 0 && <p className="text-sm text-muted-foreground">Your college has not published any FAQs or rules yet. Use Support to ask the placement office.</p>}
    </div>
  )
}
