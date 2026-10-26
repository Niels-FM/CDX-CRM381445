import { getClient, type DataClient } from "@microsoft/power-apps/data";
import {
  odataString,
  type Account,
  type AccountDraft,
  type Contact,
  type ContactDraft,
  type CustomerService,
  type ListQuery,
  type Page,
} from "../domain/customers.ts";

const PAGE_SIZE = 25;
const DUPLICATE_LIMIT = 5;

interface AccountRow {
  accountid: string;
  name: string | null;
  telephone1: string | null;
  websiteurl: string | null;
  _ownerid_value: string;
}
interface ContactRow {
  contactid: string;
  firstname: string | null;
  lastname: string | null;
  fullname: string | null;
  emailaddress1: string | null;
  telephone1: string | null;
  jobtitle: string | null;
  _parentcustomerid_value: string | null;
  _ownerid_value: string;
}

const ACCOUNT_SELECT = ["accountid", "name", "telephone1", "websiteurl", "_ownerid_value"];
const CONTACT_SELECT = [
  "contactid", "firstname", "lastname", "fullname", "emailaddress1", "telephone1", "jobtitle", "_parentcustomerid_value", "_ownerid_value",
];

const toAccount = (r: AccountRow): Account => ({
  id: r.accountid, name: r.name ?? "", phone: r.telephone1 ?? "", website: r.websiteurl ?? "", ownerId: r._ownerid_value,
});
const toContact = (r: ContactRow, accountNames: Map<string, string>): Contact => ({
  id: r.contactid,
  firstName: r.firstname ?? "",
  lastName: r.lastname ?? "",
  fullName: r.fullname ?? "",
  email: r.emailaddress1 ?? "",
  phone: r.telephone1 ?? "",
  jobTitle: r.jobtitle ?? "",
  accountId: r._parentcustomerid_value,
  accountName: (r._parentcustomerid_value && accountNames.get(r._parentcustomerid_value)) || "",
  ownerId: r._ownerid_value,
});

const accountBody = (d: AccountDraft) => ({ name: d.name, telephone1: d.phone || null, websiteurl: d.website || null });
const contactBody = (d: ContactDraft) => ({
  firstname: d.firstName || null,
  lastname: d.lastName,
  emailaddress1: d.email || null,
  telephone1: d.phone || null,
  jobtitle: d.jobTitle || null,
  "parentcustomerid_account@odata.bind": d.accountId ? `/accounts(${d.accountId})` : null,
});

/**
 * Data-service implementation on the SDK's DataClient. The data source info is hand-declared because the generated
 * services need `pa app add data-source`, which requires interactive sign-in (see README, Status).
 */
export function createDataverseCustomerService(client: DataClient): CustomerService {
  const must = <T>(r: { success: boolean; data: T; error?: unknown }): T => {
    if (!r.success) throw r.error instanceof Error ? r.error : new Error("Dataverse request failed");
    return r.data;
  };

  async function accountNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const rows = must(
      await client.retrieveMultipleRecordsAsync<AccountRow>("account", {
        select: ["accountid", "name"],
        filter: unique.map((i) => `accountid eq ${i}`).join(" or "),
      }),
    );
    return new Map(rows.map((r) => [r.accountid, r.name ?? ""]));
  }

  async function contactsFrom(rows: ContactRow[]): Promise<Contact[]> {
    const names = await accountNames(rows.map((r) => r._parentcustomerid_value));
    return rows.map((r) => toContact(r, names));
  }

  const getAccount = async (id: string) =>
    toAccount(must(await client.retrieveRecordAsync<AccountRow>("account", id, { select: ACCOUNT_SELECT })));
  const getContact = async (id: string) => {
    const row = must(await client.retrieveRecordAsync<ContactRow>("contact", id, { select: CONTACT_SELECT }));
    return (await contactsFrom([row]))[0];
  };

  return {
    async listAccounts(q: ListQuery): Promise<Page<Account>> {
      const r = await client.retrieveMultipleRecordsAsync<AccountRow>("account", {
        select: ACCOUNT_SELECT, filter: q.filter, orderBy: ["name", "accountid"], maxPageSize: PAGE_SIZE, skipToken: q.skipToken,
      });
      return { items: must(r).map(toAccount), skipToken: r.skipToken };
    },
    async listContacts(q: ListQuery): Promise<Page<Contact>> {
      const r = await client.retrieveMultipleRecordsAsync<ContactRow>("contact", {
        select: CONTACT_SELECT, filter: q.filter, orderBy: ["fullname", "contactid"], maxPageSize: PAGE_SIZE, skipToken: q.skipToken,
      });
      return { items: await contactsFrom(must(r)), skipToken: r.skipToken };
    },
    getAccount,
    getContact,
    async findAccountsByName(name) {
      const rows = must(
        await client.retrieveMultipleRecordsAsync<AccountRow>("account", {
          select: ACCOUNT_SELECT, filter: `name eq ${odataString(name)}`, top: DUPLICATE_LIMIT,
        }),
      );
      return rows.map(toAccount);
    },
    async findContactsByEmail(email) {
      const rows = must(
        await client.retrieveMultipleRecordsAsync<ContactRow>("contact", {
          select: CONTACT_SELECT, filter: `emailaddress1 eq ${odataString(email)}`, top: DUPLICATE_LIMIT,
        }),
      );
      return contactsFrom(rows);
    },
    async createAccount(d) {
      const row = must(await client.createRecordAsync<object, AccountRow>("account", accountBody(d)));
      return getAccount(row.accountid);
    },
    async updateAccount(id, d) {
      must(await client.updateRecordAsync("account", id, accountBody(d)));
      return getAccount(id);
    },
    async createContact(d) {
      const row = must(await client.createRecordAsync<object, ContactRow>("contact", contactBody(d)));
      return getContact(row.contactid);
    },
    async updateContact(id, d) {
      must(await client.updateRecordAsync("contact", id, contactBody(d)));
      return getContact(id);
    },
    // Opportunities (nvdb_opportunity) arrive with the pipeline ticket.
    listOpportunitiesFor: async () => [],
  };
}

let instance: CustomerService | undefined;
export function getCustomerService(): CustomerService {
  instance ??= createDataverseCustomerService(
    getClient({
      account: { tableId: "account", version: "v1.0", primaryKey: "accountid", dataSourceType: "Dataverse", apis: {} },
      contact: { tableId: "contact", version: "v1.0", primaryKey: "contactid", dataSourceType: "Dataverse", apis: {} },
    }),
  );
  return instance;
}
