"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  htmlToMisiuneMarkdown,
  isMisiuneEditorEmpty,
  renderMisiuneLightMarkdown,
} from "@/lib/misiune-markdown";

export type MisiuneEditorHandle = {
  getMarkdown: () => string;
};

export const MisiuneEditor = forwardRef<
  MisiuneEditorHandle,
  {
    value: string;
    onChange: (markdown: string) => void;
    placeholder?: string;
    id?: string;
  }
>(function MisiuneEditor(
  {
    value,
    onChange,
    placeholder = "Write or generate the mission…",
    id = "misiune-text",
  },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  /** Last markdown we pushed via onChange — skip re-render from our own echo. */
  const lastFromUs = useRef<string | null>(null);
  const [empty, setEmpty] = useState(() => !(value || "").trim());

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      const el = elRef.current;
      if (!el) return lastFromUs.current ?? value;
      return htmlToMisiuneMarkdown(el);
    },
  }));

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (lastFromUs.current !== null && value === lastFromUs.current) return;
    el.innerHTML = renderMisiuneLightMarkdown(value);
    lastFromUs.current = value;
    setEmpty(!(value || "").trim());
  }, [value]);

  function emitFromDom() {
    const el = elRef.current;
    if (!el) return;
    const md = htmlToMisiuneMarkdown(el);
    const isEmpty = isMisiuneEditorEmpty(el);
    lastFromUs.current = md;
    setEmpty(isEmpty);
    onChange(md);
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={id}>
        Text misiune
      </label>
      <div
        id={id}
        ref={elRef}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        onInput={emitFromDom}
        onBlur={emitFromDom}
        className="min-h-[16rem] w-full overflow-auto rounded-md border border-line bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-accent"
      />
      {empty ? (
        <p
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 px-3 py-2.5 text-sm text-foreground/40"
        >
          {placeholder}
        </p>
      ) : null}
    </div>
  );
});
