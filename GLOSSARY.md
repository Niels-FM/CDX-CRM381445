# Sales CRM

A simple internal sales CRM that replaces the D365 Sales Hub: tracking prospects, customers and deals through a pipeline.

## Language

**Lead**:
An unqualified prospect, before any Account, Contact or Opportunity exists for them.
_Avoid_: Prospect, enquiry

**Qualification**:
Turning a Lead into an Account, a Contact and an Opportunity in one step; the Lead is then Qualified.
_Avoid_: Conversion

**Opportunity**:
A potential deal with an Account, moving through the pipeline until Won or Lost.
_Avoid_: Deal, sale

**Stage**:
An Opportunity's position in the pipeline: Qualify, Develop, Propose or Close.
_Avoid_: Phase, step

**Status**:
Whether an Opportunity is Open, Won or Lost, independent of its Stage.
_Avoid_: State

**Account**:
An organisation the company sells to.
_Avoid_: Company, customer

**Contact**:
A person at an Account.
_Avoid_: Person

**Activity**:
A Task, Phone Call or Appointment recorded against a Lead, Account, Contact or Opportunity.
_Avoid_: Event, interaction

**Note**:
Free text recorded against a Lead, Account, Contact or Opportunity.
_Avoid_: Comment

**Timeline**:
The combined chronological list of a record's Activities and Notes.
_Avoid_: History, feed

**Sales Rep**:
A user who works their own Leads, Opportunities and related records.
_Avoid_: Salesperson, seller

**Sales Manager**:
A user who sees and works the whole team's records.
_Avoid_: Admin
