# Roadmap

## Implemented

Trace ships the standalone Canvas, Snap, Sketch and Thread workflow. Convex development persistence is wired through the localhost relay. The Forge source implements private workspace storage, Jira retrieval and confirmed creation, authorized Confluence retrieval, a curated Teamwork Graph lookup, a Rovo agent and read-only or draft-generating MCP actions.

## Live verification

Register and install the Forge app on an Atlassian developer site. Exercise each product path with both an authorized and a restricted user. Verify OCR works under the site's Custom UI content security policy and check scopes and Rovo feature availability. Capture a short Codegeist demo on that installation.

## Known limitations

- Workspaces are private and single-user. Sharing and multiplayer are outside the current release.
- Forge retrieves a bounded batch of source results. Search continuation and project discovery are future improvements.
- Local OCR currently bundles English. Manual feedback and recognition of visible text support screenshots. Arbitrary visual interpretation and optional semantic models are future work.
- Crop is non-destructive and inserts a new image. Reset rotation before OCR on a rotated image.
- Issue creation supports standard issue types and reports custom required fields. Subtasks, project-specific priority mapping, Jira screenshot attachment, and other custom create fields need additional project configuration and UI.
- The Rovo agent accepts workspace IDs and serialized scene selections through Atlassian's entry points. Eligible sites control Rovo, Graph and MCP access.
- Older Forge image versions remain available in the owner's storage until the workspace is deleted. Production-scale garbage collection and quotas per installation need a follow-up.
- Marketplace listing, review and submission remain pending. Multi-product Forge listings have separate eligibility requirements.
