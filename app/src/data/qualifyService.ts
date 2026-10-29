import { getClient, type DataClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import type { QualifyRequest, QualifyResult, QualifyService } from "../domain/qualify.ts";

const API = "nvdb_QualifyLead";
const TABLE = "nvdb_leads";
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

const body = (name: string, type: string, format?: string) => ({ name, in: "body", required: false, type, ...(format ? { format } : {}) });

/** The generated data source info has no Custom API metadata, so the unbound action is declared here. */
const withQualifyApi = {
  ...dataSourcesInfo,
  [TABLE]: {
    ...dataSourcesInfo[TABLE],
    apis: {
      [API]: {
        path: `/api/data/v9.2/${API}`,
        method: "POST",
        parameters: [
          body("LeadId", "object"), body("CreateOpportunity", "boolean"), body("AccountId", "string"), body("ContactId", "string"),
          body("OpportunityName", "string"), body("EstimatedRevenue", "number"), body("EstimatedCloseDate", "string", "date-time"),
        ],
        responses: {},
      },
    },
  },
};

interface QualifyResponse {
  AccountId: string;
  ContactId: string;
  OpportunityId: string;
}

export function createDataverseQualifyService(client: DataClient): QualifyService {
  return {
    async qualify(request: QualifyRequest): Promise<QualifyResult> {
      const { LeadId, ...rest } = request;
      const r = await client.executeAsync<unknown, QualifyResponse>({
        dataverseRequest: {
          action: "customapi",
          parameters: {
            operationName: API,
            tableName: TABLE,
            body: { ...rest, LeadId: { "@odata.type": "Microsoft.Dynamics.CRM.nvdb_lead", nvdb_leadid: LeadId } },
          },
        },
      });
      if (!r.success) {
        const e = r.error;
        throw e instanceof Error ? e : new Error(e ? JSON.stringify(e) : "Qualify failed");
      }
      const d = r.data;
      return { accountId: d.AccountId, contactId: d.ContactId, opportunityId: d.OpportunityId === EMPTY_GUID ? null : d.OpportunityId };
    },
  };
}

let instance: QualifyService | undefined;
export function getQualifyService(): QualifyService {
  instance ??= createDataverseQualifyService(getClient(withQualifyApi));
  return instance;
}
