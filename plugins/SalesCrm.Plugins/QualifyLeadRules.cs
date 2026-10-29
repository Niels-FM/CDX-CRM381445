using System;

namespace NVDB.SalesCrm.Plugins
{
    /// <summary>
    /// Pure decision rules for nvdb_QualifyLead (no Dataverse types, unit tested in SalesCrm.Plugins.Tests).
    /// </summary>
    public static class QualifyLeadRules
    {
        public const int StatusNew = 534210000;
        public const int StatusContacted = 534210001;
        public const int StatusQualified = 534210002;
        public const int StatusDisqualified = 534210003;

        public const string OwnerOrManagerOnly = "Only the Lead owner or a Sales Manager can qualify this Lead.";
        public const string AlreadyClosed = "A Qualified or Disqualified Lead cannot be qualified.";
        public const string CompanyRequired = "The Lead needs a company name to create a new Account. Choose an existing Account instead.";
        public const string LastNameRequired = "The Lead needs a last name to create a new Contact. Choose an existing Contact instead.";

        /// <returns>null when allowed, otherwise the message to show.</returns>
        public static string CheckCaller(int? leadStatus, bool callerIsOwner, bool callerIsManager)
        {
            if (leadStatus == StatusQualified || leadStatus == StatusDisqualified) return AlreadyClosed;
            return callerIsOwner || callerIsManager ? null : OwnerOrManagerOnly;
        }

        /// <summary>The server trusts the caller's Account/Contact choice; it only checks that a new one can be built.</summary>
        public static string CheckParties(Guid? accountId, Guid? contactId, string companyName, string lastName)
        {
            if (accountId == null && string.IsNullOrWhiteSpace(companyName)) return CompanyRequired;
            if (contactId == null && string.IsNullOrWhiteSpace(lastName)) return LastNameRequired;
            return null;
        }

        public static string OpportunityName(string requested, string leadTopic)
            => string.IsNullOrWhiteSpace(requested) ? leadTopic : requested.Trim();
    }
}
