import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { L } from "../labels.ts";
import CustomerList from "../components/CustomerList.tsx";
import DuplicateWarning from "../components/DuplicateWarning.tsx";
import OpportunitiesPanel from "../components/OpportunitiesPanel.tsx";
import { useCurrentUserId } from "../components/useCurrentUserId.ts";
import { getCustomerService } from "../data/customerService.ts";
import { buildListFilter, canEdit, submitContact, type Account, type Contact, type ContactDraft } from "../domain/customers.ts";

export function ContactsPage() {
  const fetchPage = useCallback(
    (text: string, skipToken?: string) => getCustomerService().listContacts({ filter: buildListFilter("contact", text), skipToken }),
    [],
  );
  return (
    <CustomerList<Contact>
      title={L.page.contactsTitle}
      newLabel={L.customer.newContact}
      newPath="/contacts/new"
      fetchPage={fetchPage}
      rowPath={(c) => `/contacts/${c.id}`}
      columns={[
        { header: L.customer.field.name, cell: (c) => c.fullName },
        { header: L.customer.field.email, cell: (c) => c.email },
        { header: L.customer.field.phone, cell: (c) => c.phone },
        { header: L.customer.field.account, cell: (c) => c.accountName },
      ]}
    />
  );
}

const blank: ContactDraft = { firstName: "", lastName: "", email: "", phone: "", jobTitle: "", accountId: null };

function AccountPicker({ value, currentName, disabled, onChange }: { value: string | null; currentName: string; disabled: boolean; onChange: (id: string | null) => void }) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Account[]>([]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      getCustomerService()
        .listAccounts({ filter: buildListFilter("account", text) })
        .then((p) => live && setOptions(p.items))
        .catch(() => live && setOptions([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);

  const listed = options.some((a) => a.id === value);
  return (
    <label>
      {L.customer.field.account}
      <input type="search" placeholder={L.customer.filterPlaceholder} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled} />
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} disabled={disabled}>
        <option value="" />
        {value && !listed && <option value={value}>{currentName}</option>}
        {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  );
}

export function ContactPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const [original, setOriginal] = useState<Contact>();
  const [draft, setDraft] = useState<ContactDraft>(blank);
  const [matches, setMatches] = useState<Contact[]>([]);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    getCustomerService()
      .getContact(id)
      .then((c) => {
        if (!live) return;
        setOriginal(c);
        setDraft({ firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, jobTitle: c.jobTitle, accountId: c.accountId });
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [id]);

  const editable = !id || (!!original && canEdit(original.ownerId, userId));

  async function save(force: boolean) {
    setSaving(true);
    setError(undefined);
    try {
      const r = await submitContact(getCustomerService(), draft, { id, original, force });
      if (r.status === "duplicates") setMatches(r.matches);
      else if (r.status === "invalid") setError(L.customer.field.lastName);
      else {
        setMatches([]);
        setOriginal(r.record);
        if (!id) navigate(`/contacts/${r.record.id}`, { replace: true });
      }
    } catch {
      setError(L.customer.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: Exclude<keyof ContactDraft, "accountId">) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [k]: e.target.value });

  if (loadError) return <p className="error">{L.customer.loadFailed}</p>;
  return (
    <section>
      <h1>{id ? original?.fullName ?? L.customer.loading : L.customer.newContact}</h1>
      {!editable && original && <p className="muted">{L.customer.readOnly}</p>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <label>{L.customer.field.firstName}<input value={draft.firstName} onChange={set("firstName")} disabled={!editable} /></label>
        <label>{L.customer.field.lastName}<input value={draft.lastName} onChange={set("lastName")} disabled={!editable} required /></label>
        <label>{L.customer.field.email}<input type="email" value={draft.email} onChange={set("email")} disabled={!editable} /></label>
        <label>{L.customer.field.phone}<input value={draft.phone} onChange={set("phone")} disabled={!editable} /></label>
        <label>{L.customer.field.jobTitle}<input value={draft.jobTitle} onChange={set("jobTitle")} disabled={!editable} /></label>
        <AccountPicker value={draft.accountId} currentName={original?.accountName ?? ""} disabled={!editable} onChange={(accountId) => setDraft({ ...draft, accountId })} />
        {error && <p className="error">{error}</p>}
        {editable && <button className="btn primary" type="submit" disabled={saving}>{L.customer.save}</button>}
      </form>
      {matches.length > 0 && (
        <DuplicateWarning
          message={L.customer.duplicateContact}
          matches={matches.map((m) => ({ id: m.id, label: `${m.fullName} (${m.email})`, path: `/contacts/${m.id}` }))}
          confirmLabel={id ? L.customer.saveAnyway : L.customer.createAnyway}
          onConfirm={() => void save(true)}
          onDismiss={() => setMatches([])}
        />
      )}
      {id && <OpportunitiesPanel kind="contact" id={id} />}
    </section>
  );
}
