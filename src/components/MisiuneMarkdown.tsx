"use client";

import { renderMisiuneLightMarkdown } from "@/lib/misiune-markdown";

export function MisiuneMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const html = renderMisiuneLightMarkdown(text);
  if (!html) return null;
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
