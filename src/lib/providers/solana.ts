// Solana adapter — real onchain reads via @solana/kit.
// Default RPC: public api.mainnet-beta.solana.com (measured healthy 2026-11-15).
// HELIUS_API_KEY enables an indexed provider (not configured here → honest
// UNAVAILABLE state for the indexed provider; public-RPC reads still operate).

import { createSolanaRpc, address, type Address, type Rpc, type SolanaRpcApi } from "@solana/kit";
import { ProviderError, ProviderHealthState, RateLimitState } from "./framework";

export interface MintInfo {
  mint: string;
  decimals: number | null;
  supply: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
  extensions: string[];
  program: "SPL_TOKEN" | "TOKEN_2022";
  slot: string;
}

export interface AccountObservation {
  address: string;
  lamports: string;
  owner: string | null;
  executable: boolean;
  dataLength: number;
  slot: string;
}

function validateMint(mint: string): Address {
  try {
    return address(mint);
  } catch {
    throw new ProviderError("PERMANENT", `Malformed Solana address: ${mint}`, false);
  }
}

const FALLBACK_RPC = "https://api.mainnet-beta.solana.com";

/** Strips credential-like query params before an endpoint is displayed in diagnostics.
 * Never use this value for the actual RPC connection. */
export function safeRpcEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    for (const key of ["api-key", "api_key", "key", "token", "authorization"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "REDACTED");
    }
    return url.toString();
  } catch {
    return endpoint;
  }
}

export class SolanaAdapter {
  private rpc: Rpc<SolanaRpcApi>;
  private endpoint: string;
  private heliusConfigured: boolean;

  constructor(opts?: { endpoint?: string; heliusApiKey?: string }) {
    this.endpoint = opts?.endpoint ?? process.env.SOLANA_RPC_URL ?? FALLBACK_RPC;
    this.heliusConfigured = !!(opts?.heliusApiKey ?? process.env.HELIUS_API_KEY);
    this.rpc = createSolanaRpc(this.endpoint);
  }

  get indexedProviderConfigured(): boolean {
    return this.heliusConfigured;
  }

  get rpcEndpoint(): string {
    return this.endpoint;
  }

  async getHealth(): Promise<ProviderHealthState> {
    try {
      const health = await this.rpc.getHealth().send();
      return health === "ok" ? "HEALTHY" : "DEGRADED";
    } catch {
      return "DEGRADED";
    }
  }

  async getRateLimitState(): Promise<RateLimitState> {
    return { limit: null, remaining: null, resetAt: null, source: "CONFIG" };
  }

  async getSlot(): Promise<string> {
    const slot = await this.rpc.getSlot().send();
    return String(slot);
  }

  /**
   * Reads and decodes an SPL Token / Token-2022 mint account.
   * Every call returns the slot observed, preserving provenance.
   */
  async getMintInfo(mint: string): Promise<MintInfo> {
    const addr = validateMint(mint);
    let res;
    try {
      res = await this.rpc
        .getAccountInfo(addr, { encoding: "base64" })
        .send();
    } catch (err) {
      throw new ProviderError("NETWORK", `RPC error: ${String(err)}`);
    }

    const { value, context } = res;
    const slot = String(context.slot);
    if (!value) {
      throw new ProviderError("PERMANENT", "Account does not exist", false);
    }
    const ownerProgram = String(value.owner);
    const program: MintInfo["program"] = ownerProgram.includes("TokenzQd") /* Token-2022 program */
      ? "TOKEN_2022"
      : "SPL_TOKEN";

    // base64 payload from kit: { data: [base64, 'base64'] }
    const dataField = value.data as unknown;
    let bytes: Uint8Array;
    if (Array.isArray(dataField) && typeof dataField[0] === "string") {
      bytes = Uint8Array.from(Buffer.from(dataField[0], "base64"));
    } else {
      throw new ProviderError("INVALID_RESPONSE", "Unexpected account data encoding", false);
    }

    if (bytes.length < 82) {
      throw new ProviderError("INVALID_RESPONSE", "Account too short to be a mint", false);
    }
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const mintAuthorityOpt = dv.getUint32(0, true);
    // Authority pubkeys are 32 raw bytes → base58 string via kit's base58 decoder
    // (getBase58Decoder().decode(bytes): bytes → string; the encoder goes the other way).
    const { getBase58Decoder } = await import("@solana/kit");
    const b58 = getBase58Decoder();
    const mintAuthorityB58 =
      mintAuthorityOpt === 1 ? b58.decode(bytes.slice(4, 36)) : null;
    const supplyBytes = bytes.slice(36, 44);
    let supply = 0n;
    for (let i = 0; i < 8; i++) supply = BigInt(supply) + BigInt(supplyBytes[i]) * (1n << BigInt(8 * i));
    const decimals = bytes[44];
    const isInitialized = bytes[45] === 1;
    const freezeAuthorityOpt = dv.getUint32(46, true);
    const freezeAuthorityB58 = freezeAuthorityOpt === 1 ? b58.decode(bytes.slice(50, 82)) : null;

    // Token-2022 extensions present after byte 82
    const extensions: string[] = [];
    if (program === "TOKEN_2022" && bytes.length > 82) {
      extensions.push("TOKEN_EXTENSIONS_PRESENT");
    }

    return {
      mint: addr,
      decimals,
      supply: supply.toString(),
      mintAuthority: mintAuthorityB58,
      freezeAuthority: freezeAuthorityB58,
      isInitialized,
      extensions,
      program,
      slot,
    };
  }

  async getAccountObservation(addressStr: string): Promise<AccountObservation> {
    const addr = validateMint(addressStr);
    const res = await this.rpc.getAccountInfo(addr, { encoding: "base64" }).send();
    const { value, context } = res;
    if (!value) throw new ProviderError("PERMANENT", "Account does not exist", false);
    return {
      address: addr,
      lamports: String(value.lamports),
      owner: String(value.owner),
      executable: Boolean(value.executable),
      dataLength: Number((value.data as unknown[])[0] ? String((value.data as [string, string])[0].length) : 0),
      slot: String(context.slot),
    };
  }

  /** Bounded recent-signature history for a mint/wallet (read-only). */
  async getRecentSignatures(addressStr: string, limit = 10): Promise<Array<{ signature: string; slot: string; blockTime: number | null }>> {
    const addr = validateMint(addressStr);
    const res = await this.rpc.getSignaturesForAddress(addr, { limit }).send();
    return res.slice(0, limit).map((s) => ({
      signature: String(s.signature),
      slot: String(s.slot),
      blockTime: s.blockTime !== null ? Number(s.blockTime) : null,
    }));
  }

  /**
   * Onchain confirmation status for a submitted signature (read-only).
   * Used by the gated execution surface to resolve UNCERTAIN records.
   */
  async getSignatureStatus(signature: string): Promise<{ confirmed: boolean; slot: string | null; err: unknown }> {
    const res = await this.rpc.getSignatureStatuses([signature as Parameters<typeof this.rpc.getSignatureStatuses>[0][0]]).send();
    const value = res.value?.[0] ?? null;
    return {
      confirmed: value?.confirmationStatus === "confirmed" || value?.confirmationStatus === "finalized",
      slot: value?.slot !== undefined && value?.slot !== null ? String(value.slot) : null,
      err: value?.err ?? null,
    };
  }
}

export function isValidSolanaAddress(candidate: string): boolean {
  try {
    address(candidate);
    return true;
  } catch {
    return false;
  }
}
