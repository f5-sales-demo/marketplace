# tsgo LSP

TypeScript and JavaScript language server plugin for Claude Code, providing code intelligence via [tsgo](https://github.com/microsoft/typescript-go) — Microsoft's native TypeScript compiler/server ported to Go.

## Prerequisites

Install `tsgo` before enabling this plugin:

- **Pre-installed** in the f5xc-salesdemos devcontainer
- **Manual install:** `npm install -g @typescript/native-preview` (provides the `tsgo` binary)

## Features

- TypeScript and JavaScript diagnostics
- Auto-completion for identifiers, imports, and JSX
- Hover type information and signature help
- Go-to-definition, find-references, rename
- JSX / TSX support

## Handled extensions

`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`
