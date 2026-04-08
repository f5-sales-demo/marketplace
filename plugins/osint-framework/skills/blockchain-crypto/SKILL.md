---
name: blockchain-crypto
description: >-
  Blockchain analysis, cryptocurrency tracing, wallet investigation, and transaction tracking.
  Use when the user mentions: blockchain, cryptocurrency, bitcoin, ethereum, wallet lookup, crypto tracing, transaction analysis.
user-invocable: false
---

# Blockchain & Cryptocurrency

Blockchain analysis, cryptocurrency tracing, wallet investigation, and transaction tracking.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/blockchain-crypto/references/tools.md` for the complete
list of 31 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| Orbit | `git clone https://github.com/s0md3v/Orbit && cd Orbit && pip install -r requirements.txt` | `python orbit.py -s <bitcoin_address>` |

### All Install Methods — Orbit

| Method | Command |
| -------- | --------- |
| Git clone | `git clone https://github.com/s0md3v/Orbit && cd Orbit && pip install -r requirements.txt` |
| pip | N/A |
| go | N/A |
| apt | N/A |
| npm | N/A |
| Docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

## Subcategories

- **Bitcoin** — Address profiling, balance lookup, abuse reports, scam tagging (Bitcoin Who's Who, BitRef, Bitcoin Abuse Database, Blockonomics)
- **Ethereum** — Transaction analysis, smart contract inspection, token tracking, gas analytics (Etherscan, Blockscan)
- **Multi-chain** — Cross-chain explorers, SQL-like queries, portfolio aggregation (Blockchair, Bitquery Explorer, Arkham Intelligence)
- **NFT** — NFT transaction tracking, collection analysis, provenance tracing (Etherscan NFT Tracker, OpenSea)
- **DeFi** — TVL comparison, yield aggregation, DEX tracing, protocol analytics (DefiLlama, Dune Analytics)
- **Exchange Analysis** — Fund-flow visualization, mixer tracking, compliance scoring (Breadcrumbs.app, MetaSleuth, MistTrack)
- **Privacy Coins** — Monero block exploration, Zcash transparent tracking (Monero Blocks, XMRChain.net, Zcash Block Explorer)
- **Wallet Clustering** — Address grouping, entity identification, transaction pattern analysis (Wallet Explorer, OXT.me)
- **Sanctions & Compliance** — OFAC SDN list checks, AML risk scoring (OFAC Sanctions List Search, MistTrack)

## Investigation Workflow

1. **Identify chain**: Determine which blockchain the address belongs to (Bitcoin, Ethereum, Monero, etc.)
2. **Address lookup**: Query the relevant block explorer (Etherscan, Blockchair, BitRef) for balance and transaction history
3. **Abuse check**: Search Bitcoin Abuse Database and OFAC Sanctions List for known bad addresses
4. **Transaction graph**: Use Orbit (CLI) for Bitcoin network visualization or Breadcrumbs.app for fund-flow mapping
5. **Entity attribution**: Cross-reference with Wallet Explorer and Arkham Intelligence for entity labels
6. **Mixer analysis**: If funds pass through mixers, use MetaSleuth for exit-point detection
7. **Cross-chain pivot**: Check Blockchair or Bitquery Explorer for activity on other chains
8. **DeFi exposure**: Query DefiLlama and Dune Analytics for protocol interactions
9. **Compliance report**: Compile AML risk scoring via MistTrack; check OFAC sanctions list

## Cross-Category Pivots

- **threat-intelligence** — Sanctioned addresses often appear in threat feeds; pivot to threat-intelligence for IOC correlation and attribution
- **dark-web** — Cryptocurrency addresses found in dark-web marketplaces or forums; pivot to dark-web for marketplace monitoring and vendor identification

## OPSEC Notes

- Most block explorers (Etherscan, Blockchair, BitRef) are **passive** — they query public blockchain data without alerting the target
- **Orbit** is marked **Active** — it crawls the Bitcoin network recursively; use from a clean IP or VPN
- **Arkham Intelligence**, **MetaSleuth**, and **MistTrack** require **registration** and are marked **Active** — your account and queries may be logged
- Blockchain transactions are permanent and public; however, querying patterns can reveal investigator interest
- Use Tor-accessible explorers (Blockchair, XMRChain.net) when anonymity is required
- Privacy coins (Monero, Zcash shielded) have limited OSINT visibility by design

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Blockchain & Cryptocurrency tool search",
  prompt="Find OSINT tools for Blockchain & Cryptocurrency.\n
    Read skills/blockchain-crypto/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Blockchain & Cryptocurrency investigation: [target]",
  prompt="Investigate using Blockchain & Cryptocurrency tools: [target]\n\n
    Primary: Read skills/blockchain-crypto/references/tools.md\n
    Execute available CLI tools (Orbit for Bitcoin graphing), query web
    resources, report findings.\n
    Start with passive lookups (block explorers, abuse databases) before
    active tools."
)
```
