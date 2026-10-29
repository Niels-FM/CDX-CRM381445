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
            var isManager = wasClosed && RoleLookup.IsInRole(service, context.UserId, RoleLookup.ManagerRole);

            var message = OpportunityGuardRules.Evaluate(currentStatus, newStatus, isManager, lostReason);
            if (message != null)
                throw new InvalidPluginExecutionException(message);
        }
    }
}
