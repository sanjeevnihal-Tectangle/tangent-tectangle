import { readFileSync } from "node:fs"
import { Client } from "pg"

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i), l.slice(i + 1)]
    })
)

const sql = readFileSync("supabase/migrations/20261119000400_integration_credential_rpcs.sql", "utf8")
const client = new Client({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query(sql)
  const { rows } = await client.query(
    "select proname from pg_proc where proname in ('store_integration_credential','get_integration_credential')"
  )
  console.log("migration ok", rows)
} finally {
  await client.end()
}
