# Search Engines — OSINT Tools Reference

> Auto-generated from arf.json. 73 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- General Search
- Meta Search
- Code Search
- FTP Search
- Academic / Publication Search
- News Search
- Other Search
- Search Tools
- Search Engine Guides

---

### Google

- **URL**: <https://www.google.com/?gws_rd=ssl>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: General web OSINT, historical information via cache, broad searches with operators
- **Input**: Keywords, search operators (site:, intitle:, inurl:, filetype:, cache:, etc.)
- **Output**: Ranked web pages, snippets, images, news, cached pages
- **Description**: World's most popular search engine with advanced indexing capabilities and support for extensive search operators (Google dorks). Used for passive OSINT research with broad web coverage.

### Bing

- **URL**: <https://www.bing.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Alternative to Google, regional results, academic content, supplementary searches
- **Input**: Keywords, search operators (site:, intitle:, filetype:, inurl:, AND, NOT, etc.)
- **Output**: Ranked web pages, images, news, videos, answers
- **Description**: Microsoft's search engine with advanced search operators and API capabilities. Supports many of the same operators as Google, providing alternative search coverage.

### DuckDuckGo

- **URL**: <https://duckduckgo.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Privacy-preserving searches, tracking-free OSINT research, European results
- **Input**: Keywords, basic search operators (site:, intitle:, filetype:), natural language
- **Output**: Ranked web pages with privacy-protecting anonymous view option
- **Description**: Privacy-focused search engine that doesn't track users or store personal data. Processes ~3 billion queries monthly with enhanced privacy protections and tracker blocking.

### Yahoo Advanced Web Search

- **URL**: <https://search.yahoo.com/web/advanced>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Alternative to Google/Bing, specialized searches, location-based results
- **Input**: Keywords, search operators (+, -, site:, intitle:, filetype:, exact phrases in quotes)
- **Output**: Ranked web pages, news, images, location-specific results
- **Description**: Yahoo's advanced search interface with support for search operators including site:, intitle:, filetype:, AND, OR, NOT. Provides real-time search results data with location filtering.

### StartPage

- **URL**: <https://www.startpage.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Privacy-preserving Google searches, anonymous browsing through proxy
- **Input**: Keywords, Google operators (forwarded through proxy)
- **Output**: Google/Bing results returned anonymously without trackers
- **Description**: Privacy-centric proxy search engine that strips identifying data before querying Google/Bing and provides anonymous view to visited websites through proxy servers.

### Yandex

- **URL**: <https://yandex.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Russian/post-Soviet OSINT, faster breach board indexing, regional coverage
- **Input**: Keywords, advanced operators (inurl:, url:, "", *, |, lang:, mime:, etc.)
- **Output**: Ranked web pages with regional focus, Russian content prioritized
- **Description**: Russian search engine with excellent coverage of post-Soviet digital spaces. Supports 20+ advanced operators and provides faster indexing of Russian forums and breach boards than Google.

### Baidu

- **URL**: <https://www.baidu.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Chinese language OSINT, Chinese market research, regional search coverage
- **Input**: Keywords, operators (inurl:, intitle:, site:, filetype:), language and time filters
- **Output**: Ranked web pages, images, news, knowledge graph, trending queries
- **Description**: China's dominant search engine with support for advanced search operators and knowledge graph data. Used for Chinese language and regional OSINT research.

### Google Advanced Search

- **URL**: <https://www.google.com/advanced_search>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Guided advanced searches, learning Google operators, constructing complex queries visually
- **Input**: Form-based parameters (date range, language, file type, domain, safe search, reading level)
- **Output**: Ranked web pages matching advanced filters
- **Description**: Dedicated interface to Google's advanced search operators. Makes complex queries easier to construct without memorizing dork syntax through visual form-based interface.

### iZito

- **URL**: <https://www.izito.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Multi-type searches (web, video, news, products in one overview), quick result aggregation
- **Input**: Keywords, basic operators
- **Output**: Web results, videos, news, products, Wikipedia entries in multi-column layout
- **Description**: Metasearch engine aggregating results from multiple sources including Wikipedia, videos, news, and products. Designed to support non-linear search behavior with multi-column display.

### Advangle

