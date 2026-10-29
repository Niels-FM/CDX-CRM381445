import { describe, expect, it } from "vitest";
import { canSearch, globalSearch, searchFilter, type SearchService } from "./search.ts";

const hit = (id: string, title: string) => ({ id, title, subtitle: "" });

function fakeService(over: Partial<SearchService> = {}): SearchService & { calls: Record<string, string> } {
  const calls: Record<string, string> = {};
  const make = (kind: string, rows: ReturnType<typeof hit>[]) => async (filter: string, top: number) => {
    calls[kind] = filter;
    return rows.slice(0, top);
  };
  return {
    calls,
    account: make("account", [hit("a1", "Acme")]),
    contact: make("contact", []),
    lead: make("lead", []),
    opportunity: make("opportunity", []),
    ...over,
  };
}

describe("canSearch", () => {
  it("needs at least 2 characters after trimming", () => {
    expect(canSearch("a")).toBe(false);
    expect(canSearch(" a ")).toBe(false);
    expect(canSearch("ac")).toBe(true);
  });
});

describe("searchFilter", () => {
  it("searches the specified fields per entity", () => {
    expect(searchFilter("account", "ac")).toBe("(contains(name,'ac') or contains(telephone1,'ac') or contains(websiteurl,'ac'))");
    expect(searchFilter("contact", "ac")).toBe("(contains(fullname,'ac') or contains(emailaddress1,'ac') or contains(telephone1,'ac'))");
    expect(searchFilter("lead", "ac")).toBe(
      "(contains(nvdb_topic,'ac') or contains(nvdb_firstname,'ac') or contains(nvdb_lastname,'ac') or contains(nvdb_companyname,'ac') or contains(nvdb_email,'ac'))",
    );
    expect(searchFilter("opportunity", "ac")).toBe("(contains(nvdb_name,'ac'))");
  });

  it("escapes quotes in the term", () => {
    expect(searchFilter("opportunity", "o'neil")).toBe("(contains(nvdb_name,'o''neil'))");
  });
});

describe("globalSearch", () => {
  it("returns nothing and does not query below the minimum length", async () => {
    const s = fakeService();
    expect(await globalSearch(s, "a")).toEqual({ groups: [], failed: [] });
    expect(s.calls).toEqual({});
  });

  it("queries all four entities and groups non-empty results in a fixed order", async () => {
    const s = fakeService({ opportunity: async () => [hit("o1", "Deal")] });
    const r = await globalSearch(s, " ac ");
    expect(Object.keys(s.calls).sort()).toEqual(["account", "contact", "lead"]);
    expect(s.calls.account).toContain("contains(name,'ac')");
    expect(r.groups.map((g) => g.kind)).toEqual(["account", "opportunity"]);
  });

  it("asks for about 5 results per entity", async () => {
    const seen: number[] = [];
    const s = fakeService({ lead: async (_f, top) => (seen.push(top), []) });
    await globalSearch(s, "ac");
    expect(seen).toEqual([5]);
  });

  it("keeps the other groups when one entity fails", async () => {
    const s = fakeService({
      contact: async () => {
        throw new Error("no privilege");
      },
    });
    const r = await globalSearch(s, "ac");
    expect(r.groups.map((g) => g.kind)).toEqual(["account"]);
    expect(r.failed).toEqual(["contact"]);
  });
});
