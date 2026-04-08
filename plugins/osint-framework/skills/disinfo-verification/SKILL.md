---
name: disinfo-verification
description: >-
  Deepfake detection, fact-checking, media authenticity verification,
  and misinformation analysis. Use when the user wants to detect
  deepfakes, verify media authenticity, fact-check claims, or analyze
  image/video manipulation. Activates for "fact check", "deepfake",
  "media verification", "disinformation", "fake news",
  "image manipulation", "video verification", "invid", "fotoforensics".
user-invocable: false
---

# Disinformation & Media Verification

Deepfake detection, fact-checking, media authenticity verification,
and misinformation analysis.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/disinfo-verification/references/tools.md` for the complete
list of 17 free tools in this category.

## Key command-line tools

| Tool | Install | Alt Install | Usage |
| ------ | --------- | ------------- | ------- |
| DeepFake-Detect | `git clone https://github.com/dessa-oss/DeepFake-Detection && pip install -r requirements.txt` | Docker: `docker build -t deepfake-detect .` (from repo) | ResNet18-based deepfake classifier for images/video |
| DeepSafe | `git clone https://github.com/siddharthksah/DeepSafe && pip install -r requirements.txt` | Docker: `docker-compose up` (from repo -- recommended) | Ensemble deepfake detection with web and extension interfaces |
| DeepfakeBench | `git clone https://github.com/SCLBD/DeepfakeBench && pip install -r requirements.txt` | Conda: `conda env create -f environment.yml` | Benchmark framework for comparing deepfake detection models |
| DeepfakeDetector | `git clone https://github.com/TRahulsingh/DeepfakeDetector && pip install -r requirements.txt` | Docker: `docker build -t deepfake-detector .` (from repo) | EfficientNet-based deepfake detector with web interface |
| InVID-WeVerify Verification Plugin | Browser extension: install from Chrome Web Store or Firefox Add-ons | `git clone https://github.com/nicedayforainbow/InVID-WeVerify` | Media verification plugin for reverse search, metadata, keyframes |

### Dockerfile Install Examples

```dockerfile
# DeepFake-Detect (PyTorch + ResNet18)
RUN git clone --depth 1 https://github.com/dessa-oss/DeepFake-Detection /opt/deepfake-detect \
    && cd /opt/deepfake-detect \
    && pip install --no-cache-dir -r requirements.txt

# DeepSafe (Docker Compose -- recommended)
RUN git clone --depth 1 https://github.com/siddharthksah/DeepSafe /opt/deepsafe \
    && cd /opt/deepsafe \
    && pip install --no-cache-dir -r requirements.txt
# Or use: docker-compose -f /opt/deepsafe/docker-compose.yml up

# DeepfakeBench (Conda or pip)
RUN git clone --depth 1 https://github.com/SCLBD/DeepfakeBench /opt/deepfakebench \
    && cd /opt/deepfakebench \
    && pip install --no-cache-dir -r requirements.txt

# DeepfakeDetector (EfficientNet)
RUN git clone --depth 1 https://github.com/TRahulsingh/DeepfakeDetector /opt/deepfake-detector \
    && cd /opt/deepfake-detector \
    && pip install --no-cache-dir -r requirements.txt

# Common ML dependencies for all deepfake tools
RUN pip install --no-cache-dir torch torchvision opencv-python-headless pillow

# InVID-WeVerify (browser extension -- not containerizable; use for
# local workstation installs only)
```

## Subcategories

- **Deepfake Detection** -- DeepFake-Detect, DeepSafe, DeepfakeBench, DeepfakeDetector, TruthScan, FaceForensics++
- **Fact-Checking** -- PolitiFact, Snopes, SciCheck, Duke Reporters' Lab, Stop Fake
- **Image Manipulation** -- FotoForensics (ELA analysis), ImgOps (multi-engine reverse search), TinEye (reverse image search)
- **Video Verification** -- InVID-WeVerify (keyframe extraction, metadata, reverse search), Verification Handbook

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Disinformation & Media Verification tool search",
  prompt="Find OSINT tools for Disinformation & Media Verification.\n
    Read skills/disinfo-verification/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Disinformation & Media Verification investigation: [target]",
  prompt="Investigate media authenticity: [target]\n\n
    Primary: Read skills/disinfo-verification/references/tools.md\n
    Secondary: Read skills/images-videos/references/tools.md\n
    Execute available CLI tools (deepfake detectors), query web
    resources (FotoForensics, TinEye, fact-checkers), report findings.\n
    Start with metadata extraction before running ML classifiers."
)
```

## Investigation Workflow

1. **Collect media**: Obtain the suspect image, video, or claim with full context (source URL, timestamp, social media post)
2. **Metadata extraction**: Check EXIF data, creation dates, GPS coordinates, camera model, software used
3. **Reverse media search**: Run TinEye and ImgOps to find original publication and earlier versions
4. **Image forensics**: Submit to FotoForensics for error level analysis (ELA) to detect manipulation regions
5. **Deepfake analysis**: Run suspect images/video through DeepFake-Detect or DeepSafe for AI-generated content scoring
6. **Video verification**: Use InVID-WeVerify to extract keyframes, check metadata, and run reverse searches on frames
7. **Fact-check claims**: Cross-reference associated claims against PolitiFact, Snopes, SciCheck, and Stop Fake
8. **Benchmark models**: Use DeepfakeBench to compare detector performance if initial results are ambiguous
9. **Document findings**: Record chain of evidence with timestamps, tool outputs, and confidence scores

## Cross-Category Pivots

| Finding | Pivot To |
| --------- | ---------- |
| Image contains GPS coordinates | `geolocation` -- location verification and mapping |
| Social media source identified | `social-networks` -- profile and account analysis |
| Domain hosting disinformation | `domain-recon` -- WHOIS, hosting, infrastructure |
| Email in image metadata | `email-recon` -- breach checks, linked accounts |
| Username of content creator | `username-recon` -- cross-platform enumeration |
| Dark web origin suspected | `dark-web` -- onion service investigation |
| Coordinated campaign indicators | `threat-intelligence` -- IOC enrichment, actor tracking |
| Video from news source | `archives-cache` -- retrieve original/cached versions |

## OPSEC Notes

- **Deepfake detection tools** require GPU for reasonable performance; CPU-only inference is significantly slower
- **FotoForensics** and **TinEye** are web services -- uploading suspect media shares it with the service provider; use local tools for sensitive investigations
- **ImgOps** routes images to multiple third-party services -- be aware of data exposure
- **DeepSafe** supports containerized deployment for air-gapped environments
- All ML-based detectors have false positive/negative rates -- never rely on a single tool; use ensemble approaches
- Strip metadata from your own investigation artifacts before sharing externally
- For sensitive investigations, run deepfake detectors locally rather than using cloud APIs (TruthScan)
- Keep model weights updated -- deepfake generation techniques evolve rapidly and older models lose accuracy
- The InVID-WeVerify plugin runs in-browser and does not require server infrastructure
