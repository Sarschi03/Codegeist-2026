# Cost and quota controls

Demo mode runs in the browser. The connected local Convex development deployment runs on the workstation. If switching to cloud Convex, verify the team is on the Free plan and check its usage page in the Convex dashboard. The setup does not enable billing.

Use an Atlassian developer site and stay within its Forge and Rovo allowances. Check Forge's developer console for official usage and organization administration for applicable Rovo allowances. The Settings panel estimates board size from serialized data. It is an application estimate. No paid AI API, Forge LLM billing, cloud model download or background polling is required.

The app caps workspace count, image count and payload size. It compresses images, debounces meaningful writes, keeps Forge image chunks below KVS value limits, bounds context retrieval and deduplicates identical in-flight searches. If a provider rejects a quota-limited request, Trace reports a failure and preserves a working draft for an authorized retry or export.

[Forge quotas and limits](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/) · [Convex limits](https://docs.convex.dev/production/state/limits)
