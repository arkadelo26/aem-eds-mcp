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
// ── Tool: suggest_create_command ─────────────────────────────────────────────
// Full knowledge of aem-eds-cli exact prompt flow

server.tool(
  'suggest_create_command',
  `Generate exact step-by-step answers for every aem-eds-cli prompt to create a block.
   Knows the real CLI flow: block types, field types, options builder, validation,
   variants, conditional fields. Use this whenever asked to create an EDS block.`,
  {
    name: z.string().describe(
      'Block name in kebab-case e.g. "carousel", "hero-banner", "faq"'
    ),
    blockType: z.enum(['simple','simple-tabs','container','container-tabs','section-wrapper']).describe(
      'Block type: simple=fixed fields, simple-tabs=fields in UE tabs, container=repeating children, container-tabs=container with tabbed parent config, section-wrapper=section/v1/section tab panel'
    ),
    parentFields: z.array(z.object({
      name:         z.string().describe('Field name in camelCase e.g. "interval"'),
      label:        z.string().describe('Display label e.g. "Interval (seconds)"'),
      type:         z.enum([
        'text','textarea','richtext',
        'reference','aem-content','aem-content-fragment','aem-experience-fragment',
        'boolean','select','multiselect','radio-group','checkbox-group',
        'number','aem-tag'
      ]).describe('Field type'),
      required:     z.boolean().optional().describe('Is this field required?'),
      multi:        z.boolean().optional().describe('Allow multiple values? Only for text, reference, aem-content'),
      defaultValue: z.string().optional().describe('Default value'),
      description:  z.string().optional().describe('Helper text shown below field in UE'),
      min:          z.number().optional().describe('Min value (number fields only — goes top-level not in validation)'),
      max:          z.number().optional().describe('Max value (number fields only — goes top-level not in validation)'),
      step:         z.number().optional().describe('Step (number fields only)'),
      minLength:    z.number().optional().describe('Min length (text/textarea — goes inside validation object)'),
      maxLength:    z.number().optional().describe('Max length (text/textarea — goes inside validation object)'),
      rootPath:     z.string().optional().describe('Root path for aem-content picker e.g. "/content/my-site"'),
      options:      z.array(z.object({
        name:  z.string().describe('Display label e.g. "Grid"'),
        value: z.string().describe('CSS value e.g. "grid"'),
      })).optional().describe('Options for select/multiselect/radio-group/checkbox-group'),
      condition: z.object({
        targetField:      z.string().describe('Field name this condition applies TO'),
        controllingField: z.string().describe('Field name that controls visibility'),
        operator:         z.enum(['===','or','!==']).describe('=== for one value, or for multiple, !== for not equal'),
        values:           z.array(z.string()).describe('Values that make the field visible'),
      }).optional().describe('Conditional visibility — only for select/boolean controlling fields'),
    })).describe('Fields for the parent block (or all fields for simple blocks)'),
    tabGroups: z.array(z.object({
      label:      z.string().describe('Tab label e.g. "Profile", "Skills"'),
      fieldNames: z.array(z.string()).describe('Field names that belong to this tab'),
    })).optional().describe('For simple-tabs and container-tabs — group parent fields into UE panel tabs'),
    childName: z.string().optional().describe('Child item name for container blocks e.g. "carousel-slide"'),
    childFields: z.array(z.object({
      name:         z.string(),
      label:        z.string(),
      type:         z.enum([
        'text','textarea','richtext',
        'reference','aem-content','aem-content-fragment','aem-experience-fragment',
        'boolean','select','multiselect','radio-group','checkbox-group',
        'number','aem-tag'
      ]),
      required:     z.boolean().optional(),
      multi:        z.boolean().optional(),
      defaultValue: z.string().optional(),
      description:  z.string().optional(),
      min:          z.number().optional(),
      max:          z.number().optional(),
      rootPath:     z.string().optional(),
      options:      z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    })).optional().describe('Fields for the child item (container blocks only)'),
    variants: z.array(z.object({
      name:  z.string().describe('Display name e.g. "Dark"'),
      value: z.string().describe('CSS class value e.g. "dark"'),
    })).optional().describe('Variant options — creates a classes select field in the model'),
    conditions: z.array(z.object({
      targetField:      z.string().describe('Field that should show/hide'),
      controllingField: z.string().describe('Field that controls visibility'),
      operator:         z.enum(['===','or','!==']),
      values:           z.array(z.string()).describe('Values that make field visible'),
    })).optional().describe('Conditional field visibility rules'),
    dryRun: z.boolean().optional().describe('If true, add --dry-run flag to preview without writing files'),
  },
  async ({ name, blockType, parentFields, tabGroups, childName, childFields, variants, conditions, dryRun }) => {

    const typeNumMap = {
      'simple':           '1',
      'simple-tabs':      '2',
      'container':        '3',
      'container-tabs':   '4',
      'section-wrapper':  '5',
    };
    const typeNum = typeNumMap[blockType];
    const drFlag  = dryRun ? ' --dry-run' : '';

    const lines = [];
    const l  = (s = '') => lines.push(s);
    const h  = (s)      => lines.push(`\n▶ ${s}`);
    const p  = (s)      => lines.push(`  ${s}`);
    const kv = (k, v)   => lines.push(`  ${k.padEnd(30)} → type: ${v}`);

    l(`Run this command in your EDS project terminal:`);
    l();
    l(`  npx aem-eds-cli create ${name}${drFlag}`);
    l();
    l(`Then answer every prompt exactly as shown below:`);
    l(`${'─'.repeat(55)}`);

    // ── Block name ─────────────────────────────────────────────────────────────
    h(`PROMPT: Block name (kebab-case):`);
    p(`→ ${name}`);

    // ── Block type ─────────────────────────────────────────────────────────────
    h(`PROMPT: Block type [1]:`);
    p(`→ ${typeNum}  (${blockType.replace(/-/g,' ')})`);
    l();
    p(`Block types available:`);
    p(`  1. Simple              Fixed fields — hero, banner`);
    p(`  2. Simple with tabs    Fields grouped into UE panel tabs`);
    p(`  3. Container           Repeating child items — carousel, accordion`);
    p(`  4. Container with tabs Container where parent config has tab groups`);
    p(`  5. Section wrapper     Section-level tab panel (section/v1/section)`);

    // ── Tab groups (types 2 and 4) ─────────────────────────────────────────────
    if ((blockType === 'simple-tabs' || blockType === 'container-tabs') && tabGroups?.length) {
      h(`TABS — define ${tabGroups.length} tab group(s):`);
      tabGroups.forEach((tab, ti) => {
        l();
        p(`Tab ${ti + 1} name: ${tab.label}`);
        p(`  Fields in this tab: ${tab.fieldNames.join(', ')}`);
        p(`  (Define each field when prompted, then press Enter blank to finish tab)`);
        if (ti < tabGroups.length - 1) {
          p(`  Add another tab? → y`);
        } else {
          p(`  Add another tab? → n`);
        }
      });
    }

    // ── Parent fields ──────────────────────────────────────────────────────────
    const phaseLabel = blockType.startsWith('container') ? 'PHASE 1 — PARENT CONFIG FIELDS' : 'DEFINE BLOCK FIELDS';
    h(`${phaseLabel} (${parentFields.length} field${parentFields.length !== 1 ? 's' : ''}):`);

    parentFields.forEach((f, i) => {
      l();
      p(`Field ${i + 1}:`);
      p(`  Field name: ${f.name}`);
      p(`  Label: ${f.label}`);
      p(`  Type: ${f.type}    ← choose from field type list`);

      // Options
      if (['select','multiselect','radio-group','checkbox-group'].includes(f.type)) {
        if (f.options?.length) {
          p(`  Define options:`);
          f.options.forEach((o, oi) => {
            p(`    Option ${oi + 1} — Name: ${o.name}    Value: ${o.value}`);
          });
          p(`    Option ${f.options.length + 1} — Name: (blank to finish)`);
        } else {
          p(`  Define options: (add your option name/value pairs, blank to finish)`);
        }
      }

      // Multi
      if (f.multi === true && ['text','reference','aem-content'].includes(f.type)) {
        p(`  Allow multiple values? → y`);
      }

      // Default value
      if (f.defaultValue !== undefined) {
        p(`  Default value: ${f.defaultValue}`);
      }

      // Validation
      const hasValidation = f.required || f.description || f.min !== undefined ||
        f.max !== undefined || f.minLength !== undefined || f.maxLength !== undefined ||
        f.rootPath || f.step !== undefined;
      if (hasValidation) {
        p(`  Add validation / hints? → y`);
        if (f.required)                    p(`    Required? → y`);
        if (f.description)                 p(`    Helper text: ${f.description}`);
        if (f.minLength !== undefined)     p(`    Min length: ${f.minLength}`);
        if (f.maxLength !== undefined)     p(`    Max length: ${f.maxLength}`);
        if (f.min !== undefined)           p(`    Min: ${f.min}`);
        if (f.max !== undefined)           p(`    Max: ${f.max}`);
        if (f.step !== undefined)          p(`    Step: ${f.step}`);
        if (f.rootPath)                    p(`    Root path: ${f.rootPath}`);
      } else {
        p(`  Add validation / hints? → n  (press Enter)`);
      }
    });

    l();
    p(`Field name: (blank — press Enter to finish parent fields)`);

    // ── Child fields (container types) ─────────────────────────────────────────
    if (['container','container-tabs'].includes(blockType) && childName) {
      h(`PHASE 2 — CHILD ITEM:`);
      l();
      p(`Use existing block as child? → n`);
      p(`Child item name: ${childName}`);
      l();

      if (childFields?.length) {
        childFields.forEach((f, i) => {
          l();
          p(`Child Field ${i + 1}:`);
          p(`  Field name: ${f.name}`);
          p(`  Label: ${f.label}`);
          p(`  Type: ${f.type}`);

          if (['select','multiselect','radio-group','checkbox-group'].includes(f.type) && f.options?.length) {
            p(`  Options:`);
            f.options.forEach((o, oi) => {
              p(`    ${oi + 1}. Name: ${o.name}    Value: ${o.value}`);
            });
            p(`    (blank to finish options)`);
          }

          if (f.multi === true) p(`  Allow multiple values? → y`);
          if (f.defaultValue !== undefined) p(`  Default value: ${f.defaultValue}`);

          const hasVal = f.required || f.description || f.min !== undefined ||
            f.max !== undefined || f.rootPath;
          if (hasVal) {
            p(`  Add validation / hints? → y`);
            if (f.required)        p(`    Required? → y`);
            if (f.description)     p(`    Helper text: ${f.description}`);
            if (f.min !== undefined) p(`    Min: ${f.min}`);
            if (f.max !== undefined) p(`    Max: ${f.max}`);
            if (f.rootPath)        p(`    Root path: ${f.rootPath}`);
          } else {
            p(`  Add validation / hints? → n`);
          }
        });
        l();
        p(`Child Field name: (blank — press Enter to finish child fields)`);
      }
    }

    // ── Variants ───────────────────────────────────────────────────────────────
    h(`VARIANTS:`);
    if (variants?.length) {
      p(`Does this block need variants? → y`);
      l();
      p(`Define variant options:`);
      variants.forEach((v, i) => {
        p(`  Option ${i + 1} — Name: ${v.name}    Value: ${v.value}`);
      });
      p(`  Option ${variants.length + 1} — Name: (blank to finish)`);
      p(`  Default variant: ${variants[0]?.value}`);
    } else {
      p(`Does this block need variants? → n  (press Enter)`);
    }

    // ── Conditions ─────────────────────────────────────────────────────────────
    h(`CONDITIONAL FIELDS:`);
    if (conditions?.length) {
      p(`Add conditional visibility to any fields? → y`);
      l();
      p(`Conditions work on: select, radio-group, boolean controlling fields`);
      p(`Operators: 1=== (equals one), 2=or (equals any of), 3=!== (not equal)`);
      l();

      conditions.forEach((cond, ci) => {
        p(`Condition ${ci + 1}:`);
        p(`  Which field should show/hide? → pick number for: ${cond.targetField}`);
        p(`  Controlling field? → pick number for: ${cond.controllingField}`);
        const opNum = cond.operator === '===' ? '1' : cond.operator === 'or' ? '2' : '3';
        p(`  Condition type? → ${opNum}  (${cond.operator})`);
        p(`  Value(s)? → pick numbers for: ${cond.values.join(', ')}`);
        p(`  ✔ "${cond.targetField}" shows when "${cond.controllingField}" is ${cond.values.join(' OR ')}`);
        l();
      });

      p(`Done with conditions? → 0  (press 0 to finish)`);
    } else {
      p(`Add conditional visibility to any fields? → n  (press Enter)`);
    }

    // ── After scaffolding ──────────────────────────────────────────────────────
    h(`AFTER SCAFFOLDING — run these commands:`);
    l();
    p(`1. Add "${name}" to the section entry in component-filters.json:`);
    p(`   Open component-filters.json → find "id": "section" → add "${name}" to components array`);
    l();
    p(`2. Build global JSON files:`);
    p(`   npm run build:json`);
    l();
    p(`3. Commit and push:`);
    p(`   git add .`);
    p(`   git commit -m "feat: ${name} block"`);
    p(`   git push`);
    l();

    // ── Generated JSON preview ─────────────────────────────────────────────────
    h(`WHAT WILL BE GENERATED:`);
    l();
    p(`blocks/${name}/`);
    p(`  ${name}.js         ← ESLint-safe decorate() stub`);
    p(`  ${name}.css        ← .${name} { display: block; }`);
    p(`  _${name}.json      ← definitions + models + filters`);
    p(`  README.md          ← UE step-by-step authoring guide`);
    l();

    if (['container','container-tabs'].includes(blockType)) {
      p(`JSON structure:`);
      p(`  definitions: [`);
      p(`    { id: "${name}", resourceType: block/v1/block, filter: "${name}" }`);
      if (childName) {
        p(`    { id: "${childName}", resourceType: block/v1/block/item }`);
      }
      p(`  ]`);
      p(`  models: [`);
      p(`    { id: "${name}", fields: [${parentFields.map(f=>f.name).join(', ')}${variants?.length ? ', classes' : ''}] }`);
      if (childName && childFields?.length) {
        p(`    { id: "${childName}", fields: [${childFields.map(f=>f.name).join(', ')}] }`);
      }
      p(`  ]`);
      p(`  filters: [{ id: "${name}", components: ["${childName || '...'}"] }]`);
    } else {
      p(`JSON structure:`);
      p(`  definitions: [{ id: "${name}", resourceType: block/v1/block }]`);
      p(`  models: [{ id: "${name}", fields: [${parentFields.map(f=>f.name).join(', ')}${variants?.length ? ', classes' : ''}] }]`);
      p(`  filters: []`);
    }

    if (conditions?.length) {
      l();
      p(`Conditional fields (JSONLogic):`);
      conditions.forEach(cond => {
        if (cond.operator === 'or') {
          p(`  "${cond.targetField}": { or: [${cond.values.map(v=>`${cond.controllingField}==="${v}"`).join(', ')}] }`);
        } else {
          p(`  "${cond.targetField}": { "${cond.operator}": ["${cond.controllingField}", "${cond.values[0]}"] }`);
        }
      });
    }

    l(`${'─'.repeat(55)}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
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