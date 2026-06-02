# Development Tools

Languages, runtimes, compilers, LSP servers, build tools, package managers,
and version managers installed in this devcontainer.

---

## Programming Languages & Runtimes

### node

- **Package**: Node.js v25.8.1 via Homebrew (linuxbrew)
- **Purpose**: JavaScript and TypeScript runtime
- **Use when**: Running JS/TS scripts, building frontend/backend apps, executing npm packages
- **Quick start**:
  - `node script.js` — run a JavaScript file
  - `node -e "console.log('hello')"` — evaluate inline JS
  - `node --inspect app.js` — run with debugger attached
- **Auth**: None
- **Docs**: `man node` or <https://nodejs.org/docs/latest/api/>

### python3.13

- **Package**: python3.13 via apt (Ubuntu)
- **Purpose**: Python 3.13 interpreter with venv support
- **Use when**: Running Python scripts, data analysis, automation, AI/ML tasks
- **Quick start**:
  - `python3.13 script.py` — run a Python file
  - `python3.13 -m venv .venv && source .venv/bin/activate` — create a virtual environment
  - `python3.13 -c "import sys; print(sys.version)"` — check version inline
- **Auth**: None
- **Docs**: `python3.13 --help` or <https://docs.python.org/3.13/>

### go

- **Package**: Go 1.26.1 installed via official tarball to /usr/local/go
- **Purpose**: Go programming language compiler and toolchain
- **Use when**: Building Go applications, compiling binaries, running Go tests
- **Quick start**:
  - `go run main.go` — compile and run a Go file
  - `go build -o myapp .` — compile a binary
  - `go test ./...` — run all tests in the module
- **Auth**: None
- **Docs**: `go help` or <https://go.dev/doc/>

### rustc

- **Package**: Rust 1.94.0 stable toolchain via rustup, includes clippy and rustfmt
- **Purpose**: Rust systems programming language compiler
- **Use when**: Building Rust applications, compiling crates, systems-level programming
- **Quick start**:
  - `cargo new myproject && cd myproject && cargo run` — create and run a new project
  - `rustc --edition 2021 main.rs` — compile a single file
  - `cargo clippy` — run the Rust linter
- **Auth**: None
- **Docs**: `rustc --help` or <https://doc.rust-lang.org/>

### Java

- **Package**: openjdk-25-jdk-headless via apt (OpenJDK 25.0.2)
- **Purpose**: Java Development Kit for compiling and running Java applications
- **Use when**: Compiling Java source, running JARs, building with Maven or Gradle
- **Quick start**:
  - `javac Main.java && java Main` — compile and run a Java file
  - `java -jar app.jar` — run an executable JAR
  - `java --version` — confirm JDK version
- **Auth**: None
- **Docs**: `man java` or <https://docs.oracle.com/en/java/javase/>

### ruby

- **Package**: ruby-full via apt (Ruby 3.2.3)
- **Purpose**: Ruby programming language interpreter
- **Use when**: Running Ruby scripts, Rails development, gem-based tooling
- **Quick start**:
  - `ruby script.rb` — run a Ruby file
  - `ruby -e "puts 'hello'"` — evaluate inline Ruby
  - `irb` — start the interactive Ruby shell
- **Auth**: None
- **Docs**: `ri` or <https://ruby-doc.org/>

### php

- **Package**: php-cli via apt (PHP 8.3.6) with XML and mbstring extensions
- **Purpose**: PHP command-line interpreter
- **Use when**: Running PHP scripts, testing PHP code, CLI-based PHP tools
- **Quick start**:
  - `php script.php` — run a PHP file
  - `php -r "echo 'hello\n';"` — evaluate inline PHP
  - `php -m` — list loaded extensions
- **Auth**: None
- **Docs**: `php --help` or <https://www.php.net/docs.php>

### lua5.4

- **Package**: lua5.4 via apt (Lua 5.4.6), with luarocks package manager
- **Purpose**: Lightweight scripting language
- **Use when**: Writing embedded scripts, configuration files, game scripting, quick automation
- **Quick start**:
  - `lua5.4 script.lua` — run a Lua file
  - `lua5.4 -e "print('hello')"` — evaluate inline Lua
  - `lua5.4 -i` — start the interactive Lua shell
- **Auth**: None
- **Docs**: `man lua5.4` or <https://www.lua.org/manual/5.4/>

### R

- **Package**: r-base via apt (R 4.3.3 "Angel Food Cake")
- **Purpose**: Statistical computing and graphics language
- **Use when**: Statistical analysis, data visualization, running R scripts
- **Quick start**:
  - `Rscript analysis.R` — run an R script
  - `R -e "print(1+1)"` — evaluate inline R
  - `R` — start the interactive R console
