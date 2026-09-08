---
schema: 1
version: 1
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
---

# Example goals

> All goals and work in this vault are fictional examples.

```noiseless
goals
```
