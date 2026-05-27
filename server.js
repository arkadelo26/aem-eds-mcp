#!/usr/bin/env node

/**
 * aem-eds-mcp v2 — Multi-turn conversational block scaffolding
 *
 * Features:
 *   - Multi-turn conversation (no one-shot prompts)
 *   - Session persistence across VS Code restarts
 *   - 24-hour session expiry
 *   - Undo last action
 *   - Input sanitization (auto-camelCase)
 *   - Block presets (carousel, hero, cards, accordion, faq, banner, teaser)
 *   - Smarter JS generation (field-type-aware readers)
 *   - Better README (field table, conditional notes, content tree)
 *   - Condition inference from boolean field names
 *   - AND conditions (multi-controlling-field)
 *   - Condition cascade validation
 *   - Variant-aware condition suggestions
 *   - clone_block (create session from existing block JSON)
 *   - validate_block (audit existing block JSON)
 *   - Atomic file writes (temp + rename)
 *   - JSON validation before writing
 *   - Smart child name suggestion
 *   - Generate files directly (no CLI dependency)
 */

const { McpServer }            = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z }                    = require('zod');
const { execSync }             = require('child_process');
const fs                       = require('fs');
const path                     = require('path');
const os                       = require('os');

const EDS_PROJECT = process.argv[2] || process.cwd();
const server      = new McpServer({ name: 'aem-eds-scaffold', version: '2.0.0' });

// ════════════════════════════════════════════════════════════════════════════
// A — CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const VALID_TYPES = [
  'text','textarea','richtext',
  'reference','aem-content','aem-content-fragment','aem-experience-fragment',
  'boolean','select','multiselect','radio-group','checkbox-group',
  'number','aem-tag',
];
const OPTION_TYPES   = new Set(['select','multiselect','radio-group','checkbox-group']);
const CONTROL_TYPES  = new Set(['select','radio-group','boolean']);
const MULTI_TYPES    = new Set(['text','reference','aem-content']);
const EXPIRY_MS      = 24 * 60 * 60 * 1000; // 24 hours

const BLOCK_TYPES = {
  'simple':          { label: 'Simple',              num: '1' },
  'simple-tabs':     { label: 'Simple with tabs',    num: '2' },
  'container':       { label: 'Container',            num: '3' },
  'container-tabs':  { label: 'Container with tabs', num: '4' },
  'section-wrapper': { label: 'Section wrapper',     num: '5' },
};

const INFERENCE_PREFIXES = ['show','enable','is','has','display','include'];

// ════════════════════════════════════════════════════════════════════════════
// B — PRESETS
// ════════════════════════════════════════════════════════════════════════════

const PRESETS = {
  carousel: {
    blockType: 'container',
    parentFields: [
      { name:'interval',    label:'Interval (seconds)', type:'number',  defaultValue:'5', min:1, max:20 },
      { name:'autoplay',    label:'Autoplay',            type:'boolean', defaultValue:'false' },
      { name:'pauseOnHover',label:'Pause on Hover',      type:'boolean', defaultValue:'true' },
    ],
    childName:   'carousel-slide',
    childFields: [
      { name:'image',    label:'Image',     type:'reference'   },
      { name:'caption',  label:'Caption',   type:'text'        },
      { name:'ctaLabel', label:'CTA Label', type:'text'        },
      { name:'ctaUrl',   label:'CTA URL',   type:'aem-content' },
    ],
    variants: [], conditions: [],
  },
  hero: {
    blockType: 'simple',
    parentFields: [
      { name:'eyebrow',     label:'Eyebrow',      type:'text'        },
      { name:'heading',     label:'Heading',       type:'text',     required:true, maxLength:100 },
      { name:'description', label:'Description',   type:'richtext'    },
      { name:'ctaLabel',    label:'CTA Label',     type:'text'        },
      { name:'ctaUrl',      label:'CTA URL',       type:'aem-content' },
      { name:'image',       label:'Image',         type:'reference'   },
    ],
    childName:'', childFields:[], variants:[], conditions:[],
  },
  accordion: {
    blockType: 'container',
    parentFields: [],
    childName:   'accordion-item',
    childFields: [
      { name:'question', label:'Question', type:'text',     required:true },
      { name:'answer',   label:'Answer',   type:'richtext', required:true },
    ],
    variants:[], conditions:[],
  },
  faq: {
    blockType: 'container',
    parentFields: [
      { name:'title', label:'FAQ Title', type:'text' },
      { name:'theme', label:'Theme',     type:'select',
        options:[{name:'Light',value:'light'},{name:'Dark',value:'dark'}], defaultValue:'light' },
    ],
    childName:   'faq-item',
    childFields: [
      { name:'question', label:'Question', type:'text',     required:true },
      { name:'answer',   label:'Answer',   type:'richtext', required:true },
      { name:'category', label:'Category', type:'text' },
    ],
    variants:[], conditions:[],
  },
  cards: {
    blockType: 'container',
    parentFields: [
      { name:'layoutVariant', label:'Layout Variant', type:'select',
        options:[
          {name:'Grid',value:'grid'},
          {name:'Carousel (Peek)',value:'carousel'},
          {name:'Carousel (Side/Center)',value:'side-carousel'},
        ], defaultValue:'grid' },
      { name:'autoplay',    label:'Autoplay',      type:'boolean', defaultValue:'false' },
      { name:'infiniteLoop',label:'Infinite Loop', type:'boolean', defaultValue:'false' },
      { name:'sectionContent',   label:'Section Content',          type:'richtext' },
      { name:'backgroundImage',  label:'Section Background Image', type:'reference' },
    ],
    childName:   'card',
    childFields: [
      { name:'image',       label:'Image',         type:'reference'   },
      { name:'title',       label:'Title',         type:'text'        },
      { name:'description', label:'Description',   type:'richtext'    },
      { name:'ctaLabel',    label:'CTA Label',     type:'text'        },
      { name:'ctaUrl',      label:'CTA URL',       type:'aem-content' },
    ],
    variants: [],
    conditions: [
      { targetField:'autoplay',     controllingField:'layoutVariant', operator:'or', values:['carousel','side-carousel'] },
      { targetField:'infiniteLoop', controllingField:'layoutVariant', operator:'or', values:['carousel','side-carousel'] },
    ],
  },
  banner: {
    blockType: 'simple',
    parentFields: [
      { name:'heading',         label:'Heading',          type:'text',     required:true },
      { name:'description',     label:'Description',      type:'richtext'  },
      { name:'backgroundImage', label:'Background Image', type:'reference' },
      { name:'ctaLabel',        label:'CTA Label',        type:'text'      },
      { name:'ctaUrl',          label:'CTA URL',          type:'aem-content' },
      { name:'theme', label:'Theme', type:'select',
        options:[{name:'Light',value:'light'},{name:'Dark',value:'dark'}], defaultValue:'light' },
    ],
    childName:'', childFields:[], variants:[], conditions:[],
  },
  teaser: {
    blockType: 'simple',
    parentFields: [
      { name:'image',       label:'Image',       type:'reference'   },
      { name:'heading',     label:'Heading',     type:'text', required:true },
      { name:'description', label:'Description', type:'richtext'    },
      { name:'ctaLabel',    label:'CTA Label',   type:'text'        },
      { name:'ctaUrl',      label:'CTA URL',     type:'aem-content' },
    ],
    childName:'', childFields:[], variants:[], conditions:[],
  },
};

