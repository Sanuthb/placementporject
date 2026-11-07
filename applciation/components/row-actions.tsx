"use client"

import * as React from "react"
import Link from "next/link"
import { EllipsisIcon, EyeIcon, PencilIcon, PowerIcon, Trash2Icon } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

/** The "..." menu on a list row. Leave out any action the row does not support. */
export function RowActions({ viewHref, onView, onEdit, onToggle, toggleLabel = "Deactivate", onDelete }: {
  viewHref?: string; onView?: () => void; onEdit?: () => void
  onToggle?: () => void; toggleLabel?: string; onDelete?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}><EllipsisIcon /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {viewHref && <DropdownMenuItem render={<Link href={viewHref} />}><EyeIcon />View details</DropdownMenuItem>}
        {onView && <DropdownMenuItem onClick={onView}><EyeIcon />View details</DropdownMenuItem>}
        {onEdit && <DropdownMenuItem onClick={onEdit}><PencilIcon />Edit</DropdownMenuItem>}
        {onToggle && <DropdownMenuItem onClick={onToggle}><PowerIcon />{toggleLabel}</DropdownMenuItem>}
        {onDelete && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2Icon />Delete</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Asks before deleting. The server still refuses if the record is in use, and that message is shown as a toast. */
export function ConfirmDelete({ open, what, busy, onConfirm, onClose }: { open: boolean; what: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone. If anything still uses it, it will not be deleted and you can deactivate it instead.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); onConfirm() }}>{busy && <Spinner />}Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
