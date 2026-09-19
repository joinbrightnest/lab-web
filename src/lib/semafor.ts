/** Semafor listă cursanți: roșu / galben / verde din ritm + misiune. */

export type SemaforCuloare = "rosu" | "galben" | "verde";

export type SemaforInput = {
  ultimul_update?: string | null;
  ritm_zile?: string | number | null;
  misiune_status?: string | null;
};

export type SemaforResult = {
  culoare: SemaforCuloare;
  tooltip: string;
  /** Sort key: 0 roșu, 1 galben, 2 verde */
  rank: number;
  zileFaraUpdate: number | null;
  ritm: number;
};

const RANK: Record<SemaforCuloare, number> = {
  rosu: 0,
  galben: 1,
  verde: 2,
};

function startOfDay(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Zile calendaristice de la ultimul_update până azi. null = fără update. */
export function zileFaraUpdate(
  ultimul_update: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const raw = (ultimul_update || "").trim();
  if (!raw) return null;
  // Accept YYYY-MM-DD or ISO
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const then = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const days = Math.floor((startOfDay(now) - then.getTime()) / 86400000);
  return days < 0 ? 0 : days;
}

export function ritmZile(ritm_zile: string | number | null | undefined): number {
  if (ritm_zile === null || ritm_zile === undefined) return 7;
  const n = typeof ritm_zile === "number" ? ritm_zile : parseInt(String(ritm_zile).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

/**
 * verde: update în ultimele ritm zile ȘI misiune aprobata|editata
 * galben: fără update ≥ ritm SAU misiune doar propusa
 * roșu: fără update > 2×ritm SAU zero misiune / ultima e skip
 */
export function calcSemafor(row: SemaforInput, now: Date = new Date()): SemaforResult {
  const ritm = ritmZile(row.ritm_zile);
  const zile = zileFaraUpdate(row.ultimul_update, now);
  const status = (row.misiune_status || "").trim().toLowerCase();
  const activOk = status === "aprobata" || status === "editata";
  const doarPropusa = status === "propusa";
  const faraMisiune = !status || status === "skip";

  const staleHard = zile === null || zile > 2 * ritm;
  const staleSoft = zile === null || zile > ritm;
  const updateOk = zile !== null && zile <= ritm;

  let culoare: SemaforCuloare;
  let tooltip: string;

  if (staleHard || faraMisiune) {
    culoare = "rosu";
    if (faraMisiune) {
      tooltip = status === "skip" ? "Last mission: skip" : "No mission";
    } else {
      tooltip = `No update for ${zile} days`;
    }
  } else if (staleSoft || doarPropusa) {
    culoare = "galben";
    if (doarPropusa && !staleSoft) {
      tooltip = "Mission not approved";
    } else if (staleSoft && zile !== null) {
      tooltip = `No update for ${zile} days`;
    } else {
      tooltip = "Mission not approved";
    }
  } else if (updateOk && activOk) {
    culoare = "verde";
    tooltip = "Up to date";
  } else {
    culoare = "galben";
    tooltip = "Mission not approved";
  }

  return {
    culoare,
    tooltip,
    rank: RANK[culoare],
    zileFaraUpdate: zile,
    ritm,
  };
}

export function sortCursantiBySemafor<T extends SemaforInput & { nume?: string }>(
  rows: T[],
  now?: Date,
): T[] {
  return [...rows].sort((a, b) => {
    const sa = calcSemafor(a, now);
    const sb = calcSemafor(b, now);
    if (sa.rank !== sb.rank) return sa.rank - sb.rank;
    return (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" });
  });
}
