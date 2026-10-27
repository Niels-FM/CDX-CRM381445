using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Update, pre-operation, nvdb_opportunity. Enforces on the server (also via API) that Won/Lost Opportunities are
    /// read-only and that only a Sales Manager can reopen one. Registered as its own plug-in type; see plugins\README.md.
    /// </summary>
    public class OpportunityGuard : IPlugin
    {
        private const string ManagerRole = "Sales Manager";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (!string.Equals(context.PrimaryEntityName, "nvdb_opportunity", StringComparison.OrdinalIgnoreCase)
                || !string.Equals(context.MessageName, "Update", StringComparison.OrdinalIgnoreCase)
                || !(context.InputParameters["Target"] is Entity target))
                return;

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(null); // system: the caller cannot always read roles

            var current = service.Retrieve("nvdb_opportunity", target.Id, new ColumnSet("nvdb_opportunitystatus", "nvdb_lostreason"));
            var currentStatus = current.GetAttributeValue<OptionSetValue>("nvdb_opportunitystatus")?.Value;
            var newStatus = target.Contains("nvdb_opportunitystatus") ? target.GetAttributeValue<OptionSetValue>("nvdb_opportunitystatus")?.Value : null;
            var lostReason = target.Contains("nvdb_lostreason") ? target.GetAttributeValue<string>("nvdb_lostreason") : current.GetAttributeValue<string>("nvdb_lostreason");

            // Only look the role up when it can matter.
            var wasClosed = currentStatus == OpportunityGuardRules.StatusWon || currentStatus == OpportunityGuardRules.StatusLost;
            var isManager = wasClosed && IsInRole(service, context.UserId, ManagerRole);

            var message = OpportunityGuardRules.Evaluate(currentStatus, newStatus, isManager, lostReason);
            if (message != null)
                throw new InvalidPluginExecutionException(message);
        }

        /// <summary>Direct role assignment, or through a team the user belongs to.</summary>
        private static bool IsInRole(IOrganizationService service, Guid userId, string roleName)
        {
            var direct = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), TopCount = 1 };
            direct.Criteria.AddCondition("name", ConditionOperator.Equal, roleName);
            direct.AddLink("systemuserroles", "roleid", "roleid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            if (service.RetrieveMultiple(direct).Entities.Count > 0) return true;

            var viaTeam = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), TopCount = 1 };
            viaTeam.Criteria.AddCondition("name", ConditionOperator.Equal, roleName);
            viaTeam.AddLink("teamroles", "roleid", "roleid")
                .AddLink("teammembership", "teamid", "teamid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return service.RetrieveMultiple(viaTeam).Entities.Count > 0;
        }
    }
}
