# Code Quality — Linters and Formatters

## Multi-language

## prettier

- **Package**: `prettier` via npm
- **Purpose**: Opinionated code formatter for JS, TS, CSS, HTML, JSON, YAML, Markdown, and more
- **Use when**: Enforcing consistent formatting across a project, running in CI or pre-commit hooks
- **Quick start**:
  - `npx prettier --check .`
  - `npx prettier --write "src/**/*.ts"`
  - `npx prettier --write "*.{json,yaml,md}"`
- **Auth**: None
- **Docs**: <https://prettier.io/docs/en/>

## biome

- **Package**: `@biomejs/biome` via npm
- **Purpose**: Extremely fast JS/TS formatter and linter (Rust-based Prettier/ESLint alternative)
- **Use when**: Wanting a single tool for formatting and linting JS/TS with near-instant execution
- **Quick start**:
  - `npx @biomejs/biome check .`
  - `npx @biomejs/biome format --write .`
  - `npx @biomejs/biome lint .`
- **Auth**: None
- **Docs**: <https://biomejs.dev/reference/cli/>

## editorconfig-checker

- **Package**: `editorconfig-checker` via manual download
- **Purpose**: Validates files against `.editorconfig` rules (indent style, trailing whitespace, final newline)
- **Use when**: Enforcing EditorConfig compliance in CI, catching whitespace issues across all file types
- **Quick start**:
  - `editorconfig-checker`
  - `editorconfig-checker -exclude '.git'`
  - `editorconfig-checker src/`
- **Auth**: None
- **Docs**: <https://github.com/editorconfig-checker/editorconfig-checker>

## jscpd

- **Package**: `jscpd` via npm
- **Purpose**: Copy/paste detection across 150+ languages
- **Use when**: Finding duplicated code blocks, enforcing DRY principles in CI
- **Quick start**:
  - `npx jscpd src/`
  - `npx jscpd --min-lines 5 --min-tokens 50 .`
  - `npx jscpd --reporters html --output report/`
- **Auth**: None
- **Docs**: <https://github.com/kucherenko/jscpd>

## codespell

- **Package**: `codespell` via pip
- **Purpose**: Spell checker designed for source code — catches common misspellings in comments, strings, and docs
- **Use when**: Running spell checks in CI, fixing typos across a codebase
- **Quick start**:
  - `codespell .`
  - `codespell --skip="*.min.js,node_modules" .`
  - `codespell -w .` (autofix)
- **Auth**: None
- **Docs**: `codespell --help`

---

## JavaScript / TypeScript

## ESLint

- **Package**: `eslint` via npm
- **Purpose**: Pluggable linter for JavaScript and TypeScript with extensive rule ecosystem
- **Use when**: Enforcing code quality rules, catching bugs, maintaining style consistency in JS/TS projects
- **Quick start**:
  - `npx eslint .`
  - `npx eslint --fix src/`
  - `npx eslint --config eslint.config.js .`
- **Auth**: None
- **Docs**: <https://eslint.org/docs/latest/>

## standard

- **Package**: `standard` via npm
- **Purpose**: JavaScript Standard Style — zero-config linter and formatter
- **Use when**: Wanting opinionated JS formatting without configuring ESLint rules
- **Quick start**:
  - `npx standard`
  - `npx standard --fix`
  - `npx standard "src/**/*.js"`
- **Auth**: None
- **Docs**: <https://standardjs.com>

## ts-standard

- **Package**: `ts-standard` via npm
- **Purpose**: TypeScript Standard Style — standard for TypeScript files
- **Use when**: Applying Standard Style rules to TypeScript projects
- **Quick start**:
  - `npx ts-standard`
  - `npx ts-standard --fix`
  - `npx ts-standard "src/**/*.ts"`
- **Auth**: None
- **Docs**: <https://github.com/standard/ts-standard>

## TypeScript

- **Package**: `typescript` via npm (provides `tsc`)
- **Purpose**: TypeScript compiler — type-checks and transpiles TypeScript to JavaScript
- **Use when**: Checking type errors, compiling TS projects, running `tsc --noEmit` in CI
- **Quick start**:
  - `npx tsc --noEmit`
  - `npx tsc --init`
  - `npx tsc -p tsconfig.json`
