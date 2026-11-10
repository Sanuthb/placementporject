import type { ResumeDoc } from "@/lib/resumeEngine"

/** A page-like preview of the resume document. The downloaded PDF and Word files follow the same order and text. */
export function ResumePreview({ doc, mark }: { doc: ResumeDoc; mark: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[42rem] rounded-md border bg-card p-6 text-sm leading-relaxed shadow-sm">
      <h2 className="text-xl font-semibold">{doc.name}</h2>
      {doc.headline && <p className="text-muted-foreground">{doc.headline}</p>}
      <p className="mb-3 text-xs text-muted-foreground">{doc.contact.join("  |  ")}</p>
      {doc.sections.map((s) => (
        <section key={s.id} className="mb-3">
          <h3 className="border-b pb-0.5 text-xs font-semibold uppercase tracking-wide">{s.title}</h3>
          {s.text && <p className="mt-1">{s.text}</p>}
          {s.skills && <p className="mt-1">{s.skills.map((k) => (mark && k.backed ? `${k.name}*` : k.name)).join(", ")}</p>}
          {s.items?.map((it) => (
            <div key={it.key} className="mt-1.5">
              <div className="flex justify-between gap-2"><span className="font-medium">{[it.heading, it.sub].filter(Boolean).join(", ")}</span>{it.date && <span className="shrink-0 text-xs text-muted-foreground">{it.date}</span>}</div>
              {it.link && <div className="text-xs text-muted-foreground">{it.link}</div>}
              {it.bullets.length > 0 && <ul className="ml-4 list-disc">{it.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            </div>
          ))}
        </section>
      ))}
      {doc.evidenceNote && mark && <p className="mt-2 text-[11px] text-muted-foreground">* Skill backed by college records: a staff check, project, course, internship, assessment or achievement.</p>}
    </div>
  )
}
