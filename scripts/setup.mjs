import fs from "node:fs";
import { spawnSync } from "node:child_process";
if (!fs.existsSync(".env"))
  fs.writeFileSync(".env", 'DATABASE_URL="file:./local.db"\n');
if (!fs.existsSync("prisma/local.db"))
  fs.closeSync(fs.openSync("prisma/local.db", "a"));
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "db", "push"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
