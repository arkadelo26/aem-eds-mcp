# aem-eds-mcp 

> MCP server for AEM Edge Delivery Services block scaffolding.  
> Connects to GitHub Copilot and Claude Code for conversational block creation.

---

## Installation

### 1. Install in your EDS project

```bash
# Add to .vscode/mcp.json in your EDS project root
```

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

### 2. Enable in VS Code

```
Settings → search "mcp" → enable chat.mcp.enabled
VS Code 1.99+ required
Copilot Chat → Agent mode (Auto)
```

### 3. Verify connection

```
MCP: aem-eds → Running → Discovered 26 tools
```

### 4. Add AGENTS.md rules (required)

Add to your project `AGENTS.md`:

```markdown
## AEM EDS Block Rules

NEVER directly edit block files or component JSON files.
ALWAYS use MCP session tools → generate_block.

For new blocks:   init_block → add fields → generate_block
For existing:     clone_block → modify → generate_block
For conditions:   add_condition → confirm_condition
For filters:      add_to_section_filter only
```

---

## Why use this instead of Copilot directly?

Copilot alone gets these wrong silently:

| Rule | Wrong (Copilot guess) | Correct (MCP generates) |
|---|---|---|
| Child resourceType | `block/v1/block` | `block/v1/block/item` |
| Number field min/max | Inside `validation` | Top-level |
| Text maxLength | Top-level | Inside `validation` |
| Condition syntax | Invented format | JSONLogic `===` / `or` |
| `:items` in template | Present → 409 JCR error | Never generated |
| JS variables | All declared → ESLint fail | Comment hints only |

---

## Block Types Reference

```
1. simple           Fixed fields only          → hero, banner, teaser
2. simple-tabs      Fixed fields + UE tabs     → profile, settings
3. container        Repeating child items      → carousel, accordion, cards
4. container-tabs   Tabbed config + children   → product showcase, investor hub
5. section-wrapper  Full tab panel sections    → content tabs, energy hub
```

---

## Prompt Patterns

> All prompts follow the same format.  
> Copy, fill in the `[ ]` parts, paste into Copilot Chat.

---

## Pattern 1 — Simple Block

**Use when:** Fixed fields, no repeating items. Hero, banner, teaser, stat block.

```
Create a block called [block-name].

Fixed fields:
- [fieldName]: [type]. [label]. [optional: required / default: value / max: N]
- [fieldName]: [type]. [label].

Do NOT create files directly.
Use init_block, then add_parent_field for each field.
Call preview_session before generate_block.
```

**Example:**

```
Create a block called page-hero.

Fixed fields:
- eyebrow: text. Eyebrow Text.
- heading: text. Main Heading. required. max: 80
- description: richtext. Description.
- ctaLabel: text. CTA Button Label.
- ctaUrl: aem-content. CTA URL. rootPath: /content/tatapower
- backgroundImage: reference. Background Image.
- theme: select. Theme. options: Light (light), Dark (dark). default: light

Do NOT create files directly.
Use init_block, then add_parent_field for each field.
Call preview_session before generate_block.
```

**Generated files:**
```
blocks/page-hero/
  page-hero.js   ← ESLint-safe decorate() stub
  page-hero.css  ← .page-hero { display: block; }
  _page-hero.json
  README.md
```

---

## Pattern 2 — Simple Block with Tabs

**Use when:** Fixed fields grouped into UE Properties panel tabs. Profile, settings, employee.

```
Create a block called [block-name] with [N] tabs.

Tab 1 — [Tab Label]:
- [fieldName]: [type]. [label].
- [fieldName]: [type]. [label].

Tab 2 — [Tab Label]:
- [fieldName]: [type]. [label].
- [fieldName]: [type]. [label].

Do NOT create files directly.
Use init_block with type simple-tabs, add_parent_field for each field,
then add_tab_group for each tab.
Call preview_session before generate_block.
```

**Example:**