- **Auth**: None
- **Docs**: <https://www.typescriptlang.org/docs/>

---

## Python

## ruff

- **Package**: `ruff` via pip
- **Purpose**: Extremely fast Python linter and formatter (Rust-based, replaces Flake8 + isort + Black)
- **Use when**: Linting and formatting Python code with near-instant speed
- **Quick start**:
  - `ruff check .`
  - `ruff check --fix .`
  - `ruff format .`
- **Auth**: None
- **Docs**: <https://docs.astral.sh/ruff/>

## black

- **Package**: `black` via pip
- **Purpose**: Uncompromising Python code formatter
- **Use when**: autoformatting Python code with deterministic output
- **Quick start**:
  - `black .`
  - `black --check --diff .`
  - `black --line-length 100 src/`
- **Auth**: None
- **Docs**: <https://black.readthedocs.io>

## pylint

- **Package**: `pylint` via pip
- **Purpose**: Full-featured Python linter with extensive checks for errors, style, and refactoring
- **Use when**: Deep static analysis of Python code, enforcing coding standards
- **Quick start**:
  - `pylint src/`
  - `pylint --disable=C0114,C0115 mymodule.py`
  - `pylint --generate-rcfile > .pylintrc`
- **Auth**: None
- **Docs**: <https://pylint.readthedocs.io>

## flake8

- **Package**: `flake8` via pip
- **Purpose**: Python linter combining pycodestyle, pyflakes, and mccabe complexity checker
- **Use when**: Quick Python style and error checks, CI pipelines
- **Quick start**:
  - `flake8 .`
  - `flake8 --max-line-length 120 src/`
  - `flake8 --statistics --count .`
- **Auth**: None
- **Docs**: <https://flake8.pycqa.org>

## mypy

- **Package**: `mypy` via pip
- **Purpose**: Static type checker for Python
- **Use when**: Verifying type annotations, catching type errors before runtime
- **Quick start**:
  - `mypy src/`
  - `mypy --strict mymodule.py`
  - `mypy --ignore-missing-imports .`
- **Auth**: None
- **Docs**: <https://mypy.readthedocs.io>

## isort

- **Package**: `isort` via pip
- **Purpose**: Sorts Python imports alphabetically and separates into sections
- **Use when**: Enforcing consistent import ordering in Python files
- **Quick start**:
  - `isort .`
  - `isort --check-only --diff .`
  - `isort --profile black .`
- **Auth**: None
- **Docs**: <https://pycqa.github.io/isort/>

## pyink

- **Package**: `pyink` via pip
- **Purpose**: Google's Python formatter — a Black variant with Google-style formatting tweaks
- **Use when**: Following Google Python style guide formatting conventions
- **Quick start**:
  - `pyink .`
  - `pyink --check .`
  - `pyink --pyink-indentation 2 .`
- **Auth**: None
- **Docs**: <https://github.com/google/pyink>

## nbqa

- **Package**: `nbqa` via pip
- **Purpose**: Run any Python linter or formatter on Jupyter notebooks
- **Use when**: Linting or formatting code cells in .ipynb files
- **Quick start**:
  - `nbqa ruff check notebooks/`
  - `nbqa black notebooks/`
  - `nbqa isort notebooks/ --float-to-top`
- **Auth**: None
- **Docs**: <https://github.com/nbQA-dev/nbQA>

---

## Go

## golangci-lint

- **Package**: `golangci-lint` via go install
- **Purpose**: Go linter aggregator running 50+ linters in parallel
- **Use when**: Comprehensive Go code quality checks, CI lint gate
- **Quick start**:
  - `golangci-lint run`
  - `golangci-lint run --fix`
  - `golangci-lint run --enable-all ./...`
- **Auth**: None
- **Docs**: <https://golangci-lint.run>

## air

- **Package**: `air` via brew
- **Purpose**: Live reload development tool for Go applications
- **Use when**: Developing Go servers and wanting automatic rebuild on file changes
- **Quick start**:
  - `air init` (generate .air.toml config)
  - `air`
  - `air -c .air.toml`
- **Auth**: None
- **Docs**: <https://github.com/air-verse/air>

