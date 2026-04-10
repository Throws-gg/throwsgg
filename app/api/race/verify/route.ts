import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/race/verify?raceId=xxx
 * Public — returns the provably-fair data for a settled race so users can
 * independently replay the simulation and confirm the outcome.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const raceId = searchParams.get("raceId");
  const raceNumber = searchParams.get("raceNumber");

  if (!raceId && !raceNumber) {
    return NextResponse.json(
      { error: "raceId or raceNumber required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const query = supabase
    .from("races")
    .select(
      "id, race_number, status, distance, ground, server_seed, server_seed_hash, client_seed, nonce, winning_horse_id, commentary"
    );

  const { data: race, error } = raceId
    ? await query.eq("id", raceId).single()
    : await query.eq("race_number", parseInt(raceNumber!)).single();

  if (error || !race) {
    return NextResponse.json({ error: "Race not found" }, { status: 404 });
  }

  if (race.status !== "settled") {
    return NextResponse.json(
      { error: "Race is not yet settled — server seed not revealed" },
      { status: 400 }
    );
  }

  // Get entries with horse data for replay
  const { data: entries } = await supabase
    .from("race_entries")
    .select(
      "horse_id, gate_position, finish_position, margin, horses(id, name, slug, color, speed, stamina, form, consistency, ground_preference)"
    )
    .eq("race_id", race.id)
    .order("gate_position", { ascending: true });

  const formattedEntries = (entries || []).map((e) => {
    const h = e.horses as unknown as {
      id: number;
      name: string;
      slug: string;
      color: string;
      speed: number;
      stamina: number;
      form: number;
      consistency: number;
      ground_preference: string;
    };
    return {
      horseId: e.horse_id,
      gatePosition: e.gate_position,
      finishPosition: e.finish_position,
      margin: e.margin ? parseFloat(e.margin) : null,
      horse: {
        id: h.id,
        name: h.name,
        slug: h.slug,
        color: h.color,
        speed: h.speed,
        stamina: h.stamina,
        form: h.form,
        consistency: h.consistency,
        groundPreference: h.ground_preference,
      },
    };
  });

  return NextResponse.json({
    race: {
      id: race.id,
      raceNumber: race.race_number,
      distance: race.distance,
      ground: race.ground,
      serverSeed: race.server_seed,
      serverSeedHash: race.server_seed_hash,
      clientSeed: race.client_seed,
      nonce: race.nonce,
      winningHorseId: race.winning_horse_id,
      commentary: race.commentary,
    },
    entries: formattedEntries,
  });
}
