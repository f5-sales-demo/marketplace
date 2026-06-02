# System Utilities

## Shell & Terminal

## Zsh

- **Package**: `zsh` via apt + oh-my-zsh framework with plugins (zsh-autosuggestions, zsh-syntax-highlighting, powerlevel10k)
- **Purpose**: Default interactive shell with rich plugin ecosystem for autocompletion, syntax highlighting, and a customizable prompt
- **Use when**: Interactive terminal sessions (default shell in the devcontainer)
- **Quick start**:
  - `zsh` (already the default shell)
  - `omz update` (update oh-my-zsh)
  - `p10k configure` (reconfigure powerlevel10k prompt)
- **Auth**: None
- **Docs**: <https://github.com/ohmyzsh/ohmyzsh>

## tmux

- **Package**: `tmux` via apt (with tpm plugin manager)
- **Purpose**: Terminal multiplexer for managing multiple terminal sessions, splits, and persistent sessions
- **Use when**: Running long processes that survive disconnection, splitting terminal into panes, managing multiple sessions
- **Quick start**:
  - `tmux new -s work`
  - `tmux attach -t work`
  - `tmux ls`
- **Auth**: None
- **Docs**: `man tmux`

## fzf

- **Package**: `fzf` via manual download
- **Purpose**: General-purpose fuzzy finder for files, command history, processes, and more
- **Use when**: Searching command history (Ctrl+R), finding files interactively, selecting items from any list
- **Quick start**:
  - `fzf` (interactive file finder)
  - `history | fzf` (search command history)
  - `cat file.txt | fzf --multi` (select multiple lines)
- **Auth**: None
- **Docs**: `man fzf`

## bat

- **Package**: `bat` via apt
- **Purpose**: Cat replacement with syntax highlighting, line numbers, and Git integration
- **Use when**: Viewing file contents with syntax highlighting, piping output with pretty formatting
- **Quick start**:
  - `bat script.py`
  - `bat --style=numbers,changes src/*.ts`
  - `bat --diff file1.txt file2.txt`
- **Auth**: None
- **Docs**: `man bat`

## eza

- **Package**: `eza` via apt (aliased via zsh-eza plugin)
- **Purpose**: Modern replacement for `ls` with color, icons, Git status, and tree view
- **Use when**: Listing directory contents (aliased to common `ls` commands via zsh-eza)
- **Quick start**:
  - `eza` (aliased to `ls`)
  - `eza -la --git` (long listing with Git status)
  - `eza --tree --level=2` (tree view)
- **Auth**: None
- **Docs**: `man eza`

## lsd

- **Package**: `lsd` via apt
- **Purpose**: LSDeluxe — another modern ls replacement with color and icons
- **Use when**: Listing files with icons and color when eza is not preferred
- **Quick start**:
  - `lsd`
  - `lsd -la`
  - `lsd --tree --depth 2`
- **Auth**: None
- **Docs**: `man lsd`

## fd-find

- **Package**: `fd-find` via apt (binary is `fdfind` or `fd`)
- **Purpose**: Fast and user-friendly alternative to `find`
- **Use when**: Searching for files by name pattern, faster than `find` with sensible defaults
- **Quick start**:
  - `fdfind "\.py$"`
  - `fdfind -e ts -x wc -l` (find .ts files and count lines)
  - `fdfind --hidden --no-ignore config`
- **Auth**: None
- **Docs**: `man fdfind`

## ripgrep

- **Package**: `ripgrep` via apt (binary is `rg`)
- **Purpose**: Extremely fast recursive grep with smart defaults (respects .gitignore)
- **Use when**: Searching for patterns in source code, faster alternative to grep -r
- **Quick start**:
  - `rg "TODO" src/`
  - `rg -t py "import requests"`
  - `rg --files-with-matches "pattern" .`
- **Auth**: None
- **Docs**: `man rg`

## htop

- **Package**: `htop` via apt
- **Purpose**: Interactive process viewer with CPU, memory, and process tree display
- **Use when**: Monitoring system resources, finding resource-heavy processes, killing processes
- **Quick start**:
  - `htop`
  - `htop -p $(pgrep node)` (monitor specific processes)
  - `htop --sort-key=PERCENT_MEM`
- **Auth**: None
- **Docs**: `man htop`

## tree

- **Package**: `tree` via apt
- **Purpose**: Display directory structure as an indented tree
- **Use when**: Visualizing project structure, documenting directory layouts
- **Quick start**:
  - `tree -L 2`
  - `tree -I node_modules`
  - `tree -a --dirsfirst`
- **Auth**: None
- **Docs**: `man tree`

---

## Editors

## neovim

- **Package**: `neovim` via manual download (with lazy.nvim plugin manager)
- **Purpose**: Modern, extensible Vim-based text editor with Lua plugin ecosystem
- **Use when**: Editing files in the terminal, using Vim keybindings with modern plugin support
- **Quick start**:
  - `nvim file.py`
  - `nvim +PlugUpdate` (update plugins)
  - `nvim -d file1.txt file2.txt` (diff mode)
