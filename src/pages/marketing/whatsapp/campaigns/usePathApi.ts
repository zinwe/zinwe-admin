import { useEffect, useState } from "react";
import { getWaPresets, type WaCampaign, type WaPreset } from "../../../../lib/whatsappApi";

/** The ready paths, asked once per visit. null = this server has no path API (404/405 or any failure). */
let presets: Promise<WaPreset[] | null> | null = null;
export function loadPresets(): Promise<WaPreset[] | null> {
  if (!presets) {
    presets = getWaPresets().then((list) => (Array.isArray(list) ? list : null)).catch(() => null);
    // A failed probe is asked again next time (the backend may be restarting).
    void presets.then((x) => { if (!x) presets = null; });
  }
  return presets;
}

/**
 * Does this server run campaign paths? Yes at once when a campaign says its `engine`; otherwise the presets route
 * decides. undefined while asking. Without it the tab shows the older campaign view, unchanged.
 */
export function usePathApi(campaigns: WaCampaign[]): { on: boolean | undefined; presets: WaPreset[] | null } {
  const known = campaigns.some((c) => c.engine === "path" || c.engine === "slots");
  const [list, setList] = useState<WaPreset[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadPresets().then((x) => { if (alive) setList(x); });
    return () => { alive = false; };
  }, []);
  return { on: known ? true : list === undefined ? undefined : list !== null, presets: list ?? null };
}
