using System;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>Direct role assignment, or through a team the user belongs to. Pass a SYSTEM service: callers cannot read roles.</summary>
    internal static class RoleLookup
    {
        public static bool IsInRole(IOrganizationService system, Guid userId, string roleName)
        {
            var direct = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), TopCount = 1 };
            direct.Criteria.AddCondition("name", ConditionOperator.Equal, roleName);
            direct.AddLink("systemuserroles", "roleid", "roleid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            if (system.RetrieveMultiple(direct).Entities.Count > 0) return true;

            var viaTeam = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), TopCount = 1 };
            viaTeam.Criteria.AddCondition("name", ConditionOperator.Equal, roleName);
            viaTeam.AddLink("teamroles", "roleid", "roleid")
                .AddLink("teammembership", "teamid", "teamid")
                .LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            return system.RetrieveMultiple(viaTeam).Entities.Count > 0;
        }
    }
}
