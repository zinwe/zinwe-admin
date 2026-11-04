import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { ApiError } from "../../../lib/api";
import { fetchWaMedia, type WaContact, type WaKind, type WaMedia, type WaParts, type WaStatus, type WaTrack } from "../../../lib/whatsappApi";

export const WA_STATUS: Record<WaStatus, [string, string]> = {
  ready: ["Ready", ""], messaged: ["Messaged", "warn"], replied: ["Replied", "warn"], interested: ["Interested", "good"],
  signed: ["Signed up", "good"], notnow: ["Not now", ""], stop: ["Do not message", "bad"],
};
export const KIND_LABEL: Record<WaKind, string> = {
  first: "First message", followup: "Follow-up", touch3: "No reply: polite close", touch4: "No reply: extra message",
  interested: "Reply: interested", question: "Reply: question", notnow: "Reply: not now", nurture: "After YES",
};
export const TRACK_LABEL: Record<WaTrack, string> = { "": "Every YES", data: "Data safety", day: "Team's day", chat: "Team chat" };
/** Fills the placeholders with a sample business, for previews. `first` = "" shows the no-name greeting:
 * "Hello Gupta Exim team" (as wa_names.py does when we don't know a real first name). */
export const sampleText = (t: string, firm = "Gupta Exim", first = "Rakesh"): string =>
  t.replace(/^\s*(Hi|Hello)\s+\{\{FirstName\}\}/, "{{Greeting}}")
    .replace(/\{\{Greeting\}\}/g, first ? `Hi ${first}` : `Hello ${firm} team`)
    .replace(/\{\{FirstName\}\}/g, first || `${firm} team`).replace(/\{\{(Firm|Business)\}\}/g, firm).replace(/\{\{City\}\}/g, "Noida")
    .replace(/\{\{HowWeKnow\}\}/g, "I found you on Google Maps, where you're rated 4.8.");

/** The outreach message structure, in order (wa_structure.py). `sent: false` parts stay out of the message. */
export const PARTS: { key: keyof WaParts; label: string; hint: string; required: boolean; sent: boolean; rows: number; example: string }[] = [
  { key: "creative", label: "Creative", hint: "A picture or video to send with it, or what to make. Text only for people who haven’t replied yet.", required: false, sent: false, rows: 2, example: "After they reply: a 10-second clip of the alert arriving" },
  { key: "intro", label: "Intro", hint: "After the greeting: who you are and how you know them. The greeting is added for you: “Hi Rohit,” or “Hello Webgross team,” when we don’t know a real name.", required: true, sent: true, rows: 2, example: "Vishal from Zinwe here. {{HowWeKnow}}" },
  { key: "problem", label: "Value: the problem", hint: "One real moment they’ll recognise. One line.", required: true, sent: true, rows: 2, example: "Client files often go to a pen drive “just for this project”." },
  { key: "solution", label: "Value: the solution", hint: "The one Zinwe feature that answers it. One line.", required: true, sent: true, rows: 2, example: "Zinwe alerts you and can set USB to read-only." },
  { key: "reward", label: "Reward", hint: "The cherry-on-top line.", required: true, sent: true, rows: 2, example: "Cherry on top: manage team activity, chat and share tasks without switching apps. Free forever." },
  { key: "cta", label: "Call to action", hint: "One easy ask they can answer in a word, and how to stop.", required: true, sent: true, rows: 2, example: "Useful for {{Business}}? Reply STOP to opt out." },
  { key: "details", label: "Other details", hint: "Optional last line: a link or a P.S. Never in a first message to a stranger.", required: false, sent: true, rows: 2, example: "" },
  { key: "notes", label: "Notes for replies", hint: "Never sent. Context for whoever answers next, like Claude in the browser: the value point, what to send after a YES, what not to promise.", required: false, sent: false, rows: 3, example: "Value point V2. If YES: send the YES reply. Use the approved answers." },
];

/** The text a structured template sends, exactly as the backend composes it. */
export const composeParts = (p: WaParts): string =>
  [`{{Greeting}}, ${(p.intro ?? "").trim()}`, ...(["problem", "solution", "reward", "cta", "details"] as const).map((k) => (p[k] ?? "").trim()).filter(Boolean)].join("\n\n");
