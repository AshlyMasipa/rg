/**
 * RugbyGrid — MockProvider
 * ---------------------------------------------------------------
 * No key, no network, no cost. This is the file that unblocks A's
 * route and D's Capture screen, so ship it before anything else.
 *
 * It returns two shapes so D can build both UI states:
 *   - default: the demo need, with start_time/end_time deliberately
 *     under 0.7 so the amber "Please check" rows are testable
 *   - no digits in the message: the missing-participants case, so the
 *     missing_fields path is testable too
 *
 * Also what runs when AI_MODE=mock, which is your instant escape hatch
 * if Gemini misbehaves on stage.
 */

import type { AiProvider } from "../provider.js";
import type { ImpactSummary, ProviderExtraction } from "../types.js";

const DEMO_RESULT: ProviderExtraction = {
  extracted: {
    age_group: "U16",
    gender: "girls",
    participants: 28,
    days: ["tue"],
    start_time: "15:00",
    end_time: "17:00",
    needs: { field: true, coach: true, balls: 6, transport: false },
  },
  confidence: {
    age_group: 0.97,
    gender: 0.95,
    participants: 0.98,
    days: 0.93,
    start_time: 0.62,   // "after school" — no time given, flag it
    end_time: 0.55,
    needs: 0.9,
  },
  missing_fields: [],
  raw_ai_output: { note: "MockProvider — no model was called" },
};

const MISSING_COUNT_RESULT: ProviderExtraction = {
  extracted: {
    age_group: "U18",
    gender: "boys",
    participants: 0,
    days: ["fri"],
    start_time: "15:00",
    end_time: "17:00",
    needs: { field: true, coach: true, balls: 0, transport: true },
  },
  confidence: {
    age_group: 0.91,
    gender: 0.94,
    participants: 0,    // never invent a number
    days: 0.88,
    start_time: 0.6,
    end_time: 0.55,
    needs: 0.86,
  },
  missing_fields: ["participants"],
  raw_ai_output: { note: "MockProvider — missing-count variant" },
};

export class MockProvider implements AiProvider {
  readonly source = "mock" as const;

  /** Fake latency so D's loading states get exercised. 0 to disable. */
  constructor(private readonly delayMs = 350) {}

  async extractNeed(text: string, _currentDate: string): Promise<ProviderExtraction> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    // Strip age-group tokens BEFORE looking for a number: "u18" and
    // "under-16" contain digits but are not head counts. Same trap
    // RulesProvider.matchParticipants has to dodge.
    const withoutAge = text.replace(/\bu(?:nder)?[\s-]*\d{1,2}\b/gi, " ");
    const hasNumber =
      /\d/.test(withoutAge) || /\b(twenty|thirty|forty)\b/i.test(withoutAge);
    return structuredClone(hasNumber ? DEMO_RESULT : MISSING_COUNT_RESULT);
  }

  async streamReport(
    metrics: ImpactSummary,
    onToken: (token: string) => void,
  ): Promise<void> {
    const text = templatedReport(metrics);
    for (let i = 0; i < text.length; i += 30) {
      onToken(text.slice(i, i + 30));
      await new Promise((r) => setTimeout(r, 40));
    }
  }
}

/**
 * Deterministic report from the same metrics the model would get.
 * Doubles as the H20 fallback when Gemini is unreachable — boring but
 * correct, and indistinguishable at a glance.
 */
export function templatedReport(m: ImpactSummary): string {
  // Index then default, rather than destructuring a fallback tuple —
  // the tuple form widens the value type to unknown.
  const spend = Object.values(m.sponsor_spend)[0] ?? { committed: 0, remaining: 0 };
  const unmet = m.unmet_requests[0];

  // Locale is PINNED. Bare toLocaleString() follows the machine, so a
  // dev laptop and the deploy container format money differently and
  // the report silently changes between rehearsal and stage.
  const rands = (n: number) => `R${n.toLocaleString("en-ZA")}`;

  return [
    `Over the pilot period, ${m.programmes_delivered} programme(s) were `
    + `delivered, producing ${m.participant_sessions} participant-sessions.`,

    `Participation was ${m.female_participation_pct}% female across the `
    + `sessions delivered. Figures are attendance counts only; no `
    + `individual participant records are held.`,

    `Of the funding committed, ${rands(spend.committed)} has been `
    + `allocated and ${rands(spend.remaining)} remains. That works `
    + `out at R${m.cost_per_participant_session.toFixed(2)} per `
    + `participant-session.`,

    unmet
      ? `One request remains unmet. ${unmet.sponsor_request}`
      : `All recorded requests were matched during this period.`,

    `These are pilot figures from synthetic data.`,
  ].join("\n\n");
}