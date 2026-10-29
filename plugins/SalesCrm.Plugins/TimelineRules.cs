using System;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>Pure validation and mapping rules for nvdb_AddActivity and nvdb_AddNote (unit tested in SalesCrm.Plugins.Tests).</summary>
    public static class TimelineRules
    {
        public const string UnsupportedParent = "Parent type must be nvdb_lead, nvdb_opportunity, account or contact.";
        public const string UnsupportedActivityType = "Activity type must be task, phonecall or appointment.";
        public const string SubjectRequired = "A subject is required.";
        public const string DueDateRequired = "A due date is required.";
        public const string NoteTextRequired = "Note text is required.";

        public static readonly TimeSpan AppointmentLength = TimeSpan.FromMinutes(30);

        public static string ValidateParent(string parentType)
        {
            switch (parentType)
            {
                case "nvdb_lead":
                case "nvdb_opportunity":
                case "account":
                case "contact":
                    return null;
                default:
                    return UnsupportedParent;
            }
        }

        public static string ValidateActivity(string activityType, string subject, DateTime? dueDate)
        {
            if (activityType != "task" && activityType != "phonecall" && activityType != "appointment") return UnsupportedActivityType;
            if (string.IsNullOrWhiteSpace(subject)) return SubjectRequired;
            if (dueDate == null) return DueDateRequired;
            return null;
        }

        public static string ValidateNote(string text) => string.IsNullOrWhiteSpace(text) ? NoteTextRequired : null;

        public static DateTime EndOf(string activityType, DateTime due) => activityType == "appointment" ? due + AppointmentLength : due;
    }
}
