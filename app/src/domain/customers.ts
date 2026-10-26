export interface Account {
  id: string;
  name: string;
  phone: string;
  website: string;
  ownerId: string;
}
export type AccountDraft = Pick<Account, "name" | "phone" | "website">;

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  accountId: string | null;
  accountName: string;
  ownerId: string;
}
export type ContactDraft = Pick<Contact, "firstName" | "lastName" | "email" | "phone" | "jobTitle" | "accountId">;

export interface OpportunitySummary {
  id: string;
  name: string;
  stage: string;
  status: string;
  estimatedRevenue: number | null;
}

export interface Page<T> {
  items: T[];
  skipToken?: string;
}

export interface ListQuery {
  filter?: string;
  skipToken?: string;
}

/** The thin seam to Dataverse; the real implementation lives in src/data. */
export interface CustomerService {
  listAccounts(q: ListQuery): Promise<Page<Account>>;
  listContacts(q: ListQuery): Promise<Page<Contact>>;
  getAccount(id: string): Promise<Account>;
  getContact(id: string): Promise<Contact>;
  findAccountsByName(name: string): Promise<Account[]>;
  findContactsByEmail(email: string): Promise<Contact[]>;
  createAccount(d: AccountDraft): Promise<Account>;
  updateAccount(id: string, d: AccountDraft): Promise<Account>;
  createContact(d: ContactDraft): Promise<Contact>;
  updateContact(id: string, d: ContactDraft): Promise<Contact>;
  /** Stub (empty) until the pipeline ticket lands. */
  listOpportunitiesFor(parent: { kind: "account" | "contact"; id: string }): Promise<OpportunitySummary[]>;
}

export const MIN_FILTER_LENGTH = 2;

export const odataString = (s: string) => `'${s.replace(/'/g, "''")}'`;

const FILTER_FIELDS = {
  account: ["name", "telephone1", "websiteurl"],
  contact: ["fullname", "emailaddress1", "telephone1"],
} as const;

/** Filter-box OData: case-insensitive contains, no normalisation (ticket #11); under 2 characters means no filter. */
export function buildListFilter(kind: keyof typeof FILTER_FIELDS, text: string): string | undefined {
  const t = text.trim();
  if (t.length < MIN_FILTER_LENGTH) return undefined;
  const q = odataString(t);
  return `(${FILTER_FIELDS[kind].map((f) => `contains(${f},${q})`).join(" or ")})`;
}

export interface ListState<T extends { id: string }> {
  items: T[];
  skipToken?: string;
  done: boolean;
}

export async function loadNextPage<T extends { id: string }>(
  state: ListState<T>,
  fetchPage: (skipToken?: string) => Promise<Page<T>>,
): Promise<ListState<T>> {
  if (state.done) return state;
  const page = await fetchPage(state.skipToken);
  const seen = new Set(state.items.map((i) => i.id));
  const items = [...state.items, ...page.items.filter((i) => !seen.has(i.id))];
  return { items, skipToken: page.skipToken, done: !page.skipToken };
}

const normId = (id: string | undefined | null) => (id ?? "").replace(/[{}]/g, "").toLowerCase();

/** Reps read everything but write only their own records; Dataverse enforces it, this only hides the controls. */
export const canEdit = (ownerId: string, currentUserId: string | undefined) =>
  !!currentUserId && normId(ownerId) === normId(currentUserId);

export type SubmitResult<T> =
  | { status: "saved"; record: T }
  | { status: "duplicates"; matches: T[] }
  | { status: "invalid"; message: string };

interface SubmitOptions<T> {
  id?: string;
  original?: T;
  force?: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function submitAccount(
  svc: CustomerService,
  draft: AccountDraft,
  { id, original, force }: SubmitOptions<Account>,
): Promise<SubmitResult<Account>> {
  const name = draft.name.trim();
  if (!name) return { status: "invalid", message: "name" };
  const clean = { ...draft, name };
  const changed = !original || !same(original.name, name);
  if (!force && changed) {
    const matches = (await svc.findAccountsByName(name)).filter((a) => a.id !== id && same(a.name, name));
    if (matches.length) return { status: "duplicates", matches };
  }
  return { status: "saved", record: id ? await svc.updateAccount(id, clean) : await svc.createAccount(clean) };
}

export async function submitContact(
  svc: CustomerService,
  draft: ContactDraft,
  { id, original, force }: SubmitOptions<Contact>,
): Promise<SubmitResult<Contact>> {
  const lastName = draft.lastName.trim();
  if (!lastName) return { status: "invalid", message: "lastName" };
  const email = draft.email.trim();
  const clean = { ...draft, lastName, email };
  const changed = !original || !same(original.email, email);
  if (!force && email && changed) {
    const matches = (await svc.findContactsByEmail(email)).filter((c) => c.id !== id && same(c.email, email));
    if (matches.length) return { status: "duplicates", matches };
  }
  return { status: "saved", record: id ? await svc.updateContact(id, clean) : await svc.createContact(clean) };
}
