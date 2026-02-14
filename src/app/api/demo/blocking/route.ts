import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";



const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});



export async function POST() {
    try {
        const response = await generateText({
            model: openrouter("google/gemini-2.0-flash-001"),
            prompt: "Hello, how are you?",
            experimental_telemetry:{
                isEnabled:true,
                recordInputs:true,
                recordOutputs:true,
                
            }
        });

        return Response.json({ response });
    } catch (error) {
        console.error("OpenRouter Error:", error);
        return Response.json(
            { error: "Failed to generate text" },
            { status: 500 }
        );
    }
}
