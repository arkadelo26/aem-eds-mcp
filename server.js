#!/usr/bin/env node

/**
 * aem-eds-mcp — MCP server for AEM EDS Block Scaffolding
 *
 * Connects aem-eds-cli to GitHub Copilot and Claude Code.
 * Project path passed as argv[2] from ${workspaceFolder}.
 *
 * Tools:
 *   1. list_blocks              — list all blocks with status
 *   2. remove_block             — delete a block
 *   3. read_block_json          — read _blockname.json
 *   4. get_field_types          — all 14 field types + block types
 *   5. suggest_create_command   — full step-by-step CLI prompt guide
 *   6. get_block_structure      — files in a block folder
 *   7. read_component_filters   — component-filters.json content
 *   8. add_to_section_filter    — add block to section filter
 */

const { McpServer }            = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }                    = require('zod');
const { execSync }             = require('child_process');
const fs                       = require('fs');
const path                     = require('path');

// ── Project path — passed from ${workspaceFolder} ────────────────────────────
const EDS_PROJECT = process.argv[2] || process.cwd();

const server = new McpServer({
  name:    'aem-eds-scaffold',
  version: '1.0.0',
});

function run(cmd) {
  return execSync(cmd, { cwd: EDS_PROJECT, encoding: 'utf8' });
}