```
Create a block called employee-profile with 3 tabs.

Tab 1 — Personal:
- photo: reference. Profile Photo. required.
- fullName: text. Full Name. required. max: 60
- age: number. Age. min: 18. max: 65
- gender: radio-group. Gender. options: Male (male), Female (female), Other (other)

Tab 2 — Professional:
- department: select. Department. options: Engineering (eng), Sales (sales), Finance (finance)
- designation: text. Designation. required.
- experience: number. Years of Experience. min: 0. max: 45. default: 0
- skills: checkbox-group. Skills. options: Leadership (leadership), Technical (technical)

Tab 3 — Social:
- linkedIn: aem-content. LinkedIn URL. rootPath: /content/tatapower/people
- showContact: boolean. Show Contact Info. default: true

Do NOT create files directly.
Use init_block with type simple-tabs, add_parent_field for each field,
then add_tab_group for each tab.
Call preview_session before generate_block.
```

---

## Pattern 3 — Container Block

**Use when:** Repeating child items. Carousel, cards, accordion, team, news feed.

```
Create a block called [block-name].
It has repeating [child-item-name] items.

Parent config fields:
- [fieldName]: [type]. [label]. [options if select]
- [fieldName]: [type]. [label].

Child item name: [child-item-name]
Child fields:
- [fieldName]: [type]. [label]. [required?]
- [fieldName]: [type]. [label].

Do NOT create files directly.
Use init_block, add_parent_field for config,
set_child, add_child_field for each child field.
Call preview_session before generate_block.
```

**Example:**

```
Create a block called news-cards.
It has repeating news-card items.

Parent config fields:
- layoutVariant: select. Layout. options: Grid (grid), List (list). default: grid
- showDate: boolean. Show Published Date. default: true

Child item name: news-card
Child fields:
- thumbnail: reference. Thumbnail Image. required.
- articleTitle: text. Article Title. required. max: 120
- author: text. Author Name. required.
- publishedDate: text. Published Date. description: e.g. 15 Jan 2025
- category: aem-tag. Category.
- excerpt: textarea. Excerpt. max: 200
- readMoreUrl: aem-content. Read More URL. rootPath: /content/tatapower/news

Do NOT create files directly.
Use init_block, add_parent_field for config,
set_child, add_child_field for each child field.
Call preview_session before generate_block.
```

---

## Pattern 4 — Container with Tabs

**Use when:** Tabbed parent config + repeating children. Product showcase, investor hub.

```
Create a block called [block-name].
It has tabbed parent config and repeating [child-name] items.

Tab 1 — [Tab Label]:
- [fieldName]: [type]. [label].

Tab 2 — [Tab Label]:
- [fieldName]: [type]. [label].

Child item name: [child-name]
Child fields:
- [fieldName]: [type]. [label].

Do NOT create files directly.
Use init_block with type container-tabs, add_parent_field for all fields,
add_tab_group for each tab, set_child, add_child_field for each child field.
Call preview_session before generate_block.
```

**Example:**

```
Create a block called solution-showcase.
It has tabbed parent config and repeating solution-item items.

Tab 1 — Layout:
- layoutStyle: select. Layout Style. options: Grid (grid), Carousel (carousel), List (list). default: grid
- columns: number. Columns. min: 1. max: 4. default: 3

Tab 2 — Animation:
- animationType: select. Animation. options: None (none), Fade (fade), Slide (slide). default: none
- animationDelay: number. Delay (ms). min: 0. max: 2000. step: 100. default: 0

Child item name: solution-item
Child fields:
- solutionImage: reference. Solution Image. required.
- solutionTitle: text. Title. required. max: 80
- shortDesc: textarea. Short Description. max: 160
- ctaUrl: aem-content. CTA URL. rootPath: /content/tatapower/solutions

Do NOT create files directly.
Use init_block with type container-tabs, add_parent_field for all fields,
add_tab_group for each tab, set_child, add_child_field for each child field.
Call preview_session before generate_block.
```

---

## Pattern 5 — Section Wrapper (Tab Panel)

**Use when:** Full-section tabs where each tab contains other blocks. Content tabs, energy hub.

```
Create a block called [block-name] as a section wrapper / tab panel.

Tab label field: [label-field-name]. required.
  description: [hint for authors e.g. "Solar Energy, Wind Power"]

Companion navigation block: [companion-name]
Companion fields:
- [fieldName]: [type]. [label]. options: [...]

Allow these blocks inside each tab:
[block1], [block2], [block3], [block4]

Do NOT create files directly.
Use init_block with type section-wrapper,
set companion name and fields, set filterComponents.
Call preview_session before generate_block.
```

**Example:**

