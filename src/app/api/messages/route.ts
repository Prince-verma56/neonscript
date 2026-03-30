import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { inngest } from "@/inngest/client";
import { convex } from "@/lib/convex-client";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

const requestSchema = z.object({
  conversationId: z.string(),
  message: z.string().trim().min(1, "Message cannot be empty"),
});

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const internalKey = process.env.NEONSCRIPT_CONVEX_INTERNAL_KEY;
  const inngestEventKey = process.env.INNGEST_EVENT_KEY;

  if (!internalKey) {
    return NextResponse.json(
      { error: "Internal key not configured" },
      { status: 500 }
    );
  }

  if (!inngestEventKey) {
    return NextResponse.json(
      { error: "INNGEST_EVENT_KEY is not configured" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { conversationId, message } = requestSchema.parse(body);

  const conversation = await convex.query(api.system.getConversationById, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  const projectId = conversation.projectId;

  const processingMessages = await convex.query(
    api.system.getProcessingMessages,
    {
      internalKey,
      projectId,
    }
  );

  for (const msg of processingMessages) {
    try {
      await inngest.send({
        name: "message/cancel",
        data: {
          messageId: msg._id,
        },
      });
    } catch (error) {
      console.error("Failed to send message/cancel event", {
        messageId: msg._id,
        error,
      });
    }

    await convex.mutation(api.system.updateMessageStatus, {
      internalKey,
      messageId: msg._id,
      status: "cancelled",
    });
  }

  await convex.mutation(api.system.createMessage, {
    internalKey,
    conversationId: conversationId as Id<"conversations">,
    projectId,
    role: "user",
    content: message,
  });

  const assistantMessageId = await convex.mutation(
    api.system.createMessage,
    {
      internalKey,
      conversationId: conversationId as Id<"conversations">,
      projectId,
      role: "assistant",
      content: "",
      status: "processing",
    }
  );

  try {
    const event = await inngest.send({
      name: "message/sent",
      data: {
        messageId: assistantMessageId,
        conversationId,
        projectId,
        message,
      },
    });

    return NextResponse.json({
      success: true,
      eventId: event.ids[0],
      messageId: assistantMessageId,
    });
  } catch (error) {
    console.error("Failed to send message/sent event", {
      messageId: assistantMessageId,
      conversationId,
      projectId,
      error,
    });

    await convex.mutation(api.system.updateMessageContent, {
      internalKey,
      messageId: assistantMessageId,
      content:
        "I couldn't start processing your request right now. Please try again in a moment.",
    });

    return NextResponse.json(
      { error: "Failed to queue message for processing" },
      { status: 503 }
    );
  }
}
