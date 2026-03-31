---
name: images-videos
description: >-
  Reverse image search, face recognition, video analysis, document metadata
  extraction, and EXIF data. Use when the user mentions: reverse image,
  face recognition, EXIF, metadata, image search, video analysis, document
  analysis, OCR, font identification, webcam, image forensics.
user-invocable: false
---

# Images, Videos & Documents

Reverse image search, face recognition, video analysis, document metadata extraction, EXIF data, and visual forensics.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Face recognition
tools carry additional ethical and legal considerations — verify
jurisdiction-specific regulations before use.

## Tools Reference

Read `skills/images-videos/references/tools.md` for the complete
list of 89 free/freemium tools in this category.

## Key CLI Tools

| Tool | Install Method | Usage |
|------|---------------|-------|
| RevEye | `git clone https://github.com/steven2358/reveye` | Browser extension; multi-engine reverse image search from right-click menu |
| ImageNet | `pip install imagenet` or download from https://image-net.org/ | Image classification dataset and API for visual taxonomy research |
| Places2 | `git clone https://github.com/CSAILVision/places365` && `pip install torch torchvision` | Scene recognition model; `python run_placesCNN_basic.py --image photo.jpg` |
| Mini Instagram | Download from https://mini-for-instagram.en.softonic.com/ | Lightweight Instagram media viewer and downloader |
| Imgrab | `pip install imgrab` or download from https://www.imgrab.com/ | `imgrab <url>` — batch image download from web pages |
| ExifTool | `apt install libimage-exiftool-perl` or `brew install exiftool` | `exiftool image.jpg` — read/write EXIF, IPTC, XMP metadata |
| FOCA | `git clone https://github.com/ElevenPaths/FOCA` (Windows/.NET) | Document metadata extraction from target domains; finds usernames, paths, software fingerprints |
| GeoSetter | Download installer from https://geosetter.de/en/main-en/ (Windows) | Bulk geotag viewing/editing for photo collections |
| JPEGsnoop | Download from https://www.impulseadventure.com/photo/jpeg-snoop.html (Windows) | JPEG forensic analysis — compression signatures, tamper detection |
| xeuledoc | `pip install xeuledoc` | `xeuledoc <google-doc-url>` — extract owner metadata from public Google Docs/Sheets/Slides |
| Exiv2 | `apt install exiv2` or `brew install exiv2` | `exiv2 image.jpg` — read/write EXIF, IPTC, XMP, ICC metadata |
| MediaInfo | `apt install mediainfo` or `brew install mediainfo` | `mediainfo video.mp4` — codec, bitrate, duration, stream metadata |
| Apache Tika | `apt install default-jre` && download `tika-app.jar` from https://tika.apache.org/ | `java -jar tika-app.jar -m document.pdf` — extract metadata from any file format |
| oletools | `pip install oletools` | `olevba document.docm` — extract macros; `oleid document.doc` — triage indicators |

## Subcategories

