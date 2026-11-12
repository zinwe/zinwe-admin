/**
 * WhatsApp Settings (wa4, 12 Nov 2026): GET / PUT /api/admin/marketing/wa/settings/. The rules staff change here are
 * the ones the campaigns follow from their next send (z_marketing/wa_settings.py). An older server has no route:
 * getWaSettings returns null and the tab says so.
 */
import { request } from "./api";
import { missingRoute } from "./whatsappApi.tabs";

const URL = "/api/admin/marketing/wa/settings/";

export type WaSlot = "10-12" | "12-14" | "14-17" | "17-19";
export const WA_SLOTS: WaSlot[] = ["10-12", "12-14", "14-17", "17-19"];

export interface WaSettings {
  /** Weekdays messages may go out: 0 = Monday … 6 = Sunday. */
  send_days: number[];
  /** "10:00", India time. */
  send_from: string;
  send_to: string;
  skip_holidays: boolean;
  /** A new campaign's daily limit (1–50). */
  new_per_day: number;
  /** Intro messages a day from the number, every campaign together (1–500). */
  per_number_day: number;
  per_person_day: 1 | 2;
  min_intro_wait: 1 | 2 | 3;
  max_days: 30 | 60 | 90;
  slots: WaSlot[];
  stop_words: string[];
  /** 0 = never pause a campaign for its stops. */
  stop_pause_pct: 0 | 2 | 3 | 5;
  language: "en" | "hi" | "ab";
  switch_en: boolean;
  claude_read: boolean;
  claude_draft: boolean;
  claude_track: boolean;
  wa_number: string;
  wa_name: string;
  /** Biggest discount in a message, in percent (1–50). */
  discount_max: number;
  updated_at: string | null;
  updated_by: string;
}

export type WaSettingsInput = Omit<WaSettings, "updated_at" | "updated_by">;

/** null = this server doesn't have Settings yet. */
export async function getWaSettings(): Promise<WaSettings | null> {
  try {
    return await request<WaSettings>(URL);
  } catch (err) {
    if (missingRoute(err)) return null;
    throw err;
  }
}

/** Save; a 400 is an ApiError whose `fields` say what to fix, per setting. */
export const saveWaSettings = (input: WaSettingsInput) => request<WaSettings>(URL, { method: "PUT", body: JSON.stringify(input) });