- **Auth**: None
- **Docs**: `:help` (inside Neovim)

## code

- **Package**: Visual Studio Code CLI via manual download
- **Purpose**: Visual Studio Code command-line interface for tunnel connections and remote editing
- **Use when**: Connecting to the devcontainer from a local Visual Studio Code instance, managing extensions
- **Quick start**:
  - `code tunnel`
  - `code --install-extension ms-python.python`
  - `code --list-extensions`
- **Auth**: GitHub authentication for tunnel mode
- **Docs**: <https://code.visualstudio.com/docs/editor/command-line>

---

## File Utilities

## file

- **Package**: `file` via apt
- **Purpose**: Identifies file type by examining content (magic bytes), not file extension
- **Use when**: Determining the actual type of an unknown file, verifying file formats
- **Quick start**:
  - `file mystery_file`
  - `file -i document.pdf` (MIME type output)
  - `file --brief *.bin`
- **Auth**: None
- **Docs**: `man file`

## xxd

- **Package**: `xxd` via apt
- **Purpose**: Hex dump tool and reverse hex dump converter
- **Use when**: Inspecting binary file contents, creating hex patches, debugging binary protocols
- **Quick start**:
  - `xxd binary_file | head`
  - `xxd -l 64 firmware.bin` (first 64 bytes)
  - `xxd -r hex_patch.txt > patched.bin`
- **Auth**: None
- **Docs**: `man xxd`

## dos2unix

- **Package**: `dos2unix` via apt
- **Purpose**: Converts line endings between DOS (CRLF) and Unix (LF) formats
- **Use when**: Fixing Windows line endings in scripts, normalizing line endings across a project
- **Quick start**:
  - `dos2unix script.sh`
  - `unix2dos readme.txt`
  - `dos2unix -k -n input.txt output.txt` (preserve timestamp)
- **Auth**: None
- **Docs**: `man dos2unix`

## unzip

- **Package**: `unzip` via apt
- **Purpose**: Extract files from ZIP archives
- **Use when**: Extracting ZIP files, listing ZIP contents, extracting specific files
- **Quick start**:
  - `unzip archive.zip`
  - `unzip -l archive.zip` (list contents)
  - `unzip archive.zip -d target_dir/`
- **Auth**: None
- **Docs**: `man unzip`

## xz-utils

- **Package**: `xz-utils` via apt (provides `xz`, `unxz`, `xzcat`)
- **Purpose**: XZ and LZMA compression and decompression
- **Use when**: Compressing files with high ratio, extracting .xz or .lzma archives
- **Quick start**:
  - `xz large_file.tar`
  - `unxz archive.tar.xz`
  - `xzcat compressed.log.xz | grep ERROR`
- **Auth**: None
- **Docs**: `man xz`

---

## Data Processing

## jq

- **Package**: `jq` via apt
- **Purpose**: Lightweight command-line JSON processor
- **Use when**: Parsing JSON API responses, transforming JSON data, extracting values from JSON files
- **Quick start**:
  - `curl -s api.example.com | jq '.data[0]'`
  - `jq '.[] | select(.status == "active")' users.json`
  - `jq -r '.name' config.json`
- **Auth**: None
- **Docs**: `man jq`

## yq

- **Package**: `yq` via manual download (mikefarah/yq)
- **Purpose**: YAML, JSON, XML, CSV, and TOML processor (like jq for YAML)
- **Use when**: Parsing and modifying YAML files, converting between YAML/JSON/XML
- **Quick start**:
  - `yq '.metadata.name' deployment.yaml`
  - `yq -i '.spec.replicas = 3' deployment.yaml`
  - `yq -o json config.yaml` (convert to JSON)
- **Auth**: None
- **Docs**: <https://mikefarah.gitbook.io/yq/>

## yq3

- **Package**: `yq3` via manual download (kislyuk/yq, Python-based)
- **Purpose**: Alternative YAML processor that wraps jq for YAML processing
- **Use when**: Using jq syntax on YAML files, preferring Python-based tooling
- **Quick start**:
  - `yq3 '.services' docker-compose.yml`
  - `yq3 -y '.data' configmap.yaml`
  - `cat values.yaml | yq3 '.global'`
- **Auth**: None
- **Docs**: <https://github.com/kislyuk/yq>

---

## VNC Remote Desktop

## xvfb

- **Package**: `xvfb` via apt (X Virtual Framebuffer)
- **Purpose**: Virtual display server that runs X11 applications without a physical display
- **Use when**: Running GUI applications headlessly, automated browser testing, screenshot generation
- **Quick start**:
  - `Xvfb :99 -screen 0 1920x1080x24 &`
  - `export DISPLAY=:99`
  - `xvfb-run chromium-browser --screenshot page.png https://example.com`
- **Auth**: None
- **Docs**: `man Xvfb`

## x11vnc

