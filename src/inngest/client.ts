import { Inngest } from "inngest";
import { sentryMiddleware } from "@inngest/middleware-sentry";

// Create a client to send and receive events
export const inngest = new Inngest({ 
  id: "NeonScript",
  baseUrl: process.env.INNGEST_BASE_URL,
  eventKey: process.env.INNGEST_EVENT_KEY,
  middleware: [sentryMiddleware()],
});
