import { inngest } from "./client";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { firecrawl } from "@/lib/firecrawl";
import { format } from "path";


const URL_REGEX = /\b(https?:\/\/[^\s]+)\b/g;

const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});
export const demoGenerate = inngest.createFunction(
    { id: "demoGenerate" },
    { event: "demo/generate" },
    async ({ event, step }) => {
        const { prompt } = event.data as { prompt: string };

        const urls = await step.run("extract-urls", async () => {
            return prompt.match(URL_REGEX) ?? [];
        }) as string[];

        const scrappedContent = await step.run("scrape-urls", async () => {
            const results = await Promise.all(urls.map(async (url) => {
                const result = await firecrawl.scrape(
                    url,
                    {
                        formats: ["markdown"],
                    }
                );
                return result.markdown ?? null;
            }))

            return results.filter(Boolean).join("\n");
        })

        const finalPrompt = scrappedContent
            ? `Context:\n${scrappedContent}\n\nQuestion:\n${prompt}`
            : prompt;



        await step.run("Generate-Text", async () => {
            return await generateText({
                model: openrouter("google/gemini-2.0-flash-001"),
                prompt: finalPrompt,
            });
        })
    },
);



export const demoError = inngest.createFunction(
    { id: "demoError" },
    { event: "demo/error" },
    async ({ step }) => {
      await step.run("fail", async () => {
        throw new Error("Something went wrong on the server..!");
      })
    },
);
