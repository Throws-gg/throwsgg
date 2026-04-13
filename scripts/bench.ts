import { calculateOddsMonteCarlo } from "../lib/racing/odds-engine";
import { selectRaceField } from "../lib/racing/simulation";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, "utf-8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.substring(0, eq).trim();
    const v = trimmed.substring(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

(async () => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from("horses").select("id, speed, stamina, form, consistency, ground_preference");
  const horses = (data || []).map(h => ({
    id: h.id, speed: h.speed, stamina: h.stamina, form: h.form,
    consistency: h.consistency, groundPreference: h.ground_preference
  }));
  const { selectedIds, distance, ground } = selectRaceField("bench", "throws.gg", 1, horses.map(h => h.id));
  const selected = horses.filter(h => selectedIds.includes(h.id));

  for (const iters of [1500, 2500, 4000]) {
    const t = Date.now();
    calculateOddsMonteCarlo(selected as any, distance as any, ground as any, `bench-${iters}`, iters);
    console.log(`${iters} iters: ${Date.now() - t}ms`);
  }
})();
