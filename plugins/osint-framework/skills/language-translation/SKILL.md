---
name: language-translation
description: >-
  Text translation, language detection, OCR, and multilingual OSINT support.
  Use when the user mentions: translate, language detection, translation, multilingual,
  OCR, font identification, slang decoder, foreign language document.
user-invocable: false
---

# Language Translation

Text translation, language detection, OCR extraction, slang decoding,
and multilingual support for OSINT investigations. This is a
cross-cutting capability that supports all other investigation categories.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Uploaded documents
may be processed server-side by translation services.

## Tools Reference

Read `skills/language-translation/references/tools.md` for the complete
list of 16 free tools in this category.

## Web Resources

| Resource | URL | Best For |
|----------|-----|----------|
| Google Translate | https://translate.google.com/ | Broadest language coverage, webpage translation (API) |
| DeepL Translator | https://www.deepl.com/en/translator | High-accuracy document and technical translation (API) |
| Bing Translate | https://translator.bing.com/ | Microsoft ecosystem translation (API) |
| i2OCR | https://www.i2ocr.com/ | Multilingual OCR from images, no registration |
| New OCR | https://www.newocr.com/ | Tesseract-based OCR from scanned pages |
| Online OCR (onlineocr.net) | https://www.onlineocr.net/ | OCR to Word/Excel/text conversion |
| SodaPDF OCR | https://www.sodapdf.com/pdf-tools/ocr-pdf/ | Scanned PDF to searchable PDF |
| Urban Dictionary | https://www.urbandictionary.com/ | Emerging slang and cultural terms |
| NoSlang | https://www.noslang.com/ | Internet slang and text abbreviation decoder |
| Slangit | https://slang.net/ | Modern internet terminology |
| Google Input Tools | https://www.google.com/inputtools/ | Non-Latin script typing and transliteration |
| WhatTheFont | https://www.myfonts.com/pages/whatthefont/ | Font identification from screenshots |
| Wiktionary | https://en.wiktionary.org/ | Etymology, definitions, multilingual translations |
| WordReference | https://www.wordreference.com/ | Bilingual dictionary with conjugation |
| Cambridge Dictionary | https://dictionary.cambridge.org/ | Word-level translation and pronunciation |

## Subcategories

- **Text Translation** -- Machine translation services (Google, DeepL, Bing)
- **OCR / Visual Text** -- Extract text from images, PDFs, scanned documents
- **Slang / Informal Language** -- Decode internet slang, abbreviations, cultural terms
- **Dictionary / Reference** -- Bilingual dictionaries, etymology, conjugation
- **Input / Transliteration** -- Type in non-Latin scripts, transliterate between scripts
- **Font / Visual Analysis** -- Identify fonts from images for document provenance

## Investigation Workflow

1. **Language identification**: Paste unknown text into Google Translate for auto-detection
2. **High-quality translation**: Use DeepL for nuanced translation of documents and reports
3. **OCR extraction**: Upload images/PDFs to i2OCR or New OCR to extract foreign text
4. **Slang decoding**: Check Urban Dictionary, NoSlang, Slangit for informal language
5. **Dictionary verification**: Cross-check translations with WordReference or Cambridge Dictionary
6. **Script input**: Use Google Input Tools to type non-Latin queries for foreign-language searches
7. **Font forensics**: Use WhatTheFont to identify fonts in screenshots for document analysis
8. **Iterate**: Translate extracted text, then feed translated terms back into other OSINT tools

## curl / API Patterns

### DeepL -- Translate Text

```bash
curl -s -X POST "https://api-free.deepl.com/v2/translate" \
  -d "auth_key=YOUR_KEY" \
  -d "text=Ermittlungen gegen unbekannt" \
  -d "target_lang=EN" \
  | jq '.translations[] | {detected_source_language, text}'
```

### DeepL -- Detect Language

```bash
curl -s -X POST "https://api-free.deepl.com/v2/translate" \
  -d "auth_key=YOUR_KEY" \
  -d "text=Ce document est confidentiel" \
  -d "target_lang=EN" \
  | jq '.translations[0].detected_source_language'
```

### Google Translate -- via Google Cloud API

```bash
curl -s -X POST "https://translation.googleapis.com/language/translate/v2" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "Untersuchungsbericht",
    "target": "en",
    "key": "YOUR_API_KEY"
  }' | jq '.data.translations[] | {translatedText, detectedSourceLanguage}'
```

### Google Translate -- Detect Language

```bash
curl -s -X POST "https://translation.googleapis.com/language/translate/v2/detect" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "texto desconocido aqui",
    "key": "YOUR_API_KEY"
  }' | jq '.data.detections[][0] | {language, confidence}'
```

### Bing / Microsoft Translator -- Translate Text

```bash
curl -s -X POST "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en" \
  -H "Ocp-Apim-Subscription-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"Text":"Informe de investigacion"}]' \
  | jq '.[0] | {detectedLanguage, translations}'
```

### Free Translation Shortcut -- Google Translate URL Pattern

```bash
# Quick translation without API key (returns HTML, parse as needed)
curl -s "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=Bonjour+le+monde" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0][0][0])"
```

### OCR Workflow -- Extract then Translate

```bash
# Step 1: OCR an image using Tesseract (local)
tesseract foreign_document.png stdout -l deu 2>/dev/null > /tmp/extracted.txt

# Step 2: Translate extracted text
curl -s -X POST "https://api-free.deepl.com/v2/translate" \
  -d "auth_key=YOUR_KEY" \
  -d "text=$(cat /tmp/extracted.txt)" \
  -d "target_lang=EN" \
  | jq '.translations[0].text'
```

## Cross-Category Pivots

This skill supports ALL other OSINT categories as a utility capability:

| Scenario | Pivot to | Why |
|----------|----------|-----|
| Foreign-language social media posts | `social-networks` | Translate then search in native language |
| Non-English domain WHOIS data | `domain-recon` | Understand registrant details |
| Foreign court documents | `public-records` | Translate legal filings for analysis |
| Foreign company filings | `business-records` | Translate annual reports, registry data |
| Non-English classified listings | `classifieds` | Translate listing details, seller info |
| Foreign-language threat intel | `threat-intelligence` | Translate forum posts, dark web content |
| Non-Latin script usernames | `username-recon` | Transliterate then search cross-platform |
| Foreign shipping/vessel names | `transportation` | Translate vessel data, port information |

## OPSEC Notes

- Google Translate, DeepL, and Bing are **active** -- text submitted is processed server-side
- Translation APIs log submitted text; do not translate sensitive operational content
- OCR services (i2OCR, New OCR, onlineocr.net) upload files to remote servers
- For sensitive documents, use local Tesseract OCR instead of web services
- Google Input Tools runs client-side -- safer for non-Latin script input
- Dictionary sites (Wiktionary, WordReference, Cambridge) are passive lookups
- Slang dictionaries are passive and do not log queries meaningfully
- WhatTheFont uploads images to MyFonts servers for processing
- Consider running Tesseract locally: `apt install tesseract-ocr tesseract-ocr-[lang]`
- For air-gapped translation, use locally hosted models (e.g., Argos Translate, LibreTranslate)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Language Translation tool search",
  prompt="Find OSINT tools for Language Translation.\n
    Read skills/language-translation/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Language Translation investigation: [target]",
  prompt="Translate and analyze foreign-language content: [target]\n\n
    Primary: Read skills/language-translation/references/tools.md\n
    Use Google Translate for language detection, DeepL for accuracy,
    OCR tools for image-based text extraction.\n
    Return translated content with source language identification."
)
```
