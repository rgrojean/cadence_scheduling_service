import "dotenv/config";
import { pool, migrate } from "./db.js";

await migrate();
console.log("migrations applied");
await pool.end();