// ════════════════════════════════════════════════════════════════════════════
// C — SESSION STORE
// ════════════════════════════════════════════════════════════════════════════

const SESSION_FILE = path.join(EDS_PROJECT, '.block-session.json');

const SESSION_DEFAULTS = (name) => ({
  name,
  blockType:    '',
  status:       'in-progress',
  parentFields: [],
  tabGroups:    [],
  childName:    '',
  childFields:  [],
  variants:     [],
  conditions:   [],
  filterComponents:  [],
  companionName:     '',
  companionFields:   [],
  labelName:         'tab-label',
  history:           [],
  createdAt:  new Date().toISOString(),
  updatedAt:  new Date().toISOString(),
  expiresAt:  new Date(Date.now() + EXPIRY_MS).toISOString(),
});

function isExpired(session) {
  if (!session?.expiresAt) return false;
  return new Date() > new Date(session.expiresAt);
}

function loadSessions() {
  const map = new Map();
  if (!fs.existsSync(SESSION_FILE)) return map;
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    Object.entries(data).forEach(([k, v]) => {
      if (!isExpired(v)) map.set(k, v);
    });
  } catch (_) {}
  return map;
}

function saveSessions(sessions) {
  try {
    const obj = {};
    sessions.forEach((v, k) => { obj[k] = v; });
    const tmp = SESSION_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
    fs.renameSync(tmp, SESSION_FILE);
  } catch (_) {}
}

const sessions = loadSessions();

function getSession(name) { return sessions.get(name) || null; }

function snapshotSession(s) { return JSON.parse(JSON.stringify(s)); }

function saveSession(session, pushHistory = false) {
  if (pushHistory) {
    const snap = snapshotSession(session);
    snap.history = [];
    session.history = session.history || [];
    session.history.push(snap);
    if (session.history.length > 20) session.history.shift();
  }
  session.updatedAt = new Date().toISOString();
  sessions.set(session.name, session);
  saveSessions(sessions);
  return session;
}

function deleteSession(name) {
  sessions.delete(name);
  saveSessions(sessions);
}

function txt(text) { return { content: [{ type: 'text', text }] }; }

// ════════════════════════════════════════════════════════════════════════════
// D — UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function toTitleCase(str) {
  return str.replace(/(^|[-_\s])(\w)/g, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase()).trim();
}

