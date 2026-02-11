// POST localhost:3000/api/demo/background


import { inngest } from "@/inngest/client";
import { generateText } from "ai";

export async function POST() {
    try {
        await inngest.send({
            name: "demo/generate",
            data: {
                prompt: "Write a Vegetarian lasagna recipe for 4 people."
            }
        })

        return Response.json({ status: "started" });
    } catch (error) {
        console.error("OpenRouter Error:", error);
        return Response.json(
            { error: "Failed to generate text" },
            { status: 500 }
        );
    }
}
