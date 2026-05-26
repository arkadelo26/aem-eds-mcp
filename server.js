#!/usr/bin/env node

const { McpServer }            = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }                    = require('zod');
const { execSync }             = require('child_process');
const fs                       = require('fs');
const path                     = require('path');

// ── Your EDS project path — change this ───────────────────────────────────────
const EDS_PROJECT = process.argv[2] || process.cwd();

const server = new McpServer({
  name:    'aem-eds-scaffold',
  version: '1.0.0',
});

// ── Helper ────────────────────────────────────────────────────────────────────
function run(cmd) {
  return execSync(cmd, { cwd: EDS_PROJECT, encoding: 'utf8' });
}

// ── Tool 1: list_blocks ───────────────────────────────────────────────────────
server.tool(
  'list_blocks',
  'List all blocks in the EDS project with their file status (js, css, json, readme)',
  {},
  async () => {
    try {
      const out = run('npx aem-eds-cli list');
      return { content: [{ type: 'text', text: out }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }] };
    }
  }
);

// ── Tool 2: remove_block ──────────────────────────────────────────────────────
server.tool(
  'remove_block',
  'Remove an existing block and all its files from the EDS project',
  {
    name: z.string().describe('Block name to remove e.g. "old-carousel"'),
  },
  async ({ name }) => {
    try {
      const out = run(`npx aem-eds-cli remove ${name}`);
      return { content: [{ type: 'text', text: out }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }] };
    }
  }
);

// ── Tool 3: read_block_json ───────────────────────────────────────────────────
server.tool(
  'read_block_json',
  'Read the _blockname.json of an existing block — definitions, models, filters',
  {
    name: z.string().describe('Block name e.g. "carousel"'),
  },
  async ({ name }) => {
    const jsonPath = path.join(EDS_PROJECT, 'blocks', name, `_${name}.json`);
    if (!fs.existsSync(jsonPath)) {
      return { content: [{ type: 'text', text: `_${name}.json not found in blocks/${name}/` }] };
    }
    const content = fs.readFileSync(jsonPath, 'utf8');
    return { content: [{ type: 'text', text: content }] };
  }
);

// ── Tool 4: get_field_types ───────────────────────────────────────────────────
server.tool(
  'get_field_types',
  'Get all supported Universal Editor field types and block types for aem-eds-cli',
  {},
  async () => {
    const info = `
=== aem-eds-cli Field Types ===

TEXT INPUTS
  text                → Single line text
  textarea            → Multi-line plain text
  richtext            → WYSIWYG rich text editor

MEDIA & REFERENCES
  reference           → DAM asset picker        (multi: true supported)
  aem-content         → Page / link picker      (multi: true supported)
  aem-content-fragment → Content Fragment picker
  aem-experience-fragment → Experience Fragment picker

SELECTION
  boolean             → Toggle on / off
  select              → Single choice dropdown
  multiselect         → Multi choice dropdown
  radio-group         → Radio buttons
  checkbox-group      → Checkboxes

SPECIALISED
  number              → Numeric input (min / max / step)
  aem-tag             → AEM tag picker (cq:tags)

=== Block Types ===

  1. Simple              Fixed fields — hero, banner, teaser
  2. Simple with tabs    Fixed fields grouped into UE panel tabs
  3. Container           Repeating child items — carousel, accordion
  4. Container with tabs Container where parent config has tab groups
  5. Section wrapper     Section-level tab panel (section/v1/section)

=== Conditional Fields ===

  Works on: select, radio-group, boolean fields
  Operators: === (equals one), or (equals any), !== (not equal)

=== Validation Properties ===

  required, readOnly, hidden, description        → all field types
  min, max, step                                  → number (top-level)
  minLength, maxLength, rootPath, customErrorMsg  → inside validation object
    `;
    return { content: [{ type: 'text', text: info }] };
  }
);

// ── Tool 5: suggest_create_command ───────────────────────────────────────────
server.tool(
  'suggest_create_command',
  'Given a block description, suggest the exact aem-eds-cli create command and all prompt answers the developer should type',
  {
    description: z.string().describe('What the block should do e.g. "a carousel with autoplay config and slides with image and caption"'),
  },
  async ({ description }) => {
    // Returns a structured guide for the developer to follow in terminal
    const guide = `
Based on your description: "${description}"

Run this in your EDS project terminal:

  npx aem-eds-cli create <block-name>

Then answer the prompts as follows — I will fill in the details
after you tell me the exact block name you want.

To get my full prompt-by-prompt guide, tell me:
1. What name should this block have?
2. Any specific field requirements?

I will then give you every prompt answer step by step.
    `;
    return { content: [{ type: 'text', text: guide }] };
  }
);

// ── Tool 6: get_block_structure ───────────────────────────────────────────────
server.tool(
  'get_block_structure',
  'Get the folder and file structure of a specific block',
  {
    name: z.string().describe('Block name e.g. "hero"'),
  },
  async ({ name }) => {
    const blockDir = path.join(EDS_PROJECT, 'blocks', name);
    if (!fs.existsSync(blockDir)) {
      return { content: [{ type: 'text', text: `Block "${name}" not found in blocks/` }] };
    }
    const files   = fs.readdirSync(blockDir);
    const details = files.map(f => {
      const fPath = path.join(blockDir, f);
      const size  = fs.statSync(fPath).size;
      return `  ${f.padEnd(30)} ${size} bytes`;
    }).join('\n');
    return {
      content: [{
        type: 'text',
        text: `blocks/${name}/\n${details}`,
      }],
    };
  }
);

// ── Tool 7: read_component_filters ───────────────────────────────────────────
server.tool(
  'read_component_filters',
  'Read the component-filters.json to see which blocks are in the section filter',
  {},
  async () => {
    const filePath = path.join(EDS_PROJECT, 'component-filters.json');
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: 'component-filters.json not found' }] };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { content: [{ type: 'text', text: content }] };
  }
);

// ── Tool 8: add_to_section_filter ────────────────────────────────────────────
server.tool(
  'add_to_section_filter',
  'Add a block name to the section entry in component-filters.json',
  {
    name: z.string().describe('Block name to add to section filter e.g. "hero"'),
  },
  async ({ name }) => {
    const filePath = path.join(EDS_PROJECT, 'component-filters.json');
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: 'component-filters.json not found' }] };
    }
    try {
      const json    = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const section = json.find(f => f.id === 'section');
      if (!section) {
        return { content: [{ type: 'text', text: 'No section entry found in component-filters.json' }] };
      }
      if (section.components.includes(name)) {
        return { content: [{ type: 'text', text: `"${name}" already in section filter` }] };
      }
      section.components.push(name);
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
      return { content: [{ type: 'text', text: `✔ Added "${name}" to section filter in component-filters.json` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }] };
    }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();