function sanitizeFieldName(name) {
  if (!name) return '';
  let s = name.trim();
  if (/^[A-Z][A-Z0-9]+$/.test(s)) s = s.toLowerCase();
  s = s.replace(/[-_\s]+(.)/g, (_, ch) => ch.toUpperCase());
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function normaliseType(input) {
  const map = {
    '1':'simple', 'simple':'simple', 'fixed':'simple', 'basic':'simple',
    '2':'simple-tabs', 'simple-tabs':'simple-tabs', 'tabs':'simple-tabs',
    '3':'container', 'container':'container', 'repeating':'container', 'children':'container',
    '4':'container-tabs', 'container-tabs':'container-tabs',
    '5':'section-wrapper', 'section-wrapper':'section-wrapper', 'section':'section-wrapper', 'tab-panel':'section-wrapper',
  };
  return map[input?.toLowerCase()?.trim()] || null;
}

function isValidBlockName(name) {
  return /^[a-z][a-z0-9-]*$/.test(name) && name.length >= 2 && name.length <= 50;
}

function suggestChildName(blockName) {
  const exact = {
    'carousel':'carousel-slide', 'accordion':'accordion-item',
    'faq':'faq-item', 'cards':'card', 'tabs':'tab-item',
    'gallery':'gallery-item', 'slider':'slide', 'team':'team-member',
    'features':'feature', 'list':'list-item',
  };
  if (exact[blockName]) return exact[blockName];
  if (blockName.endsWith('-slider')) return blockName.replace(/-slider$/, '-slide');
  if (blockName.endsWith('s') && !blockName.endsWith('ss')) return blockName.slice(0, -1);
  return `${blockName}-item`;
}

function inferConditionTarget(fieldName, existingFieldNames) {
  for (const prefix of INFERENCE_PREFIXES) {
    if (fieldName.toLowerCase().startsWith(prefix) && fieldName.length > prefix.length) {
      const remainder = fieldName.slice(prefix.length);
      const inferred  = remainder.charAt(0).toLowerCase() + remainder.slice(1);
      if (existingFieldNames.includes(inferred)) return inferred;
    }
  }
  return null;
}

function sessionSummary(s) {
  const lines = [];
  const l = (x = '') => lines.push(x);
  const p = (k, v) => lines.push(`  ${String(k).padEnd(22)} ${v}`);
  l(`┌─ Block: ${s.name} ─ Status: ${s.status} ─ Type: ${BLOCK_TYPES[s.blockType]?.label || 'not set'}`);
  if (s.parentFields.length) {
    l(`  Parent fields (${s.parentFields.length}):`);
    s.parentFields.forEach(f => {
      const cond = f.condition ? ' [conditional]' : '';
      const opts = f.options?.length ? ` [${f.options.length} options]` : '';
      l(`    • ${f.name} (${f.type})${opts}${cond}`);
    });
  }
  if (s.tabGroups.length) {
    l(`  Tab groups (${s.tabGroups.length}):`);
    s.tabGroups.forEach(t => l(`    • ${t.label}: ${t.fieldNames.join(', ')}`));
  }
  if (s.childName) {
    l(`  Child: ${s.childName} (${s.childFields.length} fields)`);
    s.childFields.forEach(f => l(`    • ${f.name} (${f.type})`));
  }
  if (s.variants.length) l(`  Variants: ${s.variants.map(v => `${v.name}→${v.value}`).join(', ')}`);
  if (s.conditions.length) {
    l(`  Conditions (${s.conditions.length}):`);
    s.conditions.forEach(c => {
      l(`    • "${c.targetField}" shows when "${c.controllingField}" is ${c.values.join(' OR ')}`);
    });
  }
  l(`└─`);
  return lines.join('\n');
}

function checkReady(session) {
  const issues = [];
  if (!session.blockType)             issues.push('Block type not set');
  if (!session.parentFields.length && !['container','section-wrapper'].includes(session.blockType))
                                      issues.push('No parent fields defined');
  if (['container','container-tabs'].includes(session.blockType) && !session.childName)
                                      issues.push('Child item name not set');
  if (['container','container-tabs'].includes(session.blockType) && !session.childFields.length)
                                      issues.push('No child fields defined');
  return issues;
}

// ════════════════════════════════════════════════════════════════════════════
// E — VALIDATION
// ════════════════════════════════════════════════════════════════════════════

function validateCondition(session, targetField, controllingField, operator, values) {
  const allFields = [...session.parentFields, ...session.childFields];
  const target    = allFields.find(f => f.name === targetField);
  const ctrl      = session.parentFields.find(f => f.name === controllingField);

  if (!target) return `Field "${targetField}" not found. Available: ${allFields.map(f=>f.name).join(', ')}`;
  if (!ctrl)   return `Controlling field "${controllingField}" not found in parent fields: ${session.parentFields.map(f=>f.name).join(', ')}`;
  if (!CONTROL_TYPES.has(ctrl.type)) return `"${controllingField}" is type "${ctrl.type}". Only select, radio-group, boolean can control visibility.`;
  if (targetField === controllingField) return `A field cannot control its own visibility.`;

  if (ctrl.options?.length && ctrl.type !== 'boolean') {
    const valid   = ctrl.options.map(o => o.value);
    const invalid = values.filter(v => !valid.includes(v));
    if (invalid.length) return `Invalid values: ${invalid.join(', ')}. Valid for "${controllingField}": ${valid.join(', ')}`;
  }
  if (ctrl.type === 'boolean') {
    const invalid = values.filter(v => v !== 'true' && v !== 'false');
    if (invalid.length) return `Boolean field values must be "true" or "false". Got: ${invalid.join(', ')}`;
  }
  return null;
}

function validateBlockJSON(json, session) {
  const errors = [];
  if (!json.definitions?.length) { errors.push('No definitions'); return errors; }

  json.definitions.forEach(def => {
    const rt = def.plugins?.xwalk?.page?.resourceType;
    if (!rt) errors.push(`Definition "${def.id}" missing resourceType`);
    if (def.plugins?.xwalk?.page?.template?.[':items']) {
      errors.push(`Definition "${def.id}" has :items — causes 409 JCR conflicts`);
    }
  });

  if (session.blockType !== 'section-wrapper') {
    const defIds = json.definitions.map(d => d.id);
    json.models?.forEach(m => {
      if (!defIds.includes(m.id)) errors.push(`Model "${m.id}" has no matching definition`);
    });
    json.filters?.forEach(f => {
      f.components?.forEach(comp => {
        if (!defIds.includes(comp)) errors.push(`Filter component "${comp}" has no definition`);
      });
    });
  }
  return errors;
}

function validateExistingBlock(json) {
  const issues = [];
  if (!json.definitions?.length) { issues.push('No definitions found'); return issues; }
  const defIds = json.definitions.map(d => d.id);
  const valid  = ['block/v1/block','block/v1/block/item','section/v1/section'];

  json.definitions.forEach(def => {
    const rt = def.plugins?.xwalk?.page?.resourceType || '';
    if (!rt) issues.push(`Definition "${def.id}" missing resourceType`);
    else if (!valid.some(v => rt.includes(v))) issues.push(`Definition "${def.id}" unexpected resourceType: ${rt}`);
    if (def.plugins?.xwalk?.page?.template?.[':items']) {
      issues.push(`Definition "${def.id}" has :items — causes 409 JCR conflicts`);
    }
  });

  json.models?.forEach(m => {
    if (!defIds.includes(m.id)) issues.push(`Model "${m.id}" has no matching definition`);
  });

  json.filters?.forEach(f => {
    f.components?.forEach(comp => {
      if (!defIds.includes(comp)) issues.push(`Filter component "${comp}" not in definitions`);
    });
  });

  const allFieldNames = json.models?.flatMap(m => m.fields?.map(f => f.name) || []) || [];
  json.models?.forEach(m => {
    m.fields?.forEach(f => {
      if (f.condition) {
        const condStr = JSON.stringify(f.condition);
        const varRefs = [...condStr.matchAll(/"var":"([^"]+)"/g)].map(r => r[1]);
        varRefs.forEach(ref => {
          if (!allFieldNames.includes(ref)) {
            issues.push(`Condition on "${f.name}" references unknown field "${ref}"`);
          }
        });
      }
    });
  });
  return issues;
}

// ════════════════════════════════════════════════════════════════════════════
// F — GENERATION FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

const TYPE_VALUE_MAP = {
  text:'string', textarea:'string', richtext:'string',
  reference:'string', 'aem-content':'string',
  'aem-content-fragment':'string', 'aem-experience-fragment':'string',
  boolean:'boolean', select:'string', multiselect:'string[]',
  'radio-group':'string', 'checkbox-group':'string[]',
  number:'number', 'aem-tag':'string',
};

function buildFieldSchema(field) {
  const base = {
    component: field.type,
    name:      field.name,
    label:     field.label,
    valueType: TYPE_VALUE_MAP[field.type] || 'string',
  };
  if (field.required)    base.required    = true;
  if (field.readOnly)    base.readOnly    = true;
  if (field.hidden)      base.hidden      = true;
  if (field.description) base.description = field.description;
  if (field.multi)       base.multi       = true;
  if (field.options?.length) base.options = field.options;

  if (field.defaultValue !== undefined && field.defaultValue !== '') {
    if (field.type === 'boolean')     base.value = field.defaultValue === 'true';
    else if (field.type === 'number') base.value = parseFloat(field.defaultValue);
    else                              base.value = field.defaultValue;
  }

  if (field.min  !== undefined) base.min  = field.min;
  if (field.max  !== undefined) base.max  = field.max;
  if (field.step !== undefined) base.step = field.step;

  const val = {};
  if (field.minLength !== undefined) val.minLength = field.minLength;
  if (field.maxLength !== undefined) val.maxLength = field.maxLength;
  if (field.rootPath)                val.rootPath  = field.rootPath;
  if (field.customErrorMsg)          val.customErrorMsg = field.customErrorMsg;
  if (Object.keys(val).length) base.validation = val;

  if (field.condition) base.condition = field.condition;
  return base;
}

function buildCondition(operator, controllingField, values) {
  if (operator === '!==') return { '!==': [{ var: controllingField }, values[0]] };
  if (operator === 'and') return { and: values.map(v => ({ '===': [{ var: controllingField }, v] })) };
  if (values.length === 1) return { '===': [{ var: controllingField }, values[0]] };
  return { or: values.map(v => ({ '===': [{ var: controllingField }, v] })) };
}

function applyConditionsToSession(session) {
  session.conditions.forEach(cond => {
    const allFields = [...session.parentFields, ...session.childFields];
    const target    = allFields.find(f => f.name === cond.targetField);
    if (target) target.condition = buildCondition(cond.operator, cond.controllingField, cond.values);
  });
}

function buildBlockJSON(session) {
  const { name, blockType, childName, childFields, variants } = session;
  const isContainer   = blockType === 'container' || blockType === 'container-tabs';
  const isSectionWrap = blockType === 'section-wrapper';
  const useTabs       = blockType === 'simple-tabs' || blockType === 'container-tabs';

  // Apply conditions to field objects before building schema
  applyConditionsToSession(session);

  let parentSchema = session.parentFields.map(buildFieldSchema);

  if (variants?.length) {
    parentSchema.push({
      component: 'select', name: 'classes', label: 'Layout Variant',
      valueType: 'string', options: variants, value: variants[0]?.value || '',
    });
  }

  if (useTabs && session.tabGroups.length) {
    const tabbed = [];
    session.tabGroups.forEach((tab, ti) => {
      tabbed.push({ component: 'tab', name: `tab${ti + 1}`, label: tab.label });
      tab.fieldNames.forEach(fn => {
        const f = parentSchema.find(x => x.name === fn);
        if (f) tabbed.push(f);
      });
    });
    parentSchema.forEach(f => { if (!tabbed.find(t => t.name === f.name)) tabbed.push(f); });
    parentSchema = tabbed;
  }

  const definitions = [];
  if (isSectionWrap) {
    definitions.push({
      title: toTitleCase(name), id: name,
      plugins: { xwalk: { page: {
        resourceType: 'core/franklin/components/section/v1/section',
        template: { name: toTitleCase(name), model: name, filter: name, [session.labelName || 'tab-label']: 'Tab' },
      }}},
    });
    if (session.companionName) {
      definitions.push({
        title: toTitleCase(session.companionName), id: session.companionName,
        plugins: { xwalk: { page: {
          resourceType: 'core/franklin/components/block/v1/block',
          template: { name: toTitleCase(session.companionName), model: session.companionName },
        }}},
      });
    }
  } else {
    const template = { name: toTitleCase(name), model: name };
    if (isContainer) template.filter = name;
    definitions.push({
      title: toTitleCase(name), id: name,
      plugins: { xwalk: { page: { resourceType: 'core/franklin/components/block/v1/block', template } } },
    });
    if (isContainer && childName) {
      definitions.push({
        title: toTitleCase(childName), id: childName,
        plugins: { xwalk: { page: {
          resourceType: 'core/franklin/components/block/v1/block/item',
          template: { name: toTitleCase(childName), model: childName },
        }}},
      });
    }
  }

  const models = [{ id: name, fields: parentSchema }];
  if (isContainer && childName && childFields.length) {
    models.push({ id: childName, fields: childFields.map(buildFieldSchema) });
  }
  if (isSectionWrap && session.companionName && session.companionFields?.length) {
    models.push({ id: session.companionName, fields: session.companionFields.map(buildFieldSchema) });
  }

  let filters = [];
  if (isContainer && childName) filters = [{ id: name, components: [childName] }];
  if (isSectionWrap) {
    const comps = [...(session.filterComponents || [])];
    if (session.companionName) comps.push(session.companionName);
    filters = [{ id: name, components: comps }];
  }

  return { definitions, models, filters };
}

function fieldReader(f, index, rowVar) {
  const col = `${rowVar}.children[${index}]`;
  if (f.type === 'reference')   return `  const ${f.name} = ${col}?.querySelector('picture, img');`;
  if (f.type === 'aem-content') return `  const ${f.name} = ${col}?.querySelector('a');`;
  if (f.type === 'richtext')    return `  const ${f.name} = ${col}?.innerHTML;`;
  if (f.type === 'boolean')     return `  const ${f.name} = ${col}?.textContent.trim() === 'true';`;
  if (f.type === 'number')      return `  const ${f.name} = parseFloat(${col}?.textContent.trim() || '0');`;
  return `  const ${f.name} = ${col}?.textContent.trim();`;
}

function buildSmartJS(session) {
  const { name, blockType, parentFields, childFields, childName } = session;
  const isContainer = blockType === 'container' || blockType === 'container-tabs';
  const lines = [`export default function decorate(block) {`];

  if (isContainer) {
    if (parentFields.length) {
      lines.push(`  const [configRow, ...itemRows] = [...block.children];`);
      lines.push(`  // Read parent config`);
      parentFields.forEach((f, i) => lines.push(fieldReader(f, i, 'configRow')));
    } else {
      lines.push(`  const itemRows = [...block.children];`);
    }
    lines.push(``);
    lines.push(`  itemRows.forEach((row) => {`);
    lines.push(`    row.classList.add('${name}__item');`);
    if (childFields.length) {
      lines.push(`    // Read child fields`);
      childFields.forEach((f, i) => lines.push('  ' + fieldReader(f, i, 'row')));
    }
    lines.push(`    // TODO: build ${childName || name + '-item'} UI`);
    lines.push(`  });`);
  } else {
    if (parentFields.length) {
      lines.push(`  const rows = [...block.children];`);
      parentFields.forEach((f, i) => lines.push(fieldReader(f, i, `rows[${i}]`)));
      lines.push(`  // TODO: build ${name} UI`);
    } else {
      lines.push(`  // TODO: implement ${name} block`);
    }
  }
  lines.push(`}`);
  return lines.join('\n') + '\n';
}

function buildCSS(name) { return `.${name} {\n  display: block;\n}\n`; }

function buildReadme(session) {
  const { name, blockType, parentFields, childName, childFields, conditions, variants } = session;
  const isContainer = blockType === 'container' || blockType === 'container-tabs';
  const title = toTitleCase(name);
  let md = `# ${title}\n\n`;

  if (parentFields.length) {
    md += `## Fields\n\n| Field | Label | Type | Required | Notes |\n|---|---|---|---|---|\n`;
    parentFields.forEach(f => {
      const req   = f.required ? '✔' : '';
      const notes = [];
      if (f.options?.length) notes.push(`Options: ${f.options.map(o => o.name).join(', ')}`);
      if (f.min !== undefined) notes.push(`min: ${f.min}`);
      if (f.max !== undefined) notes.push(`max: ${f.max}`);
      if (f.description) notes.push(f.description);
      md += `| \`${f.name}\` | ${f.label} | ${f.type} | ${req} | ${notes.join('. ')} |\n`;
    });
    md += '\n';
  }

  if (isContainer && childFields.length) {
    md += `## Child Fields (${toTitleCase(childName)})\n\n| Field | Label | Type | Required |\n|---|---|---|---|\n`;
    childFields.forEach(f => {
      md += `| \`${f.name}\` | ${f.label} | ${f.type} | ${f.required ? '✔' : ''} |\n`;
    });
    md += '\n';
  }

  if (conditions?.length) {
    md += `## Conditional Fields\n\n`;
    conditions.forEach(c => {
      md += `- **\`${c.targetField}\`** — only visible when \`${c.controllingField}\` is ${c.values.map(v => `\`${v}\``).join(' or ')}\n`;
    });
    md += '\n';
  }

  if (variants?.length) {
    md += `## Variants\n\n| Name | CSS Class |\n|---|---|\n`;
    variants.forEach(v => { md += `| ${v.name} | \`${v.value}\` |\n`; });
    md += '\n';
  }

  md += `## Content Tree\n\n\`\`\`\nSection\n  └── ${title}\n`;
  if (isContainer && childName) {
    md += `        ├── ${toTitleCase(childName)} 1\n        └── ${toTitleCase(childName)} 2\n`;
  }
  md += `\`\`\`\n\n`;

  md += `## Authoring in Universal Editor\n\n`;
  md += `1. Click **+** in Section → **${title}**\n`;
  if (parentFields.length) md += `2. Click block → Properties panel → fill fields\n`;
  if (isContainer && childName) {
    md += `3. Click **+** INSIDE **${title}** → **${toTitleCase(childName)}**\n`;
    md += `4. Fill child fields → repeat for each item\n`;
  }
  md += `5. Click **Publish**\n\n`;
  md += `---\n\n## After any JSON change\n\`\`\`bash\nnpm run build:json && git add . && git push\n\`\`\`\n`;
  return md;
}

function writeAtomic(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ════════════════════════════════════════════════════════════════════════════
// G — TOOLS
// ════════════════════════════════════════════════════════════════════════════

// ── 1. init_block ─────────────────────────────────────────────────────────
server.tool('init_block',
  `Start creating a new EDS block. ALWAYS call this first.
   Creates a session to accumulate block config across conversation turns.
   Optionally load a preset: carousel|hero|accordion|faq|cards|banner|teaser`,
  {
    name:      z.string().describe('Block name in kebab-case e.g. "carousel", "hero-banner"'),
    blockType: z.string().optional().describe('If known: simple|simple-tabs|container|container-tabs|section-wrapper'),
    preset:    z.string().optional().describe('Load a preset: carousel|hero|accordion|faq|cards|banner|teaser'),
  },
  async ({ name, blockType, preset }) => {
    const cleanName = name.toLowerCase().trim().replace(/\s+/g, '-');
    if (!isValidBlockName(cleanName)) {
      return txt(`Invalid block name "${name}". Use kebab-case: lowercase letters, numbers, hyphens. Min 2 chars.\nExample: "my-carousel", "hero-banner"`);
    }
    const blockDir = path.join(EDS_PROJECT, 'blocks', cleanName);
    if (fs.existsSync(blockDir)) {
      return txt(`Block "${cleanName}" already exists in blocks/. Use a different name or call remove_block first.`);
    }

    // Check component-definition.json for ID conflicts
    const compDefPath = path.join(EDS_PROJECT, 'component-definition.json');
    if (fs.existsSync(compDefPath)) {
      try {
        const compDef = JSON.parse(fs.readFileSync(compDefPath, 'utf8'));
        const groups  = compDef.groups || [];
        const allIds  = groups.flatMap(g => g.components?.map(c => c.id) || []);
        if (allIds.includes(cleanName)) {
          return txt(`⚠ Warning: "${cleanName}" already exists in component-definition.json. Using it may cause conflicts.\nChoose a different name or delete the existing entry.`);
        }
      } catch (_) {}
    }

    const session = SESSION_DEFAULTS(cleanName);

    // Apply preset if requested
    if (preset && PRESETS[preset.toLowerCase()]) {
      const p = PRESETS[preset.toLowerCase()];
      session.blockType   = p.blockType;
      session.parentFields = JSON.parse(JSON.stringify(p.parentFields));
      session.childName    = p.childName;
      session.childFields  = JSON.parse(JSON.stringify(p.childFields));
      session.variants     = JSON.parse(JSON.stringify(p.variants));
      session.conditions   = JSON.parse(JSON.stringify(p.conditions));
      applyConditionsToSession(session);
      saveSession(session);
      return txt(
        `✔ Started "${cleanName}" with "${preset}" preset.\n\n` +
        sessionSummary(session) + '\n\n' +
        `Review the pre-loaded fields above.\n` +
        `Call preview_session to confirm, then generate_block to create files.\n` +
        `Or add/remove fields as needed.`
      );
    }

    // Apply block type if provided
    if (blockType) {
      const norm = normaliseType(blockType);
      if (norm) { session.blockType = norm; }
    }

    saveSession(session);

    if (session.blockType) {
      const isContainer = session.blockType === 'container' || session.blockType === 'container-tabs';
      return txt(
        `✔ Started "${cleanName}" as ${BLOCK_TYPES[session.blockType].label}.\n\n` +
        (isContainer
          ? `Next steps:\n1. Call add_parent_field for config fields (skip if none)\n2. Call set_child with the child item name\n3. Call add_child_field for each child field`
          : `Next step: Call add_parent_field for each field.`)
      );
    }

    const presetList = Object.keys(PRESETS).join(', ');
    return txt(
      `✔ Started "${cleanName}".\n\n` +
      `Available presets: ${presetList}\n\n` +
      `Ask the user:\n` +
      `"Does this block have repeating child items (like carousel slides or cards)?\n` +
      ` Or does it have fixed fields only (like a hero or banner)?\n` +
      ` Or should fields be grouped into tabs in the properties panel?"`
    );
  }
);

// ── 2. set_block_type ─────────────────────────────────────────────────────
server.tool('set_block_type',
  `Set the block type. Call when user intent is clear.
   "repeating items/children" → container
   "fixed fields only" → simple
   "tabs in properties panel" → simple-tabs
   "tab panel sections" → section-wrapper`,
  {
    name:      z.string(),
    blockType: z.string().describe('simple|simple-tabs|container|container-tabs|section-wrapper'),
  },
  async ({ name, blockType }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}". Call init_block first.`);
    const norm = normaliseType(blockType);
    if (!norm) return txt(`Unknown type "${blockType}". Use: simple|simple-tabs|container|container-tabs|section-wrapper`);
    saveSession(session, true);
    session.blockType = norm;
    saveSession(session);

    const isContainer = norm === 'container' || norm === 'container-tabs';
    const useTabs     = norm === 'simple-tabs' || norm === 'container-tabs';
    let next = `✔ Block type set to: ${BLOCK_TYPES[norm].label}\n\n`;
    if (norm === 'section-wrapper') {
      next += `Next: ask user which blocks can go inside each tab section, and what to call the tab label field.`;
    } else if (useTabs) {
      next += `Next: ask user how many tabs and what each tab should be called. Then add fields per tab.`;
    } else if (isContainer) {
      const suggested = suggestChildName(name);
      next += `Next: define parent config fields (if any), then call set_child("${name}", "${suggested}") and add child fields.`;
    } else {
      next += `Next: call add_parent_field for each field the block needs.`;
    }
    return txt(next);
  }
);

// ── 3. add_parent_field ───────────────────────────────────────────────────
server.tool('add_parent_field',
  `Add one field to the parent block model. Call once per field.
   Auto-sanitizes field names (camelCase).
   Detects condition inference opportunities for boolean fields named show*/enable*/is*/has*.`,
  {
    name:         z.string(),
    fieldName:    z.string().describe('Field name — auto-corrected to camelCase'),
    fieldLabel:   z.string().describe('Display label in UE properties panel'),
    fieldType:    z.string().describe('text|textarea|richtext|reference|aem-content|aem-content-fragment|aem-experience-fragment|boolean|select|multiselect|radio-group|checkbox-group|number|aem-tag'),
    options:      z.array(z.object({ name:z.string(), value:z.string() })).optional(),
    defaultValue: z.string().optional(),
    required:     z.boolean().optional(),
    multi:        z.boolean().optional(),
    min:          z.number().optional(),
    max:          z.number().optional(),
    step:         z.number().optional(),
    minLength:    z.number().optional(),
    maxLength:    z.number().optional(),
    rootPath:     z.string().optional(),
    description:  z.string().optional(),
    hidden:       z.boolean().optional(),
    readOnly:     z.boolean().optional(),
  },
  async ({ name, fieldName, fieldLabel, fieldType, options, defaultValue,
           required, multi, min, max, step, minLength, maxLength,
           rootPath, description, hidden, readOnly }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}". Call init_block first.`);

    const cleanName = sanitizeFieldName(fieldName);
    if (!cleanName || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(cleanName)) {
      return txt(`Invalid field name "${fieldName}". Use camelCase: "layoutVariant", "ctaUrl", "backgroundImage"`);
    }
    if (!VALID_TYPES.includes(fieldType)) {
      return txt(`Unknown type "${fieldType}".\nValid types: ${VALID_TYPES.join(', ')}`);
    }
    if (OPTION_TYPES.has(fieldType) && (!options?.length)) {
      return txt(`"${fieldType}" requires options. Provide options array with name/value pairs.`);
    }
    if (session.parentFields.find(f => f.name === cleanName)) {
      return txt(`Field "${cleanName}" already exists in parent fields. Use a different name.`);
    }

    saveSession(session, true);

    const field = { name: cleanName, label: fieldLabel, type: fieldType };
    if (options?.length)            field.options      = options;
    if (defaultValue !== undefined) field.defaultValue = defaultValue;
    if (required)                   field.required     = true;
    if (multi && MULTI_TYPES.has(fieldType)) field.multi = true;
    if (min  !== undefined)         field.min          = min;
    if (max  !== undefined)         field.max          = max;
    if (step !== undefined)         field.step         = step;
    if (minLength !== undefined)    field.minLength    = minLength;
    if (maxLength !== undefined)    field.maxLength    = maxLength;
    if (rootPath)                   field.rootPath     = rootPath;
    if (description)                field.description  = description;
    if (hidden)                     field.hidden       = true;
    if (readOnly)                   field.readOnly     = true;

    session.parentFields.push(field);

    // Condition inference — check if boolean field name implies it controls another
    let inferHint = '';
    if (fieldType === 'boolean') {
      const existingNames = session.parentFields.filter(f => f.name !== cleanName).map(f => f.name);
      const target = inferConditionTarget(cleanName, existingNames);
      if (target) {
        inferHint = `\n\n💡 "${cleanName}" looks like it controls "${target}". Should "${target}" only show when "${cleanName}" is true?\n   If yes, call: add_condition("${name}", "${target}", "${cleanName}", "===", ["true"])`;
      }
    }

    saveSession(session);
    const nameNote = fieldName !== cleanName ? ` (auto-corrected from "${fieldName}")` : '';
    return txt(`✔ Added "${cleanName}" (${fieldType})${nameNote}. Total parent fields: ${session.parentFields.length}${inferHint}`);
  }
);

