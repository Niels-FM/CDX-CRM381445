import { odataString, MIN_FILTER_LENGTH, type ListQuery, type Page, type SubmitResult } from "./customers.ts";

export type LeadStatus = "new" | "contacted" | "qualified" | "disqualified";
export type LeadSource = "web" | "referral" | "event" | "coldCall" | "other";
export type LeadRating = "hot" | "warm" | "cold";

export interface Lead {
  id: string;
  topic: string;
  firstName: string;
  lastName: string;
  companyName: string;
  jobTitle: string;
  email: string;
  phone: string;
  source: LeadSource | null;
  rating: LeadRating | null;
  status: LeadStatus;
  disqualifyReason: string;
  ownerId: string;
}
export type LeadDraft = Pick<Lead, "firstName" | "lastName" | "companyName" | "jobTitle" | "email" | "phone" | "source" | "rating">;
export type DuplicateProbe = Pick<LeadDraft, "firstName" | "lastName" | "companyName" | "email">;

/** The thin seam to Dataverse; the real implementation lives in src/data. */
export interface LeadService {
  listLeads(q: ListQuery): Promise<Page<Lead>>;
  getLead(id: string): Promise<Lead>;
  /** Candidates sharing the email or the company; the domain narrows them down. */
  findLeadDuplicates(probe: DuplicateProbe): Promise<Lead[]>;
  createLead(d: LeadDraft): Promise<Lead>;
  updateLead(id: string, d: LeadDraft): Promise<Lead>;
  setStatus(id: string, status: LeadStatus, disqualifyReason: string): Promise<Lead>;
}

/** Qualified is reached only through Qualify; Disqualified goes back to New (Manager only, enforced server-side). */
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "disqualified"],
  contacted: ["new", "disqualified"],
  qualified: [],
  disqualified: ["new"],
};

export const canTransition = (from: LeadStatus, to: LeadStatus) => TRANSITIONS[from].includes(to);

/** Qualified and Disqualified Leads are read-only; un-disqualifying is a separate action. */
export const isLocked = (status: LeadStatus) => status === "qualified" || status === "disqualified";

export const leadTopic = (d: Pick<LeadDraft, "firstName" | "lastName">) => `${d.firstName} ${d.lastName}`.trim();

const FILTER_FIELDS = ["nvdb_topic", "nvdb_companyname", "nvdb_email"];

export function buildLeadFilter(text: string): string | undefined {
  const t = text.trim();
  if (t.length < MIN_FILTER_LENGTH) return undefined;
  const q = odataString(t);
  return `(${FILTER_FIELDS.map((f) => `contains(${f},${q})`).join(" or ")})`;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function changeStatus(
  svc: LeadService,
  lead: Lead,
  to: LeadStatus,
  reason = "",
): Promise<SubmitResult<Lead>> {
  if (!canTransition(lead.status, to)) return { status: "invalid", message: "transition" };
  if (to === "disqualified") {
    const r = reason.trim();
    if (!r) return { status: "invalid", message: "reason" };
    return { status: "saved", record: await svc.setStatus(lead.id, to, r) };
  }
  return { status: "saved", record: await svc.setStatus(lead.id, to, "") };
}

const isDuplicate = (c: Lead, d: DuplicateProbe) =>
  (!!d.email && same(c.email, d.email)) ||
  (!!d.companyName && !!d.lastName && same(c.companyName, d.companyName) && same(c.firstName, d.firstName) && same(c.lastName, d.lastName));

export async function submitLead(
  svc: LeadService,
  draft: LeadDraft,
  { id, original, force }: { id?: string; original?: Lead; force?: boolean },
): Promise<SubmitResult<Lead>> {
  const lastName = draft.lastName.trim();
  if (!lastName) return { status: "invalid", message: "lastName" };
  const clean: LeadDraft = {
    ...draft,
    firstName: draft.firstName.trim(),
    lastName,
    companyName: draft.companyName.trim(),
    email: draft.email.trim(),
  };
  const changed =
    !original ||
    !same(original.email, clean.email) ||
    !same(original.companyName, clean.companyName) ||
    !same(original.firstName, clean.firstName) ||
    !same(original.lastName, clean.lastName);
  if (!force && changed) {
    const matches = (await svc.findLeadDuplicates(clean)).filter((c) => c.id !== id && isDuplicate(c, clean));
    if (matches.length) return { status: "duplicates", matches };
  }
  return { status: "saved", record: id ? await svc.updateLead(id, clean) : await svc.createLead(clean) };
}
