import { useCallback, useState } from "react";
import { L } from "../labels.ts";
import LookupPicker, { type LookupOption } from "./LookupPicker.tsx";
import { getCustomerService } from "../data/customerService.ts";
import { getOpportunityService } from "../data/opportunityService.ts";
import { buildListFilter } from "../domain/customers.ts";
import { saveOpportunity, stageDefaultProbability, type Opportunity, type Stage } from "../domain/pipeline.ts";

interface Props {
  original?: Opportunity;
  stage?: Stage;
  disabled?: boolean;
  onSaved: (o: Opportunity) => void;
  onCancel?: () => void;
}

const toNumber = (s: string): number | null => (s.trim() === "" ? null : Number(s));

export default function OpportunityForm({ original, stage = "qualify", disabled, onSaved, onCancel }: Props) {
  const [name, setName] = useState(original?.name ?? "");
  const [account, setAccount] = useState<LookupOption | null>(original ? { id: original.accountId, name: original.accountName } : null);
  const [contact, setContact] = useState<LookupOption | null>(original?.contactId ? { id: original.contactId, name: original.contactName } : null);
  const [revenue, setRevenue] = useState(original?.estimatedRevenue?.toString() ?? "");
  const [closeDate, setCloseDate] = useState(original?.estimatedCloseDate ?? "");
  const [probability, setProbability] = useState((original?.probability ?? stageDefaultProbability(stage)).toString());
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const searchAccounts = useCallback(async (text: string) => {
    const page = await getCustomerService().listAccounts({ filter: buildListFilter("account", text) });
    return page.items.map((a) => ({ id: a.id, name: a.name }));
  }, []);

  const accountId = account?.id;
  const searchContacts = useCallback(
    async (text: string) => {
      const parts = [accountId ? `_parentcustomerid_value eq ${accountId}` : undefined, buildListFilter("contact", text)].filter(Boolean);
      const page = await getCustomerService().listContacts({ filter: parts.length ? parts.join(" and ") : undefined });
      return page.items.map((c) => ({ id: c.id, name: c.fullName }));
    },
    [accountId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const r = await saveOpportunity(
        getOpportunityService(),
        {
          name,
          accountId: account?.id ?? null,
          contactId: contact?.id ?? null,
          estimatedRevenue: toNumber(revenue),
          estimatedCloseDate: closeDate || null,
          probability: toNumber(probability),
          stage,
        },
        original,
      );
      if (r.ok) onSaved(r.record);
      else setError(r.reason === "closed" ? L.pipeline.closedReadOnly : L.pipeline.invalid[r.reason]);
    } catch (e) {
      console.error("Save failed", e);
      setError(`${L.customer.saveFailed}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void submit(e)}>
      <label>{L.pipeline.field.name}<input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} required /></label>
      <LookupPicker label={L.pipeline.field.account} value={account} search={searchAccounts} onChange={(a) => { setAccount(a); setContact(null); }} disabled={disabled} required />
      <LookupPicker label={L.pipeline.field.contact} value={contact} search={searchContacts} onChange={setContact} disabled={disabled} />
      <label>{L.pipeline.field.estimatedRevenue}<input type="number" min="0" step="any" value={revenue} onChange={(e) => setRevenue(e.target.value)} disabled={disabled} /></label>
      <label>{L.pipeline.field.estimatedCloseDate}<input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} disabled={disabled} /></label>
      <label>{L.pipeline.field.probability}<input type="number" min="0" max="100" step="1" value={probability} onChange={(e) => setProbability(e.target.value)} disabled={disabled} /></label>
      {error && <p className="error">{error}</p>}
      {!disabled && (
        <div className="row">
          <button className="btn primary" type="submit" disabled={saving}>{L.customer.save}</button>
          {onCancel && <button className="btn" type="button" onClick={onCancel}>{L.customer.cancel}</button>}
        </div>
      )}
    </form>
  );
}