- **Auth**: None
- **Docs**: `man R` or <https://www.r-project.org/>

### dart

- **Package**: dart via apt (Dart SDK 3.11.3 stable)
- **Purpose**: Dart programming language for command-line tools and Flutter
- **Use when**: Building Dart CLI apps, running Dart scripts, Flutter development
- **Quick start**:
  - `dart run main.dart` — run a Dart file
  - `dart create myapp` — scaffold a new Dart project
  - `dart compile exe main.dart` — compile to a native executable
- **Auth**: None
- **Docs**: `dart --help` or <https://dart.dev/guides>

### dotnet

- **Package**: dotnet-sdk-9.0 via apt (.NET SDK 9.0.115)
- **Purpose**: .NET SDK for building C#, F#, and VB.NET applications
- **Use when**: Building .NET apps, running C# scripts, NuGet package management
- **Quick start**:
  - `dotnet new console -o myapp && cd myapp && dotnet run` — create and run a console app
  - `dotnet build` — compile the project
  - `dotnet test` — run unit tests
- **Auth**: None
- **Docs**: `dotnet --help` or <https://learn.microsoft.com/dotnet/>

### pwsh

- **Package**: PowerShell 7.6.0 via apt/tarball
- **Purpose**: Cross-platform task automation and configuration management shell
- **Use when**: Running PowerShell scripts, managing Windows-oriented infrastructure from Linux, Azure automation
- **Quick start**:
  - `pwsh -File script.ps1` — run a PowerShell script
  - `pwsh -Command "Get-Process"` — execute a single command
  - `pwsh` — start an interactive PowerShell session
- **Auth**: None
- **Docs**: `pwsh -Help` or <https://learn.microsoft.com/powershell/>

### perl

- **Package**: Perl 5.38.2 via base image, cpanminus added
- **Purpose**: Text processing and general-purpose scripting language
- **Use when**: Text manipulation, regex-heavy processing, legacy script maintenance, CPAN modules
- **Quick start**:
  - `perl script.pl` — run a Perl file
  - `perl -e 'print "hello\n"'` — evaluate inline Perl
  - `perl -pe 's/foo/bar/g' file.txt` — regular expression replacement on a file
- **Auth**: None
- **Docs**: `perldoc perl` or <https://perldoc.perl.org/>

### bun

- **Package**: Bun 1.3.11 via manual install
- **Purpose**: Fast JavaScript runtime, bundler, transpiler, and package manager
- **Use when**: Fast JS/TS execution, when you need a faster alternative to Node.js, bundling
- **Quick start**:
  - `bun run script.ts` — run a TypeScript file directly (no compile step)
  - `bun install` — install dependencies from package.json
  - `bun build src/index.ts --outdir ./dist` — bundle for production
- **Auth**: None
- **Docs**: `bun --help` or <https://bun.sh/docs>

---

## Build Tools

### mvn

- **Package**: Apache Maven 3.9.14 via manual download to /opt/maven
- **Purpose**: Java project build tool and dependency manager
- **Use when**: Building Java/JVM projects, managing dependencies, running lifecycle phases
- **Quick start**:
  - `mvn clean install` — build and install the project
  - `mvn test` — run unit tests
  - `mvn dependency:tree` — display the dependency tree
- **Auth**: None (Maven Central is public; private repos may need settings.xml credentials)
- **Docs**: `mvn --help` or <https://maven.apache.org/guides/>

### gradle

- **Package**: Gradle 9.4.1 via manual download
- **Purpose**: Build automation for Java, Kotlin, Groovy, and polyglot projects
- **Use when**: Building Gradle-based projects, Android builds, multi-module JVM projects
- **Quick start**:
  - `gradle build` — compile and test the project
  - `gradle tasks` — list available tasks
  - `gradle init` — scaffold a new Gradle project
- **Auth**: None
- **Docs**: `gradle --help` or <https://docs.gradle.org/>

### make

- **Package**: GNU Make 4.3 via build-essential (apt)
- **Purpose**: Classic build automation using Makefiles
- **Use when**: Running Makefile targets, building C/C++ projects, task automation via Makefile
- **Quick start**:
  - `make` — run the default target
  - `make clean` — run the clean target
  - `make -j$(nproc)` — parallel build using all CPU cores
- **Auth**: None
- **Docs**: `man make` or <https://www.gnu.org/software/make/manual/>

---

## Language Servers (LSP)

### gopls

