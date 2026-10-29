import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { L } from "../labels.ts";
import CustomerList from "../components/CustomerList.tsx";
import DuplicateWarning from "../components/DuplicateWarning.tsx";
import Timeline from "../components/Timeline.tsx";
import QualifyDialog from "../components/QualifyDialog.tsx";
import { useCurrentUserId } from "../components/useCurrentUserId.ts";
import { getLeadService } from "../data/leadService.ts";
import { canEdit } from "../domain/customers.ts";
import {
  buildLeadFilter,
  canTransition,
  changeStatus,
  isLocked,
  submitLead,
  type Lead,
  type LeadDraft,
  type LeadRating,
  type LeadSource,
  type LeadStatus,
} from "../domain/leads.ts";

export function LeadsPage() {
  const fetchPage = useCallback(
    (text: string, skipToken?: string) => getLeadService().listLeads({ filter: buildLeadFilter(text), skipToken }),
    [],
  );
  return (
    <CustomerList<Lead>
      title={L.page.leadsTitle}
      newLabel={L.lead.newLead}
      newPath="/leads/new"
      fetchPage={fetchPage}
      rowPath={(l) => `/leads/${l.id}`}
      columns={[
        { header: L.customer.field.name, cell: (l) => l.topic },
        { header: L.lead.field.company, cell: (l) => l.companyName },
        { header: L.customer.field.email, cell: (l) => l.email },
        { header: L.lead.field.status, cell: (l) => L.leadStatus[l.status] },
        { header: L.lead.field.rating, cell: (l) => (l.rating ? L.leadRating[l.rating] : "") },
      ]}
    />
  );
}

