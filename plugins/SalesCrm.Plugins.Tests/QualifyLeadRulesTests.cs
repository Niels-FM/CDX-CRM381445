using System;
using NVDB.SalesCrm.Plugins;
using Xunit;

public class QualifyLeadRulesTests
{
    private const int New = QualifyLeadRules.StatusNew;
    private const int Contacted = QualifyLeadRules.StatusContacted;
    private const int Qualified = QualifyLeadRules.StatusQualified;
    private const int Disqualified = QualifyLeadRules.StatusDisqualified;

    [Theory]
    [InlineData(New)]
    [InlineData(Contacted)]
    [InlineData(null)]
    public void Owner_can_qualify_an_open_lead(int? status)
        => Assert.Null(QualifyLeadRules.CheckCaller(status, true, false));

    [Fact]
    public void Manager_can_qualify_someone_elses_lead()
        => Assert.Null(QualifyLeadRules.CheckCaller(New, false, true));

    [Fact]
    public void Other_rep_cannot_qualify()
        => Assert.Equal(QualifyLeadRules.OwnerOrManagerOnly, QualifyLeadRules.CheckCaller(New, false, false));

    [Theory]
    [InlineData(Qualified)]
    [InlineData(Disqualified)]
    public void Qualified_or_disqualified_lead_is_rejected_even_for_a_manager(int status)
    {
        Assert.Equal(QualifyLeadRules.AlreadyClosed, QualifyLeadRules.CheckCaller(status, true, true));
        Assert.Equal(QualifyLeadRules.AlreadyClosed, QualifyLeadRules.CheckCaller(status, false, true));
    }

    [Fact]
    public void New_account_needs_a_company_name()
        => Assert.Equal(QualifyLeadRules.CompanyRequired, QualifyLeadRules.CheckParties(null, null, " ", "Smith"));

    [Fact]
    public void New_contact_needs_a_last_name()
        => Assert.Equal(QualifyLeadRules.LastNameRequired, QualifyLeadRules.CheckParties(null, null, "Acme", null));

    [Fact]
    public void Chosen_existing_parties_need_no_lead_data()
        => Assert.Null(QualifyLeadRules.CheckParties(Guid.NewGuid(), Guid.NewGuid(), null, null));

    [Fact]
    public void Opportunity_name_defaults_to_the_lead_topic()
    {
        Assert.Equal("Big deal", QualifyLeadRules.OpportunityName("Big deal", "Lead topic"));
        Assert.Equal("Lead topic", QualifyLeadRules.OpportunityName("  ", "Lead topic"));
        Assert.Equal("Lead topic", QualifyLeadRules.OpportunityName(null, "Lead topic"));
    }
}