- **Package**: gopls v0.21.1 via `go install golang.org/x/tools/gopls@latest`
- **Purpose**: Official Go language server for editor integration
- **Use when**: Editing Go code in an LSP-compatible editor, needing autocompletion, diagnostics, refactoring
- **Quick start**:
  - `gopls serve` — start the language server on stdin/stdout
  - `gopls version` — check installed version
  - `gopls references ./main.go:10:5` — find references at a position
- **Auth**: None
- **Docs**: <https://pkg.go.dev/golang.org/x/tools/gopls>

### typescript-language-server

- **Package**: typescript-language-server v5.1.3 via npm (global)
- **Purpose**: TypeScript and JavaScript language server wrapping tsserver
- **Use when**: Editing TypeScript or JavaScript in an LSP-compatible editor
- **Quick start**:
  - `typescript-language-server --stdio` — start the server on stdin/stdout
  - `typescript-language-server --version` — check installed version
- **Auth**: None
- **Docs**: <https://github.com/typescript-language-server/typescript-language-server>

### pyright

- **Package**: pyright v1.1.408 via npm (global)
- **Purpose**: Python static type checker and language server
- **Use when**: Editing Python code with type checking, LSP integration for Python
- **Quick start**:
  - `pyright .` — type-check the current directory
  - `pyright --watch` — type-check in watch mode
  - `pyright --outputjson` — output diagnostics as JSON
- **Auth**: None
- **Docs**: <https://github.com/microsoft/pyright>

### bash-language-server

- **Package**: bash-language-server v5.6.0 via npm (global)
- **Purpose**: Bash/shell script language server
- **Use when**: Editing Bash or shell scripts in an LSP-compatible editor
- **Quick start**:
  - `bash-language-server start` — start the server on stdin/stdout
  - `bash-language-server --version` — check installed version
- **Auth**: None
- **Docs**: <https://github.com/bash-lsp/bash-language-server>

### yaml-language-server

- **Package**: yaml-language-server v1.21.0 via npm (global)
- **Purpose**: YAML language server with schema validation
- **Use when**: Editing YAML files, validating against JSON schemas, Kubernetes manifests
- **Quick start**:
  - `yaml-language-server --stdio` — start the server on stdin/stdout
  - `yaml-language-server --version` — check installed version
- **Auth**: None
- **Docs**: <https://github.com/redhat-developer/yaml-language-server>

### mdx-language-server

- **Package**: @mdx-js/language-server via npm (global)
- **Purpose**: MDX language server for editing MDX (Markdown + JSX) files
- **Use when**: Editing MDX documentation, Astro/Next.js content files
- **Quick start**:
  - `mdx-language-server --stdio` — start the server on stdin/stdout
- **Auth**: None
- **Docs**: <https://github.com/mdx-js/mdx-analyzer>

### vscode-langservers-extracted

- **Package**: vscode-langservers-extracted via npm (global)
- **Purpose**: JSON, HTML, CSS, ESLint, and Markdown language servers extracted from Visual Studio Code
- **Use when**: Editing JSON, HTML, CSS, or Markdown in an LSP-compatible editor
- **Quick start**:
  - `vscode-json-language-server --stdio` — start JSON LSP
  - `vscode-html-language-server --stdio` — start HTML LSP
  - `vscode-css-language-server --stdio` — start CSS LSP
- **Auth**: None
- **Docs**: <https://github.com/hrsh7th/vscode-langservers-extracted>

### marksman

- **Package**: marksman via manual download (2026-02-08 build)
- **Purpose**: Markdown language server with cross-file link support
- **Use when**: Editing Markdown with wiki-links, references, and headings across files
- **Quick start**:
  - `marksman server` — start the language server on stdin/stdout
  - `marksman --version` — check installed version
- **Auth**: None
- **Docs**: <https://github.com/artempyanykh/marksman>

### terraform-ls

- **Package**: terraform-ls v0.38.5 via manual download
- **Purpose**: Official Terraform language server from HashiCorp
- **Use when**: Editing Terraform HCL files, needing autocompletion and diagnostics for providers
- **Quick start**:
  - `terraform-ls serve` — start the language server on stdin/stdout
  - `terraform-ls version` — check installed version
- **Auth**: None
- **Docs**: <https://github.com/hashicorp/terraform-ls>

### taplo

- **Package**: taplo v0.10.0 via manual download
- **Purpose**: TOML language server, formatter, and validator
- **Use when**: Editing TOML configuration files (Cargo.toml, pyproject.toml, etc.)
- **Quick start**:
  - `taplo lsp stdio` — start the language server on stdin/stdout
  - `taplo format Cargo.toml` — format a TOML file
  - `taplo lint Cargo.toml` — validate a TOML file
