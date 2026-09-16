import {
  EvidencePreparationError,
  prepareEvidenceFromUrl,
  readBoundedBody,
} from "../src/lib/server/evidence-preparation";

const textEncoder = new TextEncoder();

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
  } catch (reason) {
    assert(reason instanceof EvidencePreparationError, "Expected an evidence preparation error.");
    assert(reason.code === code, `Expected ${code}, received ${reason.code}.`);
    return;
  }
  throw new Error(`Expected ${code} to be thrown.`);
}

function dnsFetcher(address = "93.184.216.34"): typeof fetch {
  return async (input) => {
    const requestUrl = new URL(String(input));
    const type = requestUrl.searchParams.get("type");
    return Response.json({
      Status: 0,
      Answer: type === "A" ? [{ type: 1, data: address }] : [],
    });
  };
}

const operationalBytes = textEncoder.encode("provider operational\r\n");
const accessibilityBytes = textEncoder.encode("provider accessibility\n");

const evidenceFetcher: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith("provider-operational.txt")) {
    return new Response(operationalBytes, { status: 200 });
  }
  if (url.endsWith("provider-accessibility.txt")) {
    return new Response(accessibilityBytes, { status: 200 });
  }
  return new Response("not found", { status: 404 });
};

const operational = await prepareEvidenceFromUrl("https://example.test/provider-operational.txt", {
  fetchImpl: evidenceFetcher,
  dnsFetchImpl: dnsFetcher(),
});
const operationalDigest = await crypto.subtle.digest("SHA-256", operationalBytes);
const operationalHash = Array.from(new Uint8Array(operationalDigest), (byte) =>
  byte.toString(16).padStart(2, "0"),
).join("");
assert(operational.sha256 === operationalHash, "Operational hash did not match raw bytes.");
assert(/^[a-f0-9]{64}$/.test(operational.sha256), "Operational hash format is invalid.");
assert(operational.size === operationalBytes.byteLength, "Operational size is incorrect.");

const accessibility = await prepareEvidenceFromUrl(
  "https://example.test/provider-accessibility.txt",
  { fetchImpl: evidenceFetcher, dnsFetchImpl: dnsFetcher() },
);
assert(accessibility.sha256 !== operational.sha256, "Independent evidence hashes collided.");
assert(accessibility.size === accessibilityBytes.byteLength, "Accessibility size is incorrect.");

await expectCode(
  prepareEvidenceFromUrl("https://example.test/missing.txt", {
    fetchImpl: evidenceFetcher,
    dnsFetchImpl: dnsFetcher(),
  }),
  "EVIDENCE_HTTP_ERROR",
);

const oversized = new Uint8Array(8193);
await expectCode(
  prepareEvidenceFromUrl("https://example.test/oversized.txt", {
    fetchImpl: async () => new Response(oversized, { status: 200 }),
    dnsFetchImpl: dnsFetcher(),
  }),
  "EVIDENCE_TOO_LARGE",
);

for (const url of [
  "http://example.test/evidence.txt",
  "https://localhost/evidence.txt",
  "https://127.0.0.1/evidence.txt",
  "https://10.0.0.1/evidence.txt",
  "https://[::1]/evidence.txt",
  "https://[fc00::1]/evidence.txt",
]) {
  await expectCode(
    prepareEvidenceFromUrl(url, { fetchImpl: evidenceFetcher, dnsFetchImpl: dnsFetcher() }),
    url.startsWith("http:")
      ? "UNSUPPORTED_PROTOCOL"
      : url.includes("example")
        ? "DNS_FAILED"
        : url.includes("10.") || url.includes("127.") || url.includes("::") || url.includes("fc00")
          ? "PRIVATE_ADDRESS"
          : "BLOCKED_HOST",
  );
}

await expectCode(
  prepareEvidenceFromUrl("https://public.test/evidence.txt", {
    fetchImpl: evidenceFetcher,
    dnsFetchImpl: dnsFetcher("192.168.1.20"),
  }),
  "PRIVATE_ADDRESS",
);

await expectCode(
  prepareEvidenceFromUrl("https://public.test/evidence.txt", {
    fetchImpl: async (input) =>
      String(input).includes("public.test")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/private.txt" },
          })
        : evidenceFetcher(input),
    dnsFetchImpl: dnsFetcher(),
  }),
  "PRIVATE_ADDRESS",
);

const aborted = new AbortController();
aborted.abort();
await expectCode(
  readBoundedBody(new Response("evidence"), 8192, aborted.signal),
  "EVIDENCE_TIMEOUT",
);

console.log("Evidence preparation assertions passed.");
