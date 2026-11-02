import { useCallback, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { deletePersona, getAudiences, getPersona, savePersona, type Audience, type Confidence, type Persona, type ProfileForm, type ProfileRow } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { AudienceCard } from "./AudienceCard";
import { audienceBrief, CHANNELS, CONFIDENCE, COUNTRIES, personaBrief } from "./data";
import { AutoText, UnsavedGuard, useCopy } from "./fields";
import { formOf, groupsFor, progress, rowsOf, SECTIONS, sectionsDone, type PField, type PGroup, type PTable } from "./persona";
import "../../styles/marketing.css";

function Hero({ persona, onFill }: { persona: Persona; onFill: () => void }): ReactElement {
  const d = formOf(persona, "definition");
  if (!d.customer?.trim()) {
    return (
      <section className="card phero" aria-label="Persona summary">
        <h2>Our ideal customer</h2>
        <div className="fr between">
          <span>Not written yet. Fill in the final target definition to see it here.</span>
          <button type="button" className="btn sm" onClick={onFill}>Fill it in</button>
        </div>
      </section>
    );
  }
  return (
    <section className="card phero" aria-label="Persona summary">
      <div>
        <h2>Our ideal customer</h2>
        <p className="big">{d.customer}</p>
      </div>
      <div className="psy">
        <div><span>Primary message</span><b>{d.message || "Not set"}</b></div>
        <div><span>Conversion goal</span><b>{d.goal || "Not set"}</b></div>
        <div><span>Acquisition strategy</span><b>{d.strategy || "Not set"}</b></div>
      </div>
    </section>
  );
}

function AudiencesTab({ persona, audiences, onCopy }: { persona: Persona; audiences: Audience[]; onCopy: (text: string) => void }): ReactElement {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [channel, setChannel] = useState("");
  const base = `/marketing/persona/${persona.id}/audiences`;
  const rows = audiences.filter((a) => {
    const text = [a.name, a.state, a.city, a.business_category, a.business_segment, a.primary_problem, a.secondary_problem, a.primary_offer, a.cta, ...a.job_titles, ...a.industry_keywords].join(" ").toLowerCase();
    return (!country || a.country === country) && (!channel || a.channels.includes(channel)) && (!q || text.includes(q.toLowerCase()));
  });
  const channels = [...new Set([...CHANNELS, ...audiences.flatMap((a) => a.channels)])];

  return (
    <>
      <section className="card finder" aria-label="Find target audiences">
        <div className="fr">
          <div className="search">
            <input type="search" className="inp" aria-label="Search target audiences" placeholder="Search name, place, category, problem or offer" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={"inp" + (country ? " set" : "")} aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Any country</option>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={"inp" + (channel ? " set" : "")} aria-label="Channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">Any channel</option>
            {channels.map((c) => <option key={c}>{c}</option>)}
          </select>
          <Link className="btn dark" to={`${base}/new`}>Add target audience</Link>
        </div>
      </section>
      {audiences.length === 0 ? (
        <section className="card empty">
          <b>Who do you want to reach first?</b>
          <span>Add one group, like CPA firms in Texas. It starts from this persona.</span>
          <Link className="btn dark" to={`${base}/new`}>Add target audience</Link>
        </section>
      ) : rows.length ? (
        <div className="agrid">
          {rows.map((a) => <AudienceCard key={a.id} a={a} to={`${base}/${a.id}`} onCopy={() => onCopy(audienceBrief(a, persona))} />)}
        </div>
      ) : (
        <section className="card empty">No target audiences match these filters.</section>
      )}
    </>
  );
}

function FieldInput({ field, form, onChange }: { field: PField; form: ProfileForm; onChange: (v: string) => void }): ReactElement {
  const value = form[field.key] ?? "";
  const body = field.options ? (
    <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
      {field.options.includes(value) ? null : <option value={value}>{value || "Choose one"}</option>}
      {field.options.map((o) => <option key={o}>{o}</option>)}
    </select>
  ) : <AutoText value={value} onChange={onChange} />;
  return <label className={"fl" + (field.wide ? " wide" : "")}>{field.label}{body}</label>;
}

function GroupForm({ group, persona, onChange }: { group: PGroup; persona: Persona; onChange: (form: ProfileForm) => void }): ReactElement {
  const form = formOf(persona, group.store);
  return (
    <>
      {group.title ? <h3 className="psgroup">{group.title}</h3> : null}
      <div className="psfields">
        {group.fields.map((field) => <FieldInput key={field.key} field={field} form={form} onChange={(v) => onChange({ ...form, [field.key]: v })} />)}
      </div>
    </>
  );
}

function TableForm({ table, rows, onChange }: { table: PTable; rows: ProfileRow[]; onChange: (rows: ProfileRow[]) => void }): ReactElement {
  return (
    <div className="rows" style={{ "--cols": table.columns.length } as CSSProperties}>
      <div className="rowhd" aria-hidden="true">
        {table.columns.map((c) => <span key={c.key}>{c.label}</span>)}
      </div>
      {rows.map((row, i) => (
        <div className="rowed" key={i}>
          {table.columns.map((c) => (
            <AutoText key={c.key} label={`${c.label}, row ${i + 1}`} placeholder={c.label} value={row[c.key] ?? ""} onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [c.key]: v } : r)))} />
          ))}
          <button type="button" className="acx" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="btn sm mk-start" onClick={() => onChange([...rows, {}])}>{table.addLabel}</button>
    </div>
  );
}

