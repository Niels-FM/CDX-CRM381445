using System;
using System.Collections.Generic;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Implementation of the unbound Custom API nvdb_QualifyLead (main operation, so everything below runs in one transaction:
    /// any exception rolls back every Account, Contact and Opportunity created here). All work runs as the caller, not elevated;
    /// only the role lookup uses SYSTEM. See plugins\README.md.
    /// </summary>
    public class QualifyLead : IPlugin
    {
        private const int OpportunityStageQualify = 534210000;
        private const int OpportunityStatusOpen = OpportunityGuardRules.StatusOpen;
        private const int QualifyProbability = 10;

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var caller = factory.CreateOrganizationService(context.UserId);

            var leadRef = (EntityReference)context.InputParameters["LeadId"];
            var accountId = OptionalId(context, "AccountId");
            var contactId = OptionalId(context, "ContactId");
            var createOpportunity = Optional<bool>(context, "CreateOpportunity");

            var lead = caller.Retrieve("nvdb_lead", leadRef.Id, new ColumnSet("nvdb_leadstatus", "ownerid", "nvdb_companyname", "nvdb_firstname", "nvdb_lastname", "nvdb_jobtitle", "nvdb_email", "nvdb_phone", "nvdb_topic"));
            var status = lead.GetAttributeValue<OptionSetValue>("nvdb_leadstatus")?.Value;
            var isOwner = lead.GetAttributeValue<EntityReference>("ownerid")?.Id == context.UserId;
            var isManager = !isOwner && RoleLookup.IsInRole(factory.CreateOrganizationService(null), context.UserId, RoleLookup.ManagerRole);
            Fail(QualifyLeadRules.CheckCaller(status, isOwner, isManager));

            var company = lead.GetAttributeValue<string>("nvdb_companyname");
            var lastName = lead.GetAttributeValue<string>("nvdb_lastname");
            Fail(QualifyLeadRules.CheckParties(accountId, contactId, company, lastName));

            var account = accountId ?? caller.Create(new Entity("account") { ["name"] = company.Trim() });
            var contact = contactId ?? caller.Create(NewContact(lead, accountId == null ? account : (Guid?)null));

            Guid? opportunity = null;
            if (createOpportunity)
            {
                var name = QualifyLeadRules.OpportunityName(Optional<string>(context, "OpportunityName"), lead.GetAttributeValue<string>("nvdb_topic"));
                var opp = new Entity("nvdb_opportunity")
                {
                    ["nvdb_name"] = name,
                    ["nvdb_accountid"] = new EntityReference("account", account),
                    ["nvdb_contactid"] = new EntityReference("contact", contact),
                    ["nvdb_sourceleadid"] = new EntityReference("nvdb_lead", lead.Id),
                    ["nvdb_stage"] = new OptionSetValue(OpportunityStageQualify),
                    ["nvdb_opportunitystatus"] = new OptionSetValue(OpportunityStatusOpen),
                    ["nvdb_probability"] = QualifyProbability,
                };
                var revenue = Optional<Money>(context, "EstimatedRevenue");
                if (revenue != null) opp["nvdb_estimatedrevenue"] = revenue;
                var closeDate = Optional<DateTime>(context, "EstimatedCloseDate"); // unset arrives as DateTime.MinValue
                if (closeDate > DateTime.MinValue) opp["nvdb_estimatedclosedate"] = closeDate;
                opportunity = caller.Create(opp);
                MoveTimeline(caller, lead.Id, new EntityReference("nvdb_opportunity", opportunity.Value));
            }

            caller.Update(new Entity("nvdb_lead", lead.Id)
            {
                ["nvdb_leadstatus"] = new OptionSetValue(QualifyLeadRules.StatusQualified),
                ["nvdb_accountid"] = new EntityReference("account", account),
                ["nvdb_contactid"] = new EntityReference("contact", contact),
            });

            context.OutputParameters["AccountId"] = account;
            context.OutputParameters["ContactId"] = contact;
            context.OutputParameters["OpportunityId"] = opportunity ?? Guid.Empty;
        }

        private static Entity NewContact(Entity lead, Guid? newAccountId)
        {
            var contact = new Entity("contact")
            {
                ["firstname"] = lead.GetAttributeValue<string>("nvdb_firstname"),
                ["lastname"] = lead.GetAttributeValue<string>("nvdb_lastname").Trim(),
                ["jobtitle"] = lead.GetAttributeValue<string>("nvdb_jobtitle"),
                ["emailaddress1"] = lead.GetAttributeValue<string>("nvdb_email"),
                ["telephone1"] = lead.GetAttributeValue<string>("nvdb_phone"),
            };
            if (newAccountId != null) contact["parentcustomerid"] = new EntityReference("account", newAccountId.Value);
            return contact;
        }

        /// <summary>Re-points the Lead's Activities and Notes at the Opportunity. Closed Activities are read-only, so they are reopened for the move and closed again.</summary>
        private static void MoveTimeline(IOrganizationService service, Guid leadId, EntityReference target)
        {
            var activities = new QueryExpression("activitypointer") { ColumnSet = new ColumnSet("activitytypecode", "statecode", "statuscode") };
            activities.Criteria.AddCondition("regardingobjectid", ConditionOperator.Equal, leadId);
            foreach (var a in RetrieveAll(service, activities))
            {
                var type = a.GetAttributeValue<string>("activitytypecode");
                var state = a.GetAttributeValue<OptionSetValue>("statecode").Value;
                var status = a.GetAttributeValue<OptionSetValue>("statuscode").Value;
                var reference = new EntityReference(type, a.Id);
                if (state != 0) SetState(service, reference, 0, -1);
                service.Update(new Entity(type, a.Id) { ["regardingobjectid"] = target });
                if (state != 0) SetState(service, reference, state, status);
            }

            var notes = new QueryExpression("annotation") { ColumnSet = new ColumnSet("annotationid") };
            notes.Criteria.AddCondition("objectid", ConditionOperator.Equal, leadId);
            foreach (var n in RetrieveAll(service, notes))
                service.Update(new Entity("annotation", n.Id) { ["objectid"] = target });
        }

        private static void SetState(IOrganizationService service, EntityReference record, int state, int status)
            => service.Execute(new OrganizationRequest("SetState")
            {
                ["EntityMoniker"] = record,
                ["State"] = new OptionSetValue(state),
                ["Status"] = new OptionSetValue(status),
            });

        private static List<Entity> RetrieveAll(IOrganizationService service, QueryExpression query)
        {
            var all = new List<Entity>();
            query.PageInfo = new PagingInfo { PageNumber = 1, Count = 500 };
            EntityCollection page;
            do
            {
                page = service.RetrieveMultiple(query);
                all.AddRange(page.Entities);
                query.PageInfo.PageNumber++;
                query.PageInfo.PagingCookie = page.PagingCookie;
            } while (page.MoreRecords);
            return all;
        }

        private static T Optional<T>(IPluginExecutionContext context, string name)
            => context.InputParameters.Contains(name) && context.InputParameters[name] is T value ? value : default(T);

        // An unset Guid input arrives as Guid.Empty, not as missing.
        private static Guid? OptionalId(IPluginExecutionContext context, string name)
        {
            var id = Optional<Guid?>(context, name);
            return id == Guid.Empty ? null : id;
        }

        private static void Fail(string message)
        {
            if (message != null) throw new InvalidPluginExecutionException(message);
        }
    }
}
