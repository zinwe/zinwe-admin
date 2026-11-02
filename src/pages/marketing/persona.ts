/** The 12 persona sections: labels, and how each is stored in `Persona.profile`. Add a field here and the page picks it up. */
import type { Persona, ProfileForm, ProfileRow } from "../../lib/marketingApi";

export interface PField {
  key: string;
  label: string;
  wide?: boolean;
  options?: string[];
}

export interface PGroup {
  store: string;
  title?: string;
  /** Show this group only for these business models. */
  models?: string[];
  fields: PField[];
}

export interface PTable {
  store: string;
  addLabel: string;
  columns: { key: string; label: string }[];
}

export interface PSection {
  title: string;
  help: string;
  groups?: PGroup[];
  table?: PTable;
}

const f = (key: string, label: string, wide?: boolean): PField => ({ key, label, wide });

export const BUSINESS_MODELS = ["B2B", "B2C", "D2C", "B2B2C"];
export const CONVERSION_GOALS = ["Lead", "Demo", "Consultation", "Purchase", "Subscription"];

export const SECTIONS: PSection[] = [
  {
    title: "Business and product",
    help: "The facts every campaign is built on.",
    groups: [{
      store: "business",
      fields: [
        f("brand", "Brand or company name"), f("product", "Product or service name"), f("website", "Website"), f("industry", "Industry"),
        { key: "model", label: "Business model", options: BUSINESS_MODELS }, f("market", "Geographic market"),
        f("description", "Product or service description", true), f("value", "Core value proposition", true),
        f("pricing", "Pricing or average order value", true), f("competitors", "Main competitors", true),
      ],
    }],
  },
  {
    title: "Ideal customer",
    help: "The customer most likely to buy. The fields follow your business model.",
    groups: [
      {
        store: "icp_b2b",
        title: "For B2B",
        models: ["B2B", "B2B2C"],
        fields: [
          f("industry", "Industry", true), f("type", "Business type"), f("size", "Company size"), f("revenue", "Annual revenue"), f("employees", "Number of employees"),
          f("location", "Business location"), f("decider", "Decision maker"), f("designation", "Decision maker's designation"), f("authority", "Buying authority"),
          f("tech", "Technology used"), f("maturity", "Business maturity"),
        ],
      },
      {
        store: "icp_b2c",
        title: "For B2C",
        models: ["B2C", "D2C", "B2B2C"],
        fields: [
          f("age", "Age group"), f("gender", "Gender"), f("location", "Location"), f("income", "Income level"), f("occupation", "Occupation"), f("education", "Education"),
          f("lifestyle", "Lifestyle"), f("interests", "Interests"), f("power", "Purchasing power"),
        ],
      },
    ],
  },
  {
    title: "Customer psychology",
    help: "Why they buy.",
    groups: [{
      store: "psychology",
      fields: [
        f("primary", "Primary problems"), f("secondary", "Secondary problems"), f("frustrations", "Biggest frustrations"), f("outcomes", "Desired outcomes"),
        f("goals", "Personal or business goals"), f("motivations", "Buying motivations"), f("triggers", "Emotional triggers"), f("behaviour", "Purchasing behaviour"),
        f("brands", "Brand preferences"), f("trust", "Trust factors"),
      ],
    }],
  },
  {
    title: "Pain points and solutions",
    help: "Each pain, our answer and what the customer gets. Target audiences suggest from this table.",
    table: {
      store: "pains",
      addLabel: "Add a pain point",
      columns: [{ key: "pain", label: "Customer pain point" }, { key: "solution", label: "Our solution" }, { key: "benefit", label: "Expected benefit" }],
    },
  },
  {
    title: "Buying journey",
    help: "What moves them from first hearing about us to recommending us.",
    groups: [{
      store: "journey",
      fields: [
        f("awareness", "Awareness: how do they discover us?"), f("interest", "Interest: what makes them interested?"), f("consideration", "Consideration: what alternatives do they compare?"),
        f("intent", "Intent: what triggers their buying decision?"), f("purchase", "Purchase: what makes them pay?"), f("retention", "Retention: why would they continue?"),
        f("referral", "Referral: why would they recommend us?", true),
      ],
    }],
  },
  {
    title: "Marketing channels",
    help: "How to target on each channel. Target audiences show this when you pick a channel.",
    table: {
      store: "channels",
      addLabel: "Add a channel",
      columns: [{ key: "channel", label: "Channel" }, { key: "strategy", label: "Targeting strategy" }, { key: "objective", label: "Objective" }],
    },
  },
  {
    title: "Keywords and interests",
    help: "Separate keywords with commas.",
    groups: [{
      store: "keywords",
      fields: [
        f("primary", "Primary keywords"), f("secondary", "Secondary keywords"), f("competitor", "Competitor keywords"), f("industry", "Industry keywords"),
        f("problem", "Problem-based keywords"), f("product", "Product-based keywords"), f("intent", "Search intent"), f("interests", "Relevant social media interests"),
      ],
    }],
  },
  {
    title: "Email targeting",
    help: "New target audiences start with the job titles, offer and call to action from here.",
    groups: [{
      store: "email",
      fields: [
        f("titles", "Target job titles"), f("industries", "Target industries"), f("size", "Company size"), f("location", "Geographic location"), f("pain", "Prospect's pain point"),
        f("objective", "Email campaign objective"), f("variables", "Personalization variables"), f("offer", "Primary offer"), f("cta", "Desired CTA"), f("followup", "Follow-up strategy"),
      ],
    }],
  },
  {
    title: "Advertising strategy",
    help: "The defaults for paid campaigns. The owner approves every ad and budget.",
    groups: [{
      store: "ads",
      fields: [
        f("objective", "Campaign objective"), f("audience", "Target audience"), f("age", "Audience age"), f("geo", "Geographic target"), f("interests", "Interests"), f("behaviours", "Behaviours"),
        f("custom", "Custom audience"), f("lookalike", "Lookalike audience"), f("retargeting", "Retargeting audience"), f("exclusion", "Exclusion audience"),
        f("creative", "Creative direction"), f("message", "Core advertising message"), f("offer", "Offer"), f("cta", "CTA"),
      ],
    }],
  },
  {
    title: "Customer segments",
    help: "Divide your audience by buying potential.",
    table: {
      store: "segments",
      addLabel: "Add a segment",
      columns: [{ key: "segment", label: "Segment" }, { key: "traits", label: "Characteristics" }, { key: "approach", label: "Marketing approach" }],
    },
  },
  {
    title: "Competitors and market",
    help: "Use facts you can cite. We never run competitors down in public.",
    groups: [{
      store: "market",
      fields: [
        f("direct", "Direct competitors"), f("indirect", "Indirect competitors"), f("audience", "Competitor audience"), f("positioning", "Competitor positioning"), f("pricing", "Competitor pricing"),
        f("channels", "Competitor marketing channels"), f("gaps", "Market gaps"), f("advantage", "Our competitive advantage"),
      ],
    }],
  },
  {
    title: "Final target definition",
    help: "The persona in one place. This is what shows at the top of the page.",
    groups: [{
      store: "definition",
      fields: [
        f("customer", "Our ideal customer is", true), f("message", "Our primary marketing message", true),
        { key: "goal", label: "Our primary conversion goal", options: CONVERSION_GOALS }, f("strategy", "Our customer acquisition strategy", true),
      ],
    }],
  },
];