// ════════════════════════════════════════════════════════════════════════════
// Tool 1 — list_blocks
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'list_blocks',
  'List all blocks in the EDS project with file status (js, css, json, readme)',
  {},
  async () => {
    try {
      return { content: [{ type: 'text', text: run('npx aem-eds-cli list') }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }] };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 2 — remove_block
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'remove_block',
  'Remove an existing block and all its files (js, css, json, readme) from the EDS project',
  { name: z.string().describe('Block name e.g. "old-carousel"') },
  async ({ name }) => {
    try {
      return { content: [{ type: 'text', text: run(`npx aem-eds-cli remove ${name}`) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: 'Error: ' + e.message }] };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 3 — read_block_json
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'read_block_json',
  'Read the _blockname.json of an existing block showing definitions, models and filters',
  { name: z.string().describe('Block name e.g. "carousel"') },
  async ({ name }) => {
    const p = path.join(EDS_PROJECT, 'blocks', name, `_${name}.json`);
    if (!fs.existsSync(p)) {
      return { content: [{ type: 'text', text: `_${name}.json not found` }] };
    }
    return { content: [{ type: 'text', text: fs.readFileSync(p, 'utf8') }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 4 — get_field_types
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_field_types',
  'Get all supported Universal Editor field types, block types, and validation properties for aem-eds-cli',
  {},
  async () => {
    const info = `
=== aem-eds-cli — Complete Reference ===

FIELD TYPES (14 total)
  Text:
    text                → camelCase name, single line, multi supported
    textarea            → multi-line plain text
    richtext            → WYSIWYG editor

  Media & References:
    reference           → DAM asset picker, multi supported
    aem-content         → page/link picker, multi supported, supports rootPath
    aem-content-fragment → CF picker, supports rootPath
    aem-experience-fragment → XF picker

  Selection:
    boolean             → toggle, default: true or false
    select              → single dropdown, requires options
    multiselect         → multi dropdown, requires options
    radio-group         → radio buttons, requires options
    checkbox-group      → checkboxes, requires options

  Specialised:
    number              → numeric, min/max/step go TOP-LEVEL (not in validation)
    aem-tag             → cq:tags picker

FIELD VALIDATION (per type)
  text/textarea:        required, readOnly, hidden, description, minLength, maxLength
  richtext:             required, readOnly, hidden, description
  reference:            required, readOnly, hidden, description
  aem-content:          required, readOnly, hidden, description, rootPath
  boolean:              readOnly, hidden, description, customErrorMsg
  select/radio/etc:     required, readOnly, hidden, description
  number:               required, readOnly, hidden, description, min, max, step

BLOCK TYPES
  1. Simple              Fixed fields — hero, banner, teaser
  2. Simple with tabs    Fixed fields grouped into UE Properties panel tabs
  3. Container           Repeating child items — carousel, accordion
  4. Container with tabs Container where parent config has tab groups
  5. Section wrapper     section/v1/section — tab panel, any blocks inside

CONDITIONAL FIELDS
  Works on: select, radio-group, boolean (these can control other fields)
  Operators: === equals one value | or equals any of these | !== not equal
  Conditions use JSONLogic syntax in the generated JSON

VARIANTS
  When enabled: creates a "classes" select field with named CSS class options
  e.g. Grid→grid, Carousel→carousel gives author a Layout Variant dropdown

PROMPT FLOW ORDER
  1. Block name (kebab-case)
  2. Block type (1-5)
  For types 2/4: tab names then fields per tab
  For types 1/2/3/4: fields (name → label → type → options → default → validation)
  For types 3/4: child item name then child fields
  All types: variants (y/n → if y: define options)
  All types: conditions (y/n → if y: pick target field, controlling field, operator, values)
`.trim();
    return { content: [{ type: 'text', text: info }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 5 — suggest_create_command
//
// Full knowledge of EVERY prompt in aem-eds-cli.
// Schema uses simple string inputs Copilot can fill reliably.
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'suggest_create_command',
  `Generate the EXACT step-by-step terminal prompt answers for aem-eds-cli.
   Always call this when asked to create an EDS block. Never write block files directly.
   The developer runs aem-eds-cli in their terminal and follows this guide.`,
  {
    // ── Core ──────────────────────────────────────────────────────────────────
    name: z.string().describe(
      'Block name in kebab-case e.g. "carousel", "hero", "faq-section"'
    ),
    blockType: z.string().describe(
      '"1" simple | "2" simple-tabs | "3" container | "4" container-tabs | "5" section-wrapper'
    ),

    // ── Parent fields ─────────────────────────────────────────────────────────
    // Simple string format: "name:type:options:default:validation"
    // Copilot fills as plain text — server parses it
    parentFields: z.string().describe(`
Tilde-separated (~) parent field definitions. Each field format:
  fieldName|fieldType|options|defaultValue|validation

fieldType: text textarea richtext reference aem-content aem-content-fragment
           aem-experience-fragment boolean select multiselect radio-group
           checkbox-group number aem-tag

options (for select/multiselect/radio-group/checkbox-group):
  "DisplayName:cssValue,DisplayName2:cssValue2"
  e.g. "Grid:grid,Carousel:carousel,Side Carousel:side-carousel"

defaultValue: the default value string e.g. "grid" or "5" or "true"

validation: comma-separated e.g. "required,min:1,max:10,description:Enter interval"
  Supported: required readOnly hidden description
             minLength:N maxLength:N (text/textarea)
             min:N max:N step:N (number)
             rootPath:/content/site (aem-content)
             customErrorMsg:Message

Examples:
  "interval|number||5|required,min:1,max:10"
  "layoutVariant|select|Grid:grid,Carousel:carousel,Side:side-carousel|grid|required"
  "autoplay|boolean||false|"
  "backgroundImage|reference|||description:Optional background"
  "ctaUrl|aem-content|||rootPath:/content/my-site"

Multiple fields: separate with a double pipe ||
  "interval|number||5|min:1,max:10~autoplay|boolean||false||pauseOnHover|boolean||false"
    `.trim()),

    // ── Tab groups (types 2 and 4) ─────────────────────────────────────────────
    tabGroups: z.string().optional().describe(`
For simple-tabs (type 2) and container-tabs (type 4).
Format: "TabLabel:field1,field2,field3~TabLabel2:field4,field5"
e.g. "Profile:name,age,gender||Skills:aemKnowledge,experience"
    `.trim()),

    // ── Child (types 3 and 4) ─────────────────────────────────────────────────
    childName: z.string().optional().describe(
      'Child item name for container blocks e.g. "carousel-slide", "accordion-item", "card"'
    ),
    childFields: z.string().optional().describe(`
Same format as parentFields. Tilde-separated (~) child field definitions.
e.g. "image|reference|||required||caption|text|||""||ctaUrl|aem-content|||rootPath:/content/site"
    `.trim()),

    // ── Variants ──────────────────────────────────────────────────────────────
    variants: z.string().optional().describe(`
Variant options for the classes select field.
Format: "DisplayName:cssValue,DisplayName2:cssValue2"
e.g. "Dark:dark,Light:light,Compact:compact"
Leave empty if no variants needed.
    `.trim()),

    // ── Conditions ────────────────────────────────────────────────────────────
    conditions: z.string().optional().describe(`
Conditional visibility rules. Tilde-separated (~).
Format: "targetField:controllingField:operator:value1,value2"
operator: === (one value) | or (any value) | !== (not equal)
e.g. "autoplay:layoutVariant:or:carousel,side-carousel~visibleCards:layoutVariant:===:carousel"
Only works when controlling field is select, radio-group, or boolean.
    `.trim()),
  },

  async ({ name, blockType, parentFields, tabGroups, childName, childFields, variants, conditions }) => {

    // ── Parsers ───────────────────────────────────────────────────────────────
    const typeMap = {
      '1':'1','simple':'1',
      '2':'2','simple-tabs':'2','simple with tabs':'2',
      '3':'3','container':'3',
      '4':'4','container-tabs':'4','container with tabs':'4',
      '5':'5','section-wrapper':'5','section wrapper':'5',
    };
    const typeNum   = typeMap[blockType?.toLowerCase()?.trim()] || '1';
    const typeNames = {'1':'Simple','2':'Simple with tabs','3':'Container','4':'Container with tabs','5':'Section wrapper'};
    const typeName  = typeNames[typeNum];
    const isContainer   = typeNum === '3' || typeNum === '4';
    const useTabs       = typeNum === '2' || typeNum === '4';
    const isSectionWrap = typeNum === '5';

    // Parse fields from "name|type|options|default|validation" separated by ~
    function parseFields(str) {
      if (!str?.trim()) return [];
      return str.split('~').map(s => {
        const parts = s.split('|');
        const fname = parts[0]?.trim();
        const ftype = parts[1]?.trim() || 'text';
        const optsStr = parts[2]?.trim() || '';
        const defVal  = parts[3]?.trim() || '';
        const valStr  = parts[4]?.trim() || '';

        if (!fname) return null;

        const options = optsStr ? optsStr.split(',').map(o => {
          const [n, v] = o.split(':');
          return { name: n?.trim(), value: v?.trim() || n?.trim().toLowerCase() };
        }) : [];

        const validation = {};
        if (valStr) {
          valStr.split(',').forEach(v => {
            const [k, val] = v.trim().split(':');
            const key = k?.trim();
            const value = val?.trim();
            if (key === 'required')      validation.required   = true;
            else if (key === 'readOnly') validation.readOnly   = true;
            else if (key === 'hidden')   validation.hidden     = true;
            else if (key === 'description') validation.description = value || '';
            else if (key === 'min')      validation.min        = parseFloat(value);
            else if (key === 'max')      validation.max        = parseFloat(value);
            else if (key === 'step')     validation.step       = parseFloat(value);
            else if (key === 'minLength') validation.minLength = parseInt(value);
            else if (key === 'maxLength') validation.maxLength = parseInt(value);
            else if (key === 'rootPath') validation.rootPath   = value || '';
            else if (key === 'customErrorMsg') validation.customErrorMsg = value || '';
          });
        }

        return { name: fname, type: ftype, options, defaultValue: defVal, ...validation };
      }).filter(Boolean);
    }

    // Parse tab groups from "Label:f1,f2||Label2:f3,f4"
    function parseTabs(str) {
      if (!str?.trim()) return [];
      return str.split('~').map(s => {
        const [label, fields] = s.split(':');
        return {
          label:  label?.trim(),
          fields: fields?.split(',').map(f => f.trim()).filter(Boolean) || [],
        };
      }).filter(t => t.label);
    }

    // Parse variants from "Name:value,Name2:value2"
    function parseVariants(str) {
      if (!str?.trim()) return [];
      return str.split(',').map(s => {
        const [n, v] = s.split(':');
        return { name: n?.trim(), value: v?.trim() || n?.trim().toLowerCase() };
      }).filter(v => v.name);
    }

    // Parse conditions from "target:ctrl:op:val1,val2||..."
    function parseConds(str) {
      if (!str?.trim()) return [];
      return str.split('~').map(s => {
        const parts = s.split(':');
        const target = parts[0]?.trim();
        const ctrl   = parts[1]?.trim();
        const op     = parts[2]?.trim() || '===';
        const vals   = parts[3]?.split(',').map(v => v.trim()).filter(Boolean) || [];
        return { target, ctrl, op, vals };
      }).filter(c => c.target && c.ctrl && c.vals.length);
    }

    const pFields  = parseFields(parentFields);
    const cFields  = parseFields(childFields);
    const tabs     = parseTabs(tabGroups);
    const vList    = parseVariants(variants);
    const condList = parseConds(conditions);

    // ── Output builder ────────────────────────────────────────────────────────
    const lines = [];
    const l  = (s = '') => lines.push(s);
    const h  = (s)      => lines.push(`\n${'═'.repeat(56)}\n  ▶  ${s}\n${'═'.repeat(56)}`);
    const p  = (s)      => lines.push(`  ${s}`);
    const kv = (k, v)   => lines.push(`  ${String(k).padEnd(32)} ${v}`);

    l(`╔══════════════════════════════════════════════════════╗`);
    l(`║  aem-eds-cli guide — block: ${name.padEnd(25)}║`);
    l(`╚══════════════════════════════════════════════════════╝`);
    l();
    l(`  Run in your EDS project terminal:`);
    l();
    l(`    npx aem-eds-cli create ${name}`);
    l();
    l(`  Answer every prompt exactly as shown below:`);

    // ── 1. Block name ─────────────────────────────────────────────────────────
    h(`PROMPT 1 — Block name (kebab-case):`);
    kv('Your answer:', name);

    // ── 2. Block type ─────────────────────────────────────────────────────────
    h(`PROMPT 2 — Block type [1]:`);
    kv('Your answer:', `${typeNum}   (${typeName})`);
    l();
    p(`Available options:`);
    p(`  1. Simple              Fixed fields — hero, banner, teaser`);
    p(`  2. Simple with tabs    Fields grouped into UE Properties panel tabs`);
    p(`  3. Container           Repeating child items — carousel, accordion`);
    p(`  4. Container with tabs Tabbed parent config + repeating children`);
    p(`  5. Section wrapper     Tab panel using section/v1/section`);

    // ── 3. Tab groups (types 2 and 4) ─────────────────────────────────────────
    if (useTabs) {
      if (tabs.length) {
        h(`PROMPTS — TAB GROUPS (${tabs.length} tab${tabs.length > 1 ? 's' : ''}):`);
        tabs.forEach((tab, ti) => {
          l();
          p(`Tab ${ti + 1}:`);
          kv(`  Tab ${ti + 1} name:`, tab.label);
          p(`  → Then define fields for this tab (see fields section below)`);
          p(`  → Fields in this tab: ${tab.fields.join(', ')}`);
          if (ti < tabs.length - 1) {
            l();
            kv('  Add another tab?', 'y');
          } else {
            l();
            kv('  Add another tab?', 'n  (press Enter)');
          }
        });
      } else {
        h(`PROMPTS — TAB GROUPS:`);
        p(`Define each tab when prompted:`);
        p(`  Tab 1 name: Profile   → define fields → Add another tab? y`);
        p(`  Tab 2 name: Skills    → define fields → Add another tab? n`);
      }
    }

    // ── 4. Parent fields ──────────────────────────────────────────────────────
    const phaseTitle = isContainer
      ? `PHASE 1 — PARENT CONFIG FIELDS (${pFields.length} field${pFields.length !== 1 ? 's' : ''})`
      : `PROMPTS — BLOCK FIELDS (${pFields.length} field${pFields.length !== 1 ? 's' : ''})`;
    h(phaseTitle);

    if (pFields.length === 0) {
      p(`No parent config fields — press Enter (blank) immediately when asked for field name.`);
    }

    pFields.forEach((f, i) => {
      l();
      p(`Field ${i + 1} of ${pFields.length}:`);
      kv(`  Field name (camelCase):`, f.name);
      kv(`  Label:`,                  f.name.charAt(0).toUpperCase() + f.name.slice(1).replace(/([A-Z])/g, ' $1'));
      kv(`  Type:`,                   `${f.type}   (type name or its number from the list)`);

      // Options for selection types
      if (['select','multiselect','radio-group','checkbox-group'].includes(f.type)) {
        if (f.options?.length) {
          l();
          p(`  Define options (the CLI will prompt Name then Value for each):`);
          f.options.forEach((o, oi) => {
            p(`    Option ${oi + 1}:  Name: ${o.name.padEnd(20)} Value: ${o.value}`);
          });
          p(`    Option ${f.options.length + 1}: Name: (blank) ← press Enter to finish`);
        } else {
          p(`  → Define your options when prompted (Name: ..., Value: ..., blank to finish)`);
        }
      }

      // Multi
      const multiTypes = ['text','reference','aem-content'];
      if (multiTypes.includes(f.type)) {
        kv(`  Allow multiple values?`, f.multi ? 'y' : 'n  (press Enter)');
      }

      // Default value
      if (f.defaultValue) {
        kv(`  Default value:`, f.defaultValue);
      }

      // Validation
      const hasVal = f.required || f.readOnly || f.hidden || f.description ||
        f.min !== undefined || f.max !== undefined || f.step !== undefined ||
        f.minLength !== undefined || f.maxLength !== undefined ||
        f.rootPath || f.customErrorMsg;

      if (hasVal) {
        kv(`  Add validation / hints?`, 'y');
        if (f.required)                    kv(`    Required?`,            'y');
        if (f.readOnly)                    kv(`    Read-only?`,           'y');
        if (f.hidden)                      kv(`    Hidden?`,              'y');
        if (f.description)                 kv(`    Helper text:`,         f.description);
        if (f.minLength !== undefined)     kv(`    Min length:`,          String(f.minLength));
        if (f.maxLength !== undefined)     kv(`    Max length:`,          String(f.maxLength));
        if (f.min !== undefined)           kv(`    Min:`,                 String(f.min));
        if (f.max !== undefined)           kv(`    Max:`,                 String(f.max));
        if (f.step !== undefined)          kv(`    Step:`,                String(f.step));
        if (f.rootPath)                    kv(`    Root path:`,           f.rootPath);
        if (f.customErrorMsg)              kv(`    Custom error message:`,f.customErrorMsg);
      } else {
        kv(`  Add validation / hints?`, 'n  (press Enter to skip)');
      }
    });

    if (pFields.length > 0) {
      l();
      kv(`  Field name (blank):`, '(press Enter to finish parent fields)');
    }

    // ── 5. Child fields (container types) ─────────────────────────────────────
    if (isContainer) {
      h(`PHASE 2 — CHILD ITEM`);
      l();
      kv(`Use existing block as child?`, 'n  (press Enter)');
      kv(`Child item name:`,             childName || `${name}-item`);

      if (cFields.length === 0) {
        l();
        p(`No child fields defined — press Enter immediately when asked.`);
      }

      cFields.forEach((f, i) => {
        l();
        p(`Child Field ${i + 1} of ${cFields.length}:`);
        kv(`  Field name (camelCase):`, f.name);
        kv(`  Label:`,                  f.name.charAt(0).toUpperCase() + f.name.slice(1).replace(/([A-Z])/g, ' $1'));
        kv(`  Type:`,                   f.type);

        if (['select','multiselect','radio-group','checkbox-group'].includes(f.type)) {
          if (f.options?.length) {
            l();
            p(`  Define options:`);
            f.options.forEach((o, oi) => {
              p(`    Option ${oi + 1}:  Name: ${o.name.padEnd(20)} Value: ${o.value}`);
            });
            p(`    Option ${f.options.length + 1}: Name: (blank) ← press Enter to finish`);
          } else {
            p(`  → Define options when prompted`);
          }
        }

        if (['text','reference','aem-content'].includes(f.type)) {
          kv(`  Allow multiple values?`, f.multi ? 'y' : 'n  (press Enter)');
        }

        if (f.defaultValue) kv(`  Default value:`, f.defaultValue);

        const hasVal = f.required || f.readOnly || f.hidden || f.description ||
          f.min !== undefined || f.max !== undefined || f.rootPath;
        if (hasVal) {
          kv(`  Add validation / hints?`, 'y');
          if (f.required)    kv(`    Required?`,    'y');
          if (f.description) kv(`    Helper text:`, f.description);
          if (f.min !== undefined) kv(`    Min:`,   String(f.min));
          if (f.max !== undefined) kv(`    Max:`,   String(f.max));
          if (f.rootPath)    kv(`    Root path:`,   f.rootPath);
        } else {
          kv(`  Add validation / hints?`, 'n  (press Enter)');
        }
      });

      if (cFields.length > 0) {
        l();
        kv(`  Field name (blank):`, '(press Enter to finish child fields)');
      }
    }

    // ── 6. Variants ───────────────────────────────────────────────────────────
    h(`VARIANTS`);
    if (vList.length) {
      kv(`Does this block need variants?`, 'y');
      l();
      p(`Define variant options (the CLI prompts Name then Value for each):`);
      vList.forEach((v, i) => {
        p(`  Option ${i + 1}:  Name: ${v.name.padEnd(20)} Value: ${v.value}`);
      });
      p(`  Option ${vList.length + 1}: Name: (blank) ← press Enter to finish`);
      kv(`Default variant:`, vList[0]?.value || '');
      l();
      p(`  This creates a "Layout Variant" select field with these options.`);
      p(`  Author picks variant in UE → CSS class applied to block element.`);
    } else {
      kv(`Does this block need variants?`, 'n  (press Enter)');
    }

    // ── 7. Conditions ─────────────────────────────────────────────────────────
    h(`CONDITIONAL FIELDS`);
    if (condList.length) {
      kv(`Add conditional visibility to any fields?`, 'y');
      l();
      p(`  The CLI shows numbered lists — pick by number, not by typing names.`);
      p(`  Conditions only work on: select, radio-group, boolean controlling fields.`);
      l();

      condList.forEach((cond, ci) => {
        const opNum = cond.op === '===' ? '1' : cond.op === 'or' ? '2' : '3';
        const opLabel = {'1':'=== equals one value','2':'or  equals any of these','3':'!== not equal to'}[opNum];
        l();
        p(`Condition ${ci + 1}:`);
        p(`  ➤ "Which field should show/hide conditionally?"`);
        p(`    → Pick the number for: ${cond.target}`);
        l();
        p(`  ➤ "Based on which field (controlling field)?"`);
        p(`    → Pick the number for: ${cond.ctrl}`);
        l();
        p(`  ➤ "Condition type?"`);
        kv(`    Your answer:`, `${opNum}   (${opLabel})`);
        l();
        if (cond.op === 'or') {
          p(`  ➤ "Select values (comma-separated numbers)?"`);
          p(`    → Pick the numbers for: ${cond.vals.join(', ')}`);
        } else {
          p(`  ➤ "Select value?"`);
          p(`    → Pick the number for: ${cond.vals[0]}`);
        }
        l();
        p(`  ✔ Result: "${cond.target}" shows when "${cond.ctrl}" is ${cond.vals.join(' OR ')}`);
      });

      l();
      p(`  ➤ "Which field should show/hide?" → type 0 (zero) to finish`);
    } else {
      kv(`Add conditional visibility to any fields?`, 'n  (press Enter)');
    }

    // ── 8. After scaffolding ──────────────────────────────────────────────────
    h(`AFTER SCAFFOLDING — run these commands`);
    l();
    p(`1. Add "${name}" to section filter (for simple/container blocks):`);
    p(`   Open component-filters.json → find "id": "section" → add "${name}" to components`);
    p(`   OR ask Copilot: "Add ${name} to the section filter"`);
    l();
    p(`2. Rebuild global JSON files:`);
    p(`   npm run build:json`);
    l();
    p(`3. Commit and push:`);
    p(`   git add .`);
    p(`   git commit -m "feat: ${name} block"`);
    p(`   git push`);

    // ── 9. Generated files ────────────────────────────────────────────────────
    h(`FILES THAT WILL BE CREATED`);
    l();
    p(`blocks/${name}/`);
    p(`  ${(name + '.js').padEnd(28)} ← ESLint-safe decorate() stub`);
    p(`  ${(name + '.css').padEnd(28)} ← .${name} { display: block; }`);
    p(`  ${'_' + name + '.json'}`);
    p(`    definitions: ${isContainer
      ? `[${name} (block/v1/block with filter), ${childName || name+'-item'} (block/v1/block/item)]`
      : `[${name} (block/v1/block)]`
    }`);
    p(`    models:      ${isContainer
      ? `[${name}: ${pFields.map(f=>f.name).join(', ') || 'empty'}${vList.length ? ', classes' : ''} | ${childName || name+'-item'}: ${cFields.map(f=>f.name).join(', ')}]`
      : `[${name}: ${pFields.map(f=>f.name).join(', ')}${vList.length ? ', classes' : ''}]`
    }`);
    p(`    filters:     ${isContainer
      ? `[{id:"${name}", components:["${childName || name+'-item'}"]}]`
      : `[]`
    }`);
    if (condList.length) {
      l();
      p(`  Conditional fields (JSONLogic):`);
      condList.forEach(cond => {
        if (cond.op === 'or') {
          p(`    "${cond.target}": condition.or → when "${cond.ctrl}" is ${cond.vals.join(' OR ')}`);
        } else {
          p(`    "${cond.target}": condition.${cond.op} → when "${cond.ctrl}" ${cond.op} "${cond.vals[0]}"`);
        }
      });
    }
    p(`  README.md`);
    p(`    ← UE step-by-step authoring guide for content authors`);

    l();
    l(`${'═'.repeat(56)}`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 6 — get_block_structure
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'get_block_structure',
  'Get the folder and file structure of a specific block',
  { name: z.string().describe('Block name e.g. "hero"') },
  async ({ name }) => {
    const dir = path.join(EDS_PROJECT, 'blocks', name);
    if (!fs.existsSync(dir)) {
      return { content: [{ type: 'text', text: `Block "${name}" not found` }] };
    }
    const files   = fs.readdirSync(dir);
    const details = files.map(f => {
      const size = fs.statSync(path.join(dir, f)).size;
      return `  ${f.padEnd(30)} ${size} bytes`;
    }).join('\n');
    return { content: [{ type: 'text', text: `blocks/${name}/\n${details}` }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 7 — read_component_filters
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'read_component_filters',
  'Read component-filters.json to see which blocks are in the section filter',
  {},
  async () => {
    const p = path.join(EDS_PROJECT, 'component-filters.json');
    if (!fs.existsSync(p)) {
      return { content: [{ type: 'text', text: 'component-filters.json not found' }] };
    }
    return { content: [{ type: 'text', text: fs.readFileSync(p, 'utf8') }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// Tool 8 — add_to_section_filter
// ════════════════════════════════════════════════════════════════════════════
server.tool(
  'add_to_section_filter',
  'Add a block name to the section entry in component-filters.json',
  { name: z.string().describe('Block name to add e.g. "hero"') },
  async ({ name }) => {
    const p = path.join(EDS_PROJECT, 'component-filters.json');
    if (!fs.existsSync(p)) {
      return { content: [{ type: 'text', text: 'component-filters.json not found' }] };
    }
    try {
      const json    = JSON.parse(fs.readFileSync(p, 'utf8'));
      const section = json.find(f => f.id === 'section');
      if (!section) {
        return { content: [{ type: 'text', text: 'No section entry found' }] };
      }
      if (section.components.includes(name)) {
        return { content: [{ type: 'text', text: `"${name}" already in section filter` }] };
      }
      section.components.push(name);
      fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
      return { content: [{ type: 'text', text: `✔ Added "${name}" to section filter` }] };
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