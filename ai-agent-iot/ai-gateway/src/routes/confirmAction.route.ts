import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { confirmAction } from "../agents/deviceAgent.graph.js";

const confirmRequestSchema = z.object({
  pending_action_id: z.string().min(1),
  device_id: z.string().min(1)
}).strict();

export async function registerConfirmActionRoutes(app: FastifyInstance) {
  app.post("/device-actions/confirm", async (request, reply) => {
    const parsed = confirmRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        type: "error",
        message: "Invalid confirm action request.",
        code: "BAD_REQUEST"
      });
    }

    const response = await confirmAction(parsed.data.pending_action_id, parsed.data.device_id);
    return reply.send(response);
  });
}
