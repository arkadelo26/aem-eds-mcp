# aem-eds-mcp

MCP server for AEM Edge Delivery Services — connects `aem-eds-cli` to GitHub Copilot and Claude Code.

---

## What it does

Lets you talk to your EDS project through Copilot or Claude Code:

```
"List all my blocks"
"Remove the testcarousel block"
"Add hero to the section filter"
"I want to create a cards block, what should I type?"
```

Everything runs locally. No hosting needed.

---

## Tools available

| Tool | What it does |
|---|---|
| `list_blocks` | List all blocks with file status |
| `remove_block` | Delete a block and all its files |
| `read_block_json` | Read `_blockname.json` of any block |
| `get_field_types` | Show all supported UE field types |
| `suggest_create_command` | Get step-by-step CLI prompt guide |
| `get_block_structure` | Show files inside a block folder |
| `read_component_filters` | Read `component-filters.json` |
| `add_to_section_filter` | Add a block to the section filter |

---

## GitHub Copilot (VS Code)

**Requirements:** VS Code 1.99+, GitHub Copilot extension

**Step 1** — Enable MCP in VS Code settings (`Ctrl + ,`):
```
chat.mcp.enabled → true
```

**Step 2** — Create `.vscode/mcp.json` in your EDS project:
```json
{
  "servers": {
    "aem-eds": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "aem-eds-mcp", "${workspaceFolder}"]
    }
  }
}
```

`${workspaceFolder}` is replaced automatically by VS Code with your project path.
For example: `C:\projects\my-eds-project` or `/Users/name/projects/my-eds-project`
No changes needed per developer — works on any machine.

**Step 3** — Restart VS Code → open Copilot Chat → switch to **Agent** mode.

**Step 4** — Commit `.vscode/mcp.json` to repo. Team gets it automatically on pull.

---

## Claude Code (terminal)

**Requirements:** Node 16+, Claude Code installed (`npm install -g @anthropic-ai/claude-code`)

**Project scope** — shared with team via `.claude.json`:
```bash
cd your-eds-project
claude mcp add aem-eds --scope project -- npx -y aem-eds-mcp .
git add .claude.json && git commit -m "feat: aem-eds MCP" && git push
```

**User scope** — global, all projects:
```bash
claude mcp add aem-eds --scope user -- npx -y aem-eds-mcp .
```

Verify:
```bash
claude mcp list
# aem-eds   running   8 tools
```

Always run `claude` from your EDS project root folder.

---

## VS Code vs Claude Code

| | VS Code (Copilot) | Claude Code |
|---|---|---|
| Config file | `.vscode/mcp.json` | `.claude.json` |
| Project path | `${workspaceFolder}` | `.` |
| Team sharing | Commit `.vscode/mcp.json` | Commit `.claude.json` |

---

## Links

- CLI: [npmjs.com/package/aem-eds-cli](https://npmjs.com/package/aem-eds-cli)
- MCP: [npmjs.com/package/aem-eds-mcp](https://npmjs.com/package/aem-eds-mcp)