- **URL**: <https://advangle.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Building complex search queries with multiple filters (domain, language, date published)
- **Input**: Visual form-based query builder parameters (domain, language, date, region)
- **Output**: Complex search queries executed in Google or Bing with multiple parameters
- **Description**: Advanced search query builder for Google and Bing. Allows construction of complex multi-parameter search queries without memorizing operator syntax.

### Instya

- **URL**: <https://www.instya.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Product research, shopping comparisons, eCommerce OSINT only
- **Input**: Product names, shopping categories
- **Output**: Product listings across eCommerce sites with curated buying guides
- **Description**: eCommerce product search engine and shopping discovery platform. NOT suitable for general web OSINT research - category mismatch with Search Engines.

### Hulbee

- **URL**: <https://hulbee.com/de>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Corporate information only, NOT for web search OSINT
- **Input**: Company information
- **Output**: Corporate website content
- **Description**: Corporate site and product page for Hulbee AG. NOT a search engine itself - Hulbee is the company behind Swisscows. URL/category mismatch issue.

### Mojeek

- **URL**: <https://mojeek.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Privacy-preserving searches, independent index not reliant on Google/Bing
- **Input**: Keywords, advanced operators (site:, intitle:, inurl:, etc.)
- **Output**: Web results from independent Mojeek index in JSON/XML via API
- **Description**: Independent UK-based search engine with its own crawler and index. Privacy-focused with no user tracking since 2006. Supports advanced search operators.

### Swisscows

- **URL**: <https://swisscows.com/en>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Privacy-conscious searches, family-safe content filtering, Swiss data residency requirement
- **Input**: Keywords, natural language queries with semantic understanding
- **Output**: Ranked web results with optional content filtering, image/video search with filtering
- **Description**: Swiss privacy-focused search engine using semantic AI. Stores all data in Swiss Alps facility. No cookies, no tracking, no user profiles. Includes family-safe filtering.

### Brave

- **URL**: <https://search.brave.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Privacy-preserving searches, custom filtering via Goggles, enterprises needing zero data retention
- **Input**: Keywords, Goggle rules for custom filtering
- **Output**: Ranked web results with optional custom filtering via Goggles
- **Description**: Privacy-focused search engine with independent index. Offers Goggles for custom search result ranking. First search API with zero data retention option.

### Stract

- **URL**: <https://stract.com/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Developers, transparency enthusiasts, customizable search, filtering by content type (blogs, indieweb, educational)
- **Input**: Keywords, custom Optics rules for filtering
- **Output**: Customized ranked results with filtering options
- **Description**: Open source search engine built by developers for developers. Features customizable Optics for result filtering and ranking. Independent index with web crawler.

### eTools.ch

- **URL**: <https://www.etools.ch/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Privacy-preserving meta searches, quick result aggregation from multiple engines
- **Input**: Keywords, basic search operators
- **Output**: Aggregated results from 14 sources in parallel
- **Description**: Swiss privacy-focused metasearch engine aggregating 14+ sources (Google, Bing, Brave, DuckDuckGo, Yandex, etc.) simultaneously. Fast results averaging 0.83 seconds.

### PublicWWW

- **URL**: <https://publicwww.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Finding websites with specific code/analytics IDs, competitive intelligence, security research
- **Input**: Code snippets, regular expressions, analytics IDs (Google Analytics, AdSense, etc.), JavaScript libraries
- **Output**: Web pages containing matching code with download/export to CSV
- **Description**: Source code search engine for HTML, JavaScript, CSS, and plaintext across 509+ million web pages. Find websites using specific analytics IDs, ad accounts, or code snippets.

### Searchcode

- **URL**: <https://searchcode.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Source code snippet and function discovery across public repositories
- **Input**: Code snippet, function name, or keyword
- **Output**: Matching source code files with context and repository links
- **Description**: Code search engine that indexes public source code from GitHub, GitLab, Bitbucket, and other repositories; useful for finding code examples and identifying technology usage patterns.

### NerdyData

- **URL**: <https://www.nerdydata.com/reports/new>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Identifying websites using specific technologies, libraries, or code patterns
- **Input**: Code snippet, library name, or technology string
- **Output**: List of websites containing matching source code
- **Description**: Source code search engine for website technology reconnaissance that indexes HTML, CSS, and JavaScript across millions of live websites to identify technology and library usage.

### Gitrob (T)

