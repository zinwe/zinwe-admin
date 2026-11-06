/** F-21 (v1.3.5) Coupons: staff-only /api/admin/coupons/. A code takes its % off today's monthly price, first month only. */
import { request } from "./api";

export type CouponChannel = "whatsapp" | "email" | "popup" | "other";
/** Computed by the server from the dates (IST, inclusive) and the paused / cancelled flags. */
export type CouponStatus = "live" | "scheduled" | "ended" | "paused" | "cancelled";

export interface Coupon {
  id: number;
  /** Exactly 11 capital letters or numbers; can't change once a company has used it. */
  code: string;
  /** Whole number, 1–40. */
  percent_off: number;
  /** Empty = any plan. */
  plan_codes: string[];
  /** "2026-11-16" (IST day). */
  starts_on: string;
  ends_on: string | null;
  /** null = no limit. */
  max_uses: number | null;
  channel: CouponChannel;
  campaign: string;
  paused: boolean;
  cancelled: boolean;
  status: CouponStatus;
  /** Pending + confirmed uses. */
  uses: number;
  /** Before-GST money from CONFIRMED first payments that used it, e.g. "5777.45". */
  paid_inr: string;
  created_at: string;
  created_by: string;
}

/** A plan as Coupons needs it: today's monthly price and the lowest price (the price band minimum in Plans & pricing). */
export interface CouponPlan {
  code: string;
  name: string;
  price_inr_monthly: string;
  /** null = no lowest price. */
  band_min_inr: string | null;
  pcs: number;
}

export interface CouponsOverview {
  coupons: Coupon[];
  plans: CouponPlan[];
  totals: {
    live: number;
    uses: number;
    paid_inr: string;
    best: { code: string; uses: number; channel: CouponChannel; campaign: string } | null;
  };
}

export interface CouponUse {
  company: string;
  owner_email: string;
  plan_code: string;
  plan_name: string;
  cycle: "monthly" | "yearly";
  state: "pending" | "confirmed" | "void";
  /** Before GST. */
  amount_inr: string;
  amount_off: string;
  created_at: string;
  /** Opens the company in Subscribers (/subscribers?open=<id>). */
  subscriber_id: number | null;
}

export interface CouponInput {
  code: string;
  percent_off: number;
  plan_codes: string[];
  starts_on: string;
  ends_on: string | null;
  max_uses: number | null;
  channel: CouponChannel;
  campaign: string;
}

export type CouponPatch = Partial<CouponInput> & { paused?: boolean; cancelled?: boolean };

export const getCoupons = () => request<CouponsOverview>("/api/admin/coupons/");

/** 400 {field: [msg]} for code format / taken, percent_off 1–40, ends_on before starts_on, an unknown plan. */
export const createCoupon = (input: CouponInput) => request<Coupon>("/api/admin/coupons/", { method: "POST", body: JSON.stringify(input) });

/** The code can't change once used; pause / unpause; cancel (no delete once used). */
export const updateCoupon = (id: number, patch: CouponPatch) =>
  request<Coupon>(`/api/admin/coupons/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });

export const getCouponUses = (id: number) => request<{ uses: CouponUse[] }>(`/api/admin/coupons/${id}/uses/`);

/** A free 11-character code ("Make one"). */
export const suggestCoupon = () => request<{ code: string }>("/api/admin/coupons/suggest/");

export const CHANNEL_LABEL: Record<CouponChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  popup: "Pop-up",
  other: "Other",
};

export const CODE_RE = /^[A-Z0-9]{11}$/;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a plan costs the first month with this % off: today's price less the %, never below the lowest price
 * (band_min_inr; null = no floor). `nothing` when the plan is already at or below its lowest price.
 */
export function firstMonth(plan: CouponPlan, percent: number): { today: number; after: number; off: number; capped: boolean; nothing: boolean } {
  const today = Number(plan.price_inr_monthly) || 0;
  const low = plan.band_min_inr === null || plan.band_min_inr === undefined || plan.band_min_inr === "" ? null : Number(plan.band_min_inr);
  if (low !== null && low >= today) return { today, after: today, off: 0, capped: false, nothing: true };
  const raw = r2(today * (1 - percent / 100));
  const after = low !== null ? Math.max(raw, low) : raw;
  return { today, after, off: r2(today - after), capped: low !== null && raw < low, nothing: false };
}
