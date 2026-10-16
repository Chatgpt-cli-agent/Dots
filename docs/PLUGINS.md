# Local plugins

Dots can install local packages of skills, reference files, and MCP tool connections. Existing standalone skills continue to work through the configured skills directory, and direct Dot Connections remain fully supported. A plugin does not change the model or grant unauthorized computer access.

The restored standalone library lives in the repository's `skills/` folder and is the default. `SKILLS_PATH`, `SKILLS_DIR`, or `OPENDOTS_SKILLS_PATH` can select another directory. The legacy `GALAXYONE_SKILLS_PATH` setting is still accepted as an explicit override; you do not need GalaxyOne to use the bundled library. Dots does not move or delete the standalone directory during plugin operations. Skill packages' own tests remain resources; the Dots test runner discovers application tests under `tests/` only.

Open **Settings → Plugins**, enter the package folder path on the Dots server, preview its declared skills and tool services, and choose **Install plugin**. Assign it to the Dots that should use it. Assignments, service configuration, and enable/disable changes save immediately. You can also change an existing Dot's assignments in its settings. New installations are enabled but assigned to no Dots.

Try the included `examples/plugins/sims-architect` directory. Installation copies the package into the managed library beside the workspace database (`data/plugins` by default). Changes to the source folder do not affect installed packages. `DOTS_PLUGIN_DIR` can override that location. Keep the library and SQLite database together when backing up or moving the server.

## Package layout

```text
my-plugin/
  plugin.json
  skills/
    query-assistant/
      SKILL.md
      references/schema.md
```

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Assistant workflows and tools",
  "skills": "./skills/",
  "mcpServers": {
    "db": {
      "url": "https://api.example.com/mcp",
      "description": "Database query service",
      "requiresToken": true
    }
  }
}
```

Names use lowercase letters, numbers, and hyphens. `skills` can be one relative folder or an array of relative folders, each containing a SKILL.md directly or a collection of skill folders. Use simple skill folder names. A `.codex-plugin/plugin.json` or `.mcp.json` manifest with the same fields is also accepted, with paths resolved from the package root. Other ChatGPT/Codex capabilities are not implied by accepting this manifest location.

`list_skills` lists assigned plugin skills as `plugin-name:skill-name`. `read_skill` reads their SKILL.md or a relative reference file. Relevance matching can activate assigned skills automatically. Long instructions are previewed in context; the agent can read the full skill with read_skill. Disabled, unassigned, and uninstalled plugins are unavailable to new tool calls; a running turn is cancelled when its plugin access changes.

## Packaged tool connections

Plugins can declare remote MCP services under `mcpServers` using HTTP/HTTPS endpoints (`url`). Subprocess, command, or stdio transports and embedded URL credentials are not permitted.

- **Credentials & Redaction**: When `requiresToken` is set, configure the bearer token in **Settings → Plugins**. Configured credentials are never returned in API payloads, saved transcripts, or event streams. The runtime automatically redacts configured tokens (`[REDACTED]`) from tool text output, structured content, tool descriptions, and error messages.
- **Service Identity & Reconfiguration**: Changing a service's endpoint URL or authentication requirements represents a new service identity. Incompatible changes clear saved credentials, reset cached tools and approval policies, and disable the service until reconfigured. Update previews highlight required reconfigurations.
- **Tool Resolution & Collision Safety**: Tools exposed to Dots are named deterministically as `plugin__<plugin>__<service>__<tool>`. Names are normalized, truncated, and deduplicated with numeric suffixes to fit within 64-character tool limits.
- **Approvals**: Non-read-only tools require owner approval by default. Approvals bind to the specific service and arguments rather than ephemeral tool names.

## Updates, Rollback, and Recovery

- **Atomic Directory and Database Updates**: Plugin updates stage files and verify schemas before replacing installed assets. Directory swaps and SQLite persistence are coordinated; if database persistence fails, the filesystem and database atomically roll back to the previous version.
- **Restart Recovery (`recoverStaleState`)**: Interrupted updates are automatically detected on startup. If an update was interrupted prior to database commit, the previous version is restored from backup; completed updates clean up staging and backup directories.
- **Preview Binding**: Update confirmations are cryptographically bound to the reviewed package version and SHA-256 fingerprint, preventing in-flight source folder substitutions.

## Scope and Security Limits

Packages cannot contain symbolic links or junctions, exceed 2,000 entries or 20 MB in total, or include an individual file larger than 5 MB. Skill reads stay inside their skill directory. Local plugin installation is an owner operation under the existing authenticated API.

Uninstall removes the registry entry and all assignments. The original source folder and conversations stay intact. Unreferenced managed copies are retained for recovery; reinstall creates a fresh installation ID. Standalone skills do not need conversion into plugins.
