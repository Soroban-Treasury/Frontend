// Serve the static build in out/ (after `npm run build`). No dependencies.
//
//   node scripts/serve.mjs            # http://localhost:4000
//   PORT=8080 node scripts/serve.mjs
//
// Honours NEXT_PUBLIC_BASE_PATH, so a build made for GitHub Pages can be checked locally too.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "out");
const port = Number(process.env.PORT || 4000);
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

if (!existsSync(root)) {
  console.error("No out/ folder. Run `npm run build` first.");
  process.exit(1);
}

function fileFor(urlPath) {
  let path = decodeURIComponent(urlPath.split("?")[0]);
  if (basePath) {
    if (path !== basePath && !path.startsWith(`${basePath}/`)) return null;
    path = path.slice(basePath.length) || "/";
  }
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, "index.html");
  if (existsSync(file)) return file;
  if (existsSync(`${file}.html`)) return `${file}.html`;
  return null;
}

createServer((req, res) => {
  const file = fileFor(req.url || "/");
  if (file && existsSync(file)) {
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
    return;
  }
  const notFound = join(root, "404.html");
  res.writeHead(404, { "content-type": TYPES[".html"] });
  if (existsSync(notFound)) createReadStream(notFound).pipe(res);
  else res.end("Not found");
}).listen(port, () => {
  console.log(`Serving out/ at http://localhost:${port}${basePath}/`);
});
