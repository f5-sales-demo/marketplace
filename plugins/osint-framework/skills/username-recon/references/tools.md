# Username — OSINT Tools Reference

> Auto-generated from arf.json. 18 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Username Search Engines
- Specific Sites

---

### WhatsMyName Web

- **URL**: <https://whatsmyname.app/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick web-based username enumeration across social media, forums, gaming platforms, and professional networks
- **Input**: Username
- **Output**: List of sites where the username exists with direct profile links
- **Description**: Free web-based OSINT username enumeration tool that searches for a specified username across 1500+ sites and platforms simultaneously, returning direct links to matching profiles.

### WhatsMyName (T)

- **URL**: <https://github.com/WebBreacher/WhatsMyName>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Username enumeration using community-maintained site detection data
- **Input**: Username
- **Output**: List of sites where the username exists, based on HTTP response pattern matching
- **Description**: OSINT project maintaining a curated JSON database of site detection patterns for username enumeration. Web interface available at whatsmyname.app.

### Sylva Identity Discovery (T)

- **URL**: <https://sylva.pfeister.dev/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Username enumeration with identity branching
- **Input**: Username
- **Output**: Linked accounts and identities across platforms
- **Description**: Open-source command-line tool for username and identity discovery with branch discovery to expand searches as additional linked identities are uncovered.

### Sherlock (T)

- **URL**: <https://github.com/sherlock-project/sherlock>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Mass username enumeration across 400+ sites
- **Input**: Username(s)
- **Output**: List of discovered profile URLs across social networks
- **Description**: Python command-line tool that hunts down social media accounts by username across 400+ social networks. Supports Tor routing, proxy configuration, and CSV/XLSX export.

### Namechk

- **URL**: <https://namechk.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick username availability check across social media and domains
- **Input**: Username or domain name
- **Output**: Availability status across 100+ platforms and domain extensions
- **Description**: Web-based username and domain availability checker that searches 100+ social media platforms and 36 domain extensions simultaneously.

### That is Them

- **URL**: <https://thatsthem.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: People search by name, email, phone, or address
- **Input**: Name, email address, phone number, or physical address
- **Output**: Contact info, residential details, demographics, and financial estimates
- **Description**: Free people search engine aggregating data from 50+ sources. Supports lookups by name, address, phone number, or email.

### NameCheckup

- **URL**: <https://namecheckup.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Username and domain availability checking with WHOIS info
- **Input**: Username or domain name
- **Output**: Availability status across social platforms and domain extensions, with WHOIS data
- **Description**: Free web-based username and domain availability checker that searches across 20+ social media platforms and 40+ domain extensions with WHOIS lookup support.

### GitFive (T)

- **URL**: <https://github.com/mxrch/GitFive>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: Yes
- **API**: No
- **CLI Install**: Yes
- **Best For**: Deep investigation of GitHub user profiles and email-to-account mapping
- **Input**: GitHub username or email address
- **Output**: Profile history, linked emails, SSH keys, repository analysis, JSON export
- **Description**: OSINT command-line tool for investigating GitHub profiles. Tracks username/name history, maps emails to accounts, extracts SSH public keys, and exports findings as JSON.

### Sherlock

- **URL**: <https://github.com/sherlock-project/sherlock>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Mass username enumeration across 400+ sites
- **Input**: Username(s)
- **Output**: List of discovered profile URLs across social networks
- **Description**: Python command-line tool that hunts down social media accounts by username across 400+ social networks. Supports Tor routing, proxy configuration, and CSV/XLSX export.

### Names Directory

- **URL**: <https://namesdir.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Finding name combinations and frequency data for a given first or last name
- **Input**: First name or surname
- **Output**: Associated name combinations with frequency counts
- **Description**: Searchable database of 1B+ name combinations collected from public sources. Allows bidirectional lookup to find first names by surname or surnames by first name.

### Lullar

- **URL**: <https://com.lullar.com>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Social media profile discovery by username, email, or name
- **Input**: Email address, full name, or username
- **Output**: Social media profiles found across 148+ platforms
- **Description**: Free people search and username lookup tool that searches across 148+ social media platforms including Instagram, TikTok, Facebook, and LinkedIn.

### Amazon Usernames (M)

- **URL**: <https://www.google.com/search?q=site:amazon.com+%3Cusername%3E>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Finding Amazon public profiles, wishlists, and review activity by username
- **Input**: Username (inserted into Google search query)
- **Output**: Google search results linking to Amazon pages mentioning the username
- **Description**: Google dork that searches Amazon.com for pages associated with a specific username, surfacing public profiles, wishlists, and reviews.

### GitHub User (M)

- **URL**: <https://api.github.com/users/%3Cusername%3E/events/public>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Enumerating a GitHub user's recent public activity and repository interactions
- **Input**: GitHub username (inserted into URL path)
- **Output**: JSON array of public events (pushes, PRs, issues, comments) with timestamps and repo details
- **Description**: Queries the GitHub public Events API to retrieve a user's recent public activity, including pushes, pull requests, issues, and other repository events.

### Tinder Usernames (M)

- **URL**: <https://www.gotinder.com/@%3Cusername%3E>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Confirming existence of a Tinder profile and viewing public profile details
- **Input**: Tinder username (appended to URL after @)
- **Output**: Public profile page with name, photo, and basic info if the user has web sharing enabled
- **Description**: Accesses a Tinder user's public web profile via their username. The gotinder.com domain redirects to tinder.com.

### Keybase

- **URL**: <https://keybase.io/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Looking up verified social accounts, PGP keys, and crypto wallets tied to a username
- **Input**: Username
- **Output**: User profile showing verified identities across platforms, PGP keys, cryptocurrency addresses, and devices
- **Description**: Platform for cryptographic identity verification, linking social media accounts, PGP keys, and cryptocurrency addresses to a single profile. Acquired by Zoom in 2020 but still operational.

### MIT PGP Key Server

- **URL**: <https://pgp.mit.edu/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Looking up PGP public keys associated with a username or email address
- **Input**: Name, email address, or key ID
- **Output**: PGP public key data, key fingerprints, associated UIDs/email addresses, and key metadata
- **Description**: MIT PGP Public Key Server for searching, submitting, and removing PGP public keys. Look up keys by name, email, or key ID to find associated cryptographic identities.

### ProtonMail users (M)

- **URL**: `https://api.protonmail.ch/pks/lookup?op=index&search=<username>@protonmail.com`
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Confirming whether a ProtonMail username exists and retrieving its PGP public key
- **Input**: ProtonMail username (appended with @protonmail.com)
- **Output**: PGP key index with public key fingerprint, algorithm, creation timestamp, and email UID
- **Description**: Queries ProtonMail's HKP-compatible PGP key server to look up the public key for a ProtonMail username. A successful response confirms the account exists.

### ProtonMail Domains (M)

- **URL**: `https://api.protonmail.ch/pks/lookup?op=index&search=<email_address>`
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Checking if an email address on a custom domain is hosted on ProtonMail
- **Input**: Full email address (any domain that may be hosted on ProtonMail)
- **Output**: PGP key index with public key fingerprint, algorithm, creation timestamp, and email UID
- **Description**: Queries ProtonMail's HKP key server with a full email address to check for a PGP public key. Useful for identifying ProtonMail users on custom domains.