const blank: LeadDraft = { firstName: "", lastName: "", companyName: "", jobTitle: "", email: "", phone: "", source: null, rating: null };
const toDraft = (l: Lead): LeadDraft => ({
  firstName: l.firstName, lastName: l.lastName, companyName: l.companyName, jobTitle: l.jobTitle, email: l.email, phone: l.phone,
  source: l.source, rating: l.rating,
});
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function LeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const [original, setOriginal] = useState<Lead>();
  const [draft, setDraft] = useState<LeadDraft>(blank);
  const [matches, setMatches] = useState<Lead[]>([]);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [disqualifying, setDisqualifying] = useState(false);
  const [reason, setReason] = useState("");
  const [qualifying, setQualifying] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    getLeadService()
      .getLead(id)
      .then((l) => {
        if (!live) return;
        setOriginal(l);
        setDraft(toDraft(l));
      })
      .catch((e) => {
        console.error("Lead load failed", e);
        if (live) setLoadError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [id]);

  const locked = !!original && isLocked(original.status);
  const owned = !id || (!!original && canEdit(original.ownerId, userId));
  const editable = owned && !locked;

  async function run(work: () => Promise<void>) {
    setSaving(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      console.error("Lead save failed", e);
      setError(`${L.customer.saveFailed}: ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const save = (force: boolean) =>
    run(async () => {
      const r = await submitLead(getLeadService(), draft, { id, original, force });
      if (r.status === "duplicates") setMatches(r.matches);
      else if (r.status === "invalid") setError(L.customer.field.lastName);
      else {
        setMatches([]);
        setOriginal(r.record);
        if (!id) navigate(`/leads/${r.record.id}`, { replace: true });
      }
    });

  const move = (to: LeadStatus) =>
    run(async () => {
      if (!original) return;
      const r = await changeStatus(getLeadService(), original, to, reason);
      if (r.status === "invalid") setError(r.message === "reason" ? L.lead.reasonRequired : L.customer.saveFailed);
      else if (r.status === "saved") {
        setOriginal(r.record);
        setDraft(toDraft(r.record));
        setDisqualifying(false);
        setReason("");
      }
    });

  const text = (k: "firstName" | "lastName" | "companyName" | "jobTitle" | "email" | "phone") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [k]: e.target.value });

  if (loadError) return <p className="error">{L.customer.loadFailed}: {loadError}</p>;
  return (
    <section>
      <h1>{id ? original?.topic ?? L.customer.loading : L.lead.newLead}</h1>
      {original && <p><strong>{L.lead.field.status}:</strong> {L.leadStatus[original.status]}{original.disqualifyReason && ` — ${original.disqualifyReason}`}</p>}
      {original && !owned && <p className="muted">{L.customer.readOnly}</p>}
      {locked && owned && <p className="muted">{L.lead.lockedNote}</p>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <label>{L.customer.field.firstName}<input value={draft.firstName} onChange={text("firstName")} disabled={!editable} /></label>
        <label>{L.customer.field.lastName}<input value={draft.lastName} onChange={text("lastName")} disabled={!editable} required /></label>
        <label>{L.lead.field.company}<input value={draft.companyName} onChange={text("companyName")} disabled={!editable} /></label>
        <label>{L.customer.field.jobTitle}<input value={draft.jobTitle} onChange={text("jobTitle")} disabled={!editable} /></label>
        <label>{L.customer.field.email}<input type="email" value={draft.email} onChange={text("email")} disabled={!editable} /></label>
        <label>{L.customer.field.phone}<input value={draft.phone} onChange={text("phone")} disabled={!editable} /></label>
        <label>
          {L.lead.field.source}
          <select value={draft.source ?? ""} onChange={(e) => setDraft({ ...draft, source: (e.target.value || null) as LeadSource | null })} disabled={!editable}>
            <option value="" />
            {(Object.keys(L.leadSource) as LeadSource[]).map((k) => <option key={k} value={k}>{L.leadSource[k]}</option>)}
          </select>
        </label>
        <label>
          {L.lead.field.rating}
          <select value={draft.rating ?? ""} onChange={(e) => setDraft({ ...draft, rating: (e.target.value || null) as LeadRating | null })} disabled={!editable}>
            <option value="" />
            {(Object.keys(L.leadRating) as LeadRating[]).map((k) => <option key={k} value={k}>{L.leadRating[k]}</option>)}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        {editable && <button className="btn primary" type="submit" disabled={saving}>{L.customer.save}</button>}
      </form>
      {original && owned && (
        <div className="form">
          {canTransition(original.status, "contacted") && (
            <button className="btn" disabled={saving} onClick={() => void move("contacted")}>{L.lead.action.contacted}</button>
          )}
          {original.status === "contacted" && (
            <button className="btn" disabled={saving} onClick={() => void move("new")}>{L.lead.action.new}</button>
          )}
          {canTransition(original.status, "disqualified") && !disqualifying && (
            <button className="btn" disabled={saving} onClick={() => setDisqualifying(true)}>{L.lead.action.disqualify}</button>
          )}
          {disqualifying && (
            <>
              <label>{L.lead.field.disqualifyReason}<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
              <button className="btn primary" disabled={saving} onClick={() => void move("disqualified")}>{L.lead.action.confirmDisqualify}</button>{" "}
              <button className="btn" onClick={() => setDisqualifying(false)}>{L.customer.cancel}</button>
            </>
          )}
          {original.status === "disqualified" && (
            <button className="btn" disabled={saving} title={L.lead.reopenManagerOnly} onClick={() => void move("new")}>{L.lead.action.reopen}</button>
          )}
          {!locked && !qualifying && (
            <button className="btn primary" disabled={saving} onClick={() => setQualifying(true)}>{L.action.qualify}</button>
          )}
        </div>
      )}
      {original && qualifying && (
        <QualifyDialog
          lead={original}
          onCancel={() => setQualifying(false)}
          onQualified={(r) => navigate(r.opportunityId ? `/opportunities/${r.opportunityId}` : `/leads/${original.id}`, { replace: !!r.opportunityId })}
        />
      )}
      {matches.length > 0 && (
        <DuplicateWarning
          message={L.lead.duplicate}
          matches={matches.map((m) => ({ id: m.id, label: `${m.topic} (${m.companyName || m.email})`, path: `/leads/${m.id}` }))}
          confirmLabel={id ? L.customer.saveAnyway : L.customer.createAnyway}
          onConfirm={() => void save(true)}
          onDismiss={() => setMatches([])}
        />
      )}
      {id && <Timeline type="nvdb_lead" id={id} />}
    </section>
  );
}
