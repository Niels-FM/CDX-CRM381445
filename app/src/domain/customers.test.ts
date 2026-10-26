import { describe, expect, it, vi } from "vitest";
import {
  buildListFilter,
  canEdit,
  loadNextPage,
  odataString,
  submitAccount,
  submitContact,
  type Account,
  type Contact,
  type CustomerService,
  type Page,
} from "./customers.ts";

const acc = (over: Partial<Account> = {}): Account => ({ id: "a1", name: "Contoso", phone: "", website: "", ownerId: "u1", ...over });
const con = (over: Partial<Contact> = {}): Contact => ({
  id: "c1", firstName: "Ann", lastName: "Lee", fullName: "Ann Lee", email: "ann@x.com", phone: "", jobTitle: "", accountId: null, accountName: "", ownerId: "u1", ...over,
});

function mockService(over: Partial<CustomerService> = {}): CustomerService {
  const empty = async <T>(): Promise<Page<T>> => ({ items: [] });
  return {
    listAccounts: empty,
    listContacts: empty,
    getAccount: async () => acc(),
    getContact: async () => con(),
    findAccountsByName: async () => [],
    findContactsByEmail: async () => [],
    createAccount: async (d) => acc({ ...d, id: "new" }),
    updateAccount: async (id, d) => acc({ ...d, id }),
    createContact: async (d) => con({ ...d, id: "new" }),
    updateContact: async (id, d) => con({ ...d, id }),
    listOpportunitiesFor: async () => [],
    ...over,
  };
}

describe("odataString", () => {
  it("doubles single quotes", () => expect(odataString("O'Neil")).toBe("'O''Neil'"));
});

describe("buildListFilter", () => {
  it("returns undefined for empty or single-character text", () => {
    expect(buildListFilter("account", "  ")).toBeUndefined();
    expect(buildListFilter("account", "a")).toBeUndefined();
  });
  it("searches Account name, phone and website", () => {
    expect(buildListFilter("account", "acme")).toBe(
      "(contains(name,'acme') or contains(telephone1,'acme') or contains(websiteurl,'acme'))",
    );
  });
  it("searches Contact full name, email and phone and escapes quotes", () => {
    expect(buildListFilter("contact", "o'n")).toBe(
      "(contains(fullname,'o''n') or contains(emailaddress1,'o''n') or contains(telephone1,'o''n'))",
    );
  });
});

describe("loadNextPage", () => {
  it("appends pages, tracks the skip token and marks done", async () => {
    const fetch = vi
      .fn<(t?: string) => Promise<Page<{ id: string }>>>()
      .mockResolvedValueOnce({ items: [{ id: "1" }], skipToken: "t1" })
      .mockResolvedValueOnce({ items: [{ id: "1" }, { id: "2" }] });
    const s1 = await loadNextPage({ items: [], done: false }, fetch);
    expect(s1).toEqual({ items: [{ id: "1" }], skipToken: "t1", done: false });
    const s2 = await loadNextPage(s1, fetch);
    expect(fetch).toHaveBeenLastCalledWith("t1");
    expect(s2.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(s2.done).toBe(true);
  });
  it("does nothing once done", async () => {
    const fetch = vi.fn();
    const s = { items: [], done: true };
    expect(await loadNextPage(s, fetch)).toBe(s);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("canEdit", () => {
  it("allows the owner only, ignoring case and braces", () => {
    expect(canEdit("{ABC}", "abc")).toBe(true);
    expect(canEdit("abc", "def")).toBe(false);
    expect(canEdit("abc", undefined)).toBe(false);
  });
});

describe("submitAccount", () => {
  const draft = { name: "Contoso", phone: "", website: "" };
  it("creates when there is no duplicate", async () => {
    const r = await submitAccount(mockService(), draft, {});
    expect(r).toEqual({ status: "saved", record: expect.objectContaining({ id: "new" }) });
  });
  it("warns with matches on same name (case-insensitive) instead of creating", async () => {
    const createAccount = vi.fn();
    const svc = mockService({ findAccountsByName: async () => [acc({ name: "CONTOSO" })], createAccount });
    const r = await submitAccount(svc, draft, {});
    expect(r.status).toBe("duplicates");
    expect(createAccount).not.toHaveBeenCalled();
  });
  it("creates anyway when forced", async () => {
    const svc = mockService({ findAccountsByName: async () => [acc()] });
    expect((await submitAccount(svc, draft, { force: true })).status).toBe("saved");
  });
  it("skips the check when the name is unchanged on edit and ignores itself when changed", async () => {
    const find = vi.fn(async () => [acc({ id: "a1", name: "Other" })]);
    const svc = mockService({ findAccountsByName: find });
    expect((await submitAccount(svc, draft, { id: "a1", original: acc() })).status).toBe("saved");
    expect(find).not.toHaveBeenCalled();
    const r = await submitAccount(svc, { ...draft, name: "Other" }, { id: "a1", original: acc() });
    expect(r.status).toBe("saved");
  });
  it("rejects a blank name", async () => {
    expect((await submitAccount(mockService(), { ...draft, name: "  " }, {})).status).toBe("invalid");
  });
});

describe("submitContact", () => {
  const draft = { firstName: "Ann", lastName: "Lee", email: "Ann@X.com", phone: "", jobTitle: "", accountId: null };
  it("warns on same email, ignoring case", async () => {
    const svc = mockService({ findContactsByEmail: async () => [con({ email: "ann@x.com" })] });
    const r = await submitContact(svc, draft, {});
    expect(r.status).toBe("duplicates");
  });
  it("does not check when email is empty", async () => {
    const find = vi.fn(async () => [con()]);
    const r = await submitContact(mockService({ findContactsByEmail: find }), { ...draft, email: "" }, {});
    expect(r.status).toBe("saved");
    expect(find).not.toHaveBeenCalled();
  });
  it("excludes itself when editing a changed email", async () => {
    const svc = mockService({ findContactsByEmail: async () => [con({ id: "c1", email: "ann@x.com" })] });
    const r = await submitContact(svc, draft, { id: "c1", original: con({ email: "old@x.com" }) });
    expect(r.status).toBe("saved");
  });
  it("requires a last name", async () => {
    expect((await submitContact(mockService(), { ...draft, lastName: "" }, {})).status).toBe("invalid");
  });
});
