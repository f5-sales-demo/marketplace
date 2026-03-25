# AI-Assisted Development Tools

## claude-code

- **Package**: `@anthropic-ai/claude-code` via npm (installed globally)
- **Purpose**: Anthropic's AI coding assistant — agentic CLI for code generation, editing, debugging, and Git operations
- **Use when**: Writing new features, debugging complex issues, refactoring code, navigating unfamiliar codebases, running multi-step development tasks
- **Quick start**:
  - `claude` (interactive REPL)
  - `claude "explain this codebase"`
  - `echo "fix the failing tests" | claude --dangerously-skip-permissions`
- **Auth**: Requires `ANTHROPIC_API_KEY` environment variable
- **Docs**: <https://docs.anthropic.com/en/docs/claude-code>

## pi-coding-agent

- **Package**: `@mariozechner/pi-coding-agent` via npm
- **Purpose**: Lightweight AI coding agent for automated code tasks
- **Use when**: Running automated coding tasks, batch code modifications, scripted AI-assisted development
- **Quick start**:
  - `npx @mariozechner/pi-coding-agent`
  - `npx @mariozechner/pi-coding-agent --help`
  - `npx @mariozechner/pi-coding-agent "refactor the utils module"`
- **Auth**: Requires API key for the configured AI provider
- **Docs**: <https://github.com/nicokosi/pi-coding-agent>

## opencode

- **Package**: `opencode` via manual download
- **Purpose**: Terminal-based AI code assistant built on Aider
- **Use when**: Pair programming with AI in the terminal, making targeted code edits with AI assistance
- **Quick start**:
  - `opencode`
  - `opencode --model claude-3-opus`
  - `opencode "add error handling to the API client"`
- **Auth**: Requires API key for the configured AI provider (e.g., `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`)
- **Docs**: <https://github.com/opencode-ai/opencode>

## neovim with avante.nvim

- **Package**: `neovim` via manual download + `avante.nvim` via lazy.nvim plugin manager
- **Purpose**: AI-assisted editing in Neovim — provides inline code suggestions, chat, and code actions powered by LLMs
- **Use when**: Preferring a Vim-based workflow with AI assistance, getting inline suggestions while editing, asking questions about code in the editor
- **Quick start**:
  - `nvim` (avante.nvim loads automatically if configured)
  - `:AvanteAsk "explain this function"` (in Neovim command mode)
  - `:AvanteChat` (open AI chat panel)
- **Auth**: Requires API key for the configured AI provider set in Neovim config (e.g., `ANTHROPIC_API_KEY`)
- **Docs**: <https://github.com/yetone/avante.nvim>
