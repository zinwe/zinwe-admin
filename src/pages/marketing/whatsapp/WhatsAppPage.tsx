import { useCallback, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/PageHeader";
import { ErrorState, LoadingState } from "../../../components/States";
import { getAudiences } from "../../../lib/marketingApi";
import { useLoad } from "../../../lib/useLoad";
import { getToday, getWaAnalytics, getWaCampaigns, getWaContacts, getWaTemplates } from "../../../lib/whatsappApi";
import { AnalyticsTab, SettingsTab } from "./AnalyticsTab";
import { CampaignEditor, CampaignList } from "./CampaignsTab";
import { ContactsTab } from "./ContactsTab";
import { WaTabs } from "./shared";
import { TemplatesTab } from "./TemplatesTab";
import { TodayTab } from "./TodayTab";
import "../../../styles/marketing.css";
import "../../../styles/whatsapp.css";

const SUB: Record<string, string> = {
  today: "Today's replies to answer and messages to send. Zinwe drafts each one; you send it yourself from WhatsApp.",
  contacts: "Everyone you may message on WhatsApp. Add them one at a time or from a sheet, then choose what happens to each contact.",
  campaigns: "Each campaign sends one message sequence to one target audience from Persona.",
  templates: "Message drafts, the way they land in a WhatsApp chat. Drafts start from these.",
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
    else if (tab === "campaigns") body = <CampaignList campaigns={campaigns} templates={templates} />;
    else if (tab === "templates") body = <TemplatesTab templates={templates} reload={reload} />;
    else if (tab === "analytics" && analytics) body = <AnalyticsTab data={analytics} />;
    else if (tab === "settings") body = <SettingsTab />;
    else body = <TodayTab data={today} contacts={contacts} reload={reload} />;
  }
  const count = data ? data[0].queue.length + data[0].replies.length : 0;
  return (
    <div className="mk wa">
      <PageHeader title="WhatsApp outreach" subtitle={SUB[tab] ?? SUB.today} onReload={reload} pending={pending}>
        <Link className="btn dark" to="/marketing/whatsapp/campaigns/new">New campaign</Link>
      </PageHeader>
      <WaTabs count={count} />
      {body}
    </div>
  );
}
