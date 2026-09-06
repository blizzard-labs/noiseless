---
schema: 1
rubricVersion: 1
weekdayMinutes: null
weekendMinutes: null
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
    enabled: true
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

# Make room for what matters

```noiseless
setup
```

## One-time setup

In Source mode, edit the properties above:

1. Set weekdayMinutes and weekendMinutes (focused work, not your entire workday).
2. Start the local server in LM Studio → Developer. Put its loaded model identifier under providers.lmstudio.model.
3. Optionally enable OpenAI and Anthropic, set their model IDs and current USD input/output rates per million tokens, and choose a monthlyCloudBudget. Cloud stays paused until a positive budget and rates are configured.
4. Store API keys in Obsidian Settings → Noiseless. Only credential names belong here.
5. Describe goals in [[Noiseless/Goal brief]], draft them, then review [[Noiseless/Goal draft]] before approval.

## Priority weights

Weights are relative and editable. An all-zero set is invalid. Bump rubricVersion if you change your scoring interpretation. Daily overrides use YYYY-MM-DD keys.

## Scoring anchors

Impact: 1 = minor maintenance; 5 = meaningful checkpoint deliverable; 10 = major measurable outcome.
Mission fit: 1 = little causal connection; 5 = useful indirect support; 10 = direct, substantial mission contribution.
Reputation: 1 = private or negligible external effect; 5 = strengthens a meaningful relationship; 10 = major durable trust or visibility.

Change task values in its overrides properties to preserve them across enrichment. A due override should include dateKind: explicit.