---

## Rust

## clippy

- **Package**: `clippy` via `rustup component add clippy`
- **Purpose**: Official Rust linter with hundreds of linter rules
- **Use when**: Catching common Rust mistakes, enforcing idiomatic Rust patterns
- **Quick start**:
  - `cargo clippy`
  - `cargo clippy -- -D warnings`
  - `cargo clippy --fix`
- **Auth**: None
- **Docs**: <https://doc.rust-lang.org/clippy/>

## rustfmt

- **Package**: `rustfmt` via `rustup component add rustfmt`
- **Purpose**: Official Rust code formatter
- **Use when**: autoformatting Rust code to standard style
- **Quick start**:
  - `cargo fmt`
  - `cargo fmt -- --check`
  - `rustfmt src/main.rs`
- **Auth**: None
- **Docs**: <https://rust-lang.github.io/rustfmt/>

---

## Shell

## shellcheck

- **Package**: `shellcheck` via apt
- **Purpose**: Static analysis tool for shell scripts — finds bugs, pitfalls, and style issues
- **Use when**: Validating bash/sh/Zsh scripts, catching quoting errors, CI lint checks
- **Quick start**:
  - `shellcheck script.sh`
  - `shellcheck -s bash scripts/*.sh`
  - `shellcheck -f diff script.sh | patch -p1` (autofix)
- **Auth**: None
- **Docs**: `man shellcheck`

## shfmt

- **Package**: `shfmt` via manual download
- **Purpose**: Shell script formatter supporting Bash, POSIX sh, and mksh
- **Use when**: autoformatting shell scripts for consistent indentation and style
- **Quick start**:
  - `shfmt -w script.sh`
  - `shfmt -d .` (diff mode)
  - `shfmt -i 2 -ci -w scripts/`
- **Auth**: None
- **Docs**: `shfmt --help`

---

## Ruby

## rubocop

- **Package**: `rubocop` via gem (with plugins: rubocop-performance, rubocop-rails, rubocop-rspec, rubocop-minitest, rubocop-rake)
- **Purpose**: Ruby static code analyzer and formatter with extensive plugin ecosystem
- **Use when**: Enforcing Ruby style guide, linting Rails apps, CI checks
- **Quick start**:
  - `rubocop`
  - `rubocop -a` (auto-correct safe violations)
  - `rubocop -A` (auto-correct all violations)
- **Auth**: None
- **Docs**: <https://docs.rubocop.org>

## standardrb

- **Package**: `standardrb` via gem
- **Purpose**: Ruby Standard Style — zero-config RuboCop wrapper
- **Use when**: Wanting opinionated Ruby formatting without configuring RuboCop rules
- **Quick start**:
  - `standardrb`
  - `standardrb --fix`
  - `standardrb --format progress`
- **Auth**: None
- **Docs**: <https://github.com/standardrb/standard>

## htmlbeautifier

- **Package**: `htmlbeautifier` via gem
- **Purpose**: HTML beautifier particularly suited for ERB and Rails view templates
- **Use when**: Formatting HTML and ERB templates in Ruby projects
- **Quick start**:
  - `htmlbeautifier app/views/**/*.html.erb`
  - `htmlbeautifier --tab-stops 2 index.html`
  - `cat template.erb | htmlbeautifier`
- **Auth**: None
- **Docs**: <https://github.com/threedaymonk/htmlbeautifier>

---

## Java / Kotlin / Scala

## checkstyle

- **Package**: `checkstyle` via manual download (JAR)
- **Purpose**: Java style checker enforcing coding standards (Sun, Google, custom)
- **Use when**: Enforcing Java code conventions in CI
- **Quick start**:
  - `java -jar checkstyle.jar -c /google_checks.xml src/`
  - `java -jar checkstyle.jar -c /sun_checks.xml MyClass.java`
  - `java -jar checkstyle.jar -c config.xml -f xml src/`
- **Auth**: None
- **Docs**: <https://checkstyle.org>

## google-java-format