// ── 4. add_tab_group ──────────────────────────────────────────────────────
server.tool('add_tab_group',
  'Add a tab group for simple-tabs or container-tabs blocks.',
  {
    name:       z.string(),
    tabLabel:   z.string().describe('Tab label e.g. "Profile", "Media"'),
    fieldNames: z.array(z.string()).describe('Field names that belong to this tab'),
  },
  async ({ name, tabLabel, fieldNames }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);
    if (!['simple-tabs','container-tabs'].includes(session.blockType)) {
      return txt(`Tab groups only apply to simple-tabs or container-tabs blocks.`);
    }
    const missing = fieldNames.filter(fn => !session.parentFields.find(f => f.name === fn));
    if (missing.length) {
      return txt(`Fields not found: ${missing.join(', ')}. Add them first with add_parent_field.`);
    }
    saveSession(session, true);
    session.tabGroups.push({ label: tabLabel, fieldNames });
    saveSession(session);
    return txt(`✔ Tab "${tabLabel}" added with fields: ${fieldNames.join(', ')}. Total tabs: ${session.tabGroups.length}`);
  }
);

// ── 5. set_child ──────────────────────────────────────────────────────────
server.tool('set_child',
  'Set the child item name for container blocks. Then use add_child_field.',
  {
    name:      z.string(),
    childName: z.string().optional().describe('Child name — leave empty to auto-suggest'),
  },
  async ({ name, childName }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);
    if (!['container','container-tabs'].includes(session.blockType)) {
      return txt(`Child items only apply to container/container-tabs blocks.`);
    }
    const suggested  = childName || suggestChildName(name);
    const cleanChild = suggested.toLowerCase().trim().replace(/\s+/g, '-');
    saveSession(session, true);
    session.childName = cleanChild;
    saveSession(session);
    return txt(`✔ Child item set to "${cleanChild}".\nNext: call add_child_field for each child field.`);
  }
);

