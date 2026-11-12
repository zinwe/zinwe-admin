/**
 * WhatsApp Analytics (wa4, 12 Nov 2026): GET /analytics/view/?campaign=<id>|all&period=all|30|7. One campaign (or
 * all) in one period, split six ways. Counting rules: zinwe-backend z_marketing/wa_analytics.py.
 */
import { request } from "./api";
import type { WaLanguage } from "./whatsappApi";

const BASE = "/api/admin/marketing/wa";

export type WaPeriod = "all" | "30" | "7";
export const PERIOD_LABEL: Record<WaPeriod, string> = { all: "Since day 1", "30": "Last 30 days", "7": "Last 7 days" };

export interface WaKpis {
  /** People whose first message from the campaign went out in the period. */
  people: number;
  /** Our messages sent in the period. */
  messages: number;
  replied: number;
  yes: number;
  track: number;
  first_pc: number;
  paid: number;
  /** The PCs the paid people's packs cover. */
  paid_pcs: number;
  stopped: number;
}

export interface WaViewCampaign { id: number; name: string; status: string; engine: string; people: number; replied: number }

export interface WaViewStep {
  step_id: string;
  lane: string;
  k: string;
  label: string;
  /** The label without "Day N · ". */
  title: string;
  day: number | null;
  /** People in the step now, or waiting right after it. */
  here: number;
  sent: number;
  replies: number;
  reply_rate: number;
  went_on: number;
}

export interface WaViewTemplate {
  id: number;
  name: string;
  category: string;
  type_name: string;
  version: "A" | "B";
  version_of: number | null;
  archived: boolean;
  sends: number;
  replies: number;
  reply_rate: number;
  went_on: number;
  languages: WaLanguage[];
}

export interface WaViewSegment { segment: string; cities: string[]; people: number; replied: number; yes: number; paid: number }
export interface WaViewLanguage { language: WaLanguage; label: string; people: number; messages: number; replied: number; yes: number; stopped: number }
export interface WaViewSlot {
  slot: string;
  label: string;
  name: string;
  sent: number;
  replied: number;
  same_day: number;
  /** Average time to the first reply, in seconds, over the messages that got one. */
  first_reply_secs: number | null;
}
export interface WaViewCode {
  code: string;
  percent_off: number;
  status: "live" | "scheduled" | "ended" | "paused" | "cancelled";
  pack: string;
  stage: number;
  event: boolean;
  starts_on: string;
  ends_on: string | null;
  shown_to: number;
  replied: number;
  /** Pending or paid uses of the code in the period, from any channel. */
  used: number;
  pcs_paid: number;
}

export interface WaView {
  campaign: number | null;
  period: WaPeriod;
  since: string | null;
  today: string;
  kpis: WaKpis;
  funnel: { key: string; label: string; people: number }[];
  days: { date: string; sent: number; replies: number }[];
  campaigns: WaViewCampaign[];
  /** null for all campaigns, or a campaign on the older plan. */
  steps: WaViewStep[] | null;
  templates: WaViewTemplate[];
  segments: WaViewSegment[];
  languages: WaViewLanguage[];
  slots: WaViewSlot[];
  codes: WaViewCode[];
}

export const getWaView = (campaign: number | null, period: WaPeriod) =>
  request<WaView>(`${BASE}/analytics/view/?campaign=${campaign ?? "all"}&period=${period}`);
