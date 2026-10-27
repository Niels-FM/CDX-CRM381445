using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Registered on nvdb_lead Update, pre-operation, with a pre-image named "PreImage" containing nvdb_leadstatus.
    /// Only a Sales Manager may move a Lead out of Disqualified, also when calling the Web API directly (tickets #5, #17).
    /// </summary>
    public class LeadUnDisqualifyGuard : IPlugin
    {
        public const string LeadTable = "nvdb_lead";
        public const string StatusColumn = "nvdb_leadstatus";
        public const int DisqualifiedValue = 534210003;
        public const string ManagerRole = "Sales Manager";
        public const string PreImageName = "PreImage";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context.MessageName != "Update" || context.PrimaryEntityName != LeadTable) return;
            if (!(context.InputParameters["Target"] is Entity target)) return;

            var before = context.PreEntityImages.Contains(PreImageName) ? context.PreEntityImages[PreImageName] : null;
            if (!IsUnDisqualify(before, target)) return;

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            // Roles are read as SYSTEM: reps hold no privilege to read security roles. Only directly assigned roles count.
            var system = factory.CreateOrganizationService(null);
            if (HasRole(system, context.InitiatingUserId, ManagerRole)) return;

            throw new InvalidPluginExecutionException("Only a Sales Manager can un-disqualify a Lead.");
        }

        public static bool IsUnDisqualify(Entity before, Entity target)
        {
            if (before == null || !target.Contains(StatusColumn)) return false;
            return StatusOf(before) == DisqualifiedValue && StatusOf(target) != DisqualifiedValue;
        }

        private static int? StatusOf(Entity e)
        {
            var v = e.GetAttributeValue<OptionSetValue>(StatusColumn);
            return v == null ? (int?)null : v.Value;
        }

        private static bool HasRole(IOrganizationService service, Guid userId, string roleName)
        {
            var query = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet("systemuserid"), TopCount = 1 };
            query.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            var role = query.AddLink("role", "roleid", "roleid");
            role.LinkCriteria.AddCondition("name", ConditionOperator.Equal, roleName);
            return service.RetrieveMultiple(query).Entities.Count > 0;
        }
    }
}