// ── 6. add_child_field ────────────────────────────────────────────────────
server.tool('add_child_field',
  'Add one field to the child item model. Same field types as add_parent_field.',
  {
    name:         z.string(),
    fieldName:    z.string(),
    fieldLabel:   z.string(),
    fieldType:    z.string(),
    options:      z.array(z.object({ name:z.string(), value:z.string() })).optional(),
    defaultValue: z.string().optional(),
    required:     z.boolean().optional(),
    multi:        z.boolean().optional(),
    min:          z.number().optional(),
    max:          z.number().optional(),
    minLength:    z.number().optional(),
    maxLength:    z.number().optional(),
    rootPath:     z.string().optional(),
    description:  z.string().optional(),
  },
  async ({ name, fieldName, fieldLabel, fieldType, options, defaultValue,
           required, multi, min, max, minLength, maxLength, rootPath, description }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);
    if (!session.childName) return txt(`Set child name first with set_child.`);
    const cleanName = sanitizeFieldName(fieldName);
    if (!VALID_TYPES.includes(fieldType)) return txt(`Unknown type "${fieldType}".`);
    if (OPTION_TYPES.has(fieldType) && !options?.length) return txt(`"${fieldType}" requires options.`);
    if (session.childFields.find(f => f.name === cleanName)) return txt(`Child field "${cleanName}" already exists.`);
    saveSession(session, true);
    const field = { name:cleanName, label:fieldLabel, type:fieldType };
    if (options?.length)            field.options      = options;
    if (defaultValue !== undefined) field.defaultValue = defaultValue;
    if (required)                   field.required     = true;
    if (multi && MULTI_TYPES.has(fieldType)) field.multi = true;
    if (min  !== undefined)         field.min          = min;
    if (max  !== undefined)         field.max          = max;
    if (minLength !== undefined)    field.minLength    = minLength;
    if (maxLength !== undefined)    field.maxLength    = maxLength;
    if (rootPath)                   field.rootPath     = rootPath;
    if (description)                field.description  = description;
    session.childFields.push(field);
    saveSession(session);
    return txt(`✔ Child field "${cleanName}" (${fieldType}) added. Total child fields: ${session.childFields.length}`);
  }
);

