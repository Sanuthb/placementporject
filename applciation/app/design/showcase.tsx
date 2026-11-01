"use client"

import * as React from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

export function DesignShowcase() {
  const [date, setDate] = React.useState<Date | undefined>(undefined)
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">Design reference</h1>
      <p className="text-sm text-muted-foreground">Every screen is built from these shadcn components only.</p>

      <Card>
        <CardHeader><CardTitle>Buttons and badges</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Form controls</CardTitle><CardDescription>Same inputs on every dashboard.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel>Name</FieldLabel><Input placeholder="Student name" /><FieldDescription>As on the marksheet.</FieldDescription></Field>
          <Field><FieldLabel>Email</FieldLabel><Input type="email" placeholder="name@college.edu" /></Field>
          <Field className="sm:col-span-2"><FieldLabel>Remarks</FieldLabel><Textarea placeholder="Add a note" /></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox /> Registered for placement</label>
          <label className="flex items-center gap-2 text-sm"><Switch /> Send invite email</label>
        </CardContent>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Calendar</CardTitle></CardHeader>
          <CardContent><Calendar mode="single" selected={date} onSelect={setDate} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Feedback</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => toast.success("Section approved")}>Success toast</Button>
              <Button variant="outline" onClick={() => toast.error("Could not save", { description: "Request ID: demo" })}>Error toast</Button>
            </div>
            <Alert><AlertTitle>Heads up</AlertTitle><AlertDescription>Three sections are waiting for review.</AlertDescription></Alert>
            <Progress value={64} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Table and tabs</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="pending">Pending</TabsTrigger></TabsList>
            <TabsContent value="all">
              <Table>
                <TableHeader><TableRow><TableHead>Student</TableHead><TableHead>Department</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>Asha R</TableCell><TableCell>CSE</TableCell><TableCell><Badge>Verified</Badge></TableCell></TableRow>
                  <TableRow><TableCell>Ravi K</TableCell><TableCell>ECE</TableCell><TableCell><Badge variant="secondary">Submitted</Badge></TableCell></TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="pending" className="text-sm text-muted-foreground">Nothing pending.</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