- **Images — Reverse Search** — Google Images, Bing Images, Yandex Images, Baidu Images, SauceNAO, Lenso.ai, TinEye; upload an image to find its origin, copies, and modified variants across the web
- **Images — Face Recognition** — FaceCheck, PimEyes, Surfface, FaceSeek; upload a face photo to find matching profiles and public appearances (Active OPSEC; registration often required)
- **Images — Geolocation** — Current Location, Picarta, Flickr Map; estimate or discover where a photo was taken using visual cues or geotagged databases
- **Images — Forensics** — Forensically, JPEGsnoop, C2PA Verify; detect tampering, compression artifacts, and content authenticity signals
- **Images — OCR** — i2OCR, New OCR, Online OCR; extract text from images and scanned documents
- **Videos — Search & Analysis** — Google Videos, Bing Videos, Yahoo Video, Internet Archive; YouTube Geo Search, YouTube Data Tools, Frame by Frame; search, geolocate, and frame-analyze video content
- **Videos — Download & Preservation** — Metatube, Hooktube; capture and archive video content for offline analysis
- **Webcams** — Insecam, EarthCam; discover live camera feeds by location and type
- **Documents — Metadata** — ExifTool, FOCA, xeuledoc, Apache Tika, oletools, Exiv2; extract author names, software versions, timestamps, paths, and embedded objects from documents
- **Documents — Search & Discovery** — Google Docs dorking, Scribd, WikiLeaks, RECAP Court Docs, Cryptome; find public documents hosted on cloud platforms and leak archives
- **Fonts** — What The Font, Font Squirrel Matcherator, IdentiFont, What Font Is; identify typefaces from screenshots

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Images, Videos & Documents tool search",
  prompt="Find OSINT tools for Images, Videos & Documents.\n
    Read skills/images-videos/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Images, Videos & Documents investigation: [target]",
  prompt="Investigate using Images, Videos & Documents tools: [target]\n\n
    Primary: Read skills/images-videos/references/tools.md\n
    Secondary: Read skills/geolocation/references/tools.md (for EXIF GPS pivot)\n
    Execute available CLI tools (exiftool, mediainfo, exiv2, xeuledoc,
    oletools, tika), query web resources, report findings.\n
    Start with passive metadata extraction before active lookups."
)
```

## Investigation Workflow

1. **Identify asset type**: Determine if the target is an image, video, document, or mixed media collection
2. **Metadata extraction**: Run ExifTool (`exiftool -a -G1 file`) to extract all embedded metadata including EXIF, IPTC, XMP, GPS coordinates, camera model, timestamps, and software signatures
3. **Reverse image search**: For images, run through multiple engines (Google, Yandex, Bing, SauceNAO) to find origin, copies, and modified variants; different engines have different geographic coverage
4. **Face recognition** (if applicable): If a face is present and identification is needed, use FaceCheck or PimEyes to search for matching public profiles (Active OPSEC — be aware of registration requirements)
5. **Geolocation**: Extract GPS from EXIF; if absent, use Picarta for AI-based scene geolocation or cross-reference visual cues with mapping tools
6. **Video analysis**: Use MediaInfo for technical metadata; YouTube Geo Search for location-based video discovery; Frame by Frame for temporal analysis of key moments
7. **Document analysis**: Use FOCA for bulk document metadata harvesting from domains; xeuledoc for Google Docs attribution; oletools for Office macro/embedded object inspection; Apache Tika for broad format coverage
8. **Forensic validation**: Use Forensically for error-level analysis and clone detection; JPEGsnoop for compression signature analysis; C2PA Verify for content authenticity manifests
9. **Cross-reference and pivot**: Use extracted metadata (usernames, coordinates, timestamps, software) to pivot into other OSINT categories

## Cross-Category Pivots

- **Geolocation** (`geolocation`) — EXIF GPS coordinates extracted from images/videos can be plotted on maps and cross-referenced with satellite imagery, street view, and location databases
- **People Search** (`people-search-engines`) — Face recognition results and document author metadata (names, email addresses) can feed into people-search and social-media lookups
- **Disinformation & Verification** — Forensic tools (error-level analysis, compression signatures, C2PA manifests) help verify image/video authenticity; reverse image search traces content origin and spread patterns
- **Domain Recon** (`domain-recon`) — Document metadata often leaks internal hostnames, paths, and domain names that can seed domain reconnaissance
- **Username & Social** (`username`, `social-media`) — Author names and account identifiers extracted from document metadata or image hosting profiles can pivot into username enumeration

## OPSEC Notes

- **Passive tools** (metadata extraction, reverse image search via Google/Yandex/Bing): No direct contact with the target; safe for quiet collection
- **Active tools** (face recognition services, Lenso.ai, FOCA domain scanning): May log queries, require registration, or make requests to target infrastructure; assume your query is recorded
- **Face recognition services** (FaceCheck, PimEyes, Surfface, FaceSeek): Typically require account creation; uploaded face images may be retained by the service; read each platform's data retention policy
- **Upload awareness**: Any image uploaded to a reverse search engine or recognition service leaves a trace; strip your own metadata with `exiftool -all= file.jpg` before uploading sensitive material
- **Document metadata leaks**: Documents you analyze may contain your own metadata if re-saved; always inspect outbound files with ExifTool or oletools before sharing
- **Rate limiting**: Many web-based tools (SauceNAO, PimEyes) enforce rate limits on free tiers; distribute queries across engines to avoid blocks
