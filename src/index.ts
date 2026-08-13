import "dotenv/config";
import Fastify from "fastify";
import { registerRoutes } from "./api/routes.js";
import { migrate } from "./db.js";

async function main() {
  await migrate();
  const app = Fastify({ logger: true });
  await registerRoutes(app);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