// ── 7. add_variant ────────────────────────────────────────────────────────
server.tool('add_variant',
  `Add a variant option. Creates/extends a "classes" select field.
   Call when user mentions different layouts or visual styles.
   After adding variants, proactively ask if any fields should be conditional on the variant.`,
  {
    name:  z.string(),
    label: z.string().describe('Display name e.g. "Dark", "Grid"'),
    value: z.string().describe('CSS class value e.g. "dark", "grid"'),
  },
  async ({ name, label, value }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);
    if (session.variants.find(v => v.value === value)) return txt(`Variant "${value}" already added.`);
    saveSession(session, true);
    session.variants.push({ name: label, value });
    saveSession(session);

    const boolFields = session.parentFields.filter(f => f.type === 'boolean' && !f.condition);
    const hint = boolFields.length
      ? `\n\n💡 You have ${boolFields.length} boolean field(s) without conditions: ${boolFields.map(f=>f.name).join(', ')}\n   Should any of them only show for specific variants?\n   If yes, call add_condition for each.`
      : '';
    return txt(`✔ Variant "${label}" → "${value}" added. Total variants: ${session.variants.length}${hint}`);
  }
);

// ── 8. add_condition ──────────────────────────────────────────────────────
server.tool('add_condition',
  `Add conditional visibility to a field.
   Call when user says "only show X when Y is Z", "X appears for carousel only",
   "hide X unless Y is enabled", "X only relevant for video".
   Controlling field must be select, radio-group, or boolean.
   Cascade check: warns if removing a controlling field would break conditions.
   Supports AND conditions with multiple controlling fields.`,
  {
    name:             z.string(),
    targetField:      z.string().describe('Field that should show/hide'),
    controllingField: z.string().describe('Field whose value controls visibility'),
    operator:         z.enum(['===','or','!==','and']).describe('===|or|!==|and'),
    values:           z.array(z.string()).describe('Values that make field VISIBLE'),
    applyToChild:     z.boolean().optional().describe('true if target is a child field'),
    andControllingField: z.string().optional().describe('Second controlling field for AND conditions'),
    andValues:           z.array(z.string()).optional().describe('Values for the AND condition'),
  },
  async ({ name, targetField, controllingField, operator, values,
           applyToChild, andControllingField, andValues }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);

    const err = validateCondition(session, targetField, controllingField, operator, values);
    if (err) return txt(`✖ ${err}`);

    // AND condition: validate second controlling field too
    if (operator === 'and' && andControllingField && andValues?.length) {
      const err2 = validateCondition(session, targetField, andControllingField, '===', andValues);
      if (err2) return txt(`✖ AND condition error: ${err2}`);
    }

    saveSession(session, true);

    const allFields = [...session.parentFields, ...session.childFields];
    const target    = allFields.find(f => f.name === (applyToChild ? targetField : targetField));

    let condition;
    if (operator === 'and' && andControllingField && andValues?.length) {
      condition = {
        and: [
          buildCondition('===', controllingField, values),
          buildCondition('===', andControllingField, andValues),
        ],
      };
    } else {
      condition = buildCondition(operator, controllingField, values);
    }

    target.condition = condition;

    // Update conditions registry
    const existing = session.conditions.findIndex(c => c.targetField === targetField);
    const record   = { targetField, controllingField, operator, values };
    if (existing >= 0) session.conditions[existing] = record;
    else               session.conditions.push(record);

    saveSession(session);
    return txt(
      `✔ Condition added:\n  "${targetField}" shows when "${controllingField}" is ${values.join(' OR ')}\n\n` +
      `  JSONLogic: ${JSON.stringify(condition)}`
    );
  }
);

