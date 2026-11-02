import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import type { Blocker } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { RichTextEditor } from "../../components/RichTextEditor";
import type { Groups } from "./data";

export function useAutoHeight(box: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [box, value]);
}

/** A text box that grows with its text, so long answers stay readable without a scrollbar. */
export function AutoText({ value, onChange, id, label, placeholder }: { value: string; onChange: (v: string) => void; id?: string; label?: string; placeholder?: string }): ReactElement {
  const box = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(box, value);
  return <textarea ref={box} id={id} aria-label={label} className="txt afin plain" rows={1} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function matching(groups: Groups, skip: Set<string>, token: string): Groups {
  const seen = new Set(skip);
  return groups
    .map(([label, list]): [string, string[]] => [
      label,
      list.filter((v) => {
        const s = v.toLowerCase();
        if (seen.has(s) || (token && !s.includes(token))) return false;
        seen.add(s);
        return true;
      }),
    ])
    .filter(([, list]) => list.length);
}

function Dropdown({ id, label, open, groups, cursor, none, pick }: { id: string; label: string; open: boolean; groups: Groups; cursor: number; none: string; pick: (v: string) => void }): ReactElement {
  let index = -1;
  return (
    <div className="afsug" id={`${id}-list`} role="listbox" aria-label={`${label} suggestions`} hidden={!open}>
      {groups.map(([group, list]) => (
        <div key={group}>
          <div className="afg">{group}</div>
          {list.map((v) => {
            index += 1;
            return (
              <button key={v} type="button" tabIndex={-1} role="option" aria-selected={index === cursor} className={"afopt" + (index === cursor ? " on" : "")} onMouseDown={(e) => { e.preventDefault(); pick(v); }}>
                {v}
              </button>
            );
          })}
        </div>
      ))}
      {groups.length ? null : <div className="afnone">{none}</div>}
    </div>
  );
}

function Chevron({ onToggle }: { onToggle: () => void }): ReactElement {
  return (
    <button type="button" className="afchev" tabIndex={-1} aria-label="Show suggestions" onMouseDown={(e) => { e.preventDefault(); onToggle(); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}

/** Arrow keys, Escape and Enter shared by both suggestion fields. */
function useCombo(options: string[], pick: (v: string) => void, enter: () => void, plainEnter = false) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) {
        const dir = e.key === "ArrowDown" ? 1 : -1;
        setCursor((c) => (c < 0 ? (dir > 0 ? 0 : options.length - 1) : (c + dir + options.length) % options.length));
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Enter" && !e.shiftKey) {
      if (open && options[cursor]) {
        e.preventDefault();
        pick(options[cursor]);
      } else if (!plainEnter) {
        e.preventDefault();
        enter();
      }
    }
  };
  return { open, setOpen, cursor, setCursor, keys };
}

/** One value: type your own or pick a suggestion. The dropdown closes after a pick so it never covers the next field. */
export function ComboField({ label, value, onChange, groups, placeholder, error, hint, multiline }: { label: string; value: string; onChange: (v: string) => void; groups: Groups; placeholder?: string; error?: string; hint?: string; multiline?: boolean }): ReactElement {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(box, value);
  const typed = value.trim().toLowerCase();
  const shown = useMemo(() => {
    const exact = groups.some(([, list]) => list.some((v) => v.toLowerCase() === typed));
    return matching(groups, new Set(), exact ? "" : typed);
  }, [groups, typed]);
  const options = shown.flatMap(([, list]) => list);
  const pick = (v: string) => {
    onChange(v);
    c.setOpen(false);
    c.setCursor(-1);
    box.current?.focus();
  };
  const c = useCombo(options, pick, () => c.setOpen(false), multiline);
  return (
    <div className="fl">
      <label htmlFor={id}>{label}</label>
      <div className="afcombo" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) c.setOpen(false); }}>
        <textarea
          ref={box}
          id={id}
          className={"txt afin" + (groups.length ? "" : " plain")}
          rows={1}
          role="combobox"
          aria-expanded={c.open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => { onChange(e.target.value); c.setOpen(true); c.setCursor(-1); }}
          onClick={() => c.setOpen(true)}
          onKeyDown={c.keys}
        />
        {groups.length ? (
          <>
            <Chevron onToggle={() => { box.current?.focus(); c.setOpen((o) => !o); }} />
            <Dropdown id={id} label={label} open={c.open && options.length > 0} groups={shown} cursor={c.cursor} none="" pick={pick} />
          </>
        ) : null}
      </div>
      {hint ? <span className="k">{hint}</span> : null}
      {error ? <span className="aferr" role="alert">{error}</span> : null}
    </div>
  );
}

