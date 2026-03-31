# Encoding / Decoding — OSINT Tools Reference

> Auto-generated from arf.json. 16 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Barcodes / QR
- Javascript
- PHP
- XOR

---

### ClearImage Barcode Reader

- **URL**: <https://online-barcode-reader.inliteresearch.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Barcode and QR code decoding from uploaded files
- **Input**: Image files and PDFs containing barcode or QR symbols
- **Output**: Decoded barcode and QR payload values
- **Description**: Web-based barcode and QR code recognition tool using Inlite Research ClearImage technology for common image and document formats.

### JS Beautifier

- **URL**: <https://beautifier.io/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Fast readability improvements for packed JavaScript
- **Input**: Minified or obfuscated JavaScript source text
- **Output**: Formatted JavaScript with normalized structure and spacing
- **Description**: Open-source JavaScript formatter that rewrites minified or obfuscated code into readable, consistently indented source.

### SpiderMonkey (T)

- **URL**: <https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Local JavaScript execution and behavior testing without browser UI
- **Input**: JavaScript source code
- **Output**: Execution results, runtime behavior, and script output
- **Description**: Mozilla JavaScript engine used by Firefox and available for standalone execution and analysis in local environments.

### Kahu Revelo (T)

- **URL**: <https://www.kahusecurity.com/tools/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Unpacking heavily obfuscated JavaScript samples on Windows
- **Input**: Obfuscated JavaScript files or script text
- **Output**: Deobfuscated code and decoded runtime content
- **Description**: Windows-focused JavaScript deobfuscation utility that executes scripts in a controlled environment to reveal hidden logic.

### JavaScript Deobfuscator (T)

- **URL**: <https://addons.mozilla.org/en-US/firefox/addon/javascript-deobfuscator/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Browser-native JavaScript deobfuscation during web investigations
- **Input**: JavaScript loaded in Firefox pages or pasted script content
- **Output**: Readable deobfuscated script output in browser tooling
- **Description**: Firefox add-on for inspecting and deobfuscating JavaScript in-browser during page analysis and script review.

### DDecode - PHP Decoder

- **URL**: <https://ddecode.com/phpdecoder/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Rapid decoding of obfuscated PHP webshell and malware snippets
- **Input**: Encoded or obfuscated PHP code
- **Output**: Decoded and expanded PHP source text
- **Description**: Online decoder for layered PHP obfuscation chains such as eval, base64, gzinflate, and related encoding wrappers.

### XORSearch & XORStrings (T)

- **URL**: <https://blog.didierstevens.com/programs/xorsearch/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: String extraction and key hunting in encoded malware payloads
- **Input**: Binary files and encoded byte streams
- **Output**: Decoded candidate strings across transformation and key ranges
- **Description**: Didier Stevens command-line utilities for locating XOR, ROL, ROT, and SHIFT-encoded strings in suspicious binaries.

### xortool (T)

- **URL**: <https://github.com/hellman/xortool>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Recovering repeating XOR keys from encoded files
- **Input**: XOR-encrypted text or binary data
- **Output**: Likely XOR keys and candidate decrypted output
- **Description**: Python-based XOR analysis tool that estimates key lengths and recovers likely multi-byte keys via frequency analysis.

### unxor (T)

- **URL**: <https://github.com/tomchop/unxor>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Known-plaintext XOR cracking against malware and encoded artifacts
- **Input**: XOR-encoded file plus known plaintext fragments
- **Output**: Recovered keystream segments and decoded content
- **Description**: Known-plaintext XOR analysis utility for deriving keystreams and recovering original content from encoded samples.

### Kahu Converter Utilities (T)

- **URL**: <https://www.kahusecurity.com/tools/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Mixed conversion and XOR utility operations on Windows
- **Input**: Binary blobs, hex strings, and text samples
- **Output**: Converted data and decoded intermediate representations
- **Description**: Windows utility collection for format conversion, hex/binary transforms, and XOR-related decoding workflows.

### iheartxor.py (T)

- **URL**: <https://hooked-on-mnemonics.blogspot.com/p/iheartxor.html>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Targeted extraction of XOR-obfuscated strings from binaries
- **Input**: Binary data, dumps, or encoded string segments
- **Output**: Recovered candidate strings and associated key bytes
- **Description**: Python script for brute-forcing XOR-obfuscated strings within defined boundaries to reveal hidden text in malware samples.

### XORBruteForcer.py (T)

- **URL**: <https://github.com/jesparza/scripts/blob/master/xorBruteForcer.py>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Single-byte XOR key brute-forcing and quick validation
- **Input**: Encoded file or byte sequence
- **Output**: Decoded candidates mapped to tested XOR key values
- **Description**: Single-byte XOR brute-force Python script that iterates candidate key values and surfaces matching decoded output.

### NoMoreXOR.py (T)

- **URL**: <https://github.com/hiddenillusion/NoMoreXOR>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Recovering long XOR keys in malware binaries
- **Input**: Malware sample or obfuscated binary content
- **Output**: Likely keys, decoded streams, and extraction hints
- **Description**: Python utility for recovering long XOR keys using character frequency heuristics and YARA-assisted pattern matching.

### Balbuzard (T)

- **URL**: <https://github.com/decalage2/balbuzard>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Automated deobfuscation and indicator extraction from suspicious files
- **Input**: Suspicious binaries and encoded artifact files
- **Output**: Decoded content, extracted IoCs, and pattern-analysis results
- **Description**: Python malware analysis toolkit that extracts indicators and brute-forces common obfuscation patterns including XOR and rotation transforms.

### CyberChef

- **URL**: <https://gchq.github.io/CyberChef/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Building and replaying multi-step decode and transform recipes
- **Input**: Text, binary, hex, Base64, and structured payloads
- **Output**: Transformed output for each selected operation chain
- **Description**: GCHQ-maintained browser workbench for chained encoding, decoding, hashing, crypto, and data transformation operations.

### Functions Online

- **URL**: <https://www.functions-online.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick PHP-specific encoding and decoding checks in browser
- **Input**: Function parameters and data strings for selected PHP routines
- **Output**: Computed function results and transformed data values
- **Description**: PHP-oriented online utility suite for common encoding, decoding, hashing, and string-manipulation function tests.
