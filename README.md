# Salvage

**A recovery protocol for tokens stranded in smart contracts — with a reference application.**

![Ethereum + Base](https://img.shields.io/badge/chains-Ethereum%20%2B%20Base-627EEA)
![Non-custodial](https://img.shields.io/badge/settlement-non--custodial-1A6B3C)
![Contracts verified](https://img.shields.io/badge/contracts-verified-1A6B3C)
![Base App](https://img.shields.io/badge/Base%20App-Mini%20App-627EEA)
![License MIT](https://img.shields.io/badge/license-MIT-blue)

[**Live app**](https://usesalvage.xyz) · [**Base App Mini App**](https://salvage-miniapp.vercel.app) · [**X @Salvage_xyz**](https://x.com/Salvage_xyz) · [**Farcaster @Salvage-xyz**](https://warpcast.com/salvage-xyz) · gethelp.salvage@gmail.com

Millions of dollars sit stranded inside smart contracts — sent there by mistake and assumed gone forever. The USDC contract alone holds over **$220K** in tokens people accidentally transferred to it ([verify the balances yourself on Etherscan](https://etherscan.io/tokenholdings?a=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48)).

Salvage is the missing standard for getting them back: **scan** any contract or wallet for stranded value, **triage** whether it's technically recoverable, and **settle** the recovery trustlessly on-chain. The web app is the reference implementation — the protocol underneath is built to be integrated by wallets, explorers, and support tooling.

---

## Live proof — a real recovery on Base mainnet

This isn't hypothetical. Here is a complete recovery executed through Salvage on Base, every step verifiable on-chain:

| Step | Transaction |
|---|---|
| 1. **The loss** — 1 DAI sent directly to the cbBTC token contract | [`0x7da3…a4c1`](https://basescan.org/tx/0x7da304788c1fd9b2f02e8a313ea9c0881e5d34d28cbdc9943b367139535ca4c1) |
| 2. **Claim registered** — victim signed an EIP-712 claim; router assigned deposit address [`0x3967…EFa3`](https://basescan.org/address/0x3967BfCB4A04173b9f5B735831D0D38c0549EFa3) | [`0xd202…1ae9`](https://basescan.org/tx/0xd20241abf6f4bdddd91dbd72190a9a5037cd92920689e677a7a0265118601ae9) |
| 3. **Receiver funded** — 1 DAI rescued into the claim's deposit address | [`0x4654…1531`](https://basescan.org/tx/0x4654e00d88dff48ab91b7a4b9388e75e5d61fc8121b82bd6ab889acb702b1531) |
| 4. **Settlement** — permissionless `settle()`: **0.95 DAI → victim, 0.05 DAI → protocol**, exact 95/5 split in one transaction | [`0x7c6b…b51b`](https://basescan.org/tx/0x7c6ba90f73bec7accf15ec8f92bbf92fbd0e509685d5aa819ca26aca7c05b51b) |

Claim ID: `0xa0c54e183faab63c4ea488fd81ef24a61d190d43c6c063684c1a8a6e84878666`

## How a recovery flows

```mermaid
flowchart TD
    A[🔍 Scan\ncontract or wallet] --> B{Triage:\nrecoverable?}
    B -- "rescue function + owner found" --> C[✍️ Victim signs\nEIP-712 RecoveryClaim]
    B -- "finder discovered it" --> F[🕵️ Finder registers find\noff-chain · 7% priority locked]
    F --> C
    C --> D[⛓️ registerClaim on router\nclaim gets deterministic\nCREATE2 deposit address]
    D --> E[📬 Owner rescues stranded tokens\nto the claim's deposit address]
    E --> G[⚖️ settle — permissionless\nsweeps receiver, splits by\nschedule frozen at registration]
    G --> H[💰 Victim 95%\n·\nProtocol 5%]
    G --> I[💰 Victim 90% · Finder 7%\n·\nProtocol 3%]
```

## What it does

### 🔍 Contract Scanner
Paste any ERC-20 contract on Ethereum or Base. Salvage:
- Sweeps **every token balance** the contract holds (paginated discovery + guaranteed pass on major tokens)
- Prices holdings via Alchemy Prices API (hybrid by-symbol / by-address, spam-filtered)
- Runs **recovery triage**: Is the contract verified? Does its ABI expose a rescue function (`rescueERC20()` and friends)? Is it an upgradeable proxy? Is there an owner who can act?
- Verdict: **Recoverable · Needs Action · Unrecoverable** — plus a ready-to-send outreach message for the contract's team

If the wallet you connect matches the contract's on-chain `owner()`, an owner-only recovery panel appears per stranded token: register the claim (crediting whichever finder registered first, if any), get a deterministic deposit address, rescue the tokens to it yourself, and settle — the same trustless flow described below, not just an outreach template. Only works for standard `Ownable`-style contracts today; role-based (`AccessControl`) ownership isn't detected yet, so that panel simply won't appear rather than guess wrong.

> **Triage caveat:** the scanner detects the *presence* of rescue functions and ownership patterns in the ABI — it does not verify whether the owner can or will actually act. A `rescueERC20()` gated behind a timelock, or an `owner()` pointing at a multisig that's lost its signers, still reads as "Recoverable" today. Treat the verdict as "a path plausibly exists," not a guarantee.

### 🕵️ Finder registration
Anyone can discover a stranded balance before the affected team or victim does. Registering a find is **off-chain and gasless**: the finder signs a plain message (EIP-191, via `signMessage`) agreeing to the fee schedule, and it's recorded in Supabase under a deterministic `find_key` — first writer wins, enforced by a unique constraint (`409` for anyone who tries to register the same find afterward). No victim signature is required at this stage; it only locks in *priority* on the 7% finder fee.

- **Abuse case:** a victim can't register as their own finder — rejected off-chain (the API checks `finder !== victim` before writing) and on-chain (`registerClaim()` reverts on `finder == victim`, [`SalvageRecoveryRouter.sol`](contracts-hardhat/contracts/SalvageRecoveryRouter.sol)). What this *doesn't* stop: someone using a second wallet they also control as "finder" — no signature scheme can prove two addresses belong to different people, so this is an accepted, bounded risk (worth at most the gap between the two fee schedules above), not a solved one.
- **Stale registrations expire after 90 days** unless the claim has already settled — otherwise a single abandoned (or bot-squatted) registration would lock a find permanently, blocking any finder who could actually deliver the outreach. A settled find can never be reopened, checked directly against the claims registry.
- **Victim contact today is manual** — the finder reaches out with the app's generated outreach message. Automated reverse-lookup (Basename/ENS, Farcaster) is on the roadmap, not built yet.

### 🕵️ Did I Lose Tokens?
Paste your wallet address. Salvage scans your transfer history for the classic mistake — tokens sent **directly to a token contract's own address** — verified on-chain via calldata analysis (fee-on-transfer side effects are excluded by construction). Each finding shows what you lost, whether the contract still holds it, and whether a recovery path exists.

### 📱 Base App Mini App
Salvage runs natively inside the Base App as a Mini App. Open it and your wallet is already connected — one tap scans it across **both Ethereum and Base in parallel**, findings labeled by chain. Recovery no longer means leaving the app either: signing the EIP-712 claim, registering it on-chain, and settling once funded all happen natively in the Mini App now — no redirect to the website to finish. Scope is deliberately narrower than the web app: the Contract Scanner and the owner-side recovery panel stay web-only. Built with MiniKit / OnchainKit and `@farcaster/miniapp-sdk`; registered on Base Dashboard. Wallet-address opt-in captures interest for recovery alerts (delivery pending Base's notifications API).

### 👋 Proactive status on connect
Connecting a wallet on the web app immediately (and only) surfaces what's actually relevant to it, across all three roles it might play:
- **Owner** — contracts Salvage has already scanned where you're the on-chain `owner()`
- **Victim/beneficiary** — any of your own claims that haven't settled yet, with a live "Settle" button once a claim is genuinely funded (checked on-chain, not trusted from a DB flag nothing keeps in sync)
- **Finder** — every find you've registered, cross-referenced against the claims registry for its real status: still just priority-locked, a claim registered crediting you, settled and paid out, or (an honest edge case) a claim that exists but doesn't credit you

Pure lookups against data Salvage already has; never a live re-scan on every connect, since that would undo the point of rate limiting the scan endpoints. Shows nothing at all if there's nothing relevant across any of the three — an empty "no pending actions" message would just be noise for the majority of wallets that aren't an owner, victim, or finder of anything yet.

### ⚖️ On-chain Recovery Settlement
Recovery never depends on trusting anyone:

1. Victim signs an **EIP-712 RecoveryClaim** (token, victim, finder, loss tx, deadline)
2. Each claim gets its own **deterministic CREATE2 deposit address**
3. The contract owner rescues the stranded tokens to that address
4. `settle()` is **permissionless** — sweeps the receiver and splits automatically

**Fee schedule (frozen per claim, enforced by contract):**
| Flow | Victim | Finder | Protocol |
|---|---|---|---|
| Victim-initiated | 95% | — | 5% |
| Finder-brokered | 90% | 7% | 3% |

## Deployed contracts

| Contract | Ethereum | Base |
|---|---|---|
| **SalvageRecoveryRouter** (active) | [`0xD9A5f1Fcf39F99152d6443132B21C1D8f7fAAC25`](https://etherscan.io/address/0xD9A5f1Fcf39F99152d6443132B21C1D8f7fAAC25#code) | [`0x2240792d1A9D964d238bD693fCb09586B10faEdf`](https://basescan.org/address/0x2240792d1A9D964d238bD693fCb09586B10faEdf#code) |
| **SalvageFeeContract** (legacy, unused) | [`0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27`](https://etherscan.io/address/0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27#code) | [`0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27`](https://basescan.org/address/0xd21c72FBE27B6Cd26A5DBf49148B7bA0a4CAed27#code) |

Both contracts verified on **Etherscan/Basescan, Blockscout, and Sourcify**. The Fee Contract was an earlier design (manual founder-confirmed recoveries, ETH-denominated fees) fully superseded by the Router's permissionless, signature-based settlement — the app no longer calls it, and it never held stranded ERC-20 tokens.

## Security model

The router is designed so most attacks die by construction:

- **Per-claim CREATE2 receivers** — no shared pot; claims can never be confused or cross-drained
- **Front-running `settle()` is harmless** — payout addresses and splits are frozen at registration; a front-runner just pays your gas
- **No admin path to funds** — the owner can only change where *future* protocol fees go (two-step ownership); claim receivers are untouchable even with a compromised key
- **Non-upgradeable, zero external dependencies, no delegatecall**
- **EIP-712 signatures** with deadline expiry and EIP-2 malleability rejection
- **Balance-delta accounting** — fee-on-transfer tokens split correctly
- **Residual-safe** — `settle()` can run again if more tokens arrive later

Test suite: 10/10 passing (`npx hardhat test`) covering both fee paths, deterministic receiver prediction, residual settlement, forged/expired/duplicate signatures, fee-on-transfer math, and ownership.

The application layer gets the same scrutiny as the contract: RLS on every Supabase table denies writes from the public anon key by default (verified directly, not assumed), trigger functions are pinned against the mutable-`search_path` privilege-escalation class, and the scan endpoints are rate-limited (Upstash-backed, shared across serverless instances rather than an in-memory counter that resets on every cold start) to stop a scripted hammering from running up RPC/explorer API costs.

## Stack

- **Frontend:** Next.js 14 · TypeScript · wagmi v2 / viem
- **Data:** Alchemy (RPC, Token API, Prices API) · Etherscan API V2 · Supabase (leaderboard, claims/finds registry) · Upstash Redis (rate limiting)
- **Contracts:** Solidity 0.8.20 · Hardhat 3 · Ignition deploys · node:test + viem test suite
- **Chains:** Ethereum + Base
- **Base App:** MiniKit / OnchainKit Mini App · registered on Base Dashboard · wallet-address notification opt-in

## Repo layout

```
src/
  app/api/         scan, victim-scan, claims, leaderboard, stats
  components/      dashboard, scanner UI, recovery claim panel
  lib/             scanner (triage), sweeper (balances+pricing), victim (loss detection)
contracts-hardhat/
  contracts/       SalvageRecoveryRouter.sol, SalvageFeeContract.sol
  test/            router test suite
  ignition/        deployment modules + records (chain-1, chain-8453)
```

> The Base App Mini App lives in a separate repo: [`2TheMoom/salvage-miniapp`](https://github.com/2TheMoom/salvage-miniapp)

## Running locally

```bash
npm install
cp .env.example .env.local   # Alchemy RPCs + API key, Etherscan key, Supabase keys
npm run dev
```

Contracts:
```bash
cd contracts-hardhat
npm install
npx hardhat compile
npx hardhat test
```

## Roadmap

- **✅ v1.1 — Owner-gated on-chain recovery:** shipped. A wallet matching a stranded contract's on-chain `owner()` can register a claim, get a deposit address, and settle — per token, crediting whichever finder registered first.
- **✅ v1.1 — Decoded rescue calldata:** shipped. When triage detects a rescue function, the owner panel reads its *real* ABI signature (not a guessed shape) and shows a decoded call preview with editable, best-effort-prefilled parameters (token/recipient/amount matched by name + type — left blank rather than guessed wherever the mapping isn't confident), plus a raw calldata copy button. Deliberately stops there: Salvage constructs the *preview*, never sends the transaction — the owner remains the one who submits it, since it's a call into a contract Salvage doesn't control or audit.
- **Rescue edge cases:** multiple candidate rescue functions on one contract, custom/uncommon parameter shapes, and timelock/multisig-owned contracts aren't specially handled yet — the current version covers the common single-rescue-function case well and leaves the rest to the editable fields.
- **✅ Recent Activity feed:** shipped — a chronological feed of finds registered, claims registered, and settlements. Deliberately not an aggregate "all-time recovered" counter: with real volume still low, a stats-style number reads as broken rather than new. A timeline shows the same one entry as proof the thing works instead.
- **v1.2 — Recoverability Score:** every scanned contract gets a 0–100 score derived from the triage inputs (verification, rescue functions, upgradeability, ownership, proxy pattern) — one shareable number, full details underneath.
- **Victim contact discovery:** Basename/ENS reverse-resolution and Farcaster lookup so finders can reach wallet owners.
- **Further out:** recovery APIs for wallets and explorers, protocol support portals, notifications for newly stranded assets.

## Vision

Make stranded ERC-20 recoveries as standardized and trustless as token transfers themselves. Salvage starts as a scanner and a settlement router, but the protocol is designed to become infrastructure — wallet integrations that flag stranded sends before they happen, explorer badges for recoverable contracts, support portals for protocol teams, and an SDK so any app can offer recovery natively. A single frontend is the beginning, not the ceiling.

## An honest note on recovery

Salvage finds stranded funds and builds the safest possible path to return them — but **recovery always requires the contract owner to act**. No tool can force it. What Salvage guarantees is that when an owner does act, settlement is trustless, auditable, and nobody custodies anything. If anyone DMs you promising guaranteed fund recovery for an upfront fee, it's a scam — that's exactly the pattern this protocol was designed to make unnecessary.

---

**Built by [Abu Olumi](https://x.com/Olumi441)** · Builder · Researcher · Content Creator · On-chain Contributor