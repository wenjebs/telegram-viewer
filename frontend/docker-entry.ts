import { join } from "path"
import { readdir, stat } from "fs/promises"
import server from "./dist/server/server.js"

const CLIENT_DIR = join(import.meta.dir, "dist", "client")

// Build a set of all static asset paths at startup
const staticFiles = new Set<string>()
async function walkDir(dir: string, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      await walkDir(join(dir, entry.name), relPath)
    } else {
      staticFiles.add(`/${relPath}`)
    }
  }
}
await walkDir(CLIENT_DIR)

Bun.serve({
  port: Number(process.env.PORT) || 3000,
  async fetch(req) {
    const url = new URL(req.url)
    // Serve static files from dist/client
    if (staticFiles.has(url.pathname)) {
      const file = Bun.file(join(CLIENT_DIR, url.pathname))
      return new Response(file)
    }
    // Fall through to SSR
    return server.fetch(req)
  },
})

console.log(`Server listening on port ${Number(process.env.PORT) || 3000}`)
