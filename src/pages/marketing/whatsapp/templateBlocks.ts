/**
 * Conditions in WhatsApp template text (owner, 10 Nov 2026), as the editor's blocks.
 *
 *   {{#if FirstName}}Hello {{FirstName}}{{else}}Hello {{Business}} team{{/if}}, this is Vishal from Zinwe.
 *
 * `{{else}}` is optional and an If never sits inside another If (backend: z_marketing/wa_conditions.py, same token
 * rule). parseBlocks() and serializeBlocks() are lossless: serializeBlocks(parseBlocks(text)) === text for any text,
 * because each block keeps the exact tokens it was written with. Text whose Ifs don't balance comes back as one Text
 * block, unchanged (the server refuses to save it and says why).
 *
 * No imports: this file is pure, so it can be checked on its own (node --experimental-strip-types).
 */

export type Detail = "FirstName" | "OwnerName" | "Business" | "City" | "HowWeKnow";

/** The details a message can use, in the order the editor offers them. */
export const DETAILS: [Detail, string][] = [
  ["FirstName", "First name"], ["OwnerName", "Owner name"], ["Business", "Business"], ["City", "City"], ["HowWeKnow", "How we know them"],
];
export const DETAIL_LABEL: Record<string, string> = Object.fromEntries(DETAILS);
const ALIASES: Record<string, Detail> = { Firm: "Business" };

/** FirstName for "Firm"'s alias and the five details; null for anything else. */
export function detailOf(name: string): Detail | null {
  const d = ALIASES[name] ?? name;
  return (DETAILS.some(([k]) => k === d) ? d : null) as Detail | null;
}

export interface CondBlock {
  /** The detail it tests, as written (FirstName, Firm...). */
  detail: string;
  /** Then show: the words when the detail is known. */
  known: string;
  /** Otherwise: the words when it is not ("" = nothing). */
  otherwise: string;
  /** The exact tokens, so the text comes back byte for byte. */
  open: string;
  mid: string | null;
  close: string;
}
export type Block = string | CondBlock;

