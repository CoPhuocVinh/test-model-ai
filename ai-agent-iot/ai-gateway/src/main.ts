import Fastify from "fastify";
import { config } from "./config.js";
import { registerChatRoutes } from "./routes/chat.route.js";
import { registerConfirmActionRoutes } from "./routes/confirmAction.route.js";

const app = Fastify({
  logger: true
});

app.get("/health", async () => ({
  ok: true,
  service: "ai-gateway"
}));

await registerChatRoutes(app);
await registerConfirmActionRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.status(500).send({
    type: "error",
    message: "Có lỗi xảy ra khi xử lý yêu cầu.",
    code: "INTERNAL_ERROR",
    retryable: true
  });
});

await app.listen({ port: config.port, host: "0.0.0.0" });
