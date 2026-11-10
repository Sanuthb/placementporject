"use client"

import * as React from "react"

import { OptionSelect } from "@/components/option-select"
import { ReportButtons } from "@/components/report-buttons"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { useLookups } from "@/lib/web/lookups"

/** Results report for a department and/or batch: test and interview results and the topics the group finds hardest. */
export function GroupReports() {
  const lk = useLookups()
  const [departmentId, setDepartmentId] = React.useState("")
  const [batchId, setBatchId] = React.useState("")
  const query = { ...(departmentId ? { departmentId } : {}), ...(batchId ? { batchId } : {}) }
  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Group performance report</CardTitle><CardDescription>Results of finished tests, scores of interviews you assigned, and the topics the group finds hardest. A student&apos;s own practice interviews stay private. For one student, open their profile and use Performance report on the analysis tab.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field><FieldLabel>Department</FieldLabel><OptionSelect className="w-full" value={departmentId} onChange={setDepartmentId} options={[{ value: "", label: "All departments" }, ...lk.departments]} placeholder="All departments" /></Field>
          <Field><FieldLabel>Batch</FieldLabel><OptionSelect className="w-full" value={batchId} onChange={setBatchId} options={[{ value: "", label: "All batches" }, ...lk.batches]} placeholder="All batches" /></Field>
        </div>
        <div><ReportButtons path="/api/reports/documents/group" query={query} label="Download report" size="default" /></div>
      </CardContent>
    </Card>
  )
}
