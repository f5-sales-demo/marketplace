---
name: messaging-comms
description: >-
  Instant messaging and dating platform investigation — Slack, Telegram,
  WhatsApp, WeChat, LINE, Discord, Signal, and dating sites. Use when the
  user mentions: Telegram, Discord, WhatsApp, Signal, Slack, WeChat, LINE,
  messaging, chat, dating site, instant messaging, "message history",
  "chat analysis", "messaging OSINT", "platform lookup".
user-invocable: false
---

# Messaging & Communications

Instant messaging and dating platform investigation — Slack, Telegram,
WhatsApp, WeChat, LINE, Discord, Signal, and dating platforms.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws, platform terms of service, and privacy regulations.
Many messaging platforms have strict anti-scraping policies. Always obtain
proper authorization before accessing private communications data.

## Tools Reference

Read `skills/messaging-comms/references/tools.md` for the complete
list of 12 free tools in this category, focused on dating platforms.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| comms-analyzer-toolbox | `git clone https://github.com/bitsofinfo/comms-analyzer-toolbox.git && cd comms-analyzer-toolbox && docker build -t comms-analyzer-toolbox .` | `docker run --rm -ti -p 5601:5601 -v /path/to/data.csv:/toolbox/data.csv comms-analyzer-toolbox:latest` |
| SlackPirate | `git clone https://github.com/emtunc/SlackPirate.git && cd SlackPirate && pip install -r requirements.txt` | `python SlackPirate.py --token xoxc-TOKEN --cookie COOKIE` |
| slack-intelbot | `git clone https://github.com/pun1sh3r/slack-intelbot.git && cd slack-intelbot && pip install -r requirements.txt` | Configure `config.ini` with API keys, then run the bot |
| slack-web-scraper | `git clone https://github.com/iulspop/slack-web-scraper.git && cd slack-web-scraper && npm install` | Configure `CHANNEL_NAMES` in env, then run with Node.js |
| Tosint | `git clone https://github.com/drego85/tosint.git && cd tosint && pip install -r requirements.txt` | `python3 tosint.py -t BOT_TOKEN -c CHAT_ID` |
| WechatSogou | `pip install wechatsogou` | `import wechatsogou; api = wechatsogou.WechatSogouAPI(); api.search_gzh('query')` |
| wechat-dump | `git clone https://github.com/ppwwyyxx/wechat-dump.git && cd wechat-dump && pip install -r requirements.txt` | `./android-interact.sh db` (requires rooted Android + adb) |
| wechat-text-backup | `git clone https://github.com/zhaofeng-shu33/wechat-text-backup.git` | Extract encrypted SQLite DB from Windows WeChat client |
| linelog2py | `pip install linelog2py` | `from linelog2py import *; messages = Reader.readFile('history.txt')` |
| line-message-analyzer | `git clone https://github.com/chonyy/line-message-analyzer.git` | Open `index.html` in browser or visit <https://chonyy.github.io/line-message-analyzer/> |
| Email2WhatsApp | `go install -v github.com/dsonbaker/email2whatsapp@latest` | `echo 5521912345678 \| email2whatsapp` |
| WhatsApp-OSINT | `git clone https://github.com/kinghacker0/whatsapp-osint.git && cd whatsapp-osint && python3 -m venv myvenv && source myvenv/bin/activate && pip3 install -r requirements.txt` | `python3 whatsapp-osint.py` |

## Subcategories

- **Slack** — Workspace enumeration, channel scraping, token-based extraction, sensitive data discovery (SlackPirate, slack-intelbot, slack-web-scraper)
- **Telegram** — Bot token analysis, chat metadata extraction, channel/group intelligence, admin enumeration (Tosint)
- **WhatsApp** — Phone-to-profile mapping, online status tracking, profile picture retrieval, email-to-number correlation (Email2WhatsApp, WhatsApp-OSINT)
- **WeChat** — Public account scraping via Sogou search, message history extraction from Android/Windows/iOS clients (WechatSogou, wechat-dump, wechat-text-backup)
- **LINE** — Exported chat history parsing, message pattern visualization, statistical analysis (linelog2py, line-message-analyzer)
- **Discord** — Server enumeration, user ID lookup, invite link analysis, bot-based intelligence gathering
- **Signal** — Limited OSINT surface due to encryption; phone number verification, group metadata where accessible
- **Dating Platforms** — Profile discovery, username correlation, location-based matching analysis across Tinder, Bumble, Badoo, Hinge, and others (see references/tools.md)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Messaging & Communications tool search",
  prompt="Find OSINT tools for Messaging & Communications.\n
    Read skills/messaging-comms/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Messaging & Communications investigation: [target]",
  prompt="Investigate using Messaging & Communications tools: [target]\n\n
    Primary: Read skills/messaging-comms/references/tools.md\n
    Secondary: Read skills/username-recon/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with passive reconnaissance before any active interaction."
)
```

## Investigation Workflow

1. **Identify Platform** — Determine which messaging platform(s) are relevant to the target (Slack, Telegram, WhatsApp, WeChat, LINE, Discord, Signal, dating)
2. **Username/Phone Pivot** — Check if a known username, email, or phone number is registered on the target platform
3. **Profile Enumeration** — Gather publicly available profile data (display name, avatar, status, bio, last seen)
4. **Group/Channel Discovery** — Identify public groups, channels, or workspaces the target participates in
5. **Content Analysis** — Extract and analyze accessible message history, shared media, and metadata
6. **Communications Graph** — Map connections between accounts, administrators, and participants using comms-analyzer-toolbox
7. **Cross-Platform Correlation** — Pivot findings to other messaging platforms and social networks
8. **Timeline Reconstruction** — Build activity timeline from message timestamps, online status, and join dates

## Cross-Category Pivots

- **username-recon** — Correlate messaging handles with accounts on other platforms
- **phone-recon** — Phone numbers are primary identifiers for WhatsApp, Signal, Telegram, and LINE
- **social-networks** — Messaging profiles often link to or mirror social media accounts
- **email-recon** — Email addresses can be used to discover WhatsApp numbers (Email2WhatsApp) and Slack workspaces
- **people-search** — Combine messaging data with public records for identity resolution

## OPSEC Notes

- **Token exposure**: Slack and Telegram tools require API tokens or cookies. Never commit tokens to repositories or share them in logs.
- **Active vs passive**: Tools like SlackPirate and WhatsApp-OSINT actively interact with platform APIs and may trigger alerts or rate limits. Prefer passive lookups first.
- **Authentication footprint**: Many tools require logging in or linking a phone number, which ties your identity to the investigation. Use dedicated research accounts.
- **QR code scanning**: Email2WhatsApp and WhatsApp Web-based tools require scanning QR codes with a real WhatsApp account — this creates a direct link between investigator and platform.
- **Data retention**: Exported chat histories and scraped data may contain PII. Store securely and handle according to data protection requirements.
- **Platform detection**: Messaging platforms actively detect and block scraping. Respect rate limits and be aware that accounts used for OSINT may be suspended.
- **Encrypted platforms**: Signal and WhatsApp use end-to-end encryption. OSINT is limited to metadata, profile data, and publicly shared content unless device access is available.