// ── 9. remove_field ───────────────────────────────────────────────────────
server.tool('remove_field',
  'Remove a field. Cascade-checks if other fields depend on this one as a controlling field.',
  {
    name:      z.string(),
    fieldName: z.string(),
    fromChild: z.boolean().optional(),
  },
  async ({ name, fieldName, fromChild }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);

    // Cascade check — is this field controlling any conditions?
    const dependents = session.conditions.filter(c => c.controllingField === fieldName);
    const cascadeWarning = dependents.length
      ? `\n⚠ Cascade warning: ${dependents.length} condition(s) reference "${fieldName}" as controlling field:\n` +
        dependents.map(c => `  • "${c.targetField}" visibility controlled by "${fieldName}"`).join('\n') +
        `\n  These conditions have been removed automatically.`
      : '';

    saveSession(session, true);

    if (fromChild) {
      const i = session.childFields.findIndex(f => f.name === fieldName);
      if (i < 0) return txt(`Child field "${fieldName}" not found.`);
      session.childFields.splice(i, 1);
    } else {
      const i = session.parentFields.findIndex(f => f.name === fieldName);
      if (i < 0) return txt(`Parent field "${fieldName}" not found.`);
      session.parentFields.splice(i, 1);
      // Remove cascade conditions
      session.conditions = session.conditions.filter(
        c => c.targetField !== fieldName && c.controllingField !== fieldName
      );
      // Also clear condition from other fields that were controlled by this
      session.parentFields.forEach(f => {
        if (f.condition && JSON.stringify(f.condition).includes(`"var":"${fieldName}"`)) {
          delete f.condition;
        }
      });
    }

    saveSession(session);
    return txt(`✔ Field "${fieldName}" removed.${cascadeWarning}`);
  }
);

// ── 10. preview_session ───────────────────────────────────────────────────
server.tool('preview_session',
  'Show current block config before generating. Always call before generate_block.',
  { name: z.string() },
  async ({ name }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);
    const issues  = checkReady(session);
    const summary = sessionSummary(session);
    const status  = issues.length
      ? `\n⚠ Not ready:\n${issues.map(i => `  • ${i}`).join('\n')}\n\nFix these then preview again.`
      : `\n✔ Ready! Call generate_block("${name}") to create files.`;
    return txt(summary + status);
  }
);

// ── 11. undo_last_action ──────────────────────────────────────────────────
server.tool('undo_last_action',
  'Undo the last change to a session. Call when user says "undo", "go back", "remove that".',
  { name: z.string() },
  async ({ name }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}".`);
    if (!session.history?.length) return txt(`Nothing to undo for "${name}".`);
    const prev = session.history.pop();
    const history = session.history;
    Object.assign(session, { ...prev, history });
    saveSession(session);
    return txt(`✔ Last action undone.\n\n${sessionSummary(session)}`);
  }
);

// ── 12. list_sessions ─────────────────────────────────────────────────────
server.tool('list_sessions',
  'List all active block sessions in progress.',
  {},
  async () => {
    if (!sessions.size) return txt('No active sessions.');
    const lines = ['Active sessions:\n'];
    sessions.forEach((s, k) => {
      lines.push(
        `  ${k.padEnd(22)} ${(s.blockType||'type?').padEnd(16)} ` +
        `${s.parentFields.length}p  ${s.childFields.length}c  ${s.status}`
      );
    });
    return txt(lines.join('\n'));
  }
);

// ── 13. discard_session ───────────────────────────────────────────────────
server.tool('discard_session',
  'Discard a session without generating. Call when user cancels.',
  { name: z.string() },
  async ({ name }) => {
    if (!sessions.has(name)) return txt(`No session for "${name}".`);
    deleteSession(name);
    return txt(`✔ Session "${name}" discarded.`);
  }
);

// ── 14. generate_block ────────────────────────────────────────────────────
server.tool('generate_block',
  'Generate all block files. ALWAYS call preview_session first. Validates JSON before writing. Uses atomic file writes.',
  { name: z.string() },
  async ({ name }) => {
    const session = getSession(name);
    if (!session) return txt(`No session for "${name}". Call init_block first.`);
    const issues = checkReady(session);
    if (issues.length) return txt(`Cannot generate:\n${issues.map(i => `  • ${i}`).join('\n')}`);

    try {
      const blockJSON = buildBlockJSON(session);

      // Validate before writing
      const errors = validateBlockJSON(blockJSON, session);
      if (errors.length) {
        return txt(`JSON validation failed:\n${errors.map(e => `  • ${e}`).join('\n')}\n\nFix session config and try again.`);
      }

      const dir = path.join(EDS_PROJECT, 'blocks', name);
      fs.mkdirSync(dir, { recursive: true });

      writeAtomic(path.join(dir, `${name}.js`),    buildSmartJS(session));
      writeAtomic(path.join(dir, `${name}.css`),   buildCSS(name));
      writeAtomic(path.join(dir, `_${name}.json`), JSON.stringify(blockJSON, null, 2) + '\n');
      writeAtomic(path.join(dir, 'README.md'),      buildReadme(session));

      // Update component-filters.json
      let filterMsg = '';
      const filtersPath = path.join(EDS_PROJECT, 'component-filters.json');
      if (fs.existsSync(filtersPath)) {
        try {
          const f = JSON.parse(fs.readFileSync(filtersPath, 'utf8'));
          const s = f.find(x => x.id === 'section');
          if (s && !s.components.includes(name)) {
            s.components.push(name);
            writeAtomic(filtersPath, JSON.stringify(f, null, 2) + '\n');
            filterMsg = `\n  ✔ Added "${name}" to component-filters.json`;
          }
        } catch (_) { filterMsg = '\n  ⚠ Could not update component-filters.json'; }
      }

      // Update models/_section.json for section wrapper
      let sectionMsg = '';
      if (session.blockType === 'section-wrapper') {
        const sp = path.join(EDS_PROJECT, 'models', '_section.json');
        if (fs.existsSync(sp)) {
          try {
            const sj = JSON.parse(fs.readFileSync(sp, 'utf8'));
            const sf = sj.filters?.find(f => f.id === 'section');
            if (sf && !sf.components.includes(name)) {
              sf.components.push(name);
              writeAtomic(sp, JSON.stringify(sj, null, 2) + '\n');
              sectionMsg = `\n  ✔ Added "${name}" to models/_section.json`;
            }
          } catch (_) { sectionMsg = '\n  ⚠ Could not update models/_section.json'; }
        }
      }

      session.status = 'generated';
      saveSession(session);

      return txt([
        `✔ Block "${name}" generated!`, '',
        `  blocks/${name}/${name}.js`,
        `  blocks/${name}/${name}.css`,
        `  blocks/${name}/_${name}.json`,
        `  blocks/${name}/README.md`,
        filterMsg, sectionMsg, '',
        `Next steps:`,
        `  npm run build:json`,
        `  git add .`,
        `  git commit -m "feat: ${name} block"`,
        `  git push`,
      ].filter(x => x !== '').join('\n'));

    } catch (e) {
      return txt(`Error generating block: ${e.message}`);
    }
  }
);