export const formOf = (p: Persona, store: string): ProfileForm => {
  const v = p.profile[store];
  return v && !Array.isArray(v) ? v : {};
};

export const rowsOf = (p: Persona, store: string): ProfileRow[] => {
  const v = p.profile[store];
  return Array.isArray(v) ? v : [];
};

export const groupsFor = (s: PSection, p: Persona): PGroup[] => {
  const model = formOf(p, "business").model || "B2B";
  return (s.groups ?? []).filter((g) => !g.models || g.models.includes(model));
};

/** Filled and total answers in a section. A table counts as one answer once a row has text. */
export function progress(s: PSection, p: Persona): [number, number] {
  if (s.table) return [rowsOf(p, s.table.store).some((r) => Object.values(r).some((v) => v.trim())) ? 1 : 0, 1];
  let filled = 0;
  let total = 0;
  for (const g of groupsFor(s, p)) {
    const form = formOf(p, g.store);
    total += g.fields.length;
    filled += g.fields.filter((x) => (form[x.key] ?? "").trim()).length;
  }
  return [filled, total];
}

export const sectionsDone = (p: Persona): number =>
  SECTIONS.filter((s) => {
    const [filled, total] = progress(s, p);
    return filled === total;
  }).length;

export function personaBriefLines(p: Persona): string[] {
  const L: string[] = [];
  for (const s of SECTIONS) {
    const body: string[] = [];
    if (s.table) {
      for (const r of rowsOf(p, s.table.store)) {
        const cells = s.table.columns.map((c) => r[c.key]).filter(Boolean);
        if (cells.length) body.push(`- ${cells.join(" | ")}`);
      }
    }
    for (const g of groupsFor(s, p)) {
      const form = formOf(p, g.store);
      for (const x of g.fields) if ((form[x.key] ?? "").trim()) body.push(`${x.label}: ${form[x.key].trim()}`);
    }
    if (body.length) L.push(`${s.title}:`, ...body, "");
  }
  return L;
}
