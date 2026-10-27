namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Pure decision rules for updates to nvdb_opportunity (no Dataverse types, unit tested in SalesCrm.Plugins.Tests).
    /// Won and Lost records are read-only; the only allowed change is a reopen (Status back to Open) by a Sales Manager.
    /// </summary>
    public static class OpportunityGuardRules
    {
        public const int StatusOpen = 534210000;
        public const int StatusWon = 534210001;
        public const int StatusLost = 534210002;

        public const string ReopenManagerOnly = "Only a Sales Manager can reopen a Won or Lost Opportunity.";
        public const string ClosedReadOnly = "A Won or Lost Opportunity is read-only. A Sales Manager must reopen it first.";
        public const string LostReasonRequired = "A Lost reason is required.";

        /// <param name="currentStatus">Status stored on the record before this update.</param>
        /// <param name="newStatus">Status in the update, or null when the update does not touch it.</param>
        /// <param name="effectiveLostReason">Lost reason after the update (new value if supplied, else stored value).</param>
        /// <returns>null when the update is allowed, otherwise the message to show.</returns>
        public static string Evaluate(int? currentStatus, int? newStatus, bool callerIsManager, string effectiveLostReason)
        {
            var wasClosed = currentStatus == StatusWon || currentStatus == StatusLost;
            if (wasClosed)
            {
                if (newStatus == StatusOpen)
                    return callerIsManager ? null : ReopenManagerOnly;
                return ClosedReadOnly;
            }

            if (newStatus == StatusLost && string.IsNullOrWhiteSpace(effectiveLostReason))
                return LostReasonRequired;

            return null;
        }
    }
}
