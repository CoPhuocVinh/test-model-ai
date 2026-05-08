import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runChat } from "../agents/deviceAgent.graph.js";

const chatRequestSchema = z.object({
  message: z.string().min(1)
}).strict();

export async function registerChatRoutes(app: FastifyInstance) {
  app.post("/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type: "error",
        message: "Invalid chat request.",
        code: "BAD_REQUEST"
      });
    }

    const response = await runChat(parsed.data.message);
    return reply.send(response);
  });
}
