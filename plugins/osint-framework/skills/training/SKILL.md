---
name: training
description: >-
  OSINT training resources, CTF challenges, practice platforms, and
  educational materials. Use when the user mentions: OSINT training,
  CTF, practice, learning, education, OSINT course, geolocation game,
  verification quiz, skill development.
user-invocable: false
---

# Training

OSINT training resources -- games, CTF challenges, courses, practice
platforms, and reference guides for developing investigation skills.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/training/references/tools.md` for the complete
list of 4 free/freemium tools in this category.

## Web Resources

| Tool | URL | Pricing | Best For |
|------|-----|---------|----------|
| GeoGuessr | geoguessr.com | Freemium | Geolocation skills via Street View challenges |
| Verification Quiz Bot | x.com/quiztime | Free | Daily community OSINT verification challenges |
| Forensic OSINT KB Guides | forensicosint.com/osint-guide | Freemium | Evidence preservation and forensic documentation training |
| Smart Questions | catb.org/esr/faqs/smart-questions.html | Free | Research methodology and effective questioning |

## Subcategories

- **Games** -- Gamified skill-building for geolocation and visual intelligence (GeoGuessr)
- **CTF & Challenges** -- Community-driven verification quizzes and capture-the-flag exercises (Verification Quiz Bot)
- **Courses & Guides** -- Structured learning for forensic OSINT and evidence handling (Forensic OSINT KB Guides)
- **Practice & Methodology** -- Foundational research skills and question framing (Smart Questions)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Training resource search",
  prompt="Find OSINT training resources.\n
    Read skills/training/references/tools.md\n
    Return recommendations matching the user's specific learning need."
)
```

### Guided Learning

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Training guidance: [topic]",
  prompt="Recommend training resources for OSINT skill: [topic]\n\n
    Primary: Read skills/training/references/tools.md\n
    Also consider tools from related skill categories for hands-on practice.\n
    Return a learning path with resources and exercises."
)
```

## Usage Workflow

1. **Assess Skill Level**: Identify which OSINT areas need development (geolocation, verification, documentation, research methodology)
2. **Start with Fundamentals**: Read Smart Questions to build strong research and questioning habits
3. **Practice Geolocation**: Use GeoGuessr to develop visual intelligence and location identification skills
4. **Join Community Challenges**: Follow @quiztime on X for daily verification exercises with community discussion
5. **Learn Evidence Handling**: Study Forensic OSINT KB Guides for proper evidence capture and chain-of-custody procedures
6. **Apply to Real Categories**: Practice skills using tools from specific OSINT categories (domain-recon, social-networks, images-videos, etc.)
7. **Iterate**: Return to challenges regularly to sharpen skills over time

## Cross-Category Pivots

Training resources connect to all OSINT categories as learning tools:

| Skill Area | Practice With |
|------------|---------------|
| Geolocation | `geolocation` -- Apply GeoGuessr skills to real investigations |
| Image verification | `images-videos` -- Reverse image search, EXIF analysis |
| Evidence capture | `documentation-evidence` -- Screenshot, archival, timeline tools |
| Domain analysis | `domain-recon` -- WHOIS, DNS, subdomain enumeration |
| Social media | `social-networks` -- Platform-specific investigation techniques |
| Disinformation | `disinfo-verification` -- Fact-checking and media verification |

## OPSEC Notes

- All 4 tools are **passive** and safe for learning
- GeoGuessr requires **registration** and is freemium (limited free plays per day)
- Verification Quiz Bot requires an X (Twitter) account to participate in discussions
- Forensic OSINT KB Guides require **registration** for full access to some content
- When practicing with real-world tools from other categories, always follow OPSEC best practices from the `opsec` skill
- Never practice OSINT techniques against real individuals without proper authorization
