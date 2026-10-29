import { odataString } from "./customers.ts";

export type SearchKind = "account" | "contact" | "lead" | "opportunity";
export const SEARCH_KINDS: readonly SearchKind[] = ["account", "contact", "lead", "opportunity"];

export const MIN_SEARCH_CHARS = 2;
export const RESULTS_PER_KIND = 5;

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
}

export interface SearchGroup {
  kind: SearchKind;
  hits: SearchHit[];
}

export interface SearchResult {
  groups: SearchGroup[];
  /** Kinds whose query failed; the other groups are still shown. */
  failed: SearchKind[];
}

/** The thin seam to Dataverse (one contains() query per entity, in the caller's security context). */
export type SearchService = Record<SearchKind, (filter: string, top: number) => Promise<SearchHit[]>>;

const SEARCH_FIELDS: Record<SearchKind, readonly string[]> = {
  account: ["name", "telephone1", "websiteurl"],
  contact: ["fullname", "emailaddress1", "telephone1"],
  lead: ["nvdb_topic", "nvdb_firstname", "nvdb_lastname", "nvdb_companyname", "nvdb_email"],
  opportunity: ["nvdb_name"],
};

export const canSearch = (text: string) => text.trim().length >= MIN_SEARCH_CHARS;

export function searchFilter(kind: SearchKind, term: string): string {
  const q = odataString(term);
  return `(${SEARCH_FIELDS[kind].map((f) => `contains(${f},${q})`).join(" or ")})`;
}

export async function globalSearch(service: SearchService, text: string): Promise<SearchResult> {
  const term = text.trim();
  if (!canSearch(term)) return { groups: [], failed: [] };
  const settled = await Promise.allSettled(SEARCH_KINDS.map((k) => service[k](searchFilter(k, term), RESULTS_PER_KIND)));
  const result: SearchResult = { groups: [], failed: [] };
  settled.forEach((s, i) => {
    const kind = SEARCH_KINDS[i];
    if (s.status === "rejected") result.failed.push(kind);
    else if (s.value.length) result.groups.push({ kind, hits: s.value });
  });
  return result;
}
