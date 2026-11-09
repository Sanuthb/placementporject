import { StudentsView } from "./students-view"

/** The list loads its data in the browser after sign-in, so there is no static shell to validate for instant navigation. */
export const instant = false

export default function Page() {
  return <StudentsView />
}
