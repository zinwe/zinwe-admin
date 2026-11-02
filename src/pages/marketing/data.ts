/** Marketing reference content: segments, suggestions and the copy brief. Only features that ship today. */
import type { Audience, BusinessType, Confidence, Objective, Persona } from "../../lib/marketingApi";
import { formOf, personaBriefLines, rowsOf } from "./persona";

const S_USB = "Alerts when files are copied to a USB drive";
const S_RULE = "Allow, read-only or block for USB drives";
const S_BIG = "Large transfer alerts for USB, shared folders and email attachments";
const S_REMOTE = "Alerts when remote tools like AnyDesk or TeamViewer are in use";
const S_SOFT = "Alerts when new software appears on a PC";
const S_DAY = "Log in, break and log out from the PC widget";
const S_APPS = "See which apps were used and for how long";
const S_CHAT = "Owner-to-employee chat on the PC widget";
const S_SEEN = "Ready-made notes with sent, delivered and seen status";

export const COUNTRIES = ["USA", "India"];
export const CHANNELS = ["Email", "LinkedIn", "Google Ads", "Meta Ads", "SEO", "Instagram", "Facebook", "YouTube", "WhatsApp"];
export const BUSINESS_TYPES = ["B2B", "B2C", "Both"] as const;
export const BUSINESS_TYPE_TEXT: Record<BusinessType, [string, string]> = {
  B2B: ["Other businesses", "B2B"],
  B2C: ["The public", "B2C"],
  Both: ["Both", "B2B and B2C"],
};
/** Named by what the person does, in funnel order, so no two read alike. The stored values stay as they are. */
export const OBJECTIVES: Objective[] = ["Brand Awareness", "Enquiries", "Leads", "Sales"];
export const OBJECTIVE_TEXT: Record<Objective, [string, string]> = {
  "Brand Awareness": ["Awareness", "They get to know Zinwe"],
  Enquiries: ["Conversations", "They reply or contact us"],
  Leads: ["Free signups", "They create a free account"],
  Sales: ["Paid plans", "They buy or upgrade"],
};
export const STATES: Record<string, string[]> = {
  USA: [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
    "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas",
    "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  ],
  India: [
    "Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
    "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana",
    "Uttar Pradesh", "Uttarakhand", "West Bengal",
  ],
};

export const SEGMENTS: [string, string, string][] = [
  ["CPA and accounting firms", "Client files leaving with staff", "One-PC USB test for client files"],
  ["Digital agencies", "Client work leaving when people move on", "Check what leaves on your busiest PC"],
  ["Clinics", "A stranger asking for remote access", "Remote-access alerts on the front-desk PC"],
  ["Small IT and BPO shops", "Remote tools running without anyone knowing", "See which remote tools are in use"],
  ["Traders and export houses", "Customer lists copied to USB drives", "USB allow, read-only and block setup"],
  ["Design studios", "Instructions lost in calls and group chats", "Team chat on one PC widget"],
];

type Library = { problems?: string[]; solutions?: string[]; offers?: string[]; triggers?: string[]; words?: string[]; objections?: string[]; not_for?: string[] };

const LIBRARY: Library[] = [
  {
    problems: ["Client files leaving with staff", "Client files copied to USB drives", "Client files copied to pen drives", "No rule for which USB drives are allowed"],
    solutions: [S_USB, S_RULE, S_BIG, S_SOFT],
    offers: ["One-PC USB test for client files", "2-minute USB test"],
    triggers: ["A senior accountant just resigned", "A client asked how their files are protected"],
    words: ["Client files", "Tax season", "Audit season"],
    objections: ["We have no time during tax season", "We already have antivirus"],
  },
  {
    problems: ["Client work leaving when people move on", "Large project files moved out without anyone knowing", "Remote tools on PCs nobody approved", "Hard to see who is working on what day"],
    solutions: [S_BIG, S_USB, S_REMOTE, S_DAY, S_APPS],
    offers: ["Check what leaves on your busiest PC"],
    triggers: ["A designer or account lead just gave notice", "The agency just won a bigger client"],
    words: ["Client work", "Deliverables", "Offboarding"],
    objections: ["We already keep everything in the cloud", "Most of our team is on Macs"],
  },
  {
    problems: ["A stranger asking for remote access", "Fake support calls to the front desk", "Patient files copied to pen drives", "Unknown software on the front-desk PC"],
    solutions: [S_REMOTE, S_USB, S_SOFT],
    offers: ["Remote-access alerts on the front-desk PC"],
    triggers: ["Someone called asking to install AnyDesk", "A nearby clinic had a scam call"],
    words: ["AnyDesk scam", "Front desk", "Patient files"],
    objections: ["Will it slow the front-desk PC?", "Nobody here can install software"],
  },
  {
    problems: ["Remote tools running without anyone knowing", "Unknown software on team PCs", "Shifts and breaks hard to follow"],
    solutions: [S_REMOTE, S_SOFT, S_DAY, S_APPS],
    offers: ["See which remote tools are in use"],
    triggers: ["A client asked who can reach their systems", "A shift lead just left"],
    words: ["Remote tools", "Shifts", "Client systems"],
    objections: ["We already manage our own PCs", "Our team needs remote tools for work"],
  },
  {
    problems: ["Customer lists copied to USB drives", "Price lists leaving in large email attachments", "No rule for which pen drives are allowed"],
    solutions: [S_RULE, S_USB, S_BIG],
    offers: ["USB allow, read-only and block setup"],
    triggers: ["A sales person left for a rival", "A customer list turned up with a competitor"],
    words: ["Pen drive", "Customer list", "Data chori"],
    objections: ["I trust my old staff", "USB drives are how we share files"],
  },
  {
    problems: ["Instructions lost in calls and group chats", "Large design files moved without anyone knowing", "Hard to see the working day"],
    solutions: [S_CHAT, S_SEEN, S_BIG, S_DAY],
    offers: ["Team chat on one PC widget"],
    triggers: ["A client deadline was missed over a lost message", "The team grew past a few people"],
    words: ["Brief", "Revisions", "Group chat"],
    objections: ["We already use WhatsApp or Slack", "We work on Macs"],
  },
];

const COMMON: Library = {
  problems: ["No IT person to set rules", "Not knowing what software is on each PC", "Not knowing what left the company"],
  solutions: [S_USB, S_REMOTE, S_SOFT, S_DAY, S_CHAT],
  offers: ["Free forever plan", "Install on one PC first"],
  triggers: ["Someone senior just resigned", "The team just grew", "A nearby business had a data scare"],
  words: ["Office", "Team", "No IT person"],
  objections: ["Is this spying on my staff?", "My team will feel watched", "We are too small to need this", "Who will install it for us?"],
  not_for: ["Firms with their own IT team", "Anyone who wants to watch staff without telling them", "Offices that only use Mac or Linux"],
};

export const lc1 = (s: string): string => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

const split = (text: string | undefined): string[] => (text ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export type Groups = [string, string[]][];

/** Channels worth starting with, for the category picked. */
export function suggestedChannels(category: string, country: string): string[] {
  const us = country === "USA";
  const seg = SEGMENTS.findIndex((x) => x[0] === category);
  if (seg < 0) return [];
  return [
    ["LinkedIn", us ? "Email" : "WhatsApp"],
    ["LinkedIn", "Instagram"],
    [us ? "Email" : "WhatsApp", "Facebook"],
    ["LinkedIn", "Email"],
    [us ? "LinkedIn" : "WhatsApp", us ? "Email" : "Facebook"],
    ["Instagram", "LinkedIn"],
  ][seg];
}

/** Suggestions for one field: what fits the category first, then what the persona already knows. */
export function suggest(field: string, d: Audience, p: Persona): Groups {
  const seg = LIBRARY[SEGMENTS.findIndex((x) => x[0] === d.business_category)];
  const forSeg = (list?: string[]): Groups => (seg && list ? [[`For ${lc1(d.business_category)}`, list]] : []);
  const pains = rowsOf(p, "pains");
  const fromPersona = (list: string[]): Groups => (list.length ? [["From the persona", list]] : []);
  const anyBusiness = (list?: string[]): Groups => (list ? [["For any small business", list]] : []);
  switch (field) {
    case "state":
      return STATES[d.country] ? [["States", STATES[d.country]]] : [];
    case "business_category":
      return [["Categories", SEGMENTS.map((s) => s[0])]];
    case "business_segment":
      return [["By size", ["Firms of 5–15 people", "Firms of 15–50 people", "Owner-run startups", "Growing teams"]]];
    case "primary_problem":
    case "secondary_problem":
      return [...forSeg(seg?.problems), ...fromPersona(pains.map((r) => r.pain).filter(Boolean)), ...anyBusiness(COMMON.problems)];
    case "how_solves":
      return [...forSeg(seg?.solutions), ...fromPersona(pains.map((r) => r.solution).filter(Boolean)), ...anyBusiness(COMMON.solutions)];
    case "key_benefits":
      return [...fromPersona(pains.map((r) => r.benefit).filter(Boolean)), ...forSeg(seg?.solutions)];
    case "primary_offer":
      return [...forSeg(seg?.offers), ...fromPersona(split(formOf(p, "email").offer)), ...anyBusiness(COMMON.offers)];
    case "cta":
      return [["Common", ["Try it on one PC", "Start free", "Reply yes", "See plans", "Contact us"]]];
    case "job_titles":
      return fromPersona(split(formOf(p, "email").titles));
    case "decision_makers":
      return fromPersona(split(formOf(p, "icp_b2b").designation));
    case "industry_keywords":
      return [...forSeg(seg?.words), ...fromPersona([...split(formOf(p, "keywords").primary), ...split(formOf(p, "keywords").industry)])];
    case "competitors":
      return fromPersona(split(formOf(p, "business").competitors));
    default:
      return [];
  }
}

export const CONFIDENCE: Record<Confidence, [string, string]> = {
  Guess: ["", "Guess, not yet checked with real people"],
  "Heard once": ["warn", "Heard once, from one real person"],
  Confirmed: ["good", "Confirmed by several real people"],
};

/** A new audience starts from its persona: product, offer, call to action and titles carry over, ready to change. */
export function blankAudience(p: Persona): Audience {
  const business = formOf(p, "business");
  const email = formOf(p, "email");
  const goal = formOf(p, "definition").goal;
  return {
    persona: p.id as number, name: "", country: "USA", state: "", city: "", business_category: "", business_segment: "",
    business_type: business.model === "B2B2C" ? "Both" : business.model === "B2C" || business.model === "D2C" ? "B2C" : "B2B",
    primary_problem: "", secondary_problem: "", product_service: business.product ?? "", how_solves: "", key_benefits: [],
    primary_offer: email.offer ?? "", pricing: (business.pricing ?? "").slice(0, 240),
    objective: goal === "Purchase" || goal === "Subscription" ? "Sales" : goal === "Demo" || goal === "Consultation" ? "Enquiries" : "Leads",
    cta: email.cta ?? "", job_titles: split(email.titles), decision_makers: [], industry_keywords: [], competitors: [], notes: "", channels: [],
  };
}

export const place = (a: Pick<Audience, "city" | "state" | "country">): string => [a.city, a.state, a.country].filter(Boolean).join(", ");

const ABOUT_ZINWE = [
  "About Zinwe:",
  "Zinwe by SKYTECHNO is data protection and activity monitoring for small businesses of 5–50 people with no IT department. A small agent on each employee's Windows PC gives the owner plain-English alerts. It is consent-first: employees see the Zinwe widget and agree to a notice on their own PC.",
  "", "When you answer:",
  "- Write for a busy owner who is not technical, in short plain sentences.",
  '- Say "protect company data" and "know what left". Never use spying or catching language.',
  "- Zinwe runs on Windows only today. It does not read messages, record screens or log keystrokes.",
  "- Do not invent numbers, reviews or customer names.",
  "- Do not quote prices or PC limits. Point to zinwe.io/plans.",
  "- No legal or compliance claims.",
  "", "My question:", "",
];

export function personaBrief(p: Persona): string {
  return [`Persona brief: ${p.name || "New persona"} (${CONFIDENCE[p.confidence][1]})`, "", ...personaBriefLines(p), "", ...ABOUT_ZINWE].join("\n");
}

export function audienceBrief(d: Audience, p: Persona): string {
  const L = [`Target audience brief: ${d.name || "New audience"}`, "", `Location: ${place(d)}`];
  const line = (label: string, value: string) => {
    if (value.trim()) L.push(`${label}: ${value.trim()}`);
  };
  const list = (title: string, items: string[]) => {
    if (items.length) L.push("", title, ...items.map((v) => `- ${v}`));
  };
  line("Business category", d.business_category);
  line("Business segment", d.business_segment);
  line("Business type", d.business_type);
  L.push("");
  line("Primary problem", d.primary_problem);
  line("Secondary problem", d.secondary_problem);
  line("Product or service", d.product_service);
  line("How it solves the problem", d.how_solves);
  list("Key benefits:", d.key_benefits);
  L.push("");
  line("Primary offer", d.primary_offer);
  line("Pricing", d.pricing);
  line("Campaign objective", `${OBJECTIVE_TEXT[d.objective][0]} (${OBJECTIVE_TEXT[d.objective][1].toLowerCase()})`);
  line("Call to action", d.cta);
  list("Target job titles:", d.job_titles);
  list("Target decision makers:", d.decision_makers);
  list("Industry keywords:", d.industry_keywords);
  list("Competitor names:", d.competitors);
  if (d.notes.trim()) L.push("", "Additional notes:", d.notes.trim());
  const plans = rowsOf(p, "channels");
  if (d.channels.length) {
    L.push("", "Channels, best first:");
    d.channels.forEach((c, i) => {
      const plan = plans.find((r) => r.channel === c);
      L.push(`${i + 1}. ${c}${plan?.strategy ? `: ${plan.strategy}` : ""}`);
    });
  }
  const base = formOf(p, "definition");
  L.push("", `Base persona: ${p.name} (${CONFIDENCE[p.confidence][1]})`);
  line("Ideal customer", base.customer ?? "");
  line("Primary message", base.message ?? "");
  line("Biggest frustrations", formOf(p, "psychology").frustrations ?? "");
  line("Trust factors", formOf(p, "psychology").trust ?? "");
  L.push("", ...ABOUT_ZINWE);
  return L.join("\n");
}

/** What each channel suits and the rule that comes with it. */
export const CHANNEL_GUIDE: Record<string, [string, string]> = {
  Email: ["Firms with a verified work email", "Unsubscribe and postal address in every email"],
  LinkedIn: ["Owners and partners of B2B firms", "You send every message yourself"],
  "Google Ads": ["People searching for a fix right now", "The owner approves every ad and budget"],
  "Meta Ads": ["Local owners by interest", "The owner approves every ad and budget"],
  SEO: ["Owners searching a specific worry", "Useful articles only, no legal topics"],
  Instagram: ["Visual businesses and studios", "Use it for trust, not cold selling"],
  Facebook: ["Local small business owners", "Be useful first, avoid spamming groups"],
  YouTube: ["The person who runs the setup", "How-tos first, no hard selling"],
  WhatsApp: ["Indian owners who already know you", "Only with their permission, no bulk cold messages"],
};