- **Package**: `google-java-format` via manual download (JAR)
- **Purpose**: Reformats Java source code to comply with Google Java Style
- **Use when**: autoformatting Java code to Google style
- **Quick start**:
  - `java -jar google-java-format.jar --replace src/**/*.java`
  - `java -jar google-java-format.jar --dry-run src/Main.java`
  - `java -jar google-java-format.jar --aosp src/Main.java` (AOSP style)
- **Auth**: None
- **Docs**: <https://github.com/google/google-java-format>

## ktlint

- **Package**: `ktlint` via manual download
- **Purpose**: Kotlin linter and formatter with built-in Kotlin style guide rules
- **Use when**: Linting and formatting Kotlin code, CI checks for Kotlin projects
- **Quick start**:
  - `ktlint`
  - `ktlint --format`
  - `ktlint "src/**/*.kt"`
- **Auth**: None
- **Docs**: <https://pinterest.github.io/ktlint/>

## scalafmt

- **Package**: `scalafmt` via manual download
- **Purpose**: Scala code formatter with configurable style
- **Use when**: autoformatting Scala code, enforcing consistent style in sbt projects
- **Quick start**:
  - `scalafmt`
  - `scalafmt --check`
  - `scalafmt --config .scalafmt.conf src/`
- **Auth**: None
- **Docs**: <https://scalameta.org/scalafmt/>

---

## PHP

## phpcs

- **Package**: `phpcs` via manual download (PHP_CodeSniffer)
- **Purpose**: Detects violations of a defined coding standard in PHP code
- **Use when**: Enforcing PSR-12 or custom PHP coding standards
- **Quick start**:
  - `phpcs --standard=PSR12 src/`
  - `phpcbf --standard=PSR12 src/` (autofix)
  - `phpcs --report=summary .`
- **Auth**: None
- **Docs**: <https://github.com/PHPCSStandards/PHP_CodeSniffer>

## phpstan

- **Package**: `phpstan` via manual download
- **Purpose**: PHP static analysis tool — finds bugs without running code
- **Use when**: Type checking PHP code, catching null reference errors, CI analysis
- **Quick start**:
  - `phpstan analyse src/`
  - `phpstan analyse --level max src/`
  - `phpstan analyse -c phpstan.neon`
- **Auth**: None
- **Docs**: <https://phpstan.org/user-guide/getting-started>

## psalm

- **Package**: `psalm` via manual download
- **Purpose**: PHP static analysis tool focused on type safety
- **Use when**: Deep type analysis of PHP code, finding type-related bugs
- **Quick start**:
  - `psalm`
  - `psalm --init`
  - `psalm --alter --issues=MissingReturnType`
- **Auth**: None
- **Docs**: <https://psalm.dev/docs/>

## pint

- **Package**: `pint` via manual download
- **Purpose**: Laravel's opinionated PHP code style fixer (built on PHP-CS-Fixer)
- **Use when**: Formatting PHP code in Laravel projects
- **Quick start**:
  - `pint`
  - `pint --test` (dry-run)
  - `pint --preset psr12`
- **Auth**: None
- **Docs**: <https://laravel.com/docs/pint>

---

## CSS / HTML

## stylelint

- **Package**: `stylelint` via npm
- **Purpose**: CSS/SCSS/Less linter with 170+ built-in rules
- **Use when**: Enforcing CSS conventions, catching errors in style sheets
- **Quick start**:
  - `npx stylelint "**/*.css"`
  - `npx stylelint --fix "src/**/*.scss"`
  - `npx stylelint --config .stylelintrc.json "**/*.css"`
- **Auth**: None
- **Docs**: <https://stylelint.io>

## htmlhint

- **Package**: `htmlhint` via npm
- **Purpose**: Static code analysis tool for HTML
- **Use when**: Validating HTML files, catching common HTML errors
- **Quick start**:
  - `npx htmlhint "**/*.html"`
  - `npx htmlhint --config .htmlhintrc .`
  - `npx htmlhint --format json "src/**/*.html"`
- **Auth**: None
- **Docs**: <https://htmlhint.com>

---

## Markdown / Text

## markdownlint-cli2

