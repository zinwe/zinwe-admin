import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { ApiError } from "../../../lib/api";
import {
  fetchWaMedia, type WaCampaignStatus, type WaCategory, type WaContact, type WaKind, type WaLanguage, type WaMedia, type WaParts, type WaStatus,
  type WaTemplate, type WaTestimonial, type WaTrack,
} from "../../../lib/whatsappApi";

export const LANG_LABEL: Record<WaLanguage, string> = { en: "English", hi: "Hinglish" };

export const WA_STATUS: Record<WaStatus, [string, string]> = {
  ready: ["Ready", ""], messaged: ["Messaged", "warn"], replied: ["Replied", "warn"], interested: ["Interested", "good"],
  signed: ["Signed up", "good"], notnow: ["Not now", ""], stop: ["Do not message", "bad"],
};
export const KIND_LABEL: Record<WaKind, string> = {
  first: "First message", followup: "Follow-up", touch3: "No reply: polite close", touch4: "No reply: extra message",
  interested: "Reply: interested", question: "Reply: question", notnow: "Reply: not now", nurture: "After YES",
};
/** On older after-YES templates "" = every YES; on a contact it is Unassigned (UNASSIGNED). */
export const TRACK_LABEL: Record<WaTrack, string> = { "": "Every YES", privacy: "Data Privacy", activity: "Team Activity Monitoring", both: "Both Pack" };
export const TRACKS: Exclude<WaTrack, "">[] = ["privacy", "activity", "both"];
export const trackName = (t: WaTrack | undefined): string => (t ? TRACK_LABEL[t] : "Unassigned");

