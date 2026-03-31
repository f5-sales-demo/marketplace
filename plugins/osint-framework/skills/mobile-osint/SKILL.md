---
name: mobile-osint
description: >-
  Mobile device intelligence — Android/iOS app analysis, mobile forensics,
  emulators, messaging app reconnaissance, and device fingerprinting.
  Use when the user mentions: mobile, Android, iOS, app analysis, APK,
  mobile forensics, IMEI, device, emulator, mobile app, phone app,
  reverse engineering APK, mobile security, app permissions.
user-invocable: false
---

# Mobile OSINT

Mobile device intelligence — Android/iOS app analysis, mobile forensics,
emulators, messaging app reconnaissance, and device fingerprinting.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Mobile forensics
and app analysis must only be performed on devices and applications
you own or have explicit authorization to examine. Intercepting
communications or bypassing encryption without authorization may
violate federal and state wiretapping laws.

## Tools Reference

Read `skills/mobile-osint/references/tools.md` for the complete
list of 29 free/freemium tools in this category.

## Key CLI Tools

### Emulators

| Tool | Install Method | Usage |
|------|---------------|-------|
| Genymotion | Download installer from https://www.genymotion.com/ (requires registration) | `genymotion` — launch emulator for APK testing and forensic analysis |
| BlueStacks | Download installer from https://www.bluestacks.com/ | `BlueStacks` — lightweight Android emulator for app analysis |
| Nox | Download installer from https://www.bignox.com/ | `nox` — Android emulator with root access and multi-version support |

### Messaging Apps

| Tool | Install Method | Usage |
|------|---------------|-------|
| Signal | `snap install signal-desktop` or `apt install signal-desktop` (via Signal apt repo) | Desktop client — verify accounts via phone number, inspect profiles |
| Riot.im (Element) | `apt install element-desktop` or `snap install element-desktop` | Matrix client — monitor public communities and channels |
| Telegram | `snap install telegram-desktop` or `apt install telegram-desktop` | `telegram-desktop` — user discovery, channel monitoring, group recon |
| Snapchat | Mobile-only (use emulator for desktop analysis) | Profile lookup, snap map location tracking, story analysis |
| WhatsApp | Download from https://www.whatsapp.com/ or `snap install whatsapp-for-linux` | Account verification via phone number, profile and status discovery |
| Kik | Mobile-only (use emulator for desktop analysis) | Username search, profile analysis, public discovery |
| Yik Yak | Mobile-only (use emulator for desktop analysis) | Location-based anonymous post monitoring, community sentiment |
| LINE | Download from https://line.me/ or use emulator | User discovery, profile analysis, account verification (Asia-focused) |
| Periscope | Integrated into Twitter/X — use web interface | Live broadcast monitoring, location metadata extraction |
| Meerkat | Dormant service — historical archive analysis only | Legacy stream archive analysis |
| Truecaller | `snap install truecaller` or mobile app via emulator | Phone number verification, reverse caller ID lookup |

### Forensics and Analysis Tools

| Tool | Install Method | Usage |
|------|---------------|-------|
| APKLeaks | `pip install apkleaks` | `apkleaks -f app.apk` — scan APKs for hardcoded secrets and API endpoints |
| APKtool | `apt install apktool` or download JAR from https://apktool.org/ | `apktool d app.apk` — decompile APK to smali and resources |
| JADX | `apt install jadx` or download from https://github.com/skylot/jadx/releases | `jadx app.apk -d output/` — decompile DEX to Java source code |
| MobSF | `pip install mobsf` or `docker run -p 8000:8000 opensecurity/mobile-security-framework-mobsf` | `mobsf` — comprehensive static and dynamic mobile app security analysis |
| Autopsy | `apt install autopsy` or download from https://www.autopsy.com/ | `autopsy` — digital forensics platform for mobile device data extraction |
| Frida | `pip install frida-tools` | `frida -U -f com.app.target -l script.js` — runtime instrumentation and API interception |
| OSINT Researcher | iOS App Store only (https://apps.apple.com/us/app/osint-researcher/id6747302251) | GitHub organization recon, team structure analysis |

## Subcategories

- **Android** — APK analysis, emulator-based testing, Android-specific forensics
- **iOS** — IPA analysis, jailbreak forensics, App Store intelligence
- **App Analysis** — Decompilation, secret extraction, permission auditing, code review
- **Mobile Forensics** — Device data extraction, database analysis, deleted file recovery
- **Emulators** — Android emulation for testing, rooted environment simulation

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Mobile OSINT tool search",
  prompt="Find OSINT tools for mobile OSINT.\n
    Read skills/mobile-osint/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Mobile OSINT investigation: [target]",
  prompt="Investigate using mobile OSINT tools: [target]\n\n
    Primary: Read skills/mobile-osint/references/tools.md\n
    Secondary: Read skills/phone-recon/references/tools.md\n
    Execute available CLI tools (apktool, jadx, apkleaks, frida),
    query web resources, report findings.\n
    Start with passive analysis (static decompilation) before
    active instrumentation (frida, dynamic analysis)."
)
```

## Investigation Workflow

1. **Identify target**: Determine whether investigating an app (APK/IPA), a device, or a mobile user
2. **Static analysis**: Decompile the APK with `apktool` or `jadx` to review code, permissions, and manifest
3. **Secret scanning**: Run `apkleaks` to extract hardcoded API keys, endpoints, and credentials
4. **Security audit**: Use MobSF for comprehensive vulnerability and permission analysis
5. **Dynamic analysis**: Attach `frida` to a running app in an emulator to intercept API calls and runtime behavior
6. **Messaging recon**: Check target presence on messaging platforms (Telegram, WhatsApp, Signal) via phone number or username
7. **Phone pivot**: Use `truecaller` for reverse phone lookup, then pivot to `phone-recon` for deeper analysis
8. **Forensic extraction**: Use `autopsy` for device backup analysis, SQLite database recovery, and artifact extraction
9. **Correlate findings**: Cross-reference discovered accounts, phone numbers, and identifiers across platforms

## Cross-Category Pivots

- **phone-recon** — Phone numbers discovered in app data or messaging profiles; reverse caller ID; carrier lookup
- **messaging-comms** — Messaging platform accounts found during mobile analysis; chat history; group membership
- **social-networks** — Social media accounts linked from mobile apps; profile data extracted from app databases

## OPSEC Notes

- **Static analysis is passive**: Decompiling APKs locally with `apktool`, `jadx`, or `apkleaks` generates no network traffic and is undetectable
- **Emulator detection**: Many apps detect emulated environments (Genymotion, BlueStacks, Nox) and alter behavior; use rooted emulators with detection bypass
- **Frida is active**: Runtime instrumentation modifies app behavior and may trigger anti-tampering protections; use only on controlled devices
- **Messaging lookups are active**: Checking phone numbers on WhatsApp, Telegram, or Truecaller may notify the target or leave traces
- **MobSF dynamic analysis**: Running apps in MobSF dynamic mode generates network traffic to app servers; use isolated networks
- **Registration requirements**: Signal, Telegram, WhatsApp, and Truecaller require phone number registration, which creates attribution risk
- **Prefer passive first**: Always exhaust static analysis and public data before engaging in active instrumentation or account-based lookups