- **Package**: `markdownlint-cli2` via npm
- **Purpose**: Fast Markdown linter with configuration file support
- **Use when**: Linting Markdown files in CI, enforcing consistent Markdown style
- **Quick start**:
  - `npx markdownlint-cli2 "**/*.md"`
  - `npx markdownlint-cli2 --fix "docs/**/*.md"`
  - `npx markdownlint-cli2 --config .markdownlint.jsonc "**/*.md"`
- **Auth**: None
- **Docs**: <https://github.com/DavidAnson/markdownlint-cli2>

## markdownlint-cli

- **Package**: `markdownlint-cli` via npm
- **Purpose**: Markdown linter CLI (alternative interface for markdownlint)
- **Use when**: Linting Markdown with the original CLI interface, integrating with editors
- **Quick start**:
  - `npx markdownlint "**/*.md"`
  - `npx markdownlint --fix "docs/**/*.md"`
  - `npx markdownlint -c .markdownlint.json .`
- **Auth**: None
- **Docs**: <https://github.com/igorshubovych/markdownlint-cli>

## textlint

- **Package**: `textlint` via npm
- **Purpose**: Pluggable natural language linter for prose, docs, and comments
- **Use when**: Checking grammar, style, and terminology in documentation
- **Quick start**:
  - `npx textlint "docs/**/*.md"`
  - `npx textlint --fix README.md`
  - `npx textlint --rule no-dead-link "**/*.md"`
- **Auth**: None
- **Docs**: <https://textlint.github.io>

---

## YAML / JSON / TOML

## yamllint

- **Package**: `yamllint` via pip
- **Purpose**: YAML linter checking syntax, key duplication, indentation, and line length
- **Use when**: Validating YAML files, CI checks for Kubernetes manifests or Ansible playbooks
- **Quick start**:
  - `yamllint .`
  - `yamllint -d relaxed .`
  - `yamllint -c .yamllint.yml config/`
- **Auth**: None
- **Docs**: <https://yamllint.readthedocs.io>

## spectral

- **Package**: `@stoplight/spectral-cli` via npm
- **Purpose**: OpenAPI and AsyncAPI linter with custom ruleset support
- **Use when**: Validating API specifications, enforcing API design standards
- **Quick start**:
  - `npx @stoplight/spectral-cli lint openapi.yaml`
  - `npx @stoplight/spectral-cli lint --ruleset .spectral.yml api.json`
  - `npx @stoplight/spectral-cli lint -f json openapi.yaml`
- **Auth**: None
- **Docs**: <https://docs.stoplight.io/docs/spectral/>

## taplo

- **Package**: `taplo` via manual download
- **Purpose**: TOML formatter, linter, and language server
- **Use when**: Formatting and validating TOML files (Cargo.toml, pyproject.toml, etc.)
- **Quick start**:
  - `taplo format`
  - `taplo check`
  - `taplo lint Cargo.toml`
- **Auth**: None
- **Docs**: <https://taplo.tamasfe.dev>

---

## Terraform / CloudFormation

## tflint

- **Package**: `tflint` via manual download
- **Purpose**: Terraform linter for detecting errors, enforcing best practices, and naming conventions
- **Use when**: Validating Terraform configurations, CI checks for IaC
- **Quick start**:
  - `tflint`
  - `tflint --init`
  - `tflint --recursive`
- **Auth**: None
- **Docs**: <https://github.com/terraform-linters/tflint>

## cfn-lint

- **Package**: `cfn-lint` via pip
- **Purpose**: AWS CloudFormation template linter
- **Use when**: Validating CloudFormation templates before deployment
- **Quick start**:
  - `cfn-lint template.yaml`
  - `cfn-lint "templates/**/*.json"`
  - `cfn-lint -f json template.yaml`
- **Auth**: None
- **Docs**: <https://github.com/aws-cloudformation/cfn-lint>

---

## Docker

## hadolint

- **Package**: `hadolint` via manual download
- **Purpose**: Dockerfile linter that applies Dockerfile best practices and ShellCheck rules
- **Use when**: Validating Dockerfiles, CI lint checks for container builds
- **Quick start**:
  - `hadolint Dockerfile`
  - `hadolint --ignore DL3008 Dockerfile`
  - `hadolint -f json Dockerfile`
- **Auth**: None
- **Docs**: <https://github.com/hadolint/hadolint>

---

## Ansible

