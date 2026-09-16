export interface PreparedEvidence {
  url: string;
  sha256: string;
  size: number;
}

export async function prepareEvidence(url: string): Promise<PreparedEvidence> {
  validateHttpsEvidence(url);

  let response: Response;
  try {
    response = await fetch("/api/prepare-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error("Evidence preparation service is unavailable. Try again.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Evidence preparation returned an invalid response.");
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? payload.error
        : undefined;
    throw new Error(typeof message === "string" ? message : "Evidence could not be prepared.");
  }

  if (!isPreparedEvidence(payload)) {
    throw new Error("Evidence preparation returned incomplete data.");
  }
  return payload;
}

function isPreparedEvidence(value: unknown): value is PreparedEvidence {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof value.url === "string" &&
    "sha256" in value &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    "size" in value &&
    typeof value.size === "number" &&
    Number.isInteger(value.size) &&
    value.size > 0 &&
    value.size <= 8192
  );
}

export function validateHttpsEvidence(url: string, label = "Evidence URL") {
  if (!url.startsWith("https://")) throw new Error(`${label} must use HTTPS.`);
  if (url.length > 2048 || /[\s\\#]/.test(url) || url.includes("@")) {
    throw new Error(`${label} is not a valid evidence URL.`);
  }
}

export function validateProviderEvidence(url1: string, url2: string) {
  validateHttpsEvidence(url1, "Evidence source 1");
  validateHttpsEvidence(url2, "Evidence source 2");
  if (url1 === url2) throw new Error("Evidence sources must be different.");
}

export function validateOptionalEvidence(url: string, hash: string) {
  if (!url && !hash) return;
  if (!url || !hash) throw new Error("Provide both the response evidence URL and its hash.");
  validateHttpsEvidence(url, "Response evidence URL");
}