// ── 15. clone_block ───────────────────────────────────────────────────────
server.tool('clone_block',
  `Create a new block session pre-filled from an existing block's JSON.
   Call when user says "similar to X" or "based on X but with changes".`,
  {
    sourceName: z.string().describe('Existing block name to copy from'),
    newName:    z.string().describe('New block name for the clone'),
  },
  async ({ sourceName, newName }) => {
    const cleanNew = newName.toLowerCase().trim().replace(/\s+/g, '-');
    if (!isValidBlockName(cleanNew)) return txt(`Invalid new name "${newName}".`);
    if (fs.existsSync(path.join(EDS_PROJECT, 'blocks', cleanNew))) {
      return txt(`Block "${cleanNew}" already exists.`);
    }

    const srcPath = path.join(EDS_PROJECT, 'blocks', sourceName, `_${sourceName}.json`);
    if (!fs.existsSync(srcPath)) {
      return txt(`Source block "${sourceName}" not found. Make sure _${sourceName}.json exists.`);
    }

    let json;
    try {
      json = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    } catch (e) {
      return txt(`Could not parse _${sourceName}.json: ${e.message}`);
    }

    const session = SESSION_DEFAULTS(cleanNew);
    const mainDef = json.definitions?.[0];
    const rt      = mainDef?.plugins?.xwalk?.page?.resourceType || '';

    if (rt.includes('section/v1/section')) {
      session.blockType = 'section-wrapper';
    } else {
      const hasChild = json.definitions?.length > 1 &&
        json.definitions[1]?.plugins?.xwalk?.page?.resourceType?.includes('block/item');
      const mainModel = json.models?.find(m => m.id === mainDef?.id);
      const hasTabs   = mainModel?.fields?.some(f => f.component === 'tab');
      if (hasChild && hasTabs)    session.blockType = 'container-tabs';
      else if (hasChild)          session.blockType = 'container';
      else if (hasTabs)           session.blockType = 'simple-tabs';
      else                        session.blockType = 'simple';
    }

    // Parse parent fields
    const mainModel = json.models?.find(m => m.id === mainDef?.id);
    if (mainModel?.fields) {
      session.parentFields = mainModel.fields
        .filter(f => f.component !== 'tab' && f.name !== 'classes')
        .map(f => ({
          name: f.name, label: f.label, type: f.component,
          required: f.required, options: f.options,
          defaultValue: f.value !== undefined ? String(f.value) : undefined,
          min: f.min, max: f.max, condition: f.condition,
        }));
    }

    // Parse child
    if (json.definitions?.length > 1) {
      const childDef   = json.definitions[1];
      session.childName = childDef.id;
      const childModel  = json.models?.find(m => m.id === childDef.id);
      if (childModel?.fields) {
        session.childFields = childModel.fields.map(f => ({
          name: f.name, label: f.label, type: f.component,
          required: f.required, options: f.options,
        }));
      }
    }

    saveSession(session);
    return txt(
      `✔ Cloned "${sourceName}" → "${cleanNew}"\n\n` +
      sessionSummary(session) + '\n\n' +
      `Add, remove or modify fields as needed, then call generate_block.`
    );
  }
);

// ── 16. validate_block ────────────────────────────────────────────────────
server.tool('validate_block',
  `Audit an existing block's JSON for issues.
   Checks: resourceType, :items, orphan models, broken filter references, broken conditions.`,
  { name: z.string() },
  async ({ name }) => {
    const jsonPath = path.join(EDS_PROJECT, 'blocks', name, `_${name}.json`);
    if (!fs.existsSync(jsonPath)) return txt(`_${name}.json not found.`);

    let json;
    try { json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); }
    catch (e) { return txt(`Could not parse _${name}.json: ${e.message}`); }

    const issues = validateExistingBlock(json);
    if (!issues.length) return txt(`✔ "${name}" is valid — no issues found.`);
    return txt(`⚠ "${name}" has ${issues.length} issue(s):\n\n` + issues.map((i,n) => `  ${n+1}. ${i}`).join('\n'));
  }
);

// ── Utility tools ──────────────────────────────────────────────────────────
function run(cmd) { return execSync(cmd, { cwd: EDS_PROJECT, encoding: 'utf8' }); }

server.tool('list_blocks', 'List all blocks with file status',{},
  async () => { try { return txt(run('npx aem-eds-cli list')); } catch(e) { return txt('Error: '+e.message); } }
);

server.tool('remove_block', 'Remove an existing block', { name: z.string() },
  async ({name}) => { try { return txt(run(`npx aem-eds-cli remove ${name}`)); } catch(e) { return txt('Error: '+e.message); } }
);

server.tool('read_block_json', 'Read _blockname.json of an existing block', { name: z.string() },
  async ({name}) => {
    const p = path.join(EDS_PROJECT,'blocks',name,`_${name}.json`);
    return fs.existsSync(p) ? txt(fs.readFileSync(p,'utf8')) : txt(`_${name}.json not found`);
  }
);

server.tool('read_component_filters', 'Read component-filters.json', {},
  async () => {
    const p = path.join(EDS_PROJECT,'component-filters.json');
    return fs.existsSync(p) ? txt(fs.readFileSync(p,'utf8')) : txt('component-filters.json not found');
  }
);

server.tool('add_to_section_filter', 'Add block to section filter in component-filters.json', { name: z.string() },
  async ({name}) => {
    const p = path.join(EDS_PROJECT,'component-filters.json');
    if (!fs.existsSync(p)) return txt('component-filters.json not found');
    try {
      const json = JSON.parse(fs.readFileSync(p,'utf8'));
      const sec  = json.find(f => f.id==='section');
      if (!sec) return txt('No section entry found');
      if (sec.components.includes(name)) return txt(`"${name}" already in section filter`);
      sec.components.push(name);
      writeAtomic(p, JSON.stringify(json,null,2)+'\n');
      return txt(`✔ Added "${name}" to section filter`);
    } catch(e) { return txt('Error: '+e.message); }
  }
);

// ── Start ─────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main();