const TOKEN = /\{\{\s*(?:#if\s+([A-Za-z]+)|(else)|(\/if))\s*\}\}/g;

/** A new If block with the canonical tokens. */
export function newCond(detail: string, shown = "", otherwise = ""): CondBlock {
  return { detail, known: shown, otherwise, open: `{{#if ${detail}}}`, mid: null, close: "{{/if}}" };
}

export const isCond = (b: Block): b is CondBlock => typeof b !== "string";

/** Text -> blocks. Any text without conditions is one Text block; "" is one empty Text block. */
export function parseBlocks(text: string): Block[] {
  const src = text ?? "";
  const out: Block[] = [];
  let at = 0;
  let cur: CondBlock | null = null;
  let inElse = false;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(src); m; m = TOKEN.exec(src)) {
    const chunk = src.slice(at, m.index);
    const [tok, name, isElse] = m;
    if (name !== undefined) {
      if (cur) return [src]; // nested
      if (chunk) out.push(chunk);
      cur = { detail: name, known: "", otherwise: "", open: tok, mid: null, close: "" };
      inElse = false;
    } else if (isElse !== undefined) {
      if (!cur || inElse) return [src]; // stray or second Otherwise
      cur.known = chunk;
      cur.mid = tok;
      inElse = true;
    } else {
      if (!cur) return [src]; // an end with no If
      if (inElse) cur.otherwise = chunk;
      else cur.known = chunk;
      cur.close = tok;
      out.push(cur);
      cur = null;
    }
    at = m.index + tok.length;
  }
  if (cur) return [src]; // an If with no end
  const rest = src.slice(at);
  if (rest || !out.length) out.push(rest);
  return out;
}

/** Blocks -> text. An If keeps its Otherwise token when it had one, or gets one when the Otherwise has words. */
export function serializeBlocks(blocks: Block[]): string {
  return blocks.map((b) => {
    if (!isCond(b)) return b;
    const mid = b.mid ?? (b.otherwise ? "{{else}}" : null);
    return b.open + b.known + (mid !== null ? mid + b.otherwise : "") + b.close;
  }).join("");
}

/** All the words of a message, both sides of each If (search, "is it written?"). */
export const plainOf = (blocks: Block[]): string => blocks.map((b) => (isCond(b) ? `${b.known} ${b.otherwise}` : b)).join("");
export const isWritten = (text: string | undefined): boolean => plainOf(parseBlocks(text ?? "")).trim() !== "";

/** The details the Ifs test, canonical and once each. */
export function condDetails(blocks: Block[]): Detail[] {
  const out: Detail[] = [];
  blocks.forEach((b) => {
    const d = isCond(b) ? detailOf(b.detail) : null;
    if (d && !out.includes(d)) out.push(d);
  });
  return out;
}

const GREETING = /^\s*(Hi|Hello)\s+\{\{FirstName\}\}/;

/** {{Details}} used outside any If, canonical, once each. An opening "Hi {{FirstName}}" is the greeting (it reads
 * "Hello Webgross team" without a real name), so it doesn't count; Business is always known, so it doesn't either. */
export function looseDetails(blocks: Block[]): Detail[] {
  const out: Detail[] = [];
  blocks.forEach((b, i) => {
    if (isCond(b)) return;
    const text = i === 0 ? b.replace(GREETING, "") : b;
    (text.match(/\{\{(\w+)\}\}/g) ?? []).forEach((m) => {
      const d = detailOf(m.slice(2, -2));
      if (d && d !== "Business" && !out.includes(d)) out.push(d);
    });
  });
  return out;
}

/** One contact, the way fill() sees them: each detail's value ("" = not known) and how a message opens. */
export interface Who {
  FirstName: string;
  OwnerName: string;
  Business: string;
  City: string;
  HowWeKnow: string;
}

export type SegKind = "" | "cond" | "var";
export interface Seg {
  t: string;
  kind: SegKind;
}

/** The value of {{Name}} for this contact, as whatsapp.fill() writes it. */
function valueOf(name: string, who: Who, lang: "en" | "hi"): string | null {
  if (name === "Greeting") {
    if (lang === "hi") return who.FirstName ? `Namaste ${who.FirstName} ji` : `Namaste ${who.Business} team`;
    return who.FirstName ? `Hi ${who.FirstName}` : `Hello ${who.Business} team`;
  }
  if (name === "FirstName") return who.FirstName || `${who.Business} team`;
  const d = detailOf(name);
  return d ? who[d] : null;
}

/** The message as this contact gets it, in pieces: each If's right side chosen (kind "cond"), each detail filled
 * (kind "var"). Same order as the server: the Ifs first, then the opening greeting, then the details. */
export function segments(blocks: Block[], who: Who, lang: "en" | "hi"): Seg[] {
  const known = (name: string): boolean => {
    const d = detailOf(name);
    return d === "Business" || (!!d && !!who[d].trim());
  };
  const pieces: { text: string; cond: boolean }[] = blocks.map((b) => (isCond(b) ? { text: known(b.detail) ? b.known : b.otherwise, cond: true } : { text: b, cond: false }));
  const first = pieces.findIndex((p) => p.text.trim() !== "");
  if (first >= 0) pieces[first] = { ...pieces[first], text: pieces[first].text.replace(GREETING, "{{Greeting}}") };
  const out: Seg[] = [];
  pieces.forEach(({ text, cond }) => {
    text.split(/(\{\{\w+\}\})/).forEach((bit) => {
      if (!bit) return;
      const m = bit.match(/^\{\{(\w+)\}\}$/);
      const v = m ? valueOf(m[1], who, lang) : null;
      if (m && v !== null) out.push({ t: v, kind: cond ? "cond" : "var" });
      else out.push({ t: bit, kind: cond ? "cond" : "" });
    });
  });
  return out.filter((s) => s.t !== "");
}

/** The filled message, spaces tidied as the server does. */
export function fillText(blocks: Block[], who: Who, lang: "en" | "hi"): string {
  return segments(blocks, who, lang).map((s) => s.t).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}
