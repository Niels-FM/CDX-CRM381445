import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { L } from "../labels.ts";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
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
 * Data-service implementation on the SDK's DataClient.  Data sources `accounts` and `contacts` are registered with
  * `pa app add data-source` (see power.config.json and the generated dataSourcesInfo).
 */
const ACCOUNTS = "accounts";
const CONTACTS = "contacts";
const OPPORTUNITIES = "nvdb_opportunities";
const STAGE_BASE = 534210000;
const STAGE_LABELS = [L.stage.qualify, L.stage.develop, L.stage.propose, L.stage.close];
const STATUS_LABELS = [L.opportunityStatus.open, L.opportunityStatus.won, L.opportunityStatus.lost];

export function createDataverseCustomerService(client: DataClient): CustomerService {
  const must = <T>(r: { success: boolean; data: T; error?: unknown }): T => {
    if (!r.success) {
      const e = r.error;
      throw e instanceof Error ? e : new Error(e ? JSON.stringify(e) : "Dataverse request failed");
    }
    return r.data;
  };

  async function accountNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const rows = must(
      await client.retrieveMultipleRecordsAsync<AccountRow>(ACCOUNTS, {
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
    toAccount(must(await client.retrieveRecordAsync<AccountRow>(ACCOUNTS, id, { select: ACCOUNT_SELECT })));
  const getContact = async (id: string) => {
    const row = must(await client.retrieveRecordAsync<ContactRow>(CONTACTS, id, { select: CONTACT_SELECT }));
    return (await contactsFrom([row]))[0];
  };

  return {
    async listAccounts(q: ListQuery): Promise<Page<Account>> {
      const r = await client.retrieveMultipleRecordsAsync<AccountRow>(ACCOUNTS, {
        select: ACCOUNT_SELECT, filter: q.filter, orderBy: ["name", "accountid"], maxPageSize: PAGE_SIZE, skipToken: q.skipToken,
      });
      return { items: must(r).map(toAccount), skipToken: r.skipToken };
    },
    async listContacts(q: ListQuery): Promise<Page<Contact>> {
      const r = await client.retrieveMultipleRecordsAsync<ContactRow>(CONTACTS, {
        select: CONTACT_SELECT, filter: q.filter, orderBy: ["fullname", "contactid"], maxPageSize: PAGE_SIZE, skipToken: q.skipToken,
      });
      return { items: await contactsFrom(must(r)), skipToken: r.skipToken };
    },
    getAccount,
    getContact,
    async findAccountsByName(name) {
      const rows = must(
        await client.retrieveMultipleRecordsAsync<AccountRow>(ACCOUNTS, {
          select: ACCOUNT_SELECT, filter: `name eq ${odataString(name)}`, top: DUPLICATE_LIMIT,
        }),
      );
      return rows.map(toAccount);
    },
    async findContactsByEmail(email) {
      const rows = must(
        await client.retrieveMultipleRecordsAsync<ContactRow>(CONTACTS, {
          select: CONTACT_SELECT, filter: `emailaddress1 eq ${odataString(email)}`, top: DUPLICATE_LIMIT,
        }),
      );
      return contactsFrom(rows);
    },
    async createAccount(d) {
      const row = must(await client.createRecordAsync<object, AccountRow>(ACCOUNTS, accountBody(d)));
      return getAccount(row.accountid);
    },
    async updateAccount(id, d) {
      must(await client.updateRecordAsync(ACCOUNTS, id, accountBody(d)));
      return getAccount(id);
    },
    async createContact(d) {
      const row = must(await client.createRecordAsync<object, ContactRow>(CONTACTS, contactBody(d)));
      return getContact(row.contactid);
    },
    async updateContact(id, d) {
      must(await client.updateRecordAsync(CONTACTS, id, contactBody(d)));
      return getContact(id);
    },
    async listOpportunitiesFor({ kind, id }) {
      const column = kind === "account" ? "_nvdb_accountid_value" : "_nvdb_contactid_value";
      const rows = must(
        await client.retrieveMultipleRecordsAsync<{
          nvdb_opportunityid: string;
          nvdb_name: string | null;
          nvdb_stage: number | null;
          nvdb_opportunitystatus: number | null;
          nvdb_estimatedrevenue: number | null;
        }>(OPPORTUNITIES, {
          select: ["nvdb_opportunityid", "nvdb_name", "nvdb_stage", "nvdb_opportunitystatus", "nvdb_estimatedrevenue"],
          filter: `${column} eq ${id}`,
          top: 50,
        }),
      );
      return rows.map((r) => ({
        id: r.nvdb_opportunityid,
        name: r.nvdb_name ?? "",
        stage: STAGE_LABELS[(r.nvdb_stage ?? STAGE_BASE) - STAGE_BASE] ?? "",
        status: STATUS_LABELS[(r.nvdb_opportunitystatus ?? STAGE_BASE) - STAGE_BASE] ?? "",
        estimatedRevenue: r.nvdb_estimatedrevenue,
      }));
    },
  };
}

let instance: CustomerService | undefined;
export function getCustomerService(): CustomerService {
  instance ??= createDataverseCustomerService(getClient(dataSourcesInfo));
  return instance;
}
