using System;
using Microsoft.Xrm.Sdk;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Implementation of the unbound Custom API nvdb_AddActivity. Inputs: ParentType, ParentId, ActivityType, Subject, DueDate, Description (optional).
    /// Output: ActivityId. Runs as the caller (no elevation) and sets Regarding, so the code app never writes polymorphic lookups.
    /// </summary>
    public class AddActivity : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var input = context.InputParameters;
            var parentType = Text(input, "ParentType");
            var activityType = Text(input, "ActivityType");
            var subject = Text(input, "Subject");
            var due = input.Contains("DueDate") ? input["DueDate"] as DateTime? : null;

            var error = TimelineRules.ValidateParent(parentType) ?? TimelineRules.ValidateActivity(activityType, subject, due);
            if (error != null) throw new InvalidPluginExecutionException(error);
            if (!(input["ParentId"] is Guid parentId)) throw new InvalidPluginExecutionException("ParentId is required.");

            var activity = new Entity(activityType);
            activity["subject"] = subject.Trim();
            activity["regardingobjectid"] = new EntityReference(parentType, parentId);
            var description = Text(input, "Description");
            if (!string.IsNullOrWhiteSpace(description)) activity["description"] = description;
            if (activityType == "task") activity["scheduledend"] = due.Value;
            else
            {
                activity["scheduledstart"] = due.Value;
                activity["scheduledend"] = TimelineRules.EndOf(activityType, due.Value);
            }

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var id = factory.CreateOrganizationService(context.UserId).Create(activity);
            context.OutputParameters["ActivityId"] = id;
        }

        internal static string Text(ParameterCollection input, string name) => input.Contains(name) ? input[name] as string : null;
    }
}
