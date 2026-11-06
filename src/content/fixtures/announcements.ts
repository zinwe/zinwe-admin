/**
 * Preview copy for User interactions (F-22) announcement bars: the dashboard's automatic plan / payment bars for
 * "Preview as" and "Which bar wins", and the owner name in previews. These mirror the dashboard's own bars; they are
 * preview copy, not customer data.
 */

export type PreviewAs = "normal" | "ended" | "ending" | "payment" | "full";

export const PREVIEW_AS: { value: PreviewAs; label: string }[] = [
  { value: "normal", label: "A customer with nothing pending" },
  { value: "ended", label: "Plan ended" },
  { value: "ending", label: "Plan ends in 3 days" },
  { value: "payment", label: "Payment being checked" },
  { value: "full", label: "49 of 50 PCs used" },
];

export interface SystemBar {
  bar: string;
  fg: string;
  btnBg: string;
  btnFg: string;
  icon: "warn" | "clock" | "pcs";
  title: string;
  msg: string;
  btn: string;
  name: string;
}

export const SYSTEM_BARS: Record<Exclude<PreviewAs, "normal">, SystemBar> = {
  ended: { bar: "#FCE8E4", fg: "#8E2414", btnBg: "#8E2414", btnFg: "#FFFFFF", icon: "warn", title: "Your Businesses plan ended on 25 Oct.", msg: "Renew to keep alerts and backups running.", btn: "Renew", name: "plan ended" },
  ending: { bar: "#FDEBDC", fg: "#8A3A04", btnBg: "#8A3A04", btnFg: "#FFFFFF", icon: "clock", title: "Your Businesses plan ends in 3 days.", msg: "Renew now so nothing stops on Sat 31 Oct.", btn: "Renew", name: "plan ends soon" },
  payment: { bar: "#F5F5F5", fg: "#141210", btnBg: "", btnFg: "", icon: "clock", title: "We’re checking your payment.", msg: "This usually takes a few hours. Everything keeps working.", btn: "", name: "payment being checked" },
  full: { bar: "#FDEBDC", fg: "#8A3A04", btnBg: "#8A3A04", btnFg: "#FFFFFF", icon: "pcs", title: "49 of 50 PCs used.", msg: "Add PCs before you run out.", btn: "Add PCs", name: "PCs nearly full" },
};

export const BAR_LADDER: { key: PreviewAs | "ann"; label: string }[] = [
  { key: "ended", label: "Plan ended" },
  { key: "ending", label: "Plan ends within 7 days" },
  { key: "payment", label: "Payment being checked" },
  { key: "full", label: "PCs nearly full" },
  { key: "ann", label: "Your announcement" },
];

/** Name shown in the dashboard preview greeting. */
export const PREVIEW_OWNER = "Ananya";