- **URL**: <https://github.com/michenriksen/gitrob>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: GitHub organization reconnaissance for exposed secrets and sensitive files in commit history
- **Input**: GitHub username or organization name
- **Output**: List of potentially sensitive files and paths found across repositories
- **Description**: CLI tool for reconnaissance on GitHub organizations and users; clones repositories and scans commit history for sensitive files, exposed credentials, and configuration data.

### Github-Dorks (T)

- **URL**: <https://github.com/techgaun/github-dorks>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Finding exposed credentials and sensitive files on GitHub via advanced search dorks
- **Input**: Target username, organization, or domain
- **Output**: GitHub search results matching dork patterns for sensitive data exposure
- **Description**: Collection of GitHub advanced search operators and a CLI tool that automates searching GitHub for exposed credentials, API keys, configuration files, and other sensitive information.

### GitLeaks

- **URL**: <https://github.com/gitleaks/gitleaks>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Scanning git repositories for hardcoded secrets, API keys, and leaked credentials
- **Input**: Git repository path, remote URL, or file system path
- **Output**: Report of detected secrets with file location, matched rule, commit hash, and line context
- **Description**: Open-source SAST tool for detecting hardcoded secrets, API keys, passwords, and credentials in git repositories and file systems using customizable regex-based detection rules.

### GlobalFile

- **URL**: <https://globalfilesearch.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Discovering publicly accessible files on FTP servers by filename or file type
- **Input**: Filename, file extension, or keyword
- **Output**: List of matching files with FTP server addresses and paths
- **Description**: FTP file search engine that indexes publicly accessible FTP servers; allows searching for specific file types including images, videos, software, and archives.

### FTP Google Dork (D)

- **URL**: <https://www.google.com/search?q=inurl%3Aftp+-inurl%3Ahttp+-inurl%3Ahttps+ftpsearchterm>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Discovering publicly indexed FTP server directories and files via Google dorking
- **Input**: Search term appended to the dork URL
- **Output**: Google search results showing indexed FTP server directories
- **Description**: Google dork technique using inurl:ftp operators to discover publicly indexed FTP server directories and files through Google's web index.

### Napalm FTP

- **URL**: <https://www.searchftps.net/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Large-scale FTP file discovery across hundreds of indexed public servers
- **Input**: Filename, file type, or keyword
- **Output**: Matching files with FTP server address, path, file size, and date
- **Description**: FTP indexer and search engine with over 329 million files indexed across 1,200+ FTP servers; supports advanced filtering by file type, size, and server location.

### PubPeer

- **URL**: <https://pubpeer.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Verifying scientific publication credibility and finding post-publication corrections or retractions
- **Input**: DOI, paper title, or author name
- **Output**: Peer comments, flags, and discussion threads attached to the publication
- **Description**: Post-publication peer review platform where researchers comment on and flag issues with published scientific papers; useful for identifying retracted or problematic research.

### Bielefeld Academic Search Engine

- **URL**: <https://www.base-search.net/Search/Advanced>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Broad academic literature search across open-access and institutional repositories
- **Input**: Author, title, keyword, DOI, or subject
- **Output**: Academic papers, dissertations, and research documents with metadata and links
- **Description**: Academic search engine indexing over 400 million documents from 12,000+ content providers including institutional repositories, open-access journals, and research databases worldwide.

### Google Scholar

- **URL**: <https://scholar.google.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Comprehensive academic literature discovery with citation tracking across all disciplines
- **Input**: Author, paper title, keyword, or institution
- **Output**: Academic publications with citation counts, links to full text, and related work
- **Description**: Multidisciplinary academic search engine indexing journal articles, dissertations, books, conference papers, and patents; includes citation counts and related work discovery.

### PubMed - National Center for Biotechnology Information

- **URL**: <https://pubmed.ncbi.nlm.nih.gov/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Biomedical, clinical, and life sciences literature research with high-quality metadata
- **Input**: Author, MeSH term, keyword, PMID, or DOI
- **Output**: Citation records with abstracts, MeSH terms, and links to full-text sources
- **Description**: Free biomedical and life sciences literature database maintained by the NCBI with over 40 million citations; includes abstracts and links to full-text articles.

### Open Library

