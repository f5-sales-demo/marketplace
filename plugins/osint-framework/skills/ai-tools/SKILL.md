---
name: ai-tools
description: >-
  AI-powered OSINT analysis tools -- deepfake detection, AI content
  identification, and machine learning assisted intelligence gathering.
  Use when the user mentions: AI OSINT, deepfake detection, AI analysis,
  AI-generated content, AI detection, AI image detector, content
  verification, LLM tools, AI chat.
user-invocable: false
---

# AI Tools

AI-powered OSINT analysis tools -- deepfake detection, AI content
identification, content generation detection, and ML-assisted
intelligence gathering.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/ai-tools/references/tools.md` for the complete
list of 19 free tools in this category.

## Web Resources

| Tool | URL | Best For |
| ------ | ----- | ---------- |
| **AI Detection -- Text** | | |
| GPTZero | gptzero.me | AI-generated text detection and classification |
| Copyleaks | copyleaks.com | AI content and plagiarism detection |
| Grammarly AI Detector | grammarly.com/ai-detector | Quick AI text detection integrated with writing tools |
| Hugging Face AI Detector | huggingface.co/spaces/umm-maybe/AI_Detector | Open-source AI text detection model |
| **AI Detection -- Images** | | |
| AI or Not | aiornot.com | Binary AI-generated image classification |
| Decopy AI Image Detector | decopy.ai | AI image detection with confidence scoring |
| DeepAI AI Image Detector | deepai.org | AI image detection and analysis |
| Illuminarty | app.illuminarty.ai | AI-generated image and text detection |
| WasItAI | wasitai.com | Simple AI image detection |
| **AI Detection -- Deepfakes & Video** | | |
| Hive AI Content Detection | hivemoderation.com | Multi-modal AI content detection (text, image, video) |
| TrueMedia | truemedia.org | Deepfake and manipulated media detection |
| **AI Analysis & Research** | | |
| OSINT Analyser | github.com/joestanding/osint-analyser | AI-assisted OSINT data analysis |
| DocMind AI | github.com/BjornMelin/docmind-ai-llm | AI-powered document analysis |
| World Monitor | worldmonitor.app | AI-driven global event monitoring |
| **AI Chat & Generation** | | |
| DeepSeek | deepseek.com | Open-weight LLM for research queries |
| DuckDuckGo AI Chat | duckduckgo.com/aichat | Privacy-focused AI chat (no tracking) |
| Microsoft Copilot | copilot.microsoft.com | AI assistant with web search integration |
| Ollama | ollama.com | Local LLM hosting for private analysis |
| You.com | you.com | AI search with source citations |

## Subcategories

- **AI Detection -- Text** -- Identify AI-generated text content (GPTZero, Copyleaks, Grammarly AI Detector, Hugging Face AI Detector)
- **AI Detection -- Images** -- Detect AI-generated or manipulated images (AI or Not, Decopy, DeepAI, Illuminarty, WasItAI)
- **AI Detection -- Deepfakes & Video** -- Identify deepfake videos and manipulated media (Hive AI, TrueMedia)
- **AI Analysis & Research** -- ML-assisted OSINT data analysis and document processing (OSINT Analyser, DocMind AI, World Monitor)
- **AI Chat & Generation** -- LLM-powered research assistants for querying and summarization (DeepSeek, DuckDuckGo AI Chat, Copilot, Ollama, You.com)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="AI Tools tool search",
  prompt="Find AI-powered OSINT tools.\n
    Read skills/ai-tools/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="AI content analysis: [target]",
  prompt="Analyze content for AI generation or manipulation: [target]\n\n
    Primary: Read skills/ai-tools/references/tools.md\n
    Secondary: Read skills/disinfo-verification/references/tools.md\n
    Execute available tools, query web resources, report findings.\n
    Use multiple detectors and cross-reference results."
)
```

## Investigation Workflow

1. **Classify Content Type**: Determine if the target is text, image, video, or multi-modal
2. **Text Detection**: For suspected AI text, run through GPTZero and Copyleaks; cross-reference with Grammarly AI Detector
3. **Image Detection**: For suspected AI images, submit to AI or Not, Decopy, and Illuminarty; compare confidence scores
4. **Deepfake Analysis**: For video content, use TrueMedia and Hive AI for manipulation detection
5. **Cross-reference**: No single detector is definitive; use at least 2-3 tools and compare results
6. **Context Check**: Pivot to `disinfo-verification` for fact-checking and source verification
7. **Document Analysis**: For large document sets, use DocMind AI or OSINT Analyser for pattern extraction
8. **Private Analysis**: For sensitive content, use Ollama locally to avoid sending data to cloud services

## Cross-Category Pivots

| When you find... | Pivot to |
| ------------------ | ---------- |
| Suspected disinformation campaign | `disinfo-verification` -- Fact-checking, source verification |
| AI-generated face images | `images-videos` -- Reverse image search, EXIF analysis |
| Manipulated media in social posts | `social-networks` -- Platform-specific investigation |
| AI-generated text in public documents | `documentation-evidence` -- Evidence capture and preservation |

## OPSEC Notes

- All 19 tools are **passive** with no registration required for basic use
- Cloud-based detectors (GPTZero, Copyleaks, Hive) receive and may store uploaded content -- do not submit classified or sensitive material
- Use Ollama for **local-only** analysis when content sensitivity is a concern
- DuckDuckGo AI Chat is the most privacy-friendly chat option (no tracking, no persistent logs)
- AI detection accuracy varies significantly; false positives and false negatives are common
- Detection tools are in an arms race with generation tools; results degrade as generators improve
- Always document which tools and versions were used for detection, as results may not be reproducible later
- Cross-reference AI detection results with traditional verification methods from `disinfo-verification`
