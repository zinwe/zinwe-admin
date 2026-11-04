/** Zingles (F-15, v1.3.3): our animated logo for special days, scheduled (/api/admin/zingles/, multipart). */
import { request } from "./api";

/**
 * Where it shows on the web: the website (the sign-in page counts as website), the customer dashboard, both, or
 * none (the Windows app only: then `show_app` must be true).
 */
export type ZinglePlaces = "website" | "dashboard" | "both" | "none";
/** live = showing now · scheduled = starts later · ended = past its end · off = switched off. */
export type ZingleState = "live" | "scheduled" | "ended" | "off";

export interface Zingle {
  id: number;
  name: string;
  /** Animated GIF/WebP and the still PNG. The server may send file URLs as `animated`/`still` or `*_url`. */
  animated_url?: string | null;
  still_url?: string | null;
  animated?: string | null;
  still?: string | null;
  alt: string;
  starts_at: string;
  ends_at: string | null;
  places: ZinglePlaces;
  /** Also shows in the Windows app's title bar. */
  show_app?: boolean;
  is_active: boolean;
  status?: ZingleState;
  created_at?: string;
  updated_at?: string;
}

export interface ZingleInput {
  name: string;
  alt: string;
  starts_at: string;
  ends_at: string | null;
  places: ZinglePlaces;
  show_app: boolean;
  is_active: boolean;
  /** Only sent when a new file is picked. */
  animated?: File | null;
  still?: File | null;
}

/** Where it shows, as three switches (website includes sign-in), and back to `places` + `show_app`. */
export interface ZingleWhere {
  website: boolean;
  dashboard: boolean;
  app: boolean;
}

export function whereOf(places: ZinglePlaces, showApp: boolean): ZingleWhere {
  return { website: places === "website" || places === "both", dashboard: places === "dashboard" || places === "both", app: showApp };
}

export function placesOf(w: ZingleWhere): ZinglePlaces {
  return w.website && w.dashboard ? "both" : w.website ? "website" : w.dashboard ? "dashboard" : "none";
}

/** "Website + dashboard + app", "App only"... */
export function whereLabel(places: ZinglePlaces, showApp: boolean): string {
  const w = whereOf(places, showApp);
  const parts = [w.website && "website", w.dashboard && "dashboard", w.app && "app"].filter(Boolean) as string[];
  if (!parts.length) return "Nowhere";
  const text = parts.length === 1 && w.app ? "app only" : parts.join(" + ");
  return text[0].toUpperCase() + text.slice(1);
}

export const animatedUrl = (z: Zingle): string => z.animated_url || z.animated || "";
export const stillUrl = (z: Zingle): string => z.still_url || z.still || "";

/** State from the dates and the switch (the server's `status` when it sends one). */
export function zingleState(z: Zingle, now = Date.now()): ZingleState {
  if (z.status) return z.status;
  if (!z.is_active) return "off";
  if (new Date(z.starts_at).getTime() > now) return "scheduled";
  if (z.ends_at && new Date(z.ends_at).getTime() <= now) return "ended";
  return "live";
}

function form(input: Partial<ZingleInput>): FormData {
  const body = new FormData();
  if (input.name !== undefined) body.set("name", input.name);
  if (input.alt !== undefined) body.set("alt", input.alt);
  if (input.starts_at !== undefined) body.set("starts_at", input.starts_at);
  if (input.ends_at !== undefined) body.set("ends_at", input.ends_at ?? "");
  if (input.places !== undefined) body.set("places", input.places);
  if (input.show_app !== undefined) body.set("show_app", input.show_app ? "true" : "false");
  if (input.is_active !== undefined) body.set("is_active", input.is_active ? "true" : "false");
  if (input.animated) body.set("animated", input.animated);
  if (input.still) body.set("still", input.still);
  return body;
}

/** The list (a plain array, or a paginated `{results}` from an older shape). */
export async function getZingles(): Promise<Zingle[]> {
  const data = await request<Zingle[] | { results: Zingle[] }>("/api/admin/zingles/");
  return Array.isArray(data) ? data : (data?.results ?? []);
}

export const createZingle = (input: ZingleInput) => request<Zingle>("/api/admin/zingles/", { method: "POST", body: form(input) });

export const updateZingle = (id: number, input: Partial<ZingleInput>) =>
  request<Zingle>(`/api/admin/zingles/${id}/`, { method: "PATCH", body: form(input) });

export const deleteZingle = (id: number) => request<null>(`/api/admin/zingles/${id}/`, { method: "DELETE" });
