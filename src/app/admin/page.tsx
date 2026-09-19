import { redirect } from "next/navigation";

/** Flask/admin home maps to Next students list. */
export default function AdminPage() {
  redirect("/cursanti");
}
