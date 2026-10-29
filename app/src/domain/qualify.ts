import type { Account, Contact, CustomerService, SubmitResult } from "./customers.ts";
import { isLocked, type Lead } from "./leads.ts";

/** Wire shape of the Custom API nvdb_QualifyLead (parameter names are the API's own). */
export interface QualifyRequest {
  LeadId: string;
  CreateOpportunity: boolean;
  AccountId?: string;
  ContactId?: string;
  OpportunityName?: string;
  EstimatedRevenue?: number;
  EstimatedCloseDate?: string;
}
export interface QualifyResult {
  accountId: string;
  contactId: string;
  /** null when the Opportunity was skipped */
  opportunityId: string | null;
}

/** The thin seam to the Custom API; the real implementation lives in src/data. */
export interface QualifyService {
  qualify(request: QualifyRequest): Promise<QualifyResult>;
}

/** What the rep chose in the dialog: null Account/Contact means "create new from the Lead". */
export interface QualifyChoice {
  accountId: string | null;
  contactId: string | null;
  createOpportunity: boolean;
  opportunityName: string;
  estimatedRevenue: string;
  estimatedCloseDate: string;
}

export interface QualifySuggestions {
  accounts: Account[];
  contacts: Contact[];
  /** Preselected: exact name (Account) or exact email (Contact) match, ignoring case */
  accountId: string | null;
  contactId: string | null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function loadSuggestions(customers: CustomerService, lead: Lead): Promise<QualifySuggestions> {
  const company = lead.companyName.trim();
  const email = lead.email.trim();
  const [accounts, contacts] = await Promise.all([
    company ? customers.findAccountsByName(company) : [],
    email ? customers.findContactsByEmail(email) : [],
  ]);
  return {
    accounts,
    contacts,
    accountId: accounts.find((a) => same(a.name, company))?.id ?? null,
    contactId: contacts.find((c) => same(c.email, email))?.id ?? null,
  };
}

export function buildQualifyRequest(leadId: string, c: QualifyChoice): QualifyRequest {
  const r: QualifyRequest = { LeadId: leadId, CreateOpportunity: c.createOpportunity };
  if (c.accountId) r.AccountId = c.accountId;
  if (c.contactId) r.ContactId = c.contactId;
  if (!c.createOpportunity) return r;
  if (c.opportunityName.trim()) r.OpportunityName = c.opportunityName.trim();
  if (c.estimatedRevenue.trim()) r.EstimatedRevenue = Number(c.estimatedRevenue);
  if (c.estimatedCloseDate) r.EstimatedCloseDate = `${c.estimatedCloseDate}T00:00:00Z`;
  return r;
}

export type QualifyInvalid = "status" | "company" | "lastName" | "revenue";

export async function qualifyLead(
  svc: QualifyService,
  lead: Lead,
  choice: QualifyChoice,
): Promise<SubmitResult<QualifyResult>> {
  if (isLocked(lead.status)) return { status: "invalid", message: "status" satisfies QualifyInvalid };
  if (!choice.accountId && !lead.companyName.trim()) return { status: "invalid", message: "company" satisfies QualifyInvalid };
  if (!choice.contactId && !lead.lastName.trim()) return { status: "invalid", message: "lastName" satisfies QualifyInvalid };
  if (choice.createOpportunity && choice.estimatedRevenue.trim() && !Number.isFinite(Number(choice.estimatedRevenue))) {
    return { status: "invalid", message: "revenue" satisfies QualifyInvalid };
  }
  return { status: "saved", record: await svc.qualify(buildQualifyRequest(lead.id, choice)) };
}