- **URL**: <https://openlibrary.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Finding and borrowing digitized books, especially out-of-print or historical publications
- **Input**: Title, author, ISBN, or subject
- **Output**: Book records with metadata, cover images, and links to borrowable or readable editions
- **Description**: Internet Archive's open catalog of over 3 million books with borrowable digital editions; provides bibliographic data and full-text access for many out-of-print titles.

### JURN

- **URL**: <https://www.jurn.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Open-access academic article discovery in arts, humanities, and social sciences
- **Input**: Keyword, author, or subject
- **Output**: Links to freely accessible academic articles across indexed journals
- **Description**: Multidisciplinary search engine indexing freely accessible academic articles; covers arts, humanities, ecology, and social sciences with a focus on open-access content.

### UK National Archives

- **URL**: <https://discovery.nationalarchives.gov.uk/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: UK historical records, government documents, and legal archives research
- **Input**: Person name, place, date, or record reference
- **Output**: Archive catalog entries with descriptions, dates, and ordering information for physical or digital access
- **Description**: Official online catalog for the UK National Archives providing access to over 32 million records spanning 1,000 years of UK government, legal, and historical documents.

### OpenDOAR

- **URL**: <https://www.opendoar.org/search.php>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Finding open-access repositories by institution, country, or subject discipline
- **Input**: Institution name, country, or subject area
- **Output**: List of matching open-access repositories with metadata and direct links
- **Description**: Global directory of open-access repositories with over 6,000 academic repositories from 130+ countries; useful for locating institutional repositories and discipline-specific archives.

### Microsoft Academic

- **URL**: <https://academic.microsoft.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Academic paper discovery with author disambiguation and citation graph analysis
- **Input**: Author, title, keyword, or institution
- **Output**: Research paper records with metadata, citations, and author profiles
- **Description**: Microsoft's academic search service indexing hundreds of millions of research papers; note that the original Microsoft Academic service was discontinued in December 2021 and this URL may redirect.

### Science Direct

- **URL**: <https://www.sciencedirect.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Scientific and technical literature search across Elsevier's extensive journal catalog
- **Input**: Author, title, keyword, DOI, or journal name
- **Output**: Article records with abstracts; full text requires subscription or per-article purchase
- **Description**: Elsevier's platform for peer-reviewed scientific literature with access to over 2,900 journals and 30,000 e-books; freely searchable with full-text access requiring subscription or institutional access.

### Library Databases

- **URL**: <https://guides.uflib.ufl.edu/az.php>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Identifying specialized academic databases by subject for deep literature research
- **Input**: Subject area or database name
- **Output**: List of academic databases with descriptions and access links
- **Description**: University of Florida Library's A-Z database directory providing access to hundreds of academic databases covering all disciplines; useful as a reference for locating specialized research databases.

### Copyscape Plagiarism Checker

- **URL**: <https://www.copyscape.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Detecting plagiarism and tracing where specific text or content has been copied or republished online
- **Input**: URL or pasted text
- **Output**: List of web pages containing matching or similar text with percentage match scores
- **Description**: Online plagiarism detection service that searches the web for copies of submitted text or URLs; useful for verifying content originality or tracing where text has been republished.

### Lazy Scholar (T)

- **URL**: <https://lazyscholar.org/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Finding free full-text access to paywalled academic papers without institutional subscription
- **Input**: Paywalled journal article URL or DOI (via browser extension)
- **Output**: Links to free legal full-text versions of the paper from open-access sources
- **Description**: Browser extension that automatically finds free legal full-text versions of academic papers when viewing paywalled content; checks open-access repositories and PubMed Central.

### Open Access Scholarly Journals

- **URL**: <https://www.pagepress.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Accessing open-access peer-reviewed research in biomedical and natural sciences
- **Input**: Article title, author, or journal name
- **Output**: Freely accessible full-text research articles in PDF and HTML formats
- **Description**: PAGEPress open-access publisher hosting peer-reviewed journals across biomedical, natural, and social sciences; provides free access to published research articles.

### The Open Syllabus Project

- **URL**: <https://www.opensyllabus.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Science Publications

- **URL**: <https://www.thescipub.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### arXiv.org

- **URL**: <https://arxiv.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Google News Search

- **URL**: <https://news.google.com/news/advanced_news_search?>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Flipboard

- **URL**: <https://flipboard.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### YouGotTheNews

