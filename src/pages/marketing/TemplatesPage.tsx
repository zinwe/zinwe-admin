import { useCallback, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { getCampaigns, getTemplates, type EmailTemplate, type Sender, type TemplateKind } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { EmailTabs, fill, paragraphs } from "./campaignShared";
import { BLANK_TEMPLATE, TemplateEditor } from "./TemplateEditorPage";
import { SAMPLE } from "./templateSample";
import "../../styles/marketing.css";

const VIEW_KEY = "zinwe.admin.templateView";

const GROUPS: [TemplateKind, string, string][] = [
  ["Cold", "Cold emails", "They reach people who don’t know you yet. Only for Email 1 or 2."],
  ["Setup", "Setup", "After a yes: help them get Zinwe onto one PC."],
  ["Tips", "Tips", "After a yes: one useful idea at a time."],
  ["Final", "Final", "The last email in a flow."],
];

/** The opening line a reader sees in their inbox, after the greeting. */
function opening(t: EmailTemplate): string {
  return paragraphs(fill(t.body, SAMPLE)).find((p) => !/^(hi|hello)\b/i.test(p)) ?? "";
}

/** A template shown the way it lands: a row in the reader's inbox. */
function TemplateCard({ t }: { t: EmailTemplate }): ReactElement {
  const n = t.used_in ?? 0;
  return (
    <article className="card tcard">
      <header>
        <h3><Link to={`/marketing/email/templates/${t.id}`}>{t.name}</Link></h3>
        {t.kind === "Cold" ? <span className="pill accent">Cold</span> : <span className="pill">{t.kind}</span>}
      </header>
      <div className="inbox">
        <span className="inboxav" aria-hidden="true">V</span>
        <div>
          <span className="inboxfrom">Vishal Shakaya</span>
          <b>{fill(t.subject, SAMPLE)}</b>
          <p>{opening(t)}</p>
        </div>
      </div>
      <footer className="k">{[t.built_in ? "Starter template" : "Your template", n ? `Used in ${n} campaign email${n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</footer>
    </article>
  );
}

/** List on the left, rich editor in the middle, preview on the right. */
function TableView({ rows, sender, newOne, onNewDone, reload, guard, setDirty }: {
  rows: EmailTemplate[];
  sender: Sender;
  newOne: boolean;
  onNewDone: () => void;
  reload: () => void;
  guard: (next: () => void) => void;
  setDirty: (dirty: boolean) => void;
}): ReactElement {
  const [picked, setPicked] = useState<number | null>(null);
  const open = newOne ? null : rows.find((t) => t.id === picked) ?? rows[0] ?? null;
  return (
    <div className="seq tview">
      <section className="card ttable">
        <table className="tbl ttbl">
          <caption className="sr">Email templates</caption>
          <thead><tr><th scope="col">Template</th><th scope="col">Type</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className={"click" + (t.id === open?.id ? " sel" : "")} onClick={() => guard(() => { onNewDone(); setPicked(t.id as number); })}>
                <th scope="row" title={t.name}><button type="button" className="cobtn" aria-current={t.id === open?.id ? "true" : undefined}>{t.name}</button></th>
                <td>{t.kind === "Cold" ? <span className="pill accent">Cold</span> : <span className="pill">{t.kind}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length ? null : <div className="empty">No templates match.</div>}
      </section>
      <div className="tpane">
        {open || newOne ? (
          <TemplateEditor
            key={open?.id ?? "new"}
            start={open ?? BLANK_TEMPLATE}
            sender={sender}
            inline={{
              onDirty: setDirty,
              onSaved: (t) => { setDirty(false); setPicked(t.id as number); onNewDone(); reload(); },
              onRemoved: () => { setDirty(false); setPicked(null); reload(); },
            }}
          />
        ) : <section className="card empty">Pick a template to edit it.</section>}
      </div>
    </div>
  );
}

export function TemplatesPage(): ReactElement {
  const load = useCallback(() => Promise.all([getTemplates(), getCampaigns()]), []);
  const { data, error, pending, reload } = useLoad(load);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<TemplateKind | "">("");
  const [view, setView] = useState(() => (window.localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards"));
  const [newOne, setNewOne] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<(() => void) | null>(null);
  const rows = data?.[0] ?? [];
  const found = rows.filter((t) => !q || `${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(q.toLowerCase()));
  const inKind = found.filter((t) => !kind || t.kind === kind);
  const ordered = GROUPS.flatMap(([k]) => inKind.filter((t) => t.kind === k));
  const groups = GROUPS.filter(([k]) => !kind || k === kind).map(([k, title, help]) => ({ k, title, help, list: found.filter((t) => t.kind === k) })).filter((g) => g.list.length);
  const guard = useCallback((next: () => void) => {
    if (dirty) setAsk(() => next);
    else next();
  }, [dirty]);
  const show = (next: string) => guard(() => {
    window.localStorage.setItem(VIEW_KEY, next);
    setView(next);
    setNewOne(false);
    setDirty(false);
  });

  return (
    <div className="mk">
      <PageHeader title="Email campaigns" subtitle="Generic emails to reuse. A campaign takes a copy, so editing it there never changes the template." onReload={reload} pending={pending}>
        {view === "table" ? <button type="button" className="btn dark" onClick={() => guard(() => setNewOne(true))}>New template</button> : <Link className="btn dark" to="/marketing/email/templates/new">New template</Link>}
      </PageHeader>
      <EmailTabs />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : (
        <>
          <section className="card finder" aria-label="Find templates">
            <div className="fr">
              <div className="search"><input type="search" className="inp" aria-label="Search templates" placeholder="Search names, subjects and text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="fr" role="group" aria-label="Show">
                <button type="button" className={"chip" + (kind ? "" : " on")} aria-pressed={!kind} onClick={() => setKind("")}>All<span>{found.length}</span></button>
                {GROUPS.map(([k]) => (
                  <button key={k} type="button" className={"chip" + (kind === k ? " on" : "")} aria-pressed={kind === k} onClick={() => setKind(k)}>{k}<span>{found.filter((t) => t.kind === k).length}</span></button>
                ))}
              </div>
              <div className="seg" role="group" aria-label="View">
                <button type="button" className={view === "cards" ? "on" : ""} aria-pressed={view === "cards"} onClick={() => show("cards")}>Cards</button>
                <button type="button" className={view === "table" ? "on" : ""} aria-pressed={view === "table"} onClick={() => show("table")}>Table</button>
              </div>
            </div>
          </section>
          {view === "table" ? (
            <TableView rows={ordered} sender={data[1].sender} newOne={newOne} onNewDone={() => setNewOne(false)} reload={reload} guard={guard} setDirty={setDirty} />
          ) : (
            <>
              {groups.map((g) => (
                <section key={g.k} className="tgroup" aria-label={g.title}>
                  <div className="fighead"><h2>{g.title}</h2><span className="k">{g.help}</span></div>
                  <div className="tgrid">{g.list.map((t) => <TemplateCard key={t.id} t={t} />)}</div>
                </section>
              ))}
              {groups.length ? null : <section className="card empty">No templates match. Try another word or type.</section>}
            </>
          )}
        </>
      )}
      {ask ? (
        <ConfirmDialog title="Discard your changes?" confirmLabel="Discard changes" danger onClose={() => setAsk(null)} onConfirm={async () => { setDirty(false); ask(); }}>
          What you changed in this template and did not save will be lost.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
