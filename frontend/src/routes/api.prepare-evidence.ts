import { createFileRoute } from "@tanstack/react-router";
import {
  EvidencePreparationError,
  prepareEvidenceFromUrl,
  readBoundedBody,
} from "@/lib/server/evidence-preparation";

const MAX_REQUEST_BYTES = 4096;

export const Route = createFileRoute("/api/prepare-evidence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const bodyBytes = await readBoundedBody(request, MAX_REQUEST_BYTES);
          let body: unknown;
          try {
            body = JSON.parse(new TextDecoder().decode(bodyBytes));
          } catch {
            throw new EvidencePreparationError(
              "INVALID_REQUEST",
              "Evidence preparation request is not valid JSON.",
              400,
            );
          }
          if (
            typeof body !== "object" ||
            body === null ||
            !("url" in body) ||
            typeof body.url !== "string"
          ) {
            throw new EvidencePreparationError(
              "INVALID_REQUEST",
              "Evidence preparation requires a URL.",
              400,
            );
          }

          const result = await prepareEvidenceFromUrl(body.url);
          return Response.json(result, {
            headers: { "cache-control": "no-store" },
          });
        } catch (reason) {
          const error =
            reason instanceof EvidencePreparationError
              ? reason
              : new EvidencePreparationError(
                  "EVIDENCE_INTERNAL",
                  "Evidence could not be prepared.",
                  502,
                );
          if (error.code === "EVIDENCE_INTERNAL") console.error(reason);
          return Response.json(
            { error: error.message, code: error.code },
            { status: error.status, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
