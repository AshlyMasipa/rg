import { ExtractionError, type AiProvider } from "../provider.js";
import type { ProviderExtraction, Weekday } from "../types.js";

/** Rules extraction is a guess, so nothing here clears the 0.7 threshold. */
const HIGH = 0.65;
const MED = 0.5;
const LOW = 0.35;

const DAY_PATTERNS: Array<[Weekday, RegExp]> = [
  ["mon", /\b(mon(day)?s?|maandag)\b/i],
  ["tue", /\b(tue?s(day)?s?|dinsdag)\b/i],
  ["wed", /\b(wed(nes)?(day)?s?|woensdag)\b/i],
  ["thu", /\b(thu(rs)?(day)?s?|donderdag)\b/i],
  ["fri", /\b(fri(day)?s?|vrydag)\b/i],
  ["sat", /\b(sat(ur)?(day)?s?|saterdag)\b/i],
  ["sun", /\b(sun(day)?s?|sondag)\b/i],
];

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40,
};

export class RulesProvider implements AiProvider {
  readonly source = "rules" as const;

  async extractNeed(text: string, _currentDate: string): Promise<ProviderExtraction> {
    const missing: string[] = [];

    const ageGroup = matchAgeGroup(text);
    if (!ageGroup) missing.push("age_group");

    const gender = matchGender(text);
    if (!gender) missing.push("gender");

    const days = matchDays(text);
    if (days.length === 0) missing.push("days");

    const balls = matchBallCount(text);
    const participants = matchParticipants(text, balls);
    if (participants === 0) missing.push("participants");

    const { start, end, explicit } = matchTimes(text);

    // If nothing at all was recognisable there is no point returning a
    // shell. Throw so the chain reports a real failure and D shows the
    // manual form instead of a form full of wrong guesses.
    if (!ageGroup && !gender && days.length === 0 && participants === 0) {
      throw new ExtractionError(
        "PARSE_FAILED",
        "Rules extractor found no recognisable fields",
      );
    }

    return {
      extracted: {
        age_group: ageGroup ?? "U16",
        gender: gender ?? "mixed",
        participants,
        days: days.length ? days : ["tue"],
        start_time: start,
        end_time: end,
        needs: {
          field: /\b(field|pitch|ground|veld|kunsgras)\b/i.test(text),
          coach: /\b(coach|trainer|afrigter|umqeqeshi)\b/i.test(text),
          balls,
          transport: /\b(transport|bus|taxi|lift|vervoer|travel)\b/i.test(text),
        },
      },
      confidence: {
        age_group: ageGroup ? HIGH : 0,
        gender: gender ? HIGH : 0,
        participants: participants ? MED : 0,
        days: days.length ? HIGH : 0,
        start_time: explicit ? MED : LOW,
        end_time: explicit ? MED : LOW,
        needs: MED,
      },
      missing_fields: missing,
      raw_ai_output: { note: "RulesProvider — no model was called" },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Field matchers                                                      */
/* ------------------------------------------------------------------ */

function matchAgeGroup(text: string) {
  const m = text.match(/\bu(?:nder)?[\s-]*(12|13|14|15|16|17|18)\b/i)
    ?? text.match(/\bonder[\s-]*(12|14|16|18)\b/i);
  if (!m) return undefined;

  // Round up to the nearest band: a 13-year-old plays U14.
  const n = Number(m[1]);
  if (n <= 12) return "U12" as const;
  if (n <= 14) return "U14" as const;
  if (n <= 16) return "U16" as const;
  return "U18" as const;
}

function matchGender(text: string) {
  if (/\b(girls?|ladies|women|female|dogters|meisies|amantombazane)\b/i.test(text)) {
    return "girls" as const;
  }
  if (/\b(boys?|men|male|seuns|abafana)\b/i.test(text)) {
    return "boys" as const;
  }
  if (/\b(mixed|co-?ed|gemeng)\b/i.test(text)) {
    return "mixed" as const;
  }
  return undefined;
}

function matchDays(text: string): Weekday[] {
  return DAY_PATTERNS.filter(([, re]) => re.test(text)).map(([day]) => day);
}

function matchBallCount(text: string): number {
  const digits = text.match(/\b(\d{1,3})\s*(?:rugby\s*)?balls?\b/i);
  if (digits) return Number(digits[1]);

  const words = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\s*(?:rugby\s*)?balls?\b/i,
  );
  if (words) return WORD_NUMBERS[words[1].toLowerCase()] ?? 0;

  return 0;
}

/**
 * The hard one. "28 u16 girls with 6 balls" contains three numbers and
 * only one is the head count. Strip the ones we can identify, then take
 * the first survivor.
 */
function matchParticipants(text: string, ballCount: number): number {
  let cleaned = text
    .replace(/\bu(?:nder)?[\s-]*\d{1,2}\b/gi, " ")        // u16, under-16
    .replace(/\bonder[\s-]*\d{1,2}\b/gi, " ")
    .replace(/\b\d{1,3}\s*(?:rugby\s*)?balls?\b/gi, " ")  // 6 balls
    .replace(/\b\d{1,2}[:.h]\d{2}\b/gi, " ")              // 15:00
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, " ")            // 3pm
    .replace(/\b\d{1,2}\s*weeks?\b/gi, " ");              // 8 weeks

  if (ballCount > 0) {
    // Also strip a bare repeat of the ball count, e.g. "six balls ... 6"
    cleaned = cleaned.replace(new RegExp(`\\b${ballCount}\\b`), " ");
  }

  const digits = cleaned.match(/\b(\d{1,3})\b/);
  if (digits) return Number(digits[1]);

  const words = cleaned.match(
    /\b(ten|twelve|fifteen|twenty|thirty|forty)\b/i,
  );
  if (words) return WORD_NUMBERS[words[1].toLowerCase()] ?? 0;

  return 0;
}

function matchTimes(text: string): { start: string; end: string; explicit: boolean } {
  const times = [...text.matchAll(/\b(\d{1,2})[:.h](\d{2})\b/g)].map(
    (m) => `${m[1].padStart(2, "0")}:${m[2]}`,
  );

  if (times.length >= 2) return { start: times[0], end: times[1], explicit: true };
  if (times.length === 1) return { start: times[0], end: addTwoHours(times[0]), explicit: true };

  // "after school" and friends: the brief's documented default.
  return { start: "15:00", end: "17:00", explicit: false };
}

function addTwoHours(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String(Math.min(h + 2, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