```
Create a block called energy-hub as a section wrapper / tab panel.

Tab label field: section-label. required.
  description: e.g. Solar Energy, Wind Power, Hydroelectric
  customErrorMsg: Please enter a label for this energy section

Companion navigation block: energy-nav
Companion fields:
- navPosition: select. Navigation Position. options: Top (top), Left (left), Bottom (bottom). default: top
- navStyle: select. Navigation Style. options: Pill (pill), Underline (underline). default: underline
- stickyNav: boolean. Sticky Navigation. default: false

Allow these blocks inside each tab:
hero, banner, cards, carousel, news-cards, solar-faq

Do NOT create files directly.
Use init_block with type section-wrapper,
set companion name and fields, set filterComponents.
Call preview_session before generate_block.
```

---

## Pattern 6 — Conditional Fields

**Use when:** A field should only show in UE when another field has a specific value.

```
[after defining fields above]

Conditional fields:
- [targetField] only shows when [controllingField] is [value]
- [targetField] only shows when [controllingField] is [value1] OR [value2]
- [targetField] shows for everything EXCEPT [value]
- [targetField] shows when [fieldA] is [value1] AND [fieldB] is [value2]

Confirm each condition before applying.
```

### Operator quick reference

```
=== one value      "autoplay shows when layoutVariant is carousel"
or  multiple       "autoplay shows when layoutVariant is carousel OR side-carousel"
!== not equal      "autoplay shows for everything EXCEPT list"
and two fields     "downloadBtn shows when mediaType is image AND allowDownload is true"
```

**Example — carousel with conditions:**

```
Create a block called mycarousel.
It has repeating mycarousel-item items.

Parent config fields:
- layoutVariant: select. Layout. options: Carousel Peek (carousel-peek), Carousel Side (carousel-side), Grid (grid). default: carousel-peek
- autoplay: boolean. Autoplay. default: false
- interval: number. Interval (seconds). min: 1. max: 20. default: 5
- pauseOnHover: boolean. Pause on Hover. default: true
- infiniteLoop: boolean. Infinite Loop. default: false
- sectionTitle: text. Section Title.
- sectionContent: richtext. Section Content.
- backgroundImage: reference. Background Image.

Child item name: mycarousel-item
Child fields:
- media: reference. Media (Image or Video). required.
- mediaType: select. Media Type. options: Image (image), Video (video). default: image
- caption: text. Caption.
- description: richtext. Description.
- ctaLabel: text. CTA Label.
- ctaUrl: aem-content. CTA URL. rootPath: /content/tatapower

Conditional fields:
- autoplay only shows when layoutVariant is carousel-peek OR carousel-side
- interval only shows when autoplay is true
- pauseOnHover only shows when autoplay is true
- infiniteLoop only shows when layoutVariant is carousel-peek OR carousel-side

Confirm each condition before applying.
Do NOT create files directly.
Call preview_session before generate_block.
```

**Example — media block with !== and AND:**

```
Create a block called media-feature.

Fixed fields:
- mediaType: select. Media Type. options: Image (image), Video (video), YouTube (youtube). default: image
- image: reference. Image.
- videoUrl: aem-content. Video URL.
- youtubeId: text. YouTube Video ID. description: e.g. dQw4w9WgXcQ
- allowDownload: boolean. Allow Download. default: false
- downloadLabel: text. Download Button Label.
- caption: text. Caption.

Conditional fields:
- image only shows when mediaType is image
- videoUrl only shows when mediaType is video
- youtubeId only shows when mediaType is youtube
- allowDownload only shows when mediaType is image
- downloadLabel shows when mediaType is image AND allowDownload is true

Confirm each condition before applying.
Do NOT create files directly.
Call preview_session before generate_block.
```

---

## Pattern 7 — Variants

**Use when:** Block needs different visual styles authors can choose (CSS class applied).

```
[after defining fields above]

Variants:
- [Display Name] ([css-value])
- [Display Name] ([css-value])
```

**Example:**

```
Create a block called promo-banner.

Fixed fields:
- heading: text. Heading. required. max: 80
- description: richtext. Description.
- ctaUrl: aem-content. CTA URL.

Variants:
- Dark (dark)
- Light (light)
- Gradient (gradient)
- Full Width (full-width)

Do NOT create files directly.
Call preview_session before generate_block.
```

---

## Pattern 8 — Presets

