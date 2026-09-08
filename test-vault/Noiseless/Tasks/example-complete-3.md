---
schema: 1
kind: task
id: example-complete-3
title: Map the first user journey
originalText: Map the first user journey
createdAt: 2026-09-06T06:02:33.546Z
status: done
snoozedUntil: null
inferred:
  goalId: event
  estimateMinutes: 45
  impact: 7
  reputation: 8
  missionFit:
    - goalId: independence
      score: 8
  due: 2026-09-07
  dateKind: inferred
  confidence: 0.88
  rationale: "Fictional example: this deliverable supports a defined checkpoint. Scores are illustrative."
  complex: false
overrides: {}
enrichmentKey: ""
provider: Example
captureState: null
pending: ""
snapshot:
  at: 2026-09-02T19:00:00.000Z
  impact: 7
  alignment: 8
  points: 56
  estimateMinutes: 45
  graphVersion: 1
  rubricVersion: 1
  attribution:
    event: 1
    learn: 0.3
    independence: 1
    community: 0.7
  goals:
    - id: independence
      title: More independent lives
      level: L1
      description: Help people have the independence to live fully.
      successCriteria: Help people have the independence to live fully.
      due: 2036-09-02
      dateKind: explicit
      importance: 10
      parents: []
      achieved: false
    - id: learn
      title: Build the knowledge to contribute
      level: L2
      description: Develop research and engineering skills with practical impact.
      successCriteria: Develop research and engineering skills with practical impact.
      due: 2028-01-18
      dateKind: explicit
      importance: 10
      parents:
        - parentId: independence
          weight: 1
      achieved: false
    - id: community
      title: Grow a community of support
      level: L2
      description: Bring people and resources together around accessible care.
      successCriteria: Bring people and resources together around accessible care.
      due: 2027-09-05
      dateKind: explicit
      importance: 10
      parents:
        - parentId: independence
          weight: 1
      achieved: false
    - id: event
      title: Community fundraiser
      level: L3
      description: Host a fundraising event that raises $10,000 for care research.
      successCriteria: Host a fundraising event that raises $10,000 for care research.
      due: 2026-10-05
      dateKind: explicit
      importance: 10
      parents:
        - parentId: learn
          weight: 0.3
        - parentId: community
          weight: 0.7
      achieved: false
    - id: prototype
      title: Accessible tool prototype
      level: L3
      description: Test an accessible daily-living tool with five volunteer users.
      successCriteria: Test an accessible daily-living tool with five volunteer users.
      due: 2026-11-04
      dateKind: explicit
      importance: 10
      parents:
        - parentId: learn
          weight: 1
      achieved: false
    - id: study
      title: Research foundations
      level: L3
      description: Complete a short literature review and summarize three promising directions.
      successCriteria: Complete a short literature review and summarize three promising directions.
      due: 2026-10-20
      dateKind: explicit
      importance: 10
      parents:
        - parentId: learn
          weight: 1
      achieved: false
sessions:
  - id: a8da7a12-4334-4e14-9f11-86d7dca1503f
    at: 2026-09-02T19:00:00.000Z
    date: 2026-09-02
    minutes: 35
history:
  - id: bf3a8021-7d9b-4ed9-a59d-5ac8f04d355c
    at: 2026-09-02T19:00:00.000Z
    date: 2026-09-02
    action: complete
---

# Map the first user journey

Map the first user journey

## Notes

