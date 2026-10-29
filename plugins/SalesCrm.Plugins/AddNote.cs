using System;
using Microsoft.Xrm.Sdk;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Implementation of the unbound Custom API nvdb_AddNote. Inputs: ParentType, ParentId, Text, Subject (optional). Output: NoteId.
    /// Runs as the caller and sets the note's parent (objectid), so the code app never writes polymorphic lookups.
    /// </summary>
    public class AddNote : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var input = context.InputParameters;
            var parentType = AddActivity.Text(input, "ParentType");
            var text = AddActivity.Text(input, "Text");

            var error = TimelineRules.ValidateParent(parentType) ?? TimelineRules.ValidateNote(text);
            if (error != null) throw new InvalidPluginExecutionException(error);
            if (!(input["ParentId"] is Guid parentId)) throw new InvalidPluginExecutionException("ParentId is required.");

            var note = new Entity("annotation");
            note["objectid"] = new EntityReference(parentType, parentId);
            note["notetext"] = text;
            var subject = AddActivity.Text(input, "Subject");
            note["subject"] = string.IsNullOrWhiteSpace(subject) ? "Note" : subject.Trim();

            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            context.OutputParameters["NoteId"] = factory.CreateOrganizationService(context.UserId).Create(note);
        }
    }
}