**Use when:** Standard blocks with a well-known field set. Fastest way to start.

```
Use the [preset-name] preset for a new block called [block-name].
[optional: add / remove / change any fields]
```

**Available presets:**

| Preset | Type | Pre-loaded fields |
|---|---|---|
| `carousel` | container | interval, autoplay, pauseOnHover + slide: image, caption, ctaLabel, ctaUrl |
| `hero` | simple | eyebrow, heading, description, ctaLabel, ctaUrl, image |
| `accordion` | container | item: question (required), answer (required) |
| `faq` | container | title, theme + item: question, answer, category |
| `cards` | container | layoutVariant, autoplay, infiniteLoop (with conditions) + card: image, title, description, ctaLabel, ctaUrl |
| `banner` | simple | heading, description, backgroundImage, ctaLabel, ctaUrl, theme |
| `teaser` | simple | image, heading, description, ctaLabel, ctaUrl |

**Example:**

```
Use the cards preset for a new block called product-cards.
Add a price field (text) to each child card.
Remove the sectionContent parent field.
```

---

## Pattern 9 — Clone Existing Block

**Use when:** New block is similar to an existing one. Fastest modification path.

```
Create a block called [new-name] based on [existing-block-name].
[list changes: add field X, remove field Y, change type of Z]
```

**Example:**

```
Create a block called news-cards based on my existing cards block.
Add a publishedDate field (text) to each child card.
Remove the sectionContent and backgroundImage parent fields.
Change the child description field to textarea instead of richtext.
```

---

## Pattern 10 — Mid-Session Changes

**Use when:** You change your mind during block creation.

```
[in Copilot Chat, continuing the same session]

"Actually remove the [fieldName] field"
"Wait, change [fieldName] to [newType] instead"
"Undo that last change"
"Add [fieldName] as [type]"
"The condition on [fieldName] is wrong, change it to [correction]"
```

**Examples:**

```
Remove the backgroundImage field
```
```
Undo that last field
```
```
The autoplay condition is wrong — it should show for
carousel-peek and carousel-side, not just carousel
```
```
Add a badge field as select with options:
New (new), Sale (sale), Featured (featured)
```

---

## Pattern 11 — Validate Existing Block

**Use when:** You have an older block and want to check it for UE issues.

```
Validate the [block-name] block JSON for issues
```

**What it checks:**
- Correct `resourceType` strings
- No `:items` in template (causes 409 JCR conflicts)
- All models have matching definitions
- All filter components have definitions
- Conditions reference existing fields

---

## Pattern 12 — Utility Commands

```
List all blocks in this project
```
```
Remove the [block-name] block
```
```
Show me the JSON for the [block-name] block
```
```
What blocks are in the section filter?
```
```
Add [block-name] to the section filter
```
```
What sessions are currently in progress?
```
```
Discard the [block-name] session
```
```
Show me the safety rules
```

---

## Field Types Reference

```
Text input:
  text              Single line plain text
  textarea          Multi-line plain text
  richtext          WYSIWYG rich text editor

Media & Links:
  reference         DAM asset picker (image/video/PDF)
  aem-content       Page / link picker  [supports rootPath]
  aem-content-fragment  Content Fragment picker  [supports rootPath]
  aem-experience-fragment  Experience Fragment picker

Toggle & Selection:
  boolean           On/off toggle  [default: true or false]
  select            Single dropdown  [requires options]
  multiselect       Multi-select dropdown  [requires options]
  radio-group       Radio buttons  [requires options]
  checkbox-group    Checkboxes  [requires options]

Special:
  number            Numeric input  [min, max, step go top-level]
  aem-tag           cq:tags picker
```

---

## Validation Rules Reference

```
All field types:
  required          Field must be filled
  readOnly          Field shown but cannot be edited
  hidden            Field hidden in properties panel
  description       Helper text shown below field

text / textarea:
  max: N            → goes inside validation.maxLength
  min: N            → goes inside validation.minLength

number:
  min: N            → goes TOP-LEVEL (not in validation)
  max: N            → goes TOP-LEVEL (not in validation)
  step: N           → goes TOP-LEVEL

aem-content / aem-content-fragment:
  rootPath: /path   → goes inside validation.rootPath

boolean:
  customErrorMsg    → goes inside validation.customErrorMsg
```

---

## Condition Rules Reference

