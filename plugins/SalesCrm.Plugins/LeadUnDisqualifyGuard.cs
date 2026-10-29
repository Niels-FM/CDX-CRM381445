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
        public const int DisqualifiedValue = QualifyLeadRules.StatusDisqualified;
        public const string PreImageName = "PreImage";

        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context.MessageName != "Update" || context.PrimaryEntityName != LeadTable) return;
            if (!(context.InputParameters["Target"] is Entity target)) return;

            var before = context.PreEntityImages.Contains(PreImageName) ? context.PreEntityImages[PreImageName] : null;
            if (!IsUnDisqualify(before, target)) return;

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            // Roles are read as SYSTEM: reps hold no privilege to read security roles. The role counts when assigned directly or through a team.
            var system = factory.CreateOrganizationService(null);
            if (RoleLookup.IsInRole(system, context.UserId, RoleLookup.ManagerRole)) return;

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
    }
}
