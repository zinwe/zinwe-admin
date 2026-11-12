/**
 * WhatsApp -> Today (wa4, 12 Nov 2026): the keys GET /today/ adds (API_WA3.md section 5) and the draft call with a
 * Track preview. Every key is optional: an older server leaves them out and Today falls back to what it can work out.
 * Nothing here sends a WhatsApp message.
 */
import { request } from "./api";
import type { WaKind, WaLanguage, WaMedia, WaToday, WaTrack } from "./whatsappApi";
import type { WaContactX, WaQueueItemX } from "./whatsappApi.tabs";

const BASE = "/api/admin/marketing/wa";

/** A send slot (India time, Mon–Sat): "10" = 10–12, "12" = 12–14, "14" = 14–17, "17" = 17–19. */
export type WaSlot = "10" | "12" | "14" | "17";
export const SLOT_LABEL: Record<WaSlot, string> = { "10": "10–12", "12": "12–14", "14": "14–17", "17": "17–19" };
export const SLOT_KEYS = Object.keys(SLOT_LABEL) as WaSlot[];

/** What staff sort a reply as: the four sorts, or (an answer in the YES path, Track Unassigned) the Track. */
export type WaSort = "yes" | "question" | "notnow" | "stop" | "privacy" | "activity" | "both";
export const SORT_LABEL: Record<WaSort, string> = {
  yes: "YES", question: "A question", notnow: "Not now", stop: "STOP", privacy: "Data Privacy", activity: "Team Activity", both: "Both Pack",
};

/** Claude's read of a reply (or the rules', when Claude isn't set up or didn't answer). */
export interface WaSuggest {
  kind: "yes" | "question" | "notnow" | "stop" | "track";
  track: WaTrack;
  /** A few words on what in their message shows it: "asks for the video and names the problem". */
  why: string;
  source: "rules" | "claude";
}

/** A reply row on the wa4 server. */
export type WaReplyX = WaContactX & {
  suggest?: WaSuggest | null;
  sorts?: WaSort[];
  /** One line per sort: what confirming it does to their path. */
  effect?: Partial<Record<WaSort, string>>;
  /** The template each answer starts from (null: drafted by kind). */
  answers?: Partial<Record<WaSort, number | null>>;
};

/** A queue row on the wa4 server: its slot ("" = any time: after-YES steps) and whether it is an after-YES step. */
export type WaQueueRowX = WaQueueItemX & { slot?: WaSlot | ""; after_yes?: boolean };

export interface WaSlotInfo {
  now: WaSlot;
  now_label: string;
  open: boolean;
  sunday: boolean;
  next: WaSlot | "";
  next_label: string;
  next_at: string;
  list: { key: WaSlot; label: string; start: string }[];
}

export interface WaDay {
  /** Messages counted against the daily limit today. */
  sent: number;
  /** The live campaigns' daily limits added up. */
  limit: number;
  /** People who wrote today. */
  replies: number;
  /** People who said YES today. */
  yes: number;
}

export interface WaSentRow {
  at: string;
  contact: number;
  name: string;
  what: string;
  replied_at: string | null;
  blocked: boolean;
}

export type WaTodayX = WaToday & { slots?: WaSlotInfo; day?: WaDay; sent_list?: WaSentRow[] };

export interface WaDraft {
  text: string;
  template: string;
  template_id?: number;
  label?: string;
  by: "claude" | "template";
  media: WaMedia | null;
  creative?: string;
  notes?: string;
  language?: WaLanguage;
}

/** draftFor with `track`: drafts as if the Unassigned Track were set (nothing is saved), so the first Demo video of
 * the Track staff are about to confirm can be read before they confirm it. */
export const draftAnswer = (id: number, kind: WaKind | "flow", template?: number | null, track?: WaTrack) =>
  request<WaDraft>(`${BASE}/contacts/${id}/draft/`, {
    method: "POST",
    body: JSON.stringify({ kind, ...(template ? { template } : {}), ...(track ? { track } : {}) }),
  });

/** The slot we are in, worked out in the browser (India time) when the server doesn't send it. */
export function localSlots(now = new Date()): WaSlotInfo {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours() + ist.getMinutes() / 60;
  const starts: [WaSlot, number][] = [["10", 10], ["12", 12], ["14", 14], ["17", 17]];
  let cur: WaSlot = "10";
  for (const [k, a] of starts) if (h >= a) cur = k;
  const nxt = starts.find(([, a]) => a > Number(cur));
  return {
    now: cur, now_label: SLOT_LABEL[cur], open: ist.getDay() !== 0 && h >= 10 && h < 19, sunday: ist.getDay() === 0,
    next: nxt ? nxt[0] : "", next_label: nxt ? SLOT_LABEL[nxt[0]] : "", next_at: nxt ? `${String(nxt[1]).padStart(2, "0")}:00` : "",
    list: starts.map(([k, a]) => ({ key: k, label: SLOT_LABEL[k], start: `${String(a).padStart(2, "0")}:00` })),
  };
}
