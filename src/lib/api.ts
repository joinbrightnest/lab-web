/** Flask API at /lab/api (absolute path on shared host). */
export const API_BASE = "/lab/api";

export type Me = {
  id: number;
  username: string;
  role: string;
  name: string;
  email?: string;
  /** Optional profile photo URL/path; empty → illustrated default. */
  avatar?: string | null;
};

export type Lector = {
  id: number;
  username: string;
  name: string;
  telefon?: string;
  email?: string;
  iban?: string;
  program?: string;
  cap_max?: number;
  onorariu_tip?: "fix_per_student" | "procent" | string;
  onorariu_valoare?: number;
  refund_zile?: number;
  slot_grup?: string;
  onboarding_ok?: number;
  mod_plata?: "transfer" | "stripe" | "altul" | string;
  plata_nota?: string;
  nr_cursanti?: number;
  de_incasat?: number;
  role?: string;
};

export type Inscriere = {
  id: number | null;
  cursant_cod: string;
  cursant_nume?: string;
  lector_username: string;
  pret?: number;
  parte_lector: number | null;
  platit_la?: string | null;
  start_la: string | null;
  end_la?: string | null;
  refund_pana?: string | null;
  status: string;
  platit_lector?: number;
  platit_lector_la?: string | null;
  zile_ramase?: number | null;
  fara_contract?: boolean;
  mod_plata?: "transfer" | "stripe" | "altul" | string;
};

export type EuIncasari = {
  items: Inscriere[];
  total: number;
};

export type Cursant = {
  cod: string;
  nume: string;
  nivel: string;
  lector: string;
  lacune?: string;
  ultimul_update?: string;
  ritm_zile?: string | number | null;
  /** AI output language: auto | ro | en */
  limba?: string | null;
  /** Active mission status, or skip/null when none active. */
  misiune_status?: string | null;
  data_start?: string | null;
  context?: string | null;
  obiectiv?: string | null;
  puncte_tari?: string | null;
  focus_start?: string | null;
  /** Login portal (plain text; never a password hash). Admin-only from API. */
  username_student?: string | null;
};

export type MisiuneActiva = {
  id?: number | string | null;
  creat_la?: string | null;
  textul?: string | null;
  status?: string | null;
  rezultat?: string | null;
  de_catre?: string | null;
  skill_id?: number | string | null;
} | null;

export type MisiuneRow = {
  id?: number | string | null;
  creat_la?: string | null;
  textul?: string | null;
  status?: string | null;
  de_catre?: string | null;
};

export type UpdateRow = {
  id?: number | string | null;
  data?: string | null;
  tip?: string | null;
  feedback?: string | null;
};

export type NotitaRow = {
  id?: number | string | null;
  cursant_cod?: string | null;
  creat_la?: string | null;
  textul?: string | null;
  de_catre?: string | null;
  reminder_la?: string | null;
};

export type SkillRow = {
  skill_id?: number | string | null;
  nume?: string | null;
  nivel?: number | string | null;
};

export type DosarPayload = {
  cursant: Cursant;
  misiune_activa: MisiuneActiva;
  updateuri: UpdateRow[];
  misiuni?: MisiuneRow[];
  notite?: NotitaRow[];
  skilluri: SkillRow[];
};

export type Conversatie = {
  id: number;
  titlu: string | null;
  updated_at?: string | null;
  cursant_cod?: string | null;
};

export type Mesaj = {
  role: string;
  text: string;
};

export type MesajePayload = {
  cursant_cod?: string | null;
  mesaje: Mesaj[];
};

/** Chip meta from the same fields as DATE DIN LAB (no fake URLs). */
export type LabChatSources = {
  cod?: string;
  misiune?: boolean;
  ultimul_update?: string | null;
};

export type ChatApiResponse = {
  c?: number;
  cod?: string | null;
  cursant_cod?: string | null;
  text?: string;
  html?: string;
  error?: string;
  sources?: LabChatSources | null;
};

export type Setari = {
  ritm_zile_implicit: string;
  prompt_chat: string;
  prompt_misiune: string;
};

export type StudentHome = {
  name: string;
  nume?: string;
  cod: string;
  /** Text from /lab/api/student-me, or legacy {text,status}. */
  misiune: string | { text: string; status: string } | null;
  materiale: string;
  upcoming: StudentCall[];
};

export type StudentCall = {
  id?: number;
  starts_at: string;
  ends_at: string;
  titlu?: string;
};

export type Disponibilitate = {
  id: number;
  lector_username: string;
  /** ISO-8601 weekday: 1=Mon … 7=Sun */
  zi_sapt: number;
  start_hm: string;
  end_hm: string;
};

export type SloturiItem = {
  starts_at: string;
  ends_at: string;
};

export type InboxCat = "toate" | "raspuns" | "fara_semnal" | "intarziat";

export type InboxCounts = {
  toate: number;
  raspuns: number;
  fara_semnal: number;
  intarziat: number;
};

export type InboxItem = {
  cod: string;
  nume: string;
  cat: Exclude<InboxCat, "toate">;
  why: string;
  when: string;
  mission_preview?: string;
  update_preview?: string;
};

export type InboxPayload = {
  counts: InboxCounts;
  items: InboxItem[];
};

export type SesiuneTip = "call" | "grup" | "pregatire" | "personal" | string;
export type SesiuneStatus =
  | "programat"
  | "done"
  | "no_show"
  | "anulat"
  | string;

export type Sesiune = {
  id: number;
  lector_username: string;
  cursant_cod: string | null;
  cursant_nume?: string;
  starts_at: string;
  ends_at: string;
  tip: SesiuneTip;
  status: SesiuneStatus;
  titlu?: string | null;
  nota?: string | null;
};

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    cache: init.cache ?? "no-store",
    headers,
  });
}

/** Auth routes under /api/auth/* (credentials always included). */
export async function authFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`/api/auth${p}`, {
    ...init,
    credentials: "include",
    headers,
  });
}

export function resolveMeEmail(me: Pick<Me, "username" | "email">): string {
  const em = (me.email || "").trim();
  if (em) return em;
  const un = (me.username || "").trim() || "user";
  return `${un}@brightnest.local`;
}
