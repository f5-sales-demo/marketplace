# F5 location correlation rules

The location workflow discovers current F5 Regional Edge groups and components
from F5 Statuspage. It extracts a site code only when that code is present in a
live component name. It discovers the current PeeringDB network record for
AS35280 from the ASN, then joins current `netfac`, `netixlan`, `fac`, `ix`, and
`ixfac` records.

## What the evidence supports

| Public evidence | Defensible statement | Required limitation |
| --- | --- | --- |
| Live site code plus direct AS35280 facility presence with the same code | Strongest public correlation | Does not prove that an F5 service instance occupies that building |
| Direct AS35280 presence in the same metro | AS35280 is present in the metro | Does not select the Regional Edge building |
| AS35280 connection at an IXP | AS35280 participates at that exchange | Does not prove private interconnection or residence at every IXP facility |
| Facility or IXP candidate without direct AS presence | A next place to investigate | Must not be attributed to the F5 edge |
| No converging evidence | Exact location is unresolved | List candidates and the evidence needed to decide |

Multiple direct facilities in one metro remain competing candidates unless a
current site-code match supplies a stronger correlation. Similar-looking codes,
operator naming conventions, and geographic proximity are not direct evidence.

## Facility reporting

Do not describe facilities as Tier-1. Report measurable current attributes:

- Direct ASN presence or IXP-only association
- Facility operator and PeeringDB identifier
- Network and hosted-IX counts when the source supplies them
- Current street address from the live facility record
- Record update time and corroborating official sources

An address is a property of the facility record. It is not proof of F5 service
placement.
