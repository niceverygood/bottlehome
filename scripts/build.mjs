import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "client"), { recursive: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await cp(resolve(root, "public"), resolve(dist, "client"), { recursive: true });

await writeFile(
  resolve(dist, "server/index.js"),
  `const worker = {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};

export default worker;
`,
  "utf8",
);

console.log("Bottle homepage build complete.");