function ProfileTab({ draft, setDraft }: { draft: Persona; setDraft: (update: (p: Persona) => Persona) => void }): ReactElement {
  const [at, setAt] = useState(0);
  const section = SECTIONS[at];
  const top = useRef<HTMLElement>(null);
  const setStore = (store: string, value: ProfileForm | ProfileRow[]) =>
    setDraft((p) => ({ ...p, profile: { ...p.profile, [store]: value } }));
  const go = (n: number) => {
    setAt(n);
    top.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <>
      <section className="card pbasics" aria-label="Persona basics">
        <label className="fl">Persona name
          <input className="inp" type="text" maxLength={120} value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <label className="fl">How sure are you?
          <select className="inp" value={draft.confidence} onChange={(e) => setDraft((p) => ({ ...p, confidence: e.target.value as Confidence }))}>
            {(Object.keys(CONFIDENCE) as Confidence[]).map((c) => <option key={c} value={c}>{CONFIDENCE[c][1]}</option>)}
          </select>
        </label>
      </section>
      <div className="psgrid">
        <nav className="card psrail" aria-label="Persona sections">
          <ol>
            {SECTIONS.map((s, i) => {
              const [filled, total] = progress(s, draft);
              const done = filled === total;
              return (
                <li key={s.title}>
                  <button type="button" aria-current={i === at ? "step" : undefined} className={(i === at ? "on " : "") + (done ? "done" : "")} onClick={() => go(i)}>
                    <span className="afn" aria-hidden="true">{done ? "✓" : i + 1}</span>
                    <span>{s.title}</span>
                    {done || s.table ? null : <span className="k">{filled}/{total}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <section ref={top} className="card pspane" aria-labelledby="pshead">
          <div>
            <h2 id="pshead">{at + 1}. {section.title}</h2>
            <p className="k">{section.help}</p>
          </div>
          {section.table ? (
            <TableForm table={section.table} rows={rowsOf(draft, section.table.store)} onChange={(rows) => setStore(section.table!.store, rows)} />
          ) : null}
          {groupsFor(section, draft).map((g) => <GroupForm key={g.store} group={g} persona={draft} onChange={(form) => setStore(g.store, form)} />)}
          <div className="psfoot">
            <button type="button" className="btn" disabled={at === 0} onClick={() => go(at - 1)}>Previous</button>
            <button type="button" className="btn" disabled={at === SECTIONS.length - 1} onClick={() => go(at + 1)}>Next section</button>
          </div>
        </section>
      </div>
    </>
  );
}

function PersonaView({ loaded, audiences }: { loaded: Persona; audiences: Audience[] }): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [persona, setPersona] = useState(loaded);
  const [draft, setDraftState] = useState(loaded);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { copy, dialog } = useCopy(toast);
  const leaving = useRef(false);
  const tab = params.get("tab") === "profile" ? "profile" : "audiences";
  const dirty = JSON.stringify(draft) !== JSON.stringify(persona);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  const setDraft = (update: (p: Persona) => Persona) => setDraftState(update);
  const show = (next: string) => setParams(next === "profile" ? { tab: "profile" } : {}, { replace: true });

  const save = async () => {
    if (!draft.name.trim()) {
      toast("Add a persona name first.", "bad");
      return;
    }
    setBusy(true);
    try {
      const saved = await savePersona({ ...draft, name: draft.name.trim() });
      setPersona(saved);
      setDraftState(saved);
      toast("Persona saved.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "bad");
    } finally {
      setBusy(false);
    }
  };
  const done = sectionsDone(draft);

  return (
    <>
      <PageHeader
        title={draft.name || "Persona"}
        badge={<span className={"pill " + CONFIDENCE[draft.confidence][0]} title={CONFIDENCE[draft.confidence][1]} style={{ marginLeft: 10, verticalAlign: "middle" }}>{draft.confidence}</span>}
        subtitle={draft.confidence === "Confirmed" ? "Checked with real people." : "A starting guess. Update it after real conversations."}
      >
        <button type="button" className="btn" onClick={() => void copy(personaBrief(draft))}>Copy for AI</button>
        {audiences.length ? null : <button type="button" className="btn" onClick={() => setRemoving(true)}>Remove persona</button>}
      </PageHeader>
      <Link className="lnk afback" to="/marketing/persona">Back to personas</Link>
      {tab === "audiences" ? <Hero persona={draft} onFill={() => show("profile")} /> : null}
      <div className="tabs" role="tablist" aria-label="Persona">
        <button type="button" role="tab" aria-selected={tab === "audiences"} className={"tab" + (tab === "audiences" ? " on" : "")} onClick={() => show("audiences")}>
          Target audiences <span className="k">{audiences.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === "profile"} className={"tab" + (tab === "profile" ? " on" : "")} onClick={() => show("profile")}>
          Persona profile <span className="k">{done} of {SECTIONS.length}</span>
        </button>
      </div>
      {tab === "audiences" ? <AudiencesTab persona={draft} audiences={audiences} onCopy={(text) => void copy(text)} /> : <ProfileTab draft={draft} setDraft={setDraft} />}
      {tab === "profile" || dirty ? (
        <div className="card savebar">
          <span className="k">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
          <div>
            <button type="button" className="btn" disabled={busy || !dirty} onClick={() => setDraftState(persona)}>Discard</button>
            <button type="button" className="btn dark" disabled={busy || !dirty} onClick={() => void save()}>Save persona</button>
          </div>
        </div>
      ) : null}
      <UnsavedGuard blocker={blocker} dirty={dirty} />
      {removing ? (
        <ConfirmDialog
          title="Remove this persona?"
          confirmLabel="Remove persona"
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await deletePersona(persona.id as number);
            leaving.current = true;
            toast("Persona removed.");
            navigate("/marketing/persona");
          }}
        >
          This persona has no target audiences. Its profile will be deleted.
        </ConfirmDialog>
      ) : null}
      {dialog}
    </>
  );
}

export function PersonaPage(): ReactElement {
  const id = Number(useParams().id);
  const load = useCallback(() => Promise.all([getPersona(id), getAudiences(id)]), [id]);
  const { data, error, reload } = useLoad(load);
  return (
    <div className="mk">
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : <PersonaView key={id} loaded={data[0]} audiences={data[1]} />}
    </div>
  );
}