- **Auth**: None
- **Docs**: <https://taplo.tamasfe.dev/>

---

## Package Managers

### npm

- **Package**: npm v11.11.0 bundled with Node.js (Homebrew)
- **Purpose**: Node.js package manager for JavaScript and TypeScript dependencies
- **Use when**: Installing JS/TS packages, running package scripts, managing package.json
- **Quick start**:
  - `npm install` — install dependencies from package.json
  - `npm run build` — run the build script
  - `npm init -y` — create a new package.json
- **Auth**: None for public registry; `npm login` for private packages
- **Docs**: `npm help` or <https://docs.npmjs.com/>

### pip

- **Package**: pip 26.0.1 bundled with Python 3.13
- **Purpose**: Python package installer
- **Use when**: Installing Python packages from PyPI
- **Quick start**:
  - `pip install requests` — install a package
  - `pip install -r requirements.txt` — install from requirements file
  - `pip list` — list installed packages
- **Auth**: None for public PyPI; token needed for private indices
- **Docs**: `pip help` or <https://pip.pypa.io/>

### uv

- **Package**: uv v0.11.0 via standalone installer
- **Purpose**: Extremely fast Python package installer and resolver (Rust-based pip replacement)
- **Use when**: Installing Python packages faster than pip, resolving dependencies, managing venvs
- **Quick start**:
  - `uv pip install requests` — install a package (10-100x faster than pip)
  - `uv venv .venv` — create a virtual environment
  - `uv pip compile requirements.in -o requirements.txt` — lock dependencies
- **Auth**: None
- **Docs**: `uv --help` or <https://docs.astral.sh/uv/>

### cargo

- **Package**: cargo 1.94.0 bundled with Rust toolchain
- **Purpose**: Rust package manager and build tool
- **Use when**: Managing Rust crate dependencies, building Rust projects
- **Quick start**:
  - `cargo add serde` — add a dependency
  - `cargo install ripgrep` — install a binary crate
  - `cargo update` — update dependencies
- **Auth**: None for crates.io; token needed for private registries
- **Docs**: `cargo help` or <https://doc.rust-lang.org/cargo/>

### gem

- **Package**: gem v3.4.20 bundled with Ruby
- **Purpose**: Ruby package (gem) manager
- **Use when**: Installing Ruby gems, managing gem dependencies
- **Quick start**:
  - `gem install bundler` — install a gem
  - `gem list` — list installed gems
  - `gem environment` — show gem paths and configuration
- **Auth**: None for rubygems.org
- **Docs**: `gem help` or <https://guides.rubygems.org/>

### luarocks

- **Package**: luarocks 3.8.0 via apt
- **Purpose**: Lua package manager
- **Use when**: Installing Lua modules, managing Lua dependencies
- **Quick start**:
  - `luarocks install luasocket` — install a module
  - `luarocks list` — list installed modules
  - `luarocks search json` — search for packages
- **Auth**: None
- **Docs**: `luarocks help` or <https://luarocks.org/>

### cpanm

- **Package**: cpanminus via apt
- **Purpose**: Lightweight CPAN client for Perl module installation
- **Use when**: Installing Perl modules from CPAN
- **Quick start**:
  - `cpanm JSON::XS` — install a Perl module
  - `cpanm --installdeps .` — install dependencies from Makefile.PL or cpanfile
  - `cpanm -l local Module::Name` — install to a local directory
- **Auth**: None
- **Docs**: `cpanm --help` or <https://metacpan.org/pod/App::cpanminus>

---

## Version Managers

### tfenv

- **Package**: tfenv 3.0.0 installed to ~/.tfenv
- **Purpose**: Terraform version manager for switching between Terraform releases
- **Use when**: Needing a specific Terraform version, switching between projects with different version requirements
- **Quick start**:
  - `tfenv install 1.9.0` — install a specific Terraform version
  - `tfenv use 1.9.0` — switch to a specific version
  - `tfenv list` — list installed versions
- **Auth**: None
- **Docs**: <https://github.com/tfutils/tfenv>

### rustup

- **Package**: rustup 1.29.0 managing the Rust toolchain
- **Purpose**: Rust toolchain installer and version manager
- **Use when**: Switching Rust versions, adding targets, installing components like clippy or rustfmt
- **Quick start**:
  - `rustup update` — update all installed toolchains
  - `rustup target add wasm32-unknown-unknown` — add a compilation target
  - `rustup component add clippy rustfmt` — add components (pre-installed)
- **Auth**: None
- **Docs**: `rustup --help` or <https://rust-lang.github.io/rustup/>