```
Who can control conditions:
  ✔  select
  ✔  radio-group
  ✔  boolean

  ✖  text  textarea  richtext  number  reference  aem-content  aem-tag
     (these cannot control other fields)

Operators:
  ===   field shows for EXACTLY ONE value
  or    field shows for ANY OF multiple values
  !==   field shows for EVERYTHING EXCEPT one value
  and   TWO different fields must both match

Boolean values must be "true" or "false" (not yes/no/on/off)
Values must match option values exactly (not display names)
```

---

## Generated Files Reference

Every `generate_block` creates 4 files:

```
blocks/[name]/
  [name].js         ESLint-safe decorate() stub with JSDoc field reference
  [name].css        .blockname { display: block; }
  _[name].json      definitions + models + filters (correct UE schema)
  README.md         Field table, conditions, content tree, authoring steps
```

After generating — always run:

```bash
npm run build:json
git add .
git commit -m "feat: [block-name] block"
git push
```

Then add to section filter if needed:

```
Add [block-name] to the section filter
```

---

## Protected Files

These files are **never edited directly** — MCP tools manage them safely:

```
component-definition.json    ← managed by npm run build:json
component-filters.json       ← managed by add_to_section_filter tool only
component-models.json        ← managed by npm run build:json
models/_section.json         ← auto-updated by generate_block for section wrappers
blocks/*/  *.js *.css *.json ← managed by generate_block tool only
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Block not in UE picker | Wrong resourceType | Regenerate with MCP — never edit manually |
| Can't add child items | child uses `block/v1/block` not `block/v1/block/item` | Regenerate with MCP |
| 409 JCR conflict on save | `:items` in template | Run `validate_block [name]` to confirm, regenerate |
| Condition not working | Wrong JSONLogic syntax | Use `update_condition` tool not file edit |
| Commit blocked by ESLint | `no-unused-vars` in generated JS | Update aem-eds-mcp to v2.1 |
| Session lost after restart | VS Code crash | Sessions auto-persist to `.block-session.json` |
| Wrong condition values | Copilot inferred wrong | Always confirm condition before applying |
| Section wrapper not in tabs | `_section.json` not updated | Regenerate — tool auto-updates it |

---

## Session Lifecycle

```
init_block          ← always first — creates session
  ↓
set_block_type      ← if not already set
  ↓
add_parent_field    ← one call per field
  ↓
add_tab_group       ← for simple-tabs / container-tabs only
  ↓
set_child           ← for container / container-tabs only
  ↓
add_child_field     ← one call per child field
  ↓
add_variant         ← optional — for layout variants
  ↓
add_condition       ← adds to pending state
  ↓
confirm_condition   ← user confirms values → applied
  ↓
preview_session     ← always before generate
  ↓
generate_block      ← writes all 4 files
```

Sessions persist for **24 hours**.  
To resume: `"What sessions are in progress?"`  
To cancel: `"Discard the [name] session"`  
To undo: `"Undo that last change"`

---

## Claude Code Setup

```bash
claude mcp add aem-eds --scope project -- npx -y aem-eds-mcp .
git add .claude.json
git commit -m "feat: aem-eds MCP"
git push
```

---

*aem-eds-mcp v2.1 | 26 tools | Zero ESLint errors | Tested on Tata Power EDS*

---

## AGENTS.md

Add this file to your EDS project root as `AGENTS.md`.
It tells Copilot and Claude Code exactly how to behave with MCP tools.

```markdown
# AEM EDS Block Development Rules

This file governs how AI assistants (GitHub Copilot, Claude Code)
create and modify blocks in this AEM Edge Delivery Services project.

---

## MCP Server

The `aem-eds` MCP server (aem-eds-mcp v2.1) is connected to this project.
It provides 26 tools for safe block scaffolding.

Always check: MCP: aem-eds → Running → 26 tools discovered

---

## FORBIDDEN — Never do these

NEVER write or edit any file inside blocks/
NEVER write or edit component-definition.json
NEVER write or edit component-filters.json
NEVER write or edit component-models.json
NEVER write or edit models/_section.json
NEVER write or edit _blockname.json directly
NEVER write or edit blockname.js directly
NEVER write or edit blockname.css directly
NEVER use file creation tools to create block files
NEVER call read_existing_block_for_reference and then edit the file
NEVER apply a condition without calling confirm_condition first
NEVER call generate_block without calling preview_session first

