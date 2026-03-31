---
name: classifieds
description: >-
  Classified ad search across platforms like Craigslist, eBay, and marketplace sites.
  Use when the user mentions: classified ads, Craigslist search, marketplace, eBay lookup,
  online listings, OfferUp, auction search, buy/sell listings, secondhand.
user-invocable: false
---

# Classifieds

Classified ad search and investigation across platforms like Craigslist,
eBay, OfferUp, and regional marketplace sites. Useful for tracking
stolen goods, identifying sellers, verifying listings, and monitoring
marketplace activity.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Scraping classified
sites may violate their ToS.

## Tools Reference

Read `skills/classifieds/references/tools.md` for the complete
list of 11 free tools in this category.

## Web Resources

| Resource | URL | Best For | Region |
|----------|-----|----------|--------|
| Search Tempest | https://www.searchtempest.com/ | Multi-city Craigslist + marketplace aggregation | US |
| TotalCraigSearch | https://www.totalcraigsearch.com/ | Nationwide Craigslist search | US |
| SearchAllJunk | https://www.searchalljunk.com/ | Cross-platform classified search | US |
| Goofbid | https://www.goofbid.com/ | eBay misspelling and typo search | Global |
| Craigslist | https://craigslist.org/ | Local classified ads by city | US |
| eBay | https://www.ebay.com/ | Online auctions, sold item history | Global |
| OfferUp | https://offerup.com/ | Local buy/sell marketplace | US |
| Kijiji | https://www.kijiji.ca/ | Canadian classifieds | Canada |
| Quikr | https://www.quikr.com/ | Indian classifieds marketplace | India |
| Kleinanzeigen.de | https://www.kleinanzeigen.de/ | German classifieds (ex-eBay Kleinanzeigen) | Germany |
| francaisalondres.com | https://francaisalondres.com/ | French community classifieds in London | UK/France |

## Subcategories

- **Craigslist Search** -- Multi-city and nationwide Craigslist aggregation tools
- **eBay / Auction** -- Auction monitoring, misspelling search, completed sales analysis
- **General Marketplace** -- OfferUp, Facebook Marketplace, local buy/sell platforms
- **International** -- Regional classified platforms (Kijiji, Quikr, Kleinanzeigen)
- **Aggregators** -- Cross-platform search tools covering multiple classified sites

## Investigation Workflow

1. **Define search terms**: Identify item descriptions, serial numbers, unique identifiers
2. **Broad sweep**: Use Search Tempest or SearchAllJunk for cross-platform coverage
3. **Craigslist deep search**: Use TotalCraigSearch for nationwide Craigslist coverage
4. **eBay investigation**: Search active and completed listings; use Goofbid for misspelled items
5. **Local marketplaces**: Check OfferUp for local sellers; note seller profiles and locations
6. **International reach**: Search Kijiji (Canada), Quikr (India), Kleinanzeigen (Germany) as needed
7. **Seller profiling**: Note usernames, phone numbers, email addresses from listings
8. **Cross-reference**: Pivot to `people-search` for seller identity, `phone-recon` for phone numbers

## Web Investigation Procedures

### Google Dork -- Craigslist Nationwide Search

```
site:craigslist.org "serial number" OR "model number" "item description"
```

### Google Dork -- eBay Sold Items

```
site:ebay.com "sold" "item description" "serial number"
```

### Google Dork -- OfferUp Seller Search

```
site:offerup.com "seller username" OR "phone number"
```

### eBay Advanced Search (Completed Listings)

Navigate to `https://www.ebay.com/sch/ebayadvsearch` and enable
"Completed listings" and "Sold items" filters to see historical
sale prices and seller activity.

### Craigslist RSS Feed Monitoring

```
https://CITY.craigslist.org/search/sss?query=SEARCH_TERM&format=rss
```

Replace CITY with the target city subdomain and SEARCH_TERM with
URL-encoded search keywords. Subscribe to this RSS feed for
automated monitoring of new listings.

### curl -- Craigslist Search via RSS

```bash
curl -s "https://newyork.craigslist.org/search/sss?query=macbook+pro&format=rss" \
  | grep -oP '<title>\K[^<]+' | head -20
```

### curl -- eBay Browse API (requires OAuth)

```bash
curl -s "https://api.ebay.com/buy/browse/v1/item_summary/search?q=vintage+watch&limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-EBAY-C-MARKETPLACE-ID: EBAY_US" \
  | jq '.itemSummaries[] | {title, price: .price.value, seller: .seller.username, itemWebUrl}'
```

### Monitoring Pattern -- Repeat Search with Diff

```bash
# Save baseline, then diff for new listings
curl -s "https://newyork.craigslist.org/search/sss?query=stolen+bike&format=rss" > /tmp/cl_baseline.xml
# ... wait interval ...
curl -s "https://newyork.craigslist.org/search/sss?query=stolen+bike&format=rss" > /tmp/cl_current.xml
diff /tmp/cl_baseline.xml /tmp/cl_current.xml
```

## Cross-Category Pivots

| When you find... | Pivot to | Why |
|------------------|----------|-----|
| Seller phone number | `phone-recon` | Carrier lookup, caller ID, linked accounts |
| Seller email address | `email-recon` | Email verification, breach data, linked profiles |
| Seller username | `username-recon` | Cross-platform profile discovery |
| Item photos in listings | `images-videos` | Reverse image search, EXIF metadata extraction |
| Seller location / address | `people-search` | Identity verification, address history |
| Vehicle listing with VIN | `transportation` | VIN decode, theft database check |

## OPSEC Notes

- All classified tools listed are **passive** web searches -- no target notification
- Craigslist blocks aggressive scraping; use RSS feeds for monitoring
- eBay tracks search activity when logged in; use private browsing for anonymity
- OfferUp requires the app for full functionality; web access is limited
- Seller phone numbers on classifieds may be VoIP or burner numbers
- Do not contact sellers as part of investigation without legal authorization
- Screenshots of listings should be captured promptly as classified ads are frequently deleted
- Craigslist does not retain deleted postings; archive immediately with `archives-cache` tools
- Image metadata (EXIF) in listing photos may reveal location and device information

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Classifieds tool search",
  prompt="Find OSINT tools for Classifieds.\n
    Read skills/classifieds/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Classifieds investigation: [target]",
  prompt="Investigate using Classifieds tools: [target]\n\n
    Primary: Read skills/classifieds/references/tools.md\n
    Secondary: Read skills/people-search/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with aggregator searches (Search Tempest), then drill into
    specific platforms. Archive listings immediately as they may be deleted."
)
```
