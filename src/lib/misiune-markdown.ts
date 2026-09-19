/** Light markdown for misiune: escape HTML, **bold**, ## / FAPTE headings, - lists. */

const SECTION_RE =
  /^(?:#{1,3}\s+)?(?:\*\*)?(FAPTE|MISIUNE|DE\s+CE|DE\s+CUM)(?:\*\*)?\s*:?\s*(.*)$/i;

const MD_HEADING_RE = /^(#{1,3})\s+(.+)$/;

const SECTION_TITLE: Record<string, string> = {
  FAPTE: "Fapte",
  MISIUNE: "Misiune",
  "DE CE": "De ce",
  "DE CUM": "De cum",
};

const TITLE_TO_SECTION: Record<string, string> = {
  fapte: "FAPTE",
  misiune: "MISIUNE",
  "de ce": "DE CE",
  "de cum": "DE CUM",
};

const H_CLASS =
  "mt-3 first:mt-0 text-[13px] font-semibold leading-snug text-foreground";
const P_CLASS = "mt-1 text-sm leading-relaxed text-foreground";
const UL_CLASS =
  "mt-1 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-foreground";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*+/g, "");
  return s;
}

function sectionKey(label: string): string {
  const u = label.toUpperCase().replace(/\s+/g, " ").trim();
  if (u.startsWith("DE CUM")) return "DE CUM";
  if (u.startsWith("DE")) return "DE CE";
  return u;
}

function matchSectionTitle(text: string): string | null {
  const k = text.toLowerCase().replace(/\s+/g, " ").trim();
  return TITLE_TO_SECTION[k] || null;
}

/**
 * Returns safe HTML for misiune display. Escape runs before any markup is added.
 */
export function renderMisiuneLightMarkdown(raw: string): string {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const out: string[] = [];
  let listBuf: string[] = [];

  const flushList = () => {
    if (!listBuf.length) return;
    out.push(
      `<ul class="${UL_CLASS}">${listBuf.map((li) => `<li>${li}</li>`).join("")}</ul>`,
    );
    listBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    const sec = trimmed.match(SECTION_RE);
    if (sec) {
      flushList();
      const key = sectionKey(sec[1]!);
      const title = SECTION_TITLE[key] || sec[1]!;
      const rest = (sec[2] || "").trim();
      out.push(
        `<h3 class="${H_CLASS}" data-section="${escapeHtml(key)}">${inlineMd(title)}</h3>`,
      );
      if (rest) {
        const bulletRest = rest.match(/^[-*]\s+(.+)$/);
        if (bulletRest) {
          listBuf.push(inlineMd(bulletRest[1]!));
        } else {
          out.push(`<p class="${P_CLASS}">${inlineMd(rest)}</p>`);
        }
      }
      continue;
    }

    const mdH = trimmed.match(MD_HEADING_RE);
    if (mdH) {
      flushList();
      const headingText = mdH[2]!.trim();
      const key = matchSectionTitle(headingText.replace(/\*+/g, ""));
      if (key) {
        out.push(
          `<h3 class="${H_CLASS}" data-section="${escapeHtml(key)}">${inlineMd(SECTION_TITLE[key]!)}</h3>`,
        );
      } else {
        out.push(`<h3 class="${H_CLASS}">${inlineMd(headingText)}</h3>`);
      }
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listBuf.push(inlineMd(bullet[1]!));
      continue;
    }

    flushList();
    out.push(`<p class="${P_CLASS}">${inlineMd(trimmed)}</p>`);
  }

  flushList();
  return out.join("");
}

function inlineHtmlToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") {
    const inner = Array.from(el.childNodes).map(inlineHtmlToMd).join("");
    const t = inner.trim();
    return t ? `**${t}**` : "";
  }
  if (tag === "em" || tag === "i") {
    return Array.from(el.childNodes).map(inlineHtmlToMd).join("");
  }
  return Array.from(el.childNodes).map(inlineHtmlToMd).join("");
}

function pushBlock(lines: string[], text: string) {
  const t = text.replace(/\u00a0/g, " ").trim();
  if (t) lines.push(t);
}

/**
 * Contenteditable HTML → minimal misiune markdown (headings, -, **bold**).
 */
export function htmlToMisiuneMarkdown(root: HTMLElement): string {
  const lines: string[] = [];

  function process(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      pushBlock(lines, node.textContent || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") {
      const section = (el.getAttribute("data-section") || "").trim().toUpperCase();
      if (section && SECTION_TITLE[section]) {
        lines.push(section);
        return;
      }
      const title = (el.innerText || "").replace(/\s+/g, " ").trim();
      const key = matchSectionTitle(title);
      if (key) lines.push(key);
      else if (title) lines.push(`## ${title}`);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      for (const child of Array.from(el.children)) {
        if (child.tagName.toLowerCase() !== "li") continue;
        const item = inlineHtmlToMd(child).replace(/\s+/g, " ").trim();
        if (item) lines.push(`- ${item}`);
      }
      return;
    }

    if (tag === "li") {
      const item = inlineHtmlToMd(el).replace(/\s+/g, " ").trim();
      if (item) lines.push(`- ${item}`);
      return;
    }

    if (tag === "br") {
      lines.push("");
      return;
    }

    if (tag === "p" || tag === "div") {
      // Chrome often wraps lines in divs; if div only contains a list/heading, recurse.
      const onlyBlocks = Array.from(el.children).every((c) => {
        const t = c.tagName.toLowerCase();
        return (
          t === "ul" ||
          t === "ol" ||
          t === "h1" ||
          t === "h2" ||
          t === "h3" ||
          t === "h4" ||
          t === "div" ||
          t === "p"
        );
      });
      if (el.children.length > 0 && onlyBlocks) {
        for (const child of Array.from(el.childNodes)) process(child);
        return;
      }
      const text = inlineHtmlToMd(el).replace(/\s+/g, " ").trim();
      if (text) {
        const key = matchSectionTitle(text);
        if (key) lines.push(key);
        else lines.push(text);
      }
      return;
    }

    for (const child of Array.from(el.childNodes)) process(child);
  }

  for (const child of Array.from(root.childNodes)) process(child);

  // Collapse excess blank lines
  const out: string[] = [];
  for (const line of lines) {
    if (!line && out.length && out[out.length - 1] === "") continue;
    out.push(line);
  }
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

export function isMisiuneEditorEmpty(root: HTMLElement): boolean {
  const text = (root.innerText || "").replace(/\u00a0/g, " ").trim();
  return !text;
}
