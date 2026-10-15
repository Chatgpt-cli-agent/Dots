# Local plugins

Dots can install local packages of skills and reference files. Existing standalone skills continue to work through the configured skills directory. A plugin does not change the model or grant new computer or connected-service permissions.

Open **Settings → Plugins**, enter the package folder path on the Dots server, and choose **Install plugin**. Assign it to the Dots that should use it. Assignments and enable/disable changes save immediately. You can also change an existing Dot's assignments in its settings. New installations are enabled but assigned to no Dots.

Try the included `examples/plugins/sims-architect` directory. Installation copies the package into the managed library beside the workspace database (`data/plugins` by default). Changes to the source folder do not affect installed packages. `DOTS_PLUGIN_DIR` can override that location. Keep the library and SQLite database together when backing up or moving the server.

## Package layout

```text
sims-architect/
  plugin.json
  skills/
    build-planning/
      SKILL.md
      references/checklist.md
```

```json
{
  "name": "sims-architect",
  "version": "0.1.0",
  "description": "My Sims workflows",
  "skills": "./skills/"
}
```

Names use lowercase letters, numbers, and hyphens. `skills` can be one relative folder or an array of relative folders, each containing a SKILL.md directly or a collection of skill folders. Use simple skill folder names. A `.codex-plugin/plugin.json` manifest with the same fields is also accepted, with paths resolved from the package root. Other ChatGPT/Codex capabilities are not implied by accepting this manifest location.

`list_skills` lists assigned plugin skills as `plugin-name:skill-name`. `read_skill` reads their SKILL.md or a relative reference file. Relevance matching can activate assigned skills automatically. Long instructions are previewed in context; the agent can read the full skill with read_skill. Disabled, unassigned, and uninstalled plugins are unavailable to new tool calls; a running turn is cancelled when its plugin access changes.

## Scope of this release

This release imports local folders of instructions and resources. It does not start MCP servers, run startup hooks, install dependencies, download packages, or automatically execute packaged scripts. Packages declaring MCP servers, `.mcp.json`, or hooks are rejected explicitly. Use existing Dot Connections for tool services. Tool-server packaging, ZIP import, updates, plugin settings, and a shared plugin directory are future work.

Packages cannot contain symbolic links or junctions, exceed 2,000 entries or 20 MB in total, or include an individual file larger than 5 MB. Skill reads stay inside their skill directory. Local plugin installation is an owner operation under the existing authenticated API.

Uninstall removes the registry entry and all assignments. The original source folder and conversations stay intact. Unreferenced managed copies are retained for recovery; reinstall creates a fresh installation ID. To replace a version, uninstall it and install the replacement, then reassign it. Standalone skills do not need conversion into plugins.
