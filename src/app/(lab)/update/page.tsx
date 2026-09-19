"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUpdateModal } from "@/components/UpdateModal";

function UpdateRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useUpdateModal();

  useEffect(() => {
    const cod = (searchParams.get("cod") || "").trim();
    if (!cod) {
      toast("Pick a student");
      router.replace("/cursanti");
      return;
    }
    router.replace(
      `/dosar/${encodeURIComponent(cod)}?update=1`,
    );
  }, [searchParams, toast, router]);

  return (
    <p className="px-4 py-6 text-sm text-foreground/60">Opening…</p>
  );
}

export default function UpdatePage() {
  return (
    <Suspense
      fallback={<p className="px-4 py-6 text-sm text-foreground/60">Loading…</p>}
    >
      <UpdateRedirect />
    </Suspense>
  );
}
