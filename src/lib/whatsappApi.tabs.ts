/**
 * WhatsApp tabs (Today, Contacts, Analytics, Settings), wa3: the fields and calls the path engine adds (BRIEF "API for
 * the UI"). Every field here is optional: an older server leaves them out and the tabs fall back to what they showed
 * before. Nothing here sends a WhatsApp message.
 */
import { ApiError, request } from "./api";
import type { WaCampaign, WaContact, WaLanguage, WaQueueItem } from "./whatsappApi";

const BASE = "/api/admin/marketing/wa";

/** A contact's lane in a path campaign. */
export type WaLane = "main" | "yes" | "notnow" | "stop";
export const LANE_LABEL: Record<WaLane, string> = { main: "Main path", yes: "YES lane", notnow: "Not now lane", stop: "Stopped" };

/** The contact JSON on the wa3 server: where they are on their campaign's path. */
export interface WaPathPos {
  lane?: WaLane | "";
  step_id?: string;
  /** "Day 4 · Problem". */
  step_label?: string;
  /** When the next step is due (date and time). */
  next_due?: string | null;
  /** The language of their first message (en or hi), when the server sends it. */
  lang?: WaLanguage | "";
}
export type WaContactX = WaContact & WaPathPos;

/** A Today row on the wa3 server: the same shape, plus the step it is for. */
export type WaQueueItemX = WaQueueItem & { step_id?: string; step_label?: string; lane?: WaLane | ""; version?: string };

/** GET /campaigns/ on the wa3 server adds the engine, the path summary and the numbers. */
export type WaCampaignX = WaCampaign & {
  engine?: "slots" | "path";
  path_summary?: { steps: number; days: number; lanes: number } | null;
  contacts?: number;
  sent?: number;
  replies?: number;
  reply_rate?: number;
  yes?: number;
  paid?: number;
};

/** One step of a campaign's path in Analytics. */
export interface WaStepRow {
  step_id: string;
  label: string;
  lane: string;
  /** Contacts on this step now. */
  here: number;
  sent: number;
  replies: number;
}

type RawStep = Partial<WaStepRow> & { id?: string; k?: string; name?: string; reply_rate?: number };

/** An older server has no route for it. */
export const missingRoute = (err: unknown): boolean => err instanceof ApiError && (err.status === 404 || err.status === 405);

function normalize(raw: unknown): WaStepRow[] {
  const list: RawStep[] = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { steps?: unknown }).steps) ? (raw as { steps: RawStep[] }).steps : [];
  return list.map((s, i) => ({
    step_id: String(s.step_id ?? s.id ?? i),
    label: s.label ?? s.name ?? String(s.step_id ?? s.id ?? `Step ${i + 1}`),
    lane: s.lane ?? "main",
    here: Number(s.here ?? 0),
    sent: Number(s.sent ?? 0),
    replies: Number(s.replies ?? 0),
  }));
}

/**
 * The per-step numbers for one campaign: GET /analytics/steps/?campaign=<id>. null = this server doesn't have it
 * (404/405), so the Analytics path card hides.
 */
export async function getWaSteps(campaign: number): Promise<WaStepRow[] | null> {
  try {
    return normalize(await request<unknown>(`${BASE}/analytics/steps/?campaign=${campaign}`));
  } catch (err) {
    if (missingRoute(err)) return null;
    throw err;
  }
}
