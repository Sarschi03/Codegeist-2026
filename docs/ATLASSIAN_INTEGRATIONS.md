# Atlassian installation and verification

## Developer setup

Create an Atlassian cloud developer site with Jira. Add Confluence to the same site if you want document retrieval. Install a Forge CLI version current enough for Preview MCP and compatible with your Node version. Run these commands from the Trace project folder.

```powershell
npm ci
npm run build:forge
forge login
forge register
forge lint
forge deploy -e development
forge install --site your-site.atlassian.net --product jira -e development
```

`forge register` replaces the placeholder app ID with an ID owned by the signed-in developer. Use the value from your registered app for later deploys. Connect the optional Confluence product from Atlassian Administration for the same site. After changing scopes, run `forge install --upgrade` for the installation. Enable Rovo and grant relevant scope access only if provided by your site.

## Scope and API mapping

| Scope                        | Use                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `storage:app`                | Private KVS workspaces, image chunks, and Jira request state                      |
| `read:jira-work`             | Enhanced JQL search, actual issue statuses, links and project issue-type metadata |
| `write:jira-work`            | Confirmed issue creation with Atlassian Document Format                           |
| `search:confluence`          | Accessible pages via CQL and the Confluence search endpoint                       |
| `read:page:confluence`       | Permission check and body text for a selected Confluence page                     |
| `read:graph:page:confluence` | Curated Teamwork Graph lookup for pages linked from a Confluence result           |

Atlassian installation rules can limit access to Jira or Confluence. Trace returns available results and a source-specific warning for an unavailable product. Source data stays in Atlassian infrastructure. It does not use Convex in Forge mode.

## Verify the installation

1. Open **Apps → Trace** in Jira. Create a workspace, paste an image, add a pin, reload, and confirm the image and annotation return.
2. Search for an issue and a page you can access. Refresh a linked issue after changing its Jira status. Check that restricted results are absent with a user who lacks source permissions.
3. Search from a pin and link an existing issue. Review a new draft, load available issue types with the target Jira project key and confirm creation. Check the actual issue in Jira and its canvas reference. Test a project containing required custom fields.
4. Select **Linked pages** on a Confluence result with links. Review the confirmed Teamwork Graph evidence where supported.
5. Open **Trace Companion** from the Atlassian Rovo entry point. The agent can read your workspace by ID, analyze explicit selection JSON, search as the end user and prepare drafts. The workspace ID is included in Trace JSON export.
6. Enable Trace tools in Atlassian Administration under **Apps → Sites → Connected apps** if using an external MCP client. Use the Forge app ID with `https://mcp.atlassian.com/forge/<appId>`. Tools check the invoking account and do not expose Jira mutation operations.

## Documentation

- [Forge app compatibility](https://developer.atlassian.com/platform/forge/app-compatibility/)
- [Jira issue REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
- [Jira enhanced JQL](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/)
- [Confluence search](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/)
- [Teamwork Graph curated queries](https://developer.atlassian.com/platform/teamwork-graph/curated-queries/)
- [Forge Rovo agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/)
- [Forge MCP](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)