## ansible-lint

- **Package**: `ansible-lint` via pip
- **Purpose**: Linter for Ansible playbooks, roles, and collections
- **Use when**: Validating Ansible code, enforcing best practices
- **Quick start**:
  - `ansible-lint`
  - `ansible-lint playbook.yml`
  - `ansible-lint -p roles/`
- **Auth**: None
- **Docs**: <https://ansible.readthedocs.io/projects/lint/>

---

## SQL

## sqlfluff

- **Package**: `sqlfluff` via pip
- **Purpose**: SQL linter and autoformatter supporting multiple dialects (PostgreSQL, MySQL, BigQuery, etc.)
- **Use when**: Enforcing SQL style, formatting queries, CI checks for SQL code
- **Quick start**:
  - `sqlfluff lint queries/`
  - `sqlfluff fix queries/`
  - `sqlfluff lint --dialect postgres query.sql`
- **Auth**: None
- **Docs**: <https://docs.sqlfluff.com>

---

## C / C++

## cpplint

- **Package**: `cpplint` via pip
- **Purpose**: C++ style checker following Google C++ Style Guide
- **Use when**: Enforcing Google C++ style, CI checks for C++ projects
- **Quick start**:
  - `cpplint src/*.cpp`
  - `cpplint --recursive src/`
  - `cpplint --filter=-whitespace/indent src/*.h`
- **Auth**: None
- **Docs**: <https://github.com/cpplint/cpplint>

## clang-format

- **Package**: `clang-format` via apt
- **Purpose**: Code formatter for C, C++, Java, JavaScript, and Objective-C
- **Use when**: autoformatting C/C++ code, enforcing consistent brace and indent style
- **Quick start**:
  - `clang-format -i src/*.cpp`
  - `clang-format --style=google -i main.cc`
  - `clang-format --dump-config > .clang-format`
- **Auth**: None
- **Docs**: `man clang-format`

---

## Perl

## perlcritic

- **Package**: `libperl-critic-perl` via apt (with plugin packages)
- **Purpose**: Perl best practices checker based on Damian Conway's Perl Best Practices
- **Use when**: Enforcing Perl coding standards, catching common Perl pitfalls
- **Quick start**:
  - `perlcritic script.pl`
  - `perlcritic --severity 3 lib/`
  - `perlcritic --theme security script.pl`
- **Auth**: None
- **Docs**: `man perlcritic`

---

## Lua

## luacheck

- **Package**: `luacheck` via luarocks
- **Purpose**: Lua static analyzer and linter
- **Use when**: Catching undefined globals, unused variables, and style issues in Lua code
- **Quick start**:
  - `luacheck src/`
  - `luacheck --no-unused-args script.lua`
  - `luacheck --config .luacheckrc .`
- **Auth**: None
- **Docs**: <https://luacheck.readthedocs.io>

---

## R

## lintr

- **Package**: `lintr` via R (`install.packages("lintr")`)
- **Purpose**: R linter checking style, syntax, and possible semantic issues
- **Use when**: Enforcing tidyverse style guide, CI checks for R code
- **Quick start**:
  - `Rscript -e 'lintr::lint("script.R")'`
  - `Rscript -e 'lintr::lint_dir("R/")'`
  - `Rscript -e 'lintr::lint_package()'`
- **Auth**: None
- **Docs**: <https://lintr.r-lib.org>

---

## Clojure

## clj-kondo

- **Package**: `clj-kondo` via manual download
- **Purpose**: Clojure linter that catches errors and style issues via static analysis
- **Use when**: Linting Clojure/ClojureScript/EDN files, CI checks
- **Quick start**:
  - `clj-kondo --lint src/`
  - `clj-kondo --lint src/ --config '{:linters {:unused-binding {:level :off}}}'`
  - `clj-kondo --lint - < script.clj`
- **Auth**: None
- **Docs**: <https://github.com/clj-kondo/clj-kondo>

## cljfmt

- **Package**: `cljfmt` via manual download
- **Purpose**: Clojure code formatter
- **Use when**: autoformatting Clojure source files
- **Quick start**:
  - `cljfmt check src/`
  - `cljfmt fix src/`
  - `cljfmt fix --indents indents.edn src/`
