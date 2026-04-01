import { createAdminClient } from "@/lib/supabase/admin";
import type { RoundResult, Move } from "@/lib/game/constants";

const MOVE_LABEL: Record<Move, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};

const RESULT_MESSAGES: Record<RoundResult, string[]> = {
  violet_win: [
    "BULL COOKED — {move} wins",
    "bull diff. {move} crushes it",
    "bullish. {move} takes the round",
  ],
  magenta_win: [
    "BEAR ATE THAT — {move} wins",
    "bear diff. {move} takes it",
    "bearish round. {move} on top",
  ],
  draw: [
    "draw — both threw {move}",
    "stalemate. {move} vs {move}",
    "another draw lmao",
  ],
};

export async function postRoundResult(
  roundNumber: number,
  result: RoundResult,
  winningMove: Move | null,
  violetMove: Move,
  magentaMove: Move
) {
  const supabase = createAdminClient();

  const templates = RESULT_MESSAGES[result];
  const template = templates[roundNumber % templates.length];
  const moveLabel = winningMove
    ? MOVE_LABEL[winningMove]
    : MOVE_LABEL[violetMove];

  const message = `Round #${roundNumber} — ${template.replace(/\{move\}/g, moveLabel)}`;

  await supabase.from("chat_messages").insert({
    user_id: null,
    username: "throws.gg",
    message,
    is_system: true,
  });
}

export async function postBigWin(
  username: string,
  amount: number,
  betType: string
) {
  const supabase = createAdminClient();

  const betLabel =
    betType === "violet"
      ? "Bull"
      : betType === "magenta"
        ? "Bear"
        : betType.charAt(0).toUpperCase() + betType.slice(1);

  const message =
    amount >= 500
      ? `💰 ${username} just hit $${amount.toFixed(2)} on ${betLabel} — ABSOLUTE UNIT`
      : `${username} won $${amount.toFixed(2)} on ${betLabel} 🔥`;

  await supabase.from("chat_messages").insert({
    user_id: null,
    username: "throws.gg",
    message,
    is_system: true,
  });
}