export const isStructured = (p?: WaParts | null): boolean => !!p && Object.values(p).some((v) => (v ?? "").trim());
export const WaPill = ({ s }: { s: WaStatus }): ReactElement => <span className={"pill " + WA_STATUS[s][1]}>{WA_STATUS[s][0]}</span>;
export const errText = (err: unknown, fallback: string): string => (err instanceof ApiError ? err.message : fallback);
/** Who the contact is, as drafts greet them (see wa_names.py), so screens and messages agree. */
export const nameOf = (c: Pick<WaContact, "first_name" | "info" | "firm"> & Partial<Pick<WaContact, "greet_as">>): string =>
  c.greet_as || c.info?.contact_name || c.first_name || c.firm;
export const initials = (s: string): string =>
  s.replace(/^Dr\.? /i, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
export const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso.length > 10 ? iso : `${iso}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

/** The WhatsApp tabs, shared by every WhatsApp page. */
export function WaTabs({ count }: { count?: number }): ReactElement {
  const link = ({ isActive }: { isActive: boolean }) => "tab tablink" + (isActive ? " on" : "");
  return (
    <nav className="tabs" aria-label="WhatsApp">
      <NavLink to="/marketing/whatsapp" end className={link}>Today{count ? <em className="wa-count">{count}</em> : null}</NavLink>
      <NavLink to="/marketing/whatsapp/contacts" className={link}>Contacts</NavLink>
      <NavLink to="/marketing/whatsapp/campaigns" className={link}>Campaigns</NavLink>
      <NavLink to="/marketing/whatsapp/templates" className={link}>Templates</NavLink>
      <NavLink to="/marketing/whatsapp/analytics" className={link}>Analytics</NavLink>
      <NavLink to="/marketing/whatsapp/settings" className={link}>Settings</NavLink>
    </nav>
  );
}

/** A message the way it lands in a WhatsApp chat. With `media`, the picture or video sits above the text, as in WhatsApp. */
export function Bubble({ text, mine = true, meta, media }: { text: string; mine?: boolean; meta?: string; media?: ReactNode }): ReactElement {
  return (
    <div className={"wa-bub" + (mine ? " me" : "") + (media ? " has-media" : "")}>
      {media}
      {text}
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}

/** Messages to people who haven't replied stay text only: to a stranger, a picture or video looks like spam. */
export const COLD_KINDS: WaKind[] = ["first", "followup", "touch3", "touch4"];
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
export const mediaWord = (kind: "image" | "video"): string => (kind === "image" ? "picture" : "video");
export const sizeText = (bytes: number): string => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Checks a picked file the way the server does, so mistakes show before saving. */
export function mediaProblem(file: File): string {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return file.size > 5 * 1048576 ? "Pictures can be up to 5 MB." : "";
  if (["mp4", "mov"].includes(ext)) return file.size > 9 * 1048576 ? "Videos can be up to 9 MB here. Shorten it, or export it at 720p." : "";
  return "Use a JPG, PNG or WebP picture, or an MP4 or MOV video.";
}

/** Shows a saved picture or video (fetched with the staff token) or a file just picked. */
export function MediaView({ media, file }: { media?: WaMedia | null; file?: File | null }): ReactElement | null {
  const [src, setSrc] = useState("");
  const kind = file ? (file.type.startsWith("video") || /\.(mp4|mov)$/i.test(file.name) ? "video" : "image") : media?.kind;
  useEffect(() => {
    let url = "";
    let alive = true;
    if (file) {
      url = URL.createObjectURL(file);
      setSrc(url);
    } else if (media) {
      fetchWaMedia(media.url).then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      }).catch(() => setSrc(""));
    } else {
      setSrc("");
    }
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, media?.url, media?.size]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kind) return null;
  if (!src) return <span className="wa-media wa-media-wait" aria-label="Loading" />;
  return kind === "video"
    ? <video className="wa-media" src={src} controls preload="metadata" aria-label="Video" />
    : <img className="wa-media" src={src} alt="Picture sent with this message" />;
}
