---
"zoo-code": patch
---

OpenAI-Compatible provider: omit the `temperature` field when no custom temperature is set, so the model's server-side default applies instead of forcing `0` (#242). Model-required defaults (e.g. `deepseek-reasoner`) and the existing `supportsTemperature` capability gate are preserved, and a deliberately-set `0` is still sent.