- **Package**: `x11vnc` via apt
- **Purpose**: VNC server that shares an existing X11 display over the network
- **Use when**: Remotely viewing the virtual desktop, connecting via VNC client
- **Quick start**:
  - `x11vnc -display :99 -forever -nopw &`
  - `x11vnc -display :99 -rfbport 5900 -passwd secret &`
  - `x11vnc -display :99 -forever -shared`
- **Auth**: Optional password via `-passwd` flag
- **Docs**: `man x11vnc`

## novnc

- **Package**: `novnc` via apt (noVNC)
- **Purpose**: Browser-based VNC client accessible on port 6080
- **Use when**: Accessing the remote desktop from a web browser without installing a VNC client
- **Quick start**:
  - `websockify --web /usr/share/novnc 6080 localhost:5900 &`
  - Open `http://localhost:6080/vnc.html` in a browser
  - `websockify --cert cert.pem 6080 localhost:5900` (with TLS)
- **Auth**: Inherits VNC server authentication
- **Docs**: <https://novnc.com>

## fluxbox

- **Package**: `fluxbox` via apt
- **Purpose**: Lightweight window manager for the X11 desktop environment
- **Use when**: Managing windows in the VNC desktop, providing a minimal desktop experience
- **Quick start**:
  - `fluxbox &` (start after setting DISPLAY)
  - Right-click desktop for application menu
  - Edit `~/.fluxbox/init` for configuration
- **Auth**: None
- **Docs**: `man fluxbox`

---

## Fonts

## JetBrainsMono Nerd Font

- **Package**: Manual download from Nerd Fonts
- **Purpose**: Programming font with coding ligatures and Nerd Font icon glyphs
- **Use when**: Setting terminal or editor font for development with icon support (file type icons, Git indicators)
- **Quick start**:
  - `fc-list | grep JetBrains`
  - Set in terminal preferences as "JetBrainsMono Nerd Font"
- **Auth**: None
- **Docs**: <https://www.nerdfonts.com>

## Hack Nerd Font

- **Package**: Manual download from Nerd Fonts
- **Purpose**: Programming font optimized for source code with Nerd Font icons
- **Use when**: Alternative programming font with icon support
- **Quick start**:
  - `fc-list | grep Hack`
  - Set in terminal preferences as "Hack Nerd Font"
- **Auth**: None
- **Docs**: <https://www.nerdfonts.com>

## FiraCode Nerd Font

- **Package**: Manual download from Nerd Fonts
- **Purpose**: Programming font with coding ligatures (arrows, operators) and Nerd Font icons
- **Use when**: Preferring ligature-enabled font for code readability (=> becomes arrow, etc.)
- **Quick start**:
  - `fc-list | grep FiraCode`
  - Set in terminal preferences as "FiraCode Nerd Font"
- **Auth**: None
- **Docs**: <https://www.nerdfonts.com>

## fonts-noto-color-emoji

- **Package**: `fonts-noto-color-emoji` via apt
- **Purpose**: Google Noto Color Emoji font for full emoji rendering
- **Use when**: Displaying emoji in terminal, browser, or GUI applications
- **Quick start**:
  - `fc-list | grep NotoColorEmoji`
- **Auth**: None
- **Docs**: <https://fonts.google.com/noto/specimen/Noto+Color+Emoji>

## fonts-powerline

- **Package**: `fonts-powerline` via apt
- **Purpose**: Patched fonts for Powerline status line symbols
- **Use when**: Displaying Powerline-compatible prompt segments and status bars
- **Quick start**:
  - `fc-list | grep -i powerline`
- **Auth**: None
- **Docs**: <https://github.com/powerline/fonts>

## ttf-mscorefonts-installer

- **Package**: `ttf-mscorefonts-installer` via apt
- **Purpose**: Microsoft core TrueType fonts (Arial, Times New Roman, Courier New, Verdana, etc.)
- **Use when**: Rendering documents or web pages that require Microsoft fonts, PDF generation with standard fonts
- **Quick start**:
  - `fc-list | grep -i arial`
  - `fc-list | grep -i "Times New Roman"`
- **Auth**: None
- **Docs**: `dpkg -L ttf-mscorefonts-installer`

---

## Documentation

## yelp-tools

- **Package**: `yelp-tools` via apt
- **Purpose**: GNOME documentation build tools for Mallard and DocBook formats
- **Use when**: Building GNOME-style documentation, converting Mallard XML to HTML
- **Quick start**:
  - `yelp-build html .`
  - `yelp-check validate page.page`
  - `yelp-build cache .`
- **Auth**: None
- **Docs**: `man yelp-build`

## man

- **Package**: Pre-installed on most systems
- **Purpose**: Manual page viewer for command-line tools and system calls
- **Use when**: Looking up tool usage, flags, and configuration options
- **Quick start**:
  - `man git`
  - `man -k keyword` (search manual pages)
  - `man 5 crontab` (section 5 — file formats)
- **Auth**: None
- **Docs**: `man man`
