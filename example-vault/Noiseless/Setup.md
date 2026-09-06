---
schema: 1
rubricVersion: 1
weekdayMinutes: 240
weekendMinutes: 180
dailyOverrides: {}
weights:
  urgency: 25
  alignment: 30
  impact: 20
  roi: 20
  reputation: 5
monthlyCloudBudget: 0
maxOutputTokens: 2048
providers:
  lmstudio:
    enabled: false
    baseUrl: http://127.0.0.1:1234/v1
    model: ""
    credential: ""
    inputPerMillion: 0
    outputPerMillion: 0
  openai:
    enabled: false
    baseUrl: https://api.openai.com/v1
    model: ""
    credential: noiseless-openai
    inputPerMillion: 0
    outputPerMillion: 0
  anthropic:
    enabled: false
    baseUrl: https://api.anthropic.com/v1
    model: ""
    credential: noiseless-anthropic
    inputPerMillion: 0
    outputPerMillion: 0
---

# Example setup

> Fictional demonstration. Model calls are disabled. Start from starter-vault for your own work.

```noiseless
setup
```
