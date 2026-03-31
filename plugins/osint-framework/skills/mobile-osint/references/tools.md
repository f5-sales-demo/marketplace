# Mobile OSINT — OSINT Tools Reference

> Auto-generated from arf.json. 29 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Android
- App Analysis
- Device Forensics
- iOS

---

### Genymotion (T)

- **URL**: <https://www.genymotion.com/>
- **Type**: CLI
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Testing mobile apps, forensic analysis, multi-device simulation
- **Input**: APK files, app bundles
- **Output**: Runtime behavior, app data artifacts, system logs
- **Description**: Cloud-based and desktop Android emulator platform for app testing and forensic analysis. Supports multi-instance deployment and integration with security testing tools.

### BlueStacks 2 (T)

- **URL**: <https://www.bluestacks.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Quick Android testing, forensic artifact extraction, app analysis
- **Input**: APK files, installed apps
- **Output**: App data, SQLite databases, shared preferences, file system artifacts
- **Description**: Free, lightweight Android emulator for desktop. Includes built-in forensic capabilities for data extraction from installed apps.

### Nox App Player

- **URL**: <https://www.bignox.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Android version testing, app analysis, rooted device simulation
- **Input**: APK files, apps
- **Output**: App behavior, system-level data, rooted access artifacts
- **Description**: Free Android emulator with support for multiple Android versions and root access. Used for app analysis and testing.

### Apk Online

- **URL**: <https://apk.online/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick APK analysis, permission review, app feature reconnaissance
- **Input**: App package names or APK files
- **Output**: APK downloads, permission lists, app metadata, manifest data
- **Description**: Browser-based tool for analyzing and downloading APK files. Allows viewing app permissions, features, and metadata without installation.

### Facebook (T)

- **URL**: <https://www.facebook.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Profile reconnaissance, relationship mapping, photo analysis, location tracking
- **Input**: Usernames, profile URLs, phone numbers, email addresses
- **Output**: Profile data, friend networks, photos, location history, activity timeline
- **Description**: Major social network with over 2 billion users. Primary target for social OSINT and profile reconnaissance.

### LinkedIn (T)

- **URL**: <https://www.linkedin.com/>
- **Type**: Google Dork
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Professional background verification, corporate reconnaissance, employment history research
- **Input**: Usernames, email domains, company names
- **Output**: Professional profiles, employment history, connections, company structure
- **Description**: Professional social network with 900M+ users. Key source for professional identity verification and corporate structure mapping.

### Twitter (T)

- **URL**: <https://www.twitter.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Real-time monitoring, account verification, relationship mapping, sentiment analysis
- **Input**: Usernames, hashtags, keywords, user IDs
- **Output**: Tweets, user profiles, follower networks, location data, media
- **Description**: Microblogging platform with 500M+ users. Extensive public data, real-time information, and relationship networks.

### Pinterest (T)

- **URL**: <https://www.pinterest.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Interest profiling, location discovery, lifestyle analysis, image reverse search
- **Input**: Usernames, pins, boards, images
- **Output**: User profiles, boards, pins, location metadata, follower networks
- **Description**: Visual discovery platform with 460M+ users. Used for lifestyle, location, and interest-based profiling.

### Signal Private Messenger (T)

- **URL**: <https://signal.org/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Identity verification, account discovery via phone/email, community research
- **Input**: Phone numbers, email addresses, usernames
- **Output**: Account existence, profile names, avatar images
- **Description**: End-to-end encrypted messaging app with 40M+ users. Limited OSINT value due to privacy-first design.

### Riot.im - Communicate, your way (T)

- **URL**: <https://riot.im/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Open community monitoring, channel discovery, user verification
- **Input**: Usernames, community names, room IDs
- **Output**: Community membership, user profiles, message history (if public), user activity
- **Description**: Open-source Matrix client for decentralized messaging. Limited public data but useful for community monitoring.

### Telegram (T)

- **URL**: <https://telegram.org/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: User discovery, channel monitoring, group reconnaissance, bot creation for data collection
- **Input**: Usernames, user IDs, chat links, phone numbers
- **Output**: User profiles, channel data, group membership, message history, media
- **Description**: Messaging platform with 700M+ users. Extensive public data through public channels, groups, and user searches.

### Snapchat (T)

- **URL**: <https://www.snapchat.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: User verification, story analysis, location tracking via snap maps, relationship mapping
- **Input**: Usernames, Snapcodes, phone numbers
- **Output**: User profiles, story content, snap maps, friend networks
- **Description**: Ephemeral messaging app with 400M+ users. Limited historical data due to auto-deletion, but real-time activity visible.

### WhatsApp Messenger (T)

- **URL**: <https://www.whatsapp.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: User verification, profile discovery, status updates, contact verification
- **Input**: Phone numbers, WhatsApp IDs
- **Output**: User profiles, status messages, profile pictures, last-seen timestamps, online status
- **Description**: Messaging platform with 2B+ users. End-to-end encrypted, but profile data and metadata are accessible.

### Kik (T)

- **URL**: <https://www.kik.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: User discovery, profile analysis, public username search
- **Input**: Usernames, user handles
- **Output**: User profiles, status, profile pictures, user discovery
- **Description**: Messaging app with 300M+ registered users. Public username search and profile visibility.

### Yik Yak (T)

- **URL**: <https://www.yikyak.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Location-based event monitoring, community sentiment analysis, anonymity assessment
- **Input**: Location coordinates, proximity radius
- **Output**: Anonymous posts, location data, user engagement, community trends
- **Description**: Anonymous location-based social network. Public posts visible by location, useful for community sentiment and event tracking.

