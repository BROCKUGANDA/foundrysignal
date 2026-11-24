# FoundrySignal — Domain Model

## Entities and invariants

### Identity & access
- **User** — account principal. Email unique, password hash (bcrypt), platform role, deletedAt for deletion workflow.
- **Session** — opaque token hash, userId, expiry, workspace context, rotated on role change.
- **Workspace** — tenant root. Personal workspace auto-created at registration; team workspaces opt-in.
- **Membership** — (workspaceId, userId, role) unique; roles OWNER/ADMIN/ANALYST/VIEWER.
- **AuditEvent** — append-only record of privileged actions with actor, target, diff summary.
- **MfaCredential** — one per user. Holds an AES-256-GCM-encrypted TOTP secret (IV + tag, user-id AAD), algorithm/digits/step, `enabled` (false = unconfirmed enrollment), `lastUsedCounter` replay guard, enrollment/disable timestamps. **No plaintext secret is ever persisted.**
- **MfaRecoveryCode** — credentialId + SHA-256 code hash + usedAt. Plaintext is shown once at enrollment/regeneration; codes are single-use and regenerating invalidates all prior codes.
- **MFA_CHALLENGE VerificationToken** — single-use, 5-minute token issued after a correct password (or OAuth assertion) for MFA users. It is *not* a session: no authenticated route is reachable until it is exchanged with a second factor.
- **OAuthState** — single-use, 10-minute authorization request: hashed state, provider, server-held PKCE verifier and optional invitation token. Never stores access tokens or provider profile data.

### Venture registry
- **Venture** — canonical company record. Name, slug (unique), category, ecosystem (SOLANA default), website, description, status (ACTIVE/MERGED/DEFUNCT/UNKNOWN), visibility. **No seeded/fabricated ventures; registry grows only through ingestion or admin entry.**
- **VentureIdentity** — external identifier associations (GitHub org, website domain, social handles) with confidence = `SELF_ASSERTED | SOURCE_CONFIRMED | INDEPENDENTLY_CORROBORATED | DISPUTED | UNKNOWN`.
- **Founder** — a person record keyed by human identity, NOT by account. **Never auto-equates a GitHub account, wallet, or social handle to a person.** Links are `IdentityLink`s with attribution confidence.
- **IdentityLink** — (founderId, identityType GITHUB|WEBSITE|X|DISCORD|WALLET, externalId, claimedBy, confidence, evidenceId). Requires supporting evidence to rise above SELF_ASSERTED.

### Repository intelligence
- **Repository** — provider + stable provider id (GitHub node id), name, owner, url, visibility.
- **RepositoryObservation** — append-only snapshot of metadata (stars, forks, openIssues, languages, pushedAt, defaultBranch) with collectedAt + provider version.
- **CommitActivity / Release / ContributorSnapshot** — append-only observations; contributor records carry `role` ∈ {INDIVIDUAL_CONTRIBUTOR, AUTOMATED_ACCOUNT, REPO_OWNER, REPO_MAINTAINER} and are distinct from founder attribution.

### Evidence & provenance
- **Claim** — a canonical, disputable statement extracted from primary material (e.g., "X is the founder"). Status ∈ {SUPPORTED, CONTRADICTED, OUTDATED, UNVERIFIED}.
- **EvidenceSource** — origin record: URL, provider, sourceType (GITHUB_API, WEBSITE, ONCHAIN_RPC, MARKET_API, FOUNDER_PROVIDED), collectedAt, contentHash (SHA-256), collectorVersion, transformationVersion.
- **EvidenceSnapshot** — immutable fetched payload linked to a source; enables change intelligence (diff between two observations).
- **ClaimEvidenceLink** — (claimId, evidenceId, relation ∈ {SUPPORTS, CONTRADICTS, NEUTRAL}).
- Verification classification is computed only from linked evidence; no fabricated states. Stale evidence is reclassified by freshness policy, never deleted.

### Onchain & market
- **TokenAsset** — mint, symbol, name, decimals, authorities (mint/freeze), extensions, venture association (confidence-carrying).
- **WalletAssociation** — (ventureId, address, label, confidence, evidenceId). Public, defensible associations only.
- **OnchainObservation** — append-only: mint/account/program data + `slot`, `dataSources[]`, `observationTime`, `providerLimitations`.
- **MarketSnapshot** — price/liquidity/volume/supply at time T from Jupiter; always carries `asOf` + provider. Kept structurally separate from evidence.

### AI research
- **ResearchRun** — question, venture scope, status (QUEUED/RUNNING/COMPLETED/FAILED), tenant scoped.
- **ResearchReport** — 11 mandated sections; every factual statement carries citation ids that MUST resolve to evidence records visible to the tenant; unresolved citations fail validation. Unknown facts render as explicit `INSUFFICIENT_EVIDENCE`, never invented.

### Engagement & commerce
- **Watchlist** / **WatchlistItem** / **SavedSearch** — workspace-scoped.
- **Alert** / **AlertEvent** — rule over observation deltas (release published, authority changed, evidence contradiction), evaluation by worker.
- **TransactionRecord** — user-initiated trade lifecycle: quote → signed → submitted → uncertain → confirmed/failed. Signature-status aware; never assumes timeout = failure.
- **Plan / Subscription / Entitlement** — configurable plan records; prices are data, not code. **ApiKey** + **ApiUsage** for metering.

## Cross-cutting invariants
1. Append-only observations; corrections are new records.
2. Every external datum carries provider + collection time + content hash where applicable.
3. Tenant visibility enforced at retrieval (AI retrieval included).
4. Attribution confidence is explicit everywhere identity is involved.
5. Nothing is presented as verified that has not been classified by the evidence engine from linked evidence.
