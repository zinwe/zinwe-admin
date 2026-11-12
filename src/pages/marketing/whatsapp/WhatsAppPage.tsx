import { useCallback, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/PageHeader";
import { ErrorState, LoadingState } from "../../../components/States";
import { getAudiences } from "../../../lib/marketingApi";
import { useLoad } from "../../../lib/useLoad";
import { getToday, getWaAnalytics, getWaCampaigns, getWaContacts, getWaTemplates } from "../../../lib/whatsappApi";
import { AnalyticsTab } from "./AnalyticsTab";
import { CampaignEditor, CampaignList } from "./CampaignsTab";
import { ContactsTab } from "./ContactsTab";
import { SettingsTab } from "./SettingsTab";
import { WaTabs } from "./shared";
import { readCardLang, writeCardLang, type CardLang } from "./templateParts";
import { TemplatesTab } from "./TemplatesTab";
import { TodayTab } from "./TodayTab";
import "../../../styles/marketing.css";
import "../../../styles/whatsapp.css";
import "../../../styles/wa-templates.css";
import "../../../styles/wa-tabs.css";

const SUB: Record<string, string> = {
  today: "Today's replies to answer and messages to send. Zinwe drafts each one; you send it yourself from WhatsApp.",
  contacts: "Everyone you may message on WhatsApp. Add them one at a time or from a sheet, then choose what happens to each contact.",
  campaigns: "A campaign is a path you build step by step: send a template, wait, send the next. When someone replies, they move to the path for that reply.",
  templates: "Every message your team sends is a template. Pick a category or one of your tags; each card shows the message as the contact will read it.",
  analytics: "All WhatsApp campaigns together: what was sent, who replied and what they did next.",
  settings: "How WhatsApp messages leave Zinwe, and the rules every campaign follows.",
};

/** Marketing -> WhatsApp: /marketing/whatsapp[/contacts|/campaigns[/new|/:id]|/templates|/analytics|/settings]. */
export function WhatsAppPage(): ReactElement {
  const { tab = "today", id } = useParams();
  const load = useCallback(
    () => Promise.all([getToday(), getWaContacts(), getWaCampaigns(), getWaTemplates(), getAudiences(), tab === "analytics" ? getWaAnalytics() : Promise.resolve(null)]),
    [tab],
  );
  const { data, error, pending, reload } = useLoad(load);
  const editing = tab === "campaigns" && id;
  // Templates: the Language every card shows (remembered), and New template, both in the header.
  const [cardLang, setCardLang] = useState<CardLang>(readCardLang);
  const [newTick, setNewTick] = useState(0);

  let body: ReactElement;
  if (error) body = <ErrorState message={error} onRetry={reload} />;
  else if (!data) body = <LoadingState />;
  else {
    const [today, contacts, campaigns, templates, audiences, analytics] = data;
    if (editing) {
      const campaign = id === "new" ? null : campaigns.find((c) => String(c.id) === id) ?? null;
      body = id !== "new" && !campaign
        ? <ErrorState message="That campaign doesn't exist." />
        : <CampaignEditor key={id} campaign={campaign} templates={templates} audiences={audiences} contacts={contacts} onSaved={reload} />;
    } else if (tab === "contacts") body = <ContactsTab contacts={contacts} campaigns={campaigns} templates={templates} reload={reload} />;
    // wa3/campaigns adds onChanged: pass onChanged={reload} here once that branch is merged.
    else if (tab === "campaigns") body = <CampaignList campaigns={campaigns} templates={templates} />;
    else if (tab === "templates") body = <TemplatesTab templates={templates} contacts={contacts} reload={reload} lang={cardLang} newTick={newTick} />;
    else if (tab === "analytics" && analytics) body = <AnalyticsTab data={analytics} campaigns={campaigns} templates={templates} />;
    else if (tab === "settings") body = <SettingsTab />;
    else body = <TodayTab data={today} contacts={contacts} templates={templates} reload={reload} />;
  }
  const count = data ? data[0].queue.length + data[0].replies.length : 0;
  return (
    <div className="mk wa">
      <PageHeader title="WhatsApp outreach" subtitle={SUB[tab] ?? SUB.today} onReload={reload} pending={pending}>
        {tab === "templates" ? (
          <>
            <label className="wt-sel">Language
              <select value={cardLang} aria-label="Language" onChange={(e) => { const v = e.target.value as CardLang; setCardLang(v); writeCardLang(v); }}>
                <option value="en">English</option>
                <option value="hi">Hinglish</option>
                <option value="both">Both</option>
              </select>
            </label>
            <button type="button" className="btn dark" onClick={() => setNewTick((n) => n + 1)}>New template</button>
          </>
        ) : <Link className="btn dark" to="/marketing/whatsapp/campaigns/new">New campaign</Link>}
      </PageHeader>
      <WaTabs count={count} />
      {body}
    </div>
  );
}