- **URL**: <https://yougotthenews.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### NewspaperARCHIVE.com

- **URL**: <https://newspaperarchive.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### PressReader.com

- **URL**: <https://www.pressreader.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Newspaper Map

- **URL**: <https://newspapermap.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### NewsBrief

- **URL**: <https://emm.newsbrief.eu/NewsBrief/clusteredition/en/latest.html>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### AllYouCanRead.com

- **URL**: <https://www.allyoucanread.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### World News

- **URL**: <https://wn.com/#/search>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### NewsNow.co.uk

- **URL**: <https://www.newsnow.co.uk/h/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Hubii

- **URL**: <https://hubii.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Inshorts

- **URL**: <https://inshorts.com/en/read>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### NewsBot

- **URL**: <https://getnewsbot.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Colossus International Engine List

- **URL**: <https://www.searchenginecolossus.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Zenodo

- **URL**: <https://zenodo.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### EntityCube

- **URL**: <https://entitycube.research.microsoft.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### FindTheData A Research Engine

- **URL**: <https://www.findthedata.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### wayparam

- **URL**: <https://github.com/aleff-github/wayparam>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### SearchDiggity (T)

- **URL**: <https://bishopfox.com/resources>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Scanner-inurlbr (T)

- **URL**: <https://github.com/googleinurl/SCANNER-INURLBR>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Google Alerts

- **URL**: <https://www.google.com/alerts>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### Google Custom Search Engine

- **URL**: <https://cse.google.com/cse/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A

### pagodo - Passive Google Dork (T)

- **URL**: <https://github.com/opsdisk/pagodo>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Automated passive Google dork enumeration from GHDB
- **Input**: GHDB dork categories, target domain
- **Output**: Google search result URLs matching dork patterns
- **Description**: Python CLI tool that automates passive Google dork searches using the Google Hacking Database (GHDB), supporting HTTP/SOCKS5 proxies to avoid rate-limiting.

### Google Trends

- **URL**: <https://trends.google.com/trends/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Tracking topic interest, comparing search terms, identifying trend patterns
- **Input**: Search term or topic
- **Output**: Trend graphs, regional interest data, related queries
- **Description**: Google's free tool for analyzing search interest trends over time and by geography, providing anonymized and aggregated data.

### dorksearch.com

- **URL**: <https://www.dorksearch.com/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Building complex Google dorks with API cross-referencing
- **Input**: Target domain, keywords, dork parameters
- **Output**: Google search queries with optional Shodan/Censys/GitHub results
- **Description**: Web-based Google dork builder and search tool that integrates with Shodan, Censys, and GitHub for comprehensive OSINT searches.

### dorkgenerator.pages.dev

- **URL**: <https://dorkgenerator.pages.dev/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick generation of custom Google dork queries
- **Input**: Target, search parameters, dork type
- **Output**: Constructed Google dork search URL
- **Description**: Online dork generator for creating custom Google search parameter queries to assist in OSINT and security research.

### dorksearch.netlify.app

- **URL**: <https://dorksearch.netlify.app/>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Fast, simple Google dork query generation
- **Input**: Keywords and dork operators
- **Output**: Google dork search URL
- **Description**: Lightweight web interface for building and executing Google dork searches with minimal dependencies.

### Google Hacking Database

- **URL**: <https://www.exploit-db.com/google-hacking-database>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Finding proven dork queries by category for security research
- **Input**: Category or keyword search within GHDB
- **Output**: Curated Google dork queries with descriptions
- **Description**: Offensive Security's curated database of Google dork queries, organized by category, used for finding sensitive information exposed on the web.

### Google Search Operators Guide

- **URL**: <https://www.googleguide.com/advanced_operators_reference.html>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Reference for Google search operator syntax and capabilities
- **Input**: N/A (reference document)
- **Output**: Documentation on operators, syntax, and examples
- **Description**: Official Google documentation covering all supported search operators, syntax, and advanced search techniques.

### Google Guide Cheat Sheet

- **URL**: <https://www.googleguide.com/help/calculator.html>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick lookup of Google search operator syntax
- **Input**: N/A (reference document)
- **Output**: Tabular reference of operators with examples
- **Description**: Quick-reference cheat sheet for Google search operators and advanced search syntax from Google Guide.