- **Auth**: None
- **Docs**: <https://github.com/weavejester/cljfmt>

---

## Gleam

## gleam

- **Package**: `gleam` via manual download
- **Purpose**: Gleam language compiler with built-in code formatter
- **Use when**: Formatting Gleam source code
- **Quick start**:
  - `gleam format`
  - `gleam format --check`
  - `gleam format src/`
- **Auth**: None
- **Docs**: <https://gleam.run/documentation/>

---

## PowerShell

## PSScriptAnalyzer

- **Package**: `PSScriptAnalyzer` via PowerShell (`Install-Module -Name PSScriptAnalyzer`)
- **Purpose**: PowerShell static code analysis and style checker
- **Use when**: Linting PowerShell scripts, enforcing best practices
- **Quick start**:
  - `Invoke-ScriptAnalyzer -Path script.ps1`
  - `Invoke-ScriptAnalyzer -Path ./scripts/ -Recurse`
  - `Invoke-ScriptAnalyzer -Path . -Settings PSGallery`
- **Auth**: None
- **Docs**: <https://github.com/PowerShell/PSScriptAnalyzer>

---

## Dotenv

## dotenv-linter

- **Package**: `dotenv-linter` via manual download
- **Purpose**: Linter for `.env` files checking for duplicates, ordering, and formatting
- **Use when**: Validating .env files, comparing .env and .env.example
- **Quick start**:
  - `dotenv-linter`
  - `dotenv-linter .env .env.production`
  - `dotenv-linter compare .env .env.example`
- **Auth**: None
- **Docs**: <https://dotenv-linter.github.io>

---

## Protocol Buffers

## protolint

- **Package**: `protolint` via manual download
- **Purpose**: Pluggable linter for Protocol Buffer (protobuf) files
- **Use when**: Enforcing protobuf style guide, CI checks for .proto files
- **Quick start**:
  - `protolint lint .`
  - `protolint lint -fix .`
  - `protolint lint -config_path .protolint.yaml proto/`
- **Auth**: None
- **Docs**: <https://github.com/yoheimuta/protolint>

---

## Groovy

## npm-groovy-lint

- **Package**: `npm-groovy-lint` via npm
- **Purpose**: Groovy and Jenkinsfile linter and formatter
- **Use when**: Linting Jenkinsfiles, validating Groovy scripts
- **Quick start**:
  - `npx npm-groovy-lint`
  - `npx npm-groovy-lint --fix`
  - `npx npm-groovy-lint -p "**/*.groovy,**/Jenkinsfile"`
- **Auth**: None
- **Docs**: <https://github.com/nvuillam/npm-groovy-lint>

---

## Gherkin

## gherkin-lint

- **Package**: `gherkin-lint` via npm
- **Purpose**: Linter for Gherkin/Cucumber BDD feature files
- **Use when**: Validating .feature files, enforcing BDD writing conventions
- **Quick start**:
  - `npx gherkin-lint`
  - `npx gherkin-lint features/`
  - `npx gherkin-lint -c .gherkin-lintrc features/`
- **Auth**: None
- **Docs**: <https://github.com/vsiakka/gherkin-lint>

---

## CI/CD Pipelines

## actionlint

- **Package**: `actionlint` via manual download
- **Purpose**: Static checker for GitHub Actions workflow files
- **Use when**: Validating .github/workflows/\*.yml files, catching expression errors
- **Quick start**:
  - `actionlint`
  - `actionlint .github/workflows/ci.yml`
  - `actionlint -format '{{json .}}'`
- **Auth**: None
- **Docs**: <https://github.com/rhysd/actionlint>

## tekton-lint

- **Package**: `tekton-lint` via npm
- **Purpose**: Linter for Tekton CI/CD pipeline definitions
- **Use when**: Validating Tekton Task, Pipeline, and TriggerTemplate resources
- **Quick start**:
  - `npx tekton-lint "tekton/**/*.yaml"`
  - `npx tekton-lint --watch "pipelines/"`
  - `npx tekton-lint -f json tasks/`
- **Auth**: None
- **Docs**: <https://github.com/IBM/tekton-lint>

## asl-validator