### LINE (T)

- **URL**: <https://line.me/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Asian market user discovery, profile analysis, account verification
- **Input**: User IDs, phone numbers, LINE accounts
- **Output**: User profiles, status messages, timeline data, friends list
- **Description**: Messaging app with 200M+ users, dominant in Asia. User search and public profile visibility.

### Instagram (T)

- **URL**: <https://www.instagram.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Visual reconnaissance, metadata analysis, location tracking via geotagging, relationship mapping
- **Input**: Usernames, hashtags, locations, profile URLs
- **Output**: User profiles, photos, videos, captions, location data, follower networks
- **Description**: Photo and video sharing platform with 2B+ users. Extensive visual OSINT and metadata analysis.

### Flickr (T)

- **URL**: <https://www.flickr.com/>
- **Type**: Google Dork
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Photo metadata analysis, EXIF data extraction, location tracking, photographer identification
- **Input**: Usernames, tags, locations, URLs
- **Output**: Photos, metadata, EXIF data, location coordinates, user profiles
- **Description**: Photo hosting and sharing platform with 200M+ photos. Extensive metadata and location data.

### Periscope (T)

- **URL**: <https://www.periscope.tv/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Live event monitoring, real-time location tracking (via broadcast metadata), community monitoring
- **Input**: Broadcast URLs, user handles, search keywords
- **Output**: Broadcast data, viewer information, location metadata, broadcast archives
- **Description**: Live video streaming app merged into Twitter. Limited standalone value; functionality integrated into Twitter.

### Meerkat (T)

- **URL**: <https://meerkatapp.co/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Legacy stream archives, historical event analysis
- **Input**: Stream URLs, user profiles, timestamps
- **Output**: Archived streams, viewer data, user activity logs
- **Description**: Live streaming social app. Currently dormant with minimal active users; historical value for archived streams.

### Truecaller (T)

- **URL**: <https://www.truecaller.com/>
- **Type**: CLI
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Phone number verification, caller ID lookup, spam detection, contact validation
- **Input**: Phone numbers, contact names
- **Output**: Caller name, carrier info, location data, spam reports, contact validation
- **Description**: Phone and contact verification app with 500M+ users. Reverse phone lookup and caller ID identification.

### APKLeaks

- **URL**: <https://github.com/dwisiswant0/apkleaks>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: API endpoint discovery, hardcoded credential detection, sensitive data extraction from APKs
- **Input**: APK files
- **Output**: Discovered secrets, API endpoints, hardcoded strings, configuration data
- **Description**: Open-source tool that scans APK files for hardcoded secrets, API endpoints, and sensitive information.

### APKtool

- **URL**: <https://apktool.org/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: APK decompilation, resource extraction, smali code analysis, app structure analysis
- **Input**: APK files
- **Output**: Decompiled source code, resources, manifest data, smali bytecode
- **Description**: Open-source tool for reverse engineering Android apps. Decompiles APKs to extract resources and bytecode.

### JADX

- **URL**: <https://github.com/skylot/jadx>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Java source code recovery, app logic analysis, vulnerability assessment, code review
- **Input**: APK files, DEX files, class files
- **Output**: Java source code, code structure, method signatures, data flow
- **Description**: Open-source decompiler (47k+ GitHub stars) that converts DEX bytecode to Java source code. GUI and CLI available.

### MobSF

- **URL**: <https://github.com/MobSF/Mobile-Security-Framework-MobSF>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Comprehensive mobile app security analysis, vulnerability assessment, artifact extraction, compliance testing
- **Input**: APK files, IPA files, source code
- **Output**: Security vulnerabilities, permissions analysis, data flow analysis, forensic artifacts
- **Description**: Open-source mobile security framework for static and dynamic analysis. Comprehensive vulnerability scanning and artifact extraction.

### Autopsy

- **URL**: <https://www.autopsy.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Mobile forensic artifact extraction, database analysis, file system recovery, evidence analysis
- **Input**: Device backups, disk images, app databases, file systems
- **Output**: SQLite databases, app data, deleted files, timeline analysis, forensic artifacts
- **Description**: Open-source digital forensics platform. Extracts and analyzes data from mobile devices and disk images.

### Frida

- **URL**: <https://frida.re/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Runtime behavior analysis, API call interception, encryption bypass, behavior modification
- **Input**: Running app processes, method signatures, target functions
- **Output**: Intercepted method calls, API parameters, return values, runtime state
- **Description**: Open-source dynamic instrumentation toolkit. Injects JavaScript to intercept and modify app behavior at runtime.

### Lynxio OSINT

- **URL**: <https://lynxio.io/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Multi-identifier search, quick reconnaissance, phone number lookup, email verification
- **Input**: Phone numbers, email addresses, usernames, URLs
- **Output**: Associated identifiers, social media profiles, verification results, relationship mapping
- **Description**: Mobile OSINT search tool for multi-identifier reconnaissance. Searches across phone numbers, email addresses, usernames, and social platforms.

### OSINT Researcher

- **URL**: <https://apps.apple.com/us/app/osint-researcher/id6747302251>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: GitHub OSINT, organization structure analysis, open-source project discovery, team reconnaissance
- **Input**: Organization names, GitHub URLs, repository URLs
- **Output**: Organization members, repository lists, contribution history, project metadata
- **Description**: iOS app for GitHub organization reconnaissance and open-source intelligence. Limited to App Store distribution.