/** The 90-day campaign (100 Reviews): categories in the order a contact meets them, and each one's types. */
export const CATEGORY_LABEL: Record<Exclude<WaCategory, "">, string> = {
  outreach: "Intro", engage: "Engage", demo_video: "Demo video", setup: "Setup", demo_call: "Demo call",
  offer: "Offer & discount", testimonial: "Testimonial", quick_reply: "Quick reply",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Exclude<WaCategory, "">[];
export const TRACKED: WaCategory[] = ["engage", "demo_video"];
export const CATEGORY_TYPES: Record<Exclude<WaCategory, "">, string[]> = {
  outreach: ["Intro", "Problem", "Value", "Question", "Season or event", "Offer", "Discount"],
  engage: ["Need discovery", "Qualification question", "Track confirmation"],
  demo_video: ["Overview video", "Feature clip", "Recap and next step"],
  setup: ["Registration steps", "Incomplete-setup nudge"],
  demo_call: ["Booking link", "Reminder", "After the call"],
  offer: ["Startup pack", "Team pack", "Any pack (event)", "Team pack (event)"],
  testimonial: ["Written request", "Video request"],
  quick_reply: ["STOP / band karo", "Price question", "Is this spyware?", "Not now", "We already use something", "Send it on email", "Where did you get my number?"],
};
export const CATEGORY_HELP: Record<Exclude<WaCategory, "">, string> = {
  outreach: "Cold messages on days 1–90, no Track. A reply moves the contact to Replied.",
  engage: "After their YES: questions to find what they want. Their answer sets the contact’s Track.",
  demo_video: "After the Track is set: that Track’s 6 videos, one a day.",
  setup: "After the demo: the registration steps, then a nudge if no PC is connected 3 days later.",
  demo_call: "Only when setup hits an error, and only for existing businesses.",
  offer: "The stage’s code for their pack. One code per business, first month only, 40% at most. Festival codes are picked by hand.",
  testimonial: "14 days after their first PC, paid or free: written first, then video if they are happy to.",
  quick_reply: "Answers to a message (a question, an objection, STOP), any time. Never moves the path.",
};
export const CAMPAIGN_STATUS: Record<WaCampaignStatus, [string, string]> = {
  "": ["Not started", ""], messaged: ["Messaged", ""], replied: ["Replied", "warn"], yes: ["YES", "good"], engaged: ["Engaged", "good"],
  track_assigned: ["Track assigned", "good"], demo_video_sent: ["Demo video sent", "good"], setup: ["Setup", "good"],
  demo_call: ["Demo call", "good"], offer: ["Offer", "good"], paid: ["Paid", "good"], no_reply: ["No reply", ""], opted_out: ["Opted out", "bad"],
};
export const CampaignPill = ({ s }: { s: WaCampaignStatus | undefined }): ReactElement => <span className={"pill " + CAMPAIGN_STATUS[s ?? ""][1]}>{CAMPAIGN_STATUS[s ?? ""][0]}</span>;
export const TESTIMONIAL_LABEL: Record<WaTestimonial, string> = { "": "Not asked yet", written_asked: "Written: asked", written: "Written: got it", video_asked: "Video: asked", video: "Video: got it" };
/** The Track an Engage answer points to, as the backend suggests it (wa_flow.suggest_track); staff decide. */
export function suggestTrack(text: string): WaTrack {
  const t = text.toLowerCase();
  if (/\b(both|dono|donon)\b/.test(t)) return "both";
  const privacy = /file|data|pen ?drive|usb|access|client|laptop|cop(y|ies)|leak|secur|safe|password/.test(t);
  const activity = /\bteam|staff|who (is|does|works)|\bday\b|activity|monitor|productiv|kaam|\bdin\b|attendance|hours|working/.test(t);
  return privacy && !activity ? "privacy" : activity && !privacy ? "activity" : "";
}
/** Fills the placeholders with a sample business, for previews. `first` = "" shows the no-name greeting:
 * "Hello Gupta Exim team" (as wa_names.py does when we don't know a real first name). */
export const sampleText = (t: string, firm = "Gupta Exim", first = "Rakesh", lang: WaLanguage = "en"): string =>
  t.replace(/^\s*(Hi|Hello)\s+\{\{FirstName\}\}/, "{{Greeting}}")
    .replace(/\{\{Greeting\}\}/g, lang === "hi" ? (first ? `Namaste ${first} ji` : `Namaste ${firm} team`) : first ? `Hi ${first}` : `Hello ${firm} team`)
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

/** The media picker, shared by the template editors: cold messages stay text only. */
export function MediaPicker({ t, cold, file, setFile, drop, setDrop }: {
  t: WaTemplate; cold: boolean; file: File | null; setFile: (f: File | null) => void; drop: boolean; setDrop: (d: boolean) => void;
}): ReactElement {
  const [problem, setProblem] = useState("");
  const kept = drop ? null : t.media ?? null;
  const showing = !cold && (file || kept);
  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const why = mediaProblem(picked);
    setProblem(why);
    if (!why) {
      setFile(picked);
      setDrop(false);
    }
  };
  if (cold) {
    return <span className="k">{KIND_LABEL[t.kind]} goes to people who haven’t replied, so it stays text only: to a stranger, a picture or video looks like spam. Put the creative idea above and use it on the reply.{t.media && !drop ? " Its saved file will be removed when you save." : ""}</span>;
  }
  return (
    <>
      {showing ? (
        <div className="wa-mfile">
          <span>{file ? `${file.name} · ${sizeText(file.size)}` : `${kept?.name} · ${sizeText(kept?.size ?? 0)}`}</span>
          <div className="fr">
            <label className="btn sm">Replace<input className="sr" type="file" accept={MEDIA_ACCEPT} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <button type="button" className="btn sm" onClick={() => { setFile(null); setDrop(true); setProblem(""); }}>Remove</button>
          </div>
        </div>
      ) : (
        <label className="wa-mdrop">
          <input className="sr" type="file" accept={MEDIA_ACCEPT} aria-label="Choose a picture or video" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          <b>Add the creative: a picture or video</b>
          <span className="k">JPG, PNG or WebP up to 5 MB · MP4 or MOV up to 9 MB</span>
        </label>
      )}
      {problem ? <span className="aferr" role="alert">{problem}</span> : null}
      {showing ? <span className="k">WhatsApp links carry text only. When you send this, Today shows the {mediaWord(file ? (file.type.startsWith("video") ? "video" : "image") : kept?.kind ?? "image")} to paste or attach in the chat.</span> : null}
    </>
  );
}
