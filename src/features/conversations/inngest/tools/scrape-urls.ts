import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { firecrawl } from "@/lib/firecrawl";

const paramsSchema = z.object({
  urls: z.array(z.string().min(1)).optional(),
  url: z.string().min(1).optional(),
  links: z.array(z.string().min(1)).optional(),
}).refine(
  (v) =>
    Boolean(
      (v.urls && v.urls.length > 0) ||
        v.url ||
        (v.links && v.links.length > 0)
    ),
  { message: "Provide url or urls" }
);

const normalizeUrls = (values: string[]): string[] => {
  const normalized: string[] = [];

  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    try {
      const withProtocol =
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const url = new URL(withProtocol);
      normalized.push(url.toString());
    } catch {
      // Skip invalid URL; validation message returned later if all invalid.
    }
  }

  return [...new Set(normalized)];
};

export const createScrapeUrlsTool = () => {
  return createTool({
    name: "scrapeUrls",
    description:
      "Scrape content from URLs to get documentation or reference material. Use this when the user provides URLs or references external documentation. Returns markdown content from the scraped pages.",
    parameters: z.object({
      urls: z.array(z.string()).optional().describe("Array of URLs to scrape"),
      url: z.string().optional().describe("Single URL to scrape"),
      links: z.array(z.string()).optional().describe("Alias for urls"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const urls = normalizeUrls([
        ...(parsed.data.urls ?? []),
        ...(parsed.data.links ?? []),
        ...(parsed.data.url ? [parsed.data.url] : []),
      ]);

      if (urls.length === 0) {
        return "Error: No valid URLs provided.";
      }

      try {
        const runScrapeUrls = async () => {
          const settled = await Promise.allSettled(
            urls.map(async (url) => {
              const result = await firecrawl.scrape(url, {
                formats: ["markdown"],
              });

              return {
                url,
                content: result.markdown?.trim() || `No markdown extracted from: ${url}`,
              };
            })
          );

          const results = settled.map((item, index) => {
            if (item.status === "fulfilled") {
              return item.value;
            }

            return {
              url: urls[index],
              content: `Failed to scrape URL: ${urls[index]}`,
            };
          });

          return JSON.stringify(results);
        };

        if (toolStep) {
          return await toolStep.run("scrape-urls", runScrapeUrls);
        }

        return await runScrapeUrls();
      } catch (error) {
        return `Error scraping URLs: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};