- **Package**: `asl-validator` via npm
- **Purpose**: Validator for AWS Step Functions Amazon States Language (ASL) definitions
- **Use when**: Validating Step Functions state machine JSON before deployment
- **Quick start**:
  - `npx asl-validator --json-path state-machine.json`
  - `npx asl-validator --json-path sm.json --no-arc-validation`
  - `cat sm.json | npx asl-validator`
- **Auth**: None
- **Docs**: <https://github.com/ChristopheBougere/asl-validator>

## zizmor

- **Package**: `zizmor` via pip
- **Purpose**: Security-focused linter for GitHub Actions workflows
- **Use when**: Finding security vulnerabilities in Actions workflows (injection, TOCTOU, etc.)
- **Quick start**:
  - `zizmor .`
  - `zizmor .github/workflows/`
  - `zizmor --format json .`
- **Auth**: None
- **Docs**: <https://github.com/woodruffw/zizmor>

---

## Nix / Haskell / D

## nixfmt

- **Package**: `nixfmt` via brew
- **Purpose**: Nix expression formatter
- **Use when**: Formatting Nix files (flake.nix, default.nix, etc.)
- **Quick start**:
  - `nixfmt file.nix`
  - `nixfmt --check file.nix`
  - `nixfmt < input.nix > output.nix`
- **Auth**: None
- **Docs**: <https://github.com/NixOS/nixfmt>

## ormolu

- **Package**: `ormolu` via brew
- **Purpose**: Haskell source code formatter
- **Use when**: Formatting Haskell files to a canonical style
- **Quick start**:
  - `ormolu --mode inplace src/**/*.hs`
  - `ormolu --mode check src/**/*.hs`
  - `ormolu --mode stdout Main.hs`
- **Auth**: None
- **Docs**: <https://github.com/tweag/ormolu>

## dfmt

- **Package**: `dfmt` via brew
- **Purpose**: D language source code formatter
- **Use when**: Formatting D language source files
- **Quick start**:
  - `dfmt source.d`
  - `dfmt --inplace source.d`
  - `dfmt --indent_size 4 source.d`
- **Auth**: None
- **Docs**: <https://github.com/dlang-community/dfmt>

---

## Snakemake

## snakefmt

- **Package**: `snakefmt` via pip
- **Purpose**: Formatter for Snakemake workflow files
- **Use when**: Formatting Snakefile and .smk files
- **Quick start**:
  - `snakefmt Snakefile`
  - `snakefmt --check workflow/`
  - `snakefmt --diff rules/*.smk`
- **Auth**: None
- **Docs**: <https://github.com/snakemake/snakefmt>

---

## Git Hooks & History

## pre-commit

- **Package**: `pre-commit` via pip
- **Purpose**: Git hook framework that manages and runs configured linters on every commit
- **Use when**: Setting up automated lint gates, running all project linters before each commit
- **Quick start**:
  - `pre-commit install`
  - `pre-commit run --all-files`
  - `pre-commit autoupdate`
- **Auth**: None
- **Docs**: <https://pre-commit.com>

## git-filter-repo

- **Package**: `git-filter-repo` via pip
- **Purpose**: Versatile tool for rewriting Git repository history
- **Use when**: Removing large files from history, rewriting author info, splitting repos
- **Quick start**:
  - `git filter-repo --path-glob '*.bin' --invert-paths`
  - `git filter-repo --strip-blobs-bigger-than 10M`
  - `git filter-repo --mailmap mailmap.txt`
- **Auth**: None
- **Docs**: `man git-filter-repo`

## bfg

- **Package**: `bfg` via manual download (JAR)
- **Purpose**: BFG Repo-Cleaner — fast alternative to git-filter-branch for removing large files or secrets from history
- **Use when**: Quickly removing accidentally committed secrets or large blobs from Git history
- **Quick start**:
  - `java -jar bfg.jar --strip-blobs-bigger-than 100M repo.git`
  - `java -jar bfg.jar --delete-files "*.zip" repo.git`
  - `java -jar bfg.jar --replace-text passwords.txt repo.git`
- **Auth**: None
- **Docs**: <https://rtyley.github.io/bfg-repo-cleaner/>