export function splitChips(value: string, comma?: boolean): string[] {
  return value
    .split(comma ? /[\n,;]+/ : /\n+/)
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

/** A list of short values: chips plus a box with suggestions. Paste several at once, one per line or split by commas. */
export function ChipField({ label, items, groups, placeholder, hint, comma, error, pending, onPending, onChange, duplicate }: {
  label: string;
  items: string[];
  groups: Groups;
  placeholder: string;
  hint?: string;
  comma?: boolean;
  error?: string;
  pending: string;
  onPending: (v: string) => void;
  onChange: (list: string[]) => void;
  duplicate: (n: number) => void;
}): ReactElement {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(box, pending);
  const token = (pending.split(comma ? /[\n,;]/ : /\n/).pop() ?? "").trim().toLowerCase();
  const shown = useMemo(() => matching(groups, new Set(items.map((v) => v.toLowerCase())), token), [groups, items, token]);
  const options = shown.flatMap(([, list]) => list);

  const add = (list: string[]) => {
    const next = [...items];
    let dup = 0;
    for (const v of list) {
      if (next.some((x) => x.toLowerCase() === v.toLowerCase())) dup += 1;
      else next.push(v);
    }
    if (dup) duplicate(dup);
    onChange(next);
  };
  const close = () => {
    c.setOpen(false);
    c.setCursor(-1);
  };
  const commit = () => {
    const list = splitChips(pending, comma);
    onPending("");
    if (list.length) add(list);
    close();
  };
  const pick = (v: string) => {
    const kept = pending.match(comma ? /^[\s\S]*[\n,;]/ : /^[\s\S]*\n/);
    onPending(kept ? kept[0] : "");
    add([v]);
    close();
    box.current?.focus();
  };
  const c = useCombo(options, pick, commit);

  return (
    <div className="fl mk-chipfl">
      <label htmlFor={id}>{label}</label>
      <div className="afcf">
        <ul className="acs" aria-label={`${label} added`}>
          {items.map((v) => (
            <li key={v} className="ac">
              <span>{v}</span>
              <button type="button" className="acx" aria-label={`Remove ${v}`} onClick={() => onChange(items.filter((x) => x !== v))}>×</button>
            </li>
          ))}
        </ul>
        <div className="afrow">
          <div className="afcombo" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) c.setOpen(false); }}>
            <textarea
              ref={box}
              id={id}
              className="txt afin"
              rows={1}
              role="combobox"
              aria-expanded={c.open}
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder={placeholder}
              value={pending}
              onChange={(e) => { onPending(e.target.value); c.setOpen(true); c.setCursor(-1); }}
              onClick={() => c.setOpen(true)}
              onKeyDown={c.keys}
            />
            <Chevron onToggle={() => { box.current?.focus(); c.setOpen((o) => !o); }} />
            <Dropdown id={id} label={label} open={c.open} groups={shown} cursor={c.cursor} none={token ? "No suggestion matches. Press Enter to add it." : "Everything here is already added."} pick={pick} />
          </div>
          <button type="button" className="btn" onClick={() => { commit(); box.current?.focus(); }}>Add</button>
        </div>
        {hint ? <span className="k">{hint}</span> : null}
        {error ? <span className="aferr" role="alert">{error}</span> : null}
      </div>
    </div>
  );
}

/** One of a few options. `text` gives each a name and a short line, for options that need explaining. */
export function Choice<T extends string>({ label, value, options, text, onChange }: { label: string; value: T; options: readonly T[]; text?: Record<T, [string, string]>; onChange: (v: T) => void }): ReactElement {
  return (
    <div className="fl">
      <span>{label}</span>
      <div className={"seg field" + (text ? " tall" : "")} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} className={o === value ? "on" : ""} onClick={() => onChange(o)}>
            {text ? <><b>{text[o][0]}</b><small>{text[o][1]}</small></> : o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One question in a form. The ring ticks when it is answered; only optional ones carry a tag. */
export function Section({ n, title, help, tag, done, children }: { n: number; title: string; help: string; tag?: string; done: boolean; children: ReactNode }): ReactElement {
  return (
    <section className={"card afsec" + (done ? " done" : "")} aria-labelledby={`fh${n}`}>
      <header className="afh">
        <span className="afn" aria-hidden="true">{done ? "✓" : ""}</span>
        <div>
          <h2 id={`fh${n}`}>{title}</h2>
          <p className="k">{help}</p>
        </div>
        {tag ? <span className="afreq">{tag}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** Copies to the clipboard; if the browser refuses, the same text opens selected for Ctrl+C. */
export function useCopy(toast: (m: string, tone?: "bad") => void): { copy: (text: string) => Promise<void>; dialog: ReactElement | null } {
  const [blocked, setBlocked] = useState<string | null>(null);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Brief copied. Paste it into your AI tool.");
    } catch {
      setBlocked(text);
    }
  };
  const close = () => setBlocked(null);
  const dialog = blocked ? (
    <Modal title="Copy the brief" subtitle="Your browser blocked the copy. Press Ctrl+C to copy the selected text." onClose={close} footer={<button type="button" className="btn" onClick={close}>Close</button>}>
      <textarea className="mk-copy" readOnly value={blocked} ref={(el) => el?.select()} aria-label="Brief" />
    </Modal>
  ) : null;
  return { copy, dialog };
}

/** Shown when staff try to leave with unsaved work. Also warns on closing the tab. */
export function UnsavedGuard({ blocker, dirty }: { blocker: Blocker; dirty: boolean }): ReactElement | null {
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (blocker.state !== "blocked") return null;
  return (
    <Modal
      title="Discard your changes?"
      size="small"
      role="alertdialog"
      onClose={() => blocker.reset()}
      footer={
        <>
          <button type="button" className="btn" onClick={() => blocker.reset()}>Keep editing</button>
          <button type="button" className="btn danger-fill" onClick={() => blocker.proceed()}>Discard changes</button>
        </>
      }
    >
      What you entered and did not save will be lost.
    </Modal>
  );
}

const DETAILS = [{ label: "First name", text: "{{FirstName}}" }, { label: "Firm", text: "{{Firm}}" }];

/**
 * The rich email editor. Quill rewrites HTML as it loads, so `onLoaded` reports that version: compare edits against it,
 * or an untouched email looks changed. Remount with a new `key` to load other text.
 */
export function EmailBodyEditor({ html, label, onLoaded, onChange }: { html: string; label: string; onLoaded: (html: string) => void; onChange: (html: string) => void }): ReactElement {
  const loading = useRef(true);
  useEffect(() => { loading.current = false; }, []);
  return <RichTextEditor variant="note" label={label} initialHtml={html} placeholder="Write your email" inserts={DETAILS} onChange={(v) => (loading.current ? onLoaded : onChange)(v.html)} />;
}
