# Architecture

The Vite frontend renders the workspace dashboard and editor. Excalidraw owns drawing, pan, zoom, selection, transforms, undo, and scene export. Trace stores annotations, reference provenance and issue drafts alongside the scene. Zod validates imported and persisted records and applies storage limits.

The workspace repository has three implementations. IndexedDB is the standalone default. The optional Vite localhost relay makes typed calls to Convex, where indexed tables store workspace and image records in separate rows. The Forge Custom UI invokes resolvers that scope KVS keys to the authenticated account under the installation. Forge stores screenshots as checksummed chunks alongside a separate revisioned scene record.

The deterministic analysis reads native bindings, labeled shapes, notes and OCR text. MiniSearch ranks source data and gives explicit issue keys higher priority. Jira links and Teamwork Graph relationships carry source evidence. Task generation derives suggestions from labeled steps and feedback. Each draft tracks its originating element IDs.

Scene writes are debounced. All persistence modes compare an expected revision before committing. Local and Convex modes keep short-lived IndexedDB recovery snapshots. Production boards stay private to their Forge owners and keep recoverable save errors in memory.
