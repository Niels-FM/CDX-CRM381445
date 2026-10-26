import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { L } from "../labels.ts";
import CustomerList from "../components/CustomerList.tsx";
import DuplicateWarning from "../components/DuplicateWarning.tsx";
import OpportunitiesPanel from "../components/OpportunitiesPanel.tsx";
import { useCurrentUserId } from "../components/useCurrentUserId.ts";
import { getCustomerService } from "../data/customerService.ts";
import { buildListFilter, canEdit, submitAccount, type Account, type AccountDraft } from "../domain/customers.ts";

export function AccountsPage() {
  const fetchPage = useCallback(
    (text: string, skipToken?: string) => getCustomerService().listAccounts({ filter: buildListFilter("account", text), skipToken }),
    [],
  );
  return (
    <CustomerList<Account>
      title={L.page.accountsTitle}
      newLabel={L.customer.newAccount}
      newPath="/accounts/new"
      fetchPage={fetchPage}
      rowPath={(a) => `/accounts/${a.id}`}
      columns={[
        { header: L.customer.field.name, cell: (a) => a.name },
        { header: L.customer.field.phone, cell: (a) => a.phone },
        { header: L.customer.field.website, cell: (a) => a.website },
      ]}
    />
  );
}

const blank: AccountDraft = { name: "", phone: "", website: "" };

export function AccountPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const userId = useCurrentUserId();
  const [original, setOriginal] = useState<Account>();
  const [draft, setDraft] = useState<AccountDraft>(blank);
  const [matches, setMatches] = useState<Account[]>([]);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    getCustomerService()
      .getAccount(id)
      .then((a) => {
        if (!live) return;
        setOriginal(a);
        setDraft({ name: a.name, phone: a.phone, website: a.website });
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
      const r = await submitAccount(getCustomerService(), draft, { id, original, force });
      if (r.status === "duplicates") setMatches(r.matches);
      else if (r.status === "invalid") setError(L.customer.field.name);
      else {
        setMatches([]);
        setOriginal(r.record);
        if (!id) navigate(`/accounts/${r.record.id}`, { replace: true });
      }
    } catch {
      setError(L.customer.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof AccountDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });

  if (loadError) return <p className="error">{L.customer.loadFailed}</p>;
  return (
    <section>
      <h1>{id ? original?.name ?? L.customer.loading : L.customer.newAccount}</h1>
      {!editable && original && <p className="muted">{L.customer.readOnly}</p>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <label>{L.customer.field.name}<input value={draft.name} onChange={set("name")} disabled={!editable} required /></label>
        <label>{L.customer.field.phone}<input value={draft.phone} onChange={set("phone")} disabled={!editable} /></label>
        <label>{L.customer.field.website}<input value={draft.website} onChange={set("website")} disabled={!editable} /></label>
        {error && <p className="error">{error}</p>}
        {editable && <button className="btn primary" type="submit" disabled={saving}>{L.customer.save}</button>}
      </form>
      {matches.length > 0 && (
        <DuplicateWarning
          message={L.customer.duplicateAccount}
          matches={matches.map((m) => ({ id: m.id, label: m.name, path: `/accounts/${m.id}` }))}
          confirmLabel={id ? L.customer.saveAnyway : L.customer.createAnyway}
          onConfirm={() => void save(true)}
          onDismiss={() => setMatches([])}
        />
      )}
      {id && <OpportunitiesPanel kind="account" id={id} />}
    </section>
  );
}
