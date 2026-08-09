// Source URLs come from the web-search citations the Responses API attaches
// to the output text — a cited URL exists; one the model writes might not.

type ResponseLike = {
  output?: Array<{
    type: string;
    content?: Array<{ type: string; annotations?: Array<{ type: string; url?: string }> }>;
  }>;
};

export function extractFirstCitationUrl(response: ResponseLike): string | null {
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) return annotation.url;
      }
    }
  }
  return null;
}