Direct file editing produces broken JSON that fails silently in
Universal Editor. The MCP tools guarantee correct schema every time.

---

## REQUIRED — Always do these

### Creating a new block

1. init_block("block-name")
2. set_block_type("block-name", "simple|container|simple-tabs|container-tabs|section-wrapper")
3. add_parent_field()    — one call per parent field
4. add_tab_group()       — for simple-tabs and container-tabs only
5. set_child()           — for container and container-tabs only
6. add_child_field()     — one call per child field
7. add_variant()         — if layout variants needed
8. add_condition()       — for conditional fields
9. confirm_condition()   — MUST confirm each condition with user
10. preview_session()    — ALWAYS before generate
11. generate_block()     — writes all files safely
12. add_to_section_filter("block-name") — run after generate

### Modifying an existing block

1. clone_block("existing-name", "new-name-or-same-name")
2. Make changes using add/remove field tools
3. preview_session()
4. generate_block()

### Fixing a wrong condition

1. update_condition()   — NOT direct file edit
2. confirm_condition()  — user confirms new values

---

## Tool Reference

### Session tools
init_block                 Start a new block session
set_block_type             Set type: simple / simple-tabs / container / container-tabs / section-wrapper
add_parent_field           Add one parent field
add_tab_group              Group parent fields into UE Properties panel tabs
set_child                  Set child item name for container blocks
add_child_field            Add one child field
add_variant                Add a layout variant option

### Condition tools
add_condition              Add conditional rule → goes to PENDING state
confirm_condition          Apply pending condition after user confirms values
update_condition           Replace wrong condition → goes to PENDING state

### Session management
remove_field               Remove a field (cascade-checks conditions)
preview_session            Show full block spec before generating
undo_last_action           Undo last mutation (history max 20)
list_sessions              List all in-progress sessions
discard_session            Cancel and delete a session

### Generate tools
generate_block             Write all 4 files (validates JSON, atomic writes)
clone_block                Create session from existing block JSON
validate_block             Audit existing block for schema issues

### Read-only tools (NEVER edit after reading)
read_existing_block_for_reference   Read _blockname.json — reference only
read_component_filters              Read component-filters.json — reference only
read_component_definition           Read component-definition.json — reference only
read_component_models               Read component-models.json — reference only

### Safe update tools
add_to_section_filter      Only safe way to update component-filters.json

### Utility tools
list_blocks                List all blocks in the project
remove_block               Delete a block and its files
get_safety_rules           Returns complete forbidden/required list

---

## Condition Rules

Who can control conditions:
  ✔ select, radio-group, boolean
  ✖ text, textarea, richtext, number, reference, aem-content, aem-tag

Operators:
  ===    shows for EXACTLY ONE value
  or     shows for ANY OF multiple values
  !==    shows for everything EXCEPT one value
  and    TWO different fields must BOTH match

Boolean values: "true" or "false" only (not yes/no/on/off)
Values must match option values not display names

Confirmation flow (mandatory):
  add_condition() → returns PENDING → user confirms → confirm_condition()
  Never skip confirm_condition.

---

## Field Schema Rules

number:       min, max, step       → TOP-LEVEL
text:         minLength, maxLength → INSIDE validation
aem-content:  rootPath             → INSIDE validation
boolean:      customErrorMsg       → INSIDE validation
all types:    required, readOnly, hidden, description → TOP-LEVEL

NEVER add ":items" to any template — causes 409 JCR conflicts.

---

## Block Type resourceType Strings

parent block:    core/franklin/components/block/v1/block
child item:      core/franklin/components/block/v1/block/item
section wrapper: core/franklin/components/section/v1/section

Wrong resourceType = block never appears in UE picker (no error shown).

---

## After generate_block — always run

Add to section filter:  add_to_section_filter("block-name")
Build JSON:             npm run build:json
Commit:                 git add . && git commit -m "feat: block-name" && git push

---

## Presets

init_block("name", blockType, preset="carousel|hero|accordion|faq|cards|banner|teaser")

---

## Getting Help

"Show me the safety rules"       → get_safety_rules
"What sessions are in progress?" → list_sessions
"Validate the [name] block"      → validate_block
"What blocks exist?"             → list_blocks
```
