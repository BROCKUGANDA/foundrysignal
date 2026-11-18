// Connect-by-IP pinning for the SSRF guard (audit H-4).
// A rebinding authoritative DNS server must never get a second chance at
// connect time: the transport is pinned to the very address that passed
// hop validation. These tests inject both the DNS lookup and the HTTP
// transport, so no network I/O happens and no real DNS is consulted.
import { describe, test, expect } from "bun:test";
import {
  guardedFetch,
  pinnedLookupFor,
  ProviderError,
  type ConnectLookup,
  type GuardedTransport,
  type LookupAll,
  type PinnedAddress,
} from "@/lib/providers/framework";

const PUBLIC_V4 = "93.184.216.34";
const PUBLIC_V4_B = "8.8.8.8";
const METADATA_V4 = "169.254.169.254";

function callLookupAll(lookup: ConnectLookup, hostname: string): Promise<PinnedAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, { all: true }, (err, address) => {
      if (err) return reject(err);
      resolve(address as PinnedAddress[]);
    });
  });
}

function callLookupOne(
  lookup: ConnectLookup,
  hostname: string
): Promise<{ address: string; family: number | undefined }> {
  return new Promise((resolve, reject) => {
    lookup(hostname, {}, (err, address, family) => {
      if (err) return reject(err);
      resolve({ address: address as string, family });
    });
  });
}

describe("SSRF connect-by-IP pinning", () => {
  test("connects to the first validated address; the rebound answer is never used", async () => {
    const dnsCalls: string[] = [];
    // First (validation) lookup returns a public address; any subsequent lookup
    // for the same host would return the cloud metadata endpoint.
    const mockLookup: LookupAll = async (hostname) => {
      dnsCalls.push(hostname);
      if (dnsCalls.length === 1) return [{ address: PUBLIC_V4, family: 4 }];
      return [{ address: METADATA_V4, family: 4 }];
    };

    let pinnedSeen: PinnedAddress | undefined;
    let lookupSeen: ConnectLookup | undefined;
    const transport: GuardedTransport = async (_url, pinned, lookup) => {
      pinnedSeen = pinned;
      lookupSeen = lookup;
      // What node:http would do at connect time — but pinned, so no DNS:
      const resolved = await callLookupAll(lookup, "rebind.example");
      expect(resolved).toEqual([{ address: PUBLIC_V4, family: 4 }]);
      const single = await callLookupOne(lookup, "rebind.example");
      expect(single).toEqual({ address: PUBLIC_V4, family: 4 });
      return { status: 200, headers: { "content-type": "text/html" }, body: "<html>ok</html>" };
    };

    const res = await guardedFetch("http://rebind.example/", undefined, {
      lookup: mockLookup,
      transport,
    });

    expect(res.body).toBe("<html>ok</html>");
    expect(pinnedSeen).toEqual({ address: PUBLIC_V4, family: 4 });
    // DNS was consulted exactly once (validation); connect time did not re-resolve.
    expect(dnsCalls).toEqual(["rebind.example"]);
    expect(lookupSeen).toBeDefined();
  });

  test("rejects a host that resolves (even partially) to the metadata address", async () => {
    const mockLookup: LookupAll = async () => [
      { address: PUBLIC_V4, family: 4 },
      { address: METADATA_V4, family: 4 },
    ];
    let transportCalled = false;
    const transport: GuardedTransport = async () => {
      transportCalled = true;
      return { status: 200, headers: {}, body: "" };
    };

    try {
      await guardedFetch("http://mixed.example/", undefined, { lookup: mockLookup, transport });
      throw new Error("expected guardedFetch to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe("PERMANENT");
    }
    expect(transportCalled).toBe(false);
  });

  test("rejects when DNS resolution itself fails", async () => {
    const mockLookup: LookupAll = async () => {
      throw new Error("ENOTFOUND");
    };
    try {
      await guardedFetch("http://gone.example/", undefined, { lookup: mockLookup });
      throw new Error("expected guardedFetch to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe("PERMANENT");
    }
  });

  test("every redirect hop is re-validated and pinned to its own validated address", async () => {
    const answers: Record<string, PinnedAddress[]> = {
      "entry.example": [{ address: PUBLIC_V4, family: 4 }],
      "hop2.example": [{ address: PUBLIC_V4_B, family: 4 }],
    };
    let dnsCalls = 0;
    const mockLookup: LookupAll = async (hostname) => {
      dnsCalls += 1;
      const answer = answers[hostname];
      if (!answer) throw new Error(`unexpected DNS lookup for ${hostname}`);
      return answer;
    };
    const pinnedByHop: string[] = [];
    const transport: GuardedTransport = async (url, pinned, lookup) => {
      // Pinned lookup must reproduce the validated address for THIS hop only.
      const resolved = await callLookupAll(lookup, url.hostname);
      expect(resolved).toEqual([pinned]);
      pinnedByHop.push(`${url.hostname}@${pinned.address}`);
      if (url.hostname === "entry.example") {
        return {
          status: 302,
          headers: { location: "http://hop2.example/next" },
          body: "",
        };
      }
      return { status: 200, headers: { "content-type": "text/plain" }, body: "done" };
    };

    const res = await guardedFetch("http://entry.example/", undefined, {
      lookup: mockLookup,
      transport,
    });

    expect(res.body).toBe("done");
    expect(res.finalUrl).toBe("http://hop2.example/next");
    expect(pinnedByHop).toEqual([
      `entry.example@${PUBLIC_V4}`,
      `hop2.example@${PUBLIC_V4_B}`,
    ]);
    expect(dnsCalls).toBe(2); // one validation lookup per hop, nothing more
  });

  test("a redirect into the metadata address is blocked before any connection", async () => {
    const answers: Record<string, PinnedAddress[]> = {
      "entry.example": [{ address: PUBLIC_V4, family: 4 }],
      "hop2.example": [{ address: METADATA_V4, family: 4 }],
    };
    const mockLookup: LookupAll = async (hostname) => answers[hostname];
    const connected: string[] = [];
    const transport: GuardedTransport = async (url) => {
      connected.push(url.hostname);
      if (url.hostname === "entry.example") {
        return {
          status: 301,
          headers: { location: "http://hop2.example/latest/meta-data" },
          body: "",
        };
      }
      return { status: 200, headers: { "content-type": "text/plain" }, body: "pwned" };
    };

    try {
      await guardedFetch("http://entry.example/", undefined, { lookup: mockLookup, transport });
      throw new Error("expected guardedFetch to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe("PERMANENT");
    }
    expect(connected).toEqual(["entry.example"]); // hop 2 never connected
  });

  test("pinnedLookupFor serves the same address in single and all lookup modes", async () => {
    const pinned: PinnedAddress = { address: PUBLIC_V4, family: 4 };
    const lookup = pinnedLookupFor(pinned);
    expect(await callLookupAll(lookup, "anything.example")).toEqual([pinned]);
    expect(await callLookupOne(lookup, "anything.example")).toEqual({
      address: PUBLIC_V4,
      family: 4,
    });
  });
});
