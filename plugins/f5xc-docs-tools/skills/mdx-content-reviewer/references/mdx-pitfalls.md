# MDX Syntax Pitfalls

MDX treats file content as JSX. Certain characters that are valid in
plain Markdown cause parse errors in MDX. These rules apply to all
content **outside** fenced code blocks and inline code spans.

## Bare `<` Characters

**Problem:** MDX interprets `<` as the start of a JSX/HTML tag. If
what follows is not a valid tag name, the build fails.

**Correct:**
```mdx
Values less than 100 are ignored.           <!-- prose: no bare < -->
Use `<` in code: `if (x < 10)`             <!-- inline code: OK -->
The `<Aside>` component renders a callout.  <!-- known component: OK -->
```

**Incorrect:**
```mdx
Values < 100 are ignored.                   <!-- bare < in prose -->
The threshold is <50ms.                     <!-- bare < before number -->
```

**Fixes:**
- Use `&lt;` entity: `Values &lt; 100`
- Wrap in inline code: `` Values `< 100` are ignored ``
- Rephrase: `Values below 100 are ignored`

**Exceptions — these are NOT errors:**
- Known component tags: `<Aside>`, `<Screenshot`, `<Code`, `<Steps>`,
  `<CardGrid>`, `<Card>`, `<Tabs>`, `<TabItem>`, `<LinkCard>`,
  `<Badge>`, `<Icon>`, `<FileTree>`, `<Banner>`
- Standard HTML tags: `<br />`, `<hr />`, `<img`, `<a`, `<p>`,
  `<div>`, `<span>`, `<table>`, `<tr>`, `<td>`, `<th>`, `<thead>`,
  `<tbody>`, `<ul>`, `<ol>`, `<li>`, `<em>`, `<strong>`, `<code>`,
  `<pre>`, `<blockquote>`, `<h1>`–`<h6>`, `<script>`
- HTML entities: `&lt;`, `&gt;`, `&amp;`, `&rarr;`, `&larr;`
- Content inside fenced code blocks (` ``` `)
- Content inside inline code spans (`` ` ``)
- Content inside `export const` blocks (JavaScript context)
- Markdown link URLs: `[text](https://example.com)`

## Unescaped Curly Braces

**Problem:** MDX treats `{` and `}` as JSX expression delimiters.
Bare braces in prose cause a "JSX expression expected" error.

**Correct:**
```mdx
The response body is `{"status": "ok"}`.    <!-- inline code: OK -->
Use `\{` to escape braces: \{ and \}        <!-- escaped: OK -->
<Aside type="caution">                      <!-- component attr: OK -->
<Code code={myVariable} lang="js" />        <!-- JSX expression: OK -->
```

**Incorrect:**
```mdx
The JSON format is {"key": "value"}.        <!-- bare braces in prose -->
Set the value to {threshold}.               <!-- bare braces in prose -->
```

**Fixes:**
- Wrap in inline code: `` `{"key": "value"}` ``
- Escape with backslash: `\{"key": "value"\}`
- Move to a fenced code block

**Exceptions — these are NOT errors:**
- Component attributes: `type="caution"`, `code={var}`
- JSX expressions inside component tags
- `export const` statements
- `import` statements
- JSX comments: `{/* comment */}`
- Content inside fenced code blocks
- Content inside inline code spans

## Curly Braces in Filenames

**Problem:** MDX/Astro cannot process files with `{` or `}` in
their filename. The build fails before parsing even begins.

**Rule:** Never use `{` or `}` in `.mdx` filenames.

**Incorrect:** `docs/api-{version}.mdx`
**Correct:** `docs/api-version.mdx`

## Code Fence Tracking

When scanning for the above pitfalls, track code fence state:

1. A line starting with ` ``` ` (three or more backticks) toggles
   the code fence state
2. Inside a code fence, all content is safe — skip all checks
3. On the same line, content between backtick pairs is inline code
   and should be skipped
4. Nested code fences (four backticks containing three) follow
   standard Markdown nesting rules

## Mermaid Blocks

Lines inside ` ```mermaid ` blocks are code and should be skipped.
Mermaid syntax commonly uses `<`, `>`, `{`, `}` for flowchart
node shapes — these are NOT errors.
