using System;
using NVDB.SalesCrm.Plugins;
using Xunit;

public class TimelineRulesTests
{
    [Theory]
    [InlineData("nvdb_lead")]
    [InlineData("nvdb_opportunity")]
    [InlineData("account")]
    [InlineData("contact")]
    public void Timeline_parents_are_accepted(string parent)
        => Assert.Null(TimelineRules.ValidateParent(parent));

    [Theory]
    [InlineData("systemuser")]
    [InlineData("")]
    [InlineData(null)]
    public void Other_parents_are_rejected(string parent)
        => Assert.Equal(TimelineRules.UnsupportedParent, TimelineRules.ValidateParent(parent));

    [Theory]
    [InlineData("task")]
    [InlineData("phonecall")]
    [InlineData("appointment")]
    public void Activity_types_are_accepted(string type)
        => Assert.Null(TimelineRules.ValidateActivity(type, "Call back", new DateTime(2026, 1, 1)));

    [Fact]
    public void Unknown_activity_type_is_rejected()
        => Assert.Equal(TimelineRules.UnsupportedActivityType, TimelineRules.ValidateActivity("email", "x", new DateTime(2026, 1, 1)));

    [Theory]
    [InlineData(null)]
    [InlineData("  ")]
    public void Activity_needs_a_subject(string subject)
        => Assert.Equal(TimelineRules.SubjectRequired, TimelineRules.ValidateActivity("task", subject, new DateTime(2026, 1, 1)));

    [Fact]
    public void Activity_needs_a_due_date()
        => Assert.Equal(TimelineRules.DueDateRequired, TimelineRules.ValidateActivity("task", "x", null));

    [Theory]
    [InlineData(null)]
    [InlineData("\t")]
    public void Note_needs_text(string text)
        => Assert.Equal(TimelineRules.NoteTextRequired, TimelineRules.ValidateNote(text));

    [Fact]
    public void Note_with_text_is_accepted()
        => Assert.Null(TimelineRules.ValidateNote("Met on site"));

    [Fact]
    public void Appointment_lasts_thirty_minutes_from_the_due_date()
        => Assert.Equal(new DateTime(2026, 3, 4, 10, 30, 0), TimelineRules.EndOf("appointment", new DateTime(2026, 3, 4, 10, 0, 0)));

    [Theory]
    [InlineData("task")]
    [InlineData("phonecall")]
    public void Task_and_call_end_at_the_due_date(string type)
        => Assert.Equal(new DateTime(2026, 3, 4, 10, 0, 0), TimelineRules.EndOf(type, new DateTime(2026, 3, 4, 10, 0, 0)));
}
