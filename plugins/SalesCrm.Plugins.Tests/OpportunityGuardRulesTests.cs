using NVDB.SalesCrm.Plugins;
using Xunit;

public class OpportunityGuardRulesTests
{
    private const int Open = OpportunityGuardRules.StatusOpen;
    private const int Won = OpportunityGuardRules.StatusWon;
    private const int Lost = OpportunityGuardRules.StatusLost;

    [Theory]
    [InlineData(Won)]
    [InlineData(Lost)]
    public void Rep_cannot_reopen(int closed)
        => Assert.Equal(OpportunityGuardRules.ReopenManagerOnly, OpportunityGuardRules.Evaluate(closed, Open, false, null));

    [Theory]
    [InlineData(Won)]
    [InlineData(Lost)]
    public void Manager_can_reopen(int closed)
        => Assert.Null(OpportunityGuardRules.Evaluate(closed, Open, true, null));

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Closed_record_is_read_only_for_everyone(bool manager)
    {
        Assert.Equal(OpportunityGuardRules.ClosedReadOnly, OpportunityGuardRules.Evaluate(Won, null, manager, null));
        Assert.Equal(OpportunityGuardRules.ClosedReadOnly, OpportunityGuardRules.Evaluate(Lost, Lost, manager, "x"));
        Assert.Equal(OpportunityGuardRules.ClosedReadOnly, OpportunityGuardRules.Evaluate(Lost, Won, manager, null));
    }

    [Fact]
    public void Open_record_can_be_edited_and_won()
    {
        Assert.Null(OpportunityGuardRules.Evaluate(Open, null, false, null));
        Assert.Null(OpportunityGuardRules.Evaluate(Open, Won, false, null));
        Assert.Null(OpportunityGuardRules.Evaluate(null, Open, false, null));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public void Lost_needs_a_reason(string reason)
        => Assert.Equal(OpportunityGuardRules.LostReasonRequired, OpportunityGuardRules.Evaluate(Open, Lost, false, reason));

    [Fact]
    public void Lost_with_reason_is_allowed()
        => Assert.Null(OpportunityGuardRules.Evaluate(Open, Lost, false, "Price"));
}
