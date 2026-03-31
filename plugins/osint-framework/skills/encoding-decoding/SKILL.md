---
name: encoding-decoding
description: >-
  Encoding and decoding — JavaScript deobfuscation, XOR analysis, barcode/QR
  scanning, hash/crypto operations, and general-purpose transform pipelines.
  Use when the user mentions: encode, decode, base64, hex, barcode, QR code,
  cipher, hash, XOR, deobfuscate, JavaScript obfuscation, CyberChef,
  "decode this payload", "what encoding is this".
user-invocable: false
---

# Encoding & Decoding

Encoding and decoding for OSINT investigations — JavaScript deobfuscation,
XOR key recovery, barcode/QR scanning, hash/crypto operations, and
multi-step transform pipelines.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/encoding-decoding/references/tools.md` for the complete
list of 16 free tools in this category.

## Key CLI Tools

| Tool | Install | Usage |
|------|---------|-------|
| SpiderMonkey | `apt-get install -y libmozjs-115-dev` or build from source: `git clone https://github.com/nicerobot/spidermonkey && cd spidermonkey && make` | `js script.js` |
| Kahu Revelo | Download from `https://www.kahusecurity.com/tools/` (Windows .exe); on Linux run via `wine Revelo.exe` | `wine Revelo.exe sample.js` |
| JavaScript Deobfuscator | Firefox add-on: install from `https://addons.mozilla.org/en-US/firefox/addon/javascript-deobfuscator/`; for headless deobfuscation use `npm install -g js-deobfuscator` | Browser-based; or `js-deobfuscator -i obfuscated.js` |
| XORSearch/XORStrings | Download from `https://blog.didierstevens.com/programs/xorsearch/`; compile: `gcc -o xorsearch xorsearch.c` or `pip install xorsearch` | `xorsearch -s sample.bin "http"` |
| xortool | `pip install xortool` | `xortool -b encoded.bin` |
| unxor | `git clone https://github.com/tomchop/unxor && cd unxor && pip install .` | `unxor -f encoded.bin -k known_plaintext` |
| Kahu Converter | Download from `https://www.kahusecurity.com/tools/` (Windows .exe); on Linux run via `wine Converter.exe` | `wine Converter.exe` (GUI-based) |
| iheartxor.py | `git clone https://github.com/ByteSnipers/iheartxor && chmod +x iheartxor.py` or download from `https://hooked-on-mnemonics.blogspot.com/p/iheartxor.html` | `python iheartxor.py -f sample.bin` |
| XORBruteForcer.py | `curl -O https://raw.githubusercontent.com/jesparza/scripts/master/xorBruteForcer.py` | `python xorBruteForcer.py encoded.bin` |
| NoMoreXOR.py | `git clone https://github.com/hiddenillusion/NoMoreXOR && cd NoMoreXOR && pip install -r requirements.txt` | `python NoMoreXOR.py -f sample.bin` |
| Balbuzard | `pip install balbuzard` or `git clone https://github.com/decalage2/balbuzard && cd balbuzard && python setup.py install` | `balbuzard sample.bin` |
| CyberChef | Local: `git clone https://github.com/gchq/CyberChef && cd CyberChef && npm install && npm run build`; Docker: `docker run -p 8000:8000 ghcr.io/gchq/cyberchef`; or use web at `https://gchq.github.io/CyberChef/` | Open in browser; or use Node API for automation |

## Subcategories

- **Barcodes / QR** — Decode barcodes and QR codes from images and PDFs (ClearImage Barcode Reader)
- **Hash / Crypto** — Hashing, encryption, and cryptographic transforms (CyberChef, Functions Online)
- **JavaScript Deobfuscation** — Unpack and deobfuscate minified or obfuscated JavaScript (SpiderMonkey, Kahu Revelo, JavaScript Deobfuscator, JS Beautifier)
- **XOR Analysis** — Key recovery, brute-forcing, and decoding of XOR-encoded payloads (XORSearch/XORStrings, xortool, unxor, iheartxor.py, XORBruteForcer.py, NoMoreXOR.py, Balbuzard, Kahu Converter)
- **General Encoding** — Base64, hex, URL encoding, ROT13, and multi-step transform chains (CyberChef, DDecode, Functions Online)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Encoding & Decoding tool search",
  prompt="Find OSINT tools for Encoding & Decoding.\n
    Read skills/encoding-decoding/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Encoding & Decoding investigation: [target]",
  prompt="Investigate using Encoding & Decoding tools: [target]\n\n
    Primary: Read skills/encoding-decoding/references/tools.md\n
    Secondary: Read skills/malicious-file-analysis/references/tools.md\n
    Execute available CLI tools (xortool, CyberChef, Balbuzard),
    query web resources, report findings.\n
    Start with passive analysis before executing unknown scripts."
)
```

## Investigation Workflow

1. **Identify encoding**: Examine the payload visually and with CyberChef "Magic" to detect encoding type (Base64, hex, XOR, URL-encoded, obfuscated JS)
2. **Simple decoding**: Apply straightforward transforms first — Base64 decode, URL decode, hex-to-ASCII — using CyberChef or command-line tools
3. **JavaScript deobfuscation**: If the payload is obfuscated JavaScript, beautify with JS Beautifier, then analyze with SpiderMonkey or JavaScript Deobfuscator to reveal hidden logic
4. **XOR analysis**: For suspected XOR-encoded content, estimate key length with xortool, then brute-force with XORSearch or XORBruteForcer.py; use unxor if known plaintext is available
5. **Multi-layer decoding**: Chain CyberChef operations for layered encoding (e.g., Base64 -> gunzip -> XOR -> hex); save recipes for reproducibility
6. **Extract indicators**: Run Balbuzard or manual review to pull URLs, IPs, domains, and other IoCs from decoded output
7. **Pivot**: Hand extracted indicators to `malicious-file-analysis` or `threat-intelligence` for further investigation

## Cross-Category Pivots

- **malicious-file-analysis** — Decoded payloads often reveal malware artifacts; pivot to file analysis tools for deeper inspection of executables, scripts, and documents
- **threat-intelligence** — Extracted IoCs (domains, IPs, hashes) from decoded content should be checked against threat intel feeds and blocklists

## OPSEC Notes

- **Passive tools** (xortool, Balbuzard, XORSearch, CyberChef local, unxor, NoMoreXOR.py, iheartxor.py, XORBruteForcer.py, Kahu Converter, SpiderMonkey): operate entirely offline on local data; no network traffic generated; safe for sensitive samples
- **Active tools** (Kahu Revelo, JavaScript Deobfuscator browser add-on): may execute code or make network requests during deobfuscation; isolate in a sandboxed VM or container before use
- **Web-based tools** (ClearImage Barcode Reader, DDecode, Functions Online, JS Beautifier, CyberChef web): upload data to third-party servers; never submit sensitive or classified payloads to online decoders
- **General guidance**: Always decode suspicious payloads in an isolated environment; never execute untrusted JavaScript or binaries on production systems; log all transformation steps for chain-of-custody documentation
