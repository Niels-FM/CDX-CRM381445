import { useEffect, useState } from "react";
import { L } from "../labels.ts";
import { getCustomerService } from "../data/customerService.ts";
import { getQualifyService } from "../data/qualifyService.ts";
import type { Lead } from "../domain/leads.ts";
import { loadSuggestions, qualifyLead, type QualifyChoice, type QualifyInvalid, type QualifyResult, type QualifySuggestions } from "../domain/qualify.ts";

const Q = L.lead.qualify;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Props {
  lead: Lead;
  onQualified: (r: QualifyResult) => void;
  onCancel: () => void;
}

export default function QualifyDialog({ lead, onQualified, onCancel }: Props) {
  const [suggestions, setSuggestions] = useState<QualifySuggestions>();
  const [choice, setChoice] = useState<QualifyChoice>({
    accountId: null, contactId: null, createOpportunity: true, opportunityName: lead.topic, estimatedRevenue: "", estimatedCloseDate: "",
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    loadSuggestions(getCustomerService(), lead)
      .then((s) => {
        if (!live) return;
        setSuggestions(s);
        setChoice((c) => ({ ...c, accountId: s.accountId, contactId: s.contactId }));
      })
      .catch((e) => {
        console.error("Qualify suggestions failed", e);
        if (live) setSuggestions({ accounts: [], contacts: [], accountId: null, contactId: null });
      });
    return () => {
      live = false;
    };
  }, [lead]);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await qualifyLead(getQualifyService(), lead, choice);
      if (r.status === "invalid") setError(Q.invalid[r.message as QualifyInvalid] ?? Q.failed);
      else if (r.status === "saved") onQualified(r.record);
    } catch (e) {
      console.error("Qualify failed", e);
      setError(`${Q.failed}: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const pick = (key: "accountId" | "contactId") => (e: React.ChangeEvent<HTMLSelectElement>) => setChoice({ ...choice, [key]: e.target.value || null });

  return (
    <div className="form" role="dialog" aria-label={Q.title}>
      <h2>{Q.title}</h2>
      {!suggestions && <p className="muted">{Q.loadingSuggestions}</p>}
      {suggestions && (
        <>
          <label>
            {Q.account}
            <select value={choice.accountId ?? ""} onChange={pick("accountId")}>
              <option value="">{Q.createNew}{lead.companyName && ` (${lead.companyName})`}</option>
              {suggestions.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.id === suggestions.accountId && ` — ${Q.suggested}`}</option>
              ))}
            </select>
          </label>
          <label>
            {Q.contact}
            <select value={choice.contactId ?? ""} onChange={pick("contactId")}>
              <option value="">{Q.createNew}{` (${lead.topic})`}</option>
              {suggestions.contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName} ({c.email}){c.id === suggestions.contactId && ` — ${Q.suggested}`}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={choice.createOpportunity} onChange={(e) => setChoice({ ...choice, createOpportunity: e.target.checked })} />{" "}
            {Q.createOpportunity}
          </label>
          {choice.createOpportunity && (
            <>
              <label>{Q.opportunityName}<input value={choice.opportunityName} maxLength={200} onChange={(e) => setChoice({ ...choice, opportunityName: e.target.value })} /></label>
              <label>{Q.estimatedRevenue}<input inputMode="decimal" value={choice.estimatedRevenue} onChange={(e) => setChoice({ ...choice, estimatedRevenue: e.target.value })} /></label>
              <label>{Q.estimatedCloseDate}<input type="date" value={choice.estimatedCloseDate} onChange={(e) => setChoice({ ...choice, estimatedCloseDate: e.target.value })} /></label>
            </>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !suggestions} onClick={() => void submit()}>{Q.confirm}</button>{" "}
      <button className="btn" disabled={busy} onClick={onCancel}>{L.customer.cancel}</button>
    </div>
  );
}
