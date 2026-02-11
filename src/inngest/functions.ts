import { inngest } from "./client";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";


const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});
export const demoGenerate = inngest.createFunction(
    { id: "demoGenerate" },
    { event: "demo/generate" },
    async ({ step }) => {
        await step.run("Generate-Text", async () => {
            return await generateText({
                model: openrouter("google/gemini-2.0-flash-001"),
                prompt: "Hello, how are you?",
            });
        })
    },
);