

import { Type } from "@google/genai";

export const GEMINI_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    age_group: { type: Type.STRING, enum: ["U12", "U14", "U16", "U18"] },
    gender: { type: Type.STRING, enum: ["girls", "boys", "mixed"] },
    participants: { type: Type.INTEGER },
    days: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      },
    },
    start_time: { type: Type.STRING },
    end_time: { type: Type.STRING },
    needs: {
      type: Type.OBJECT,
      properties: {
        field: { type: Type.BOOLEAN },
        coach: { type: Type.BOOLEAN },
        balls: { type: Type.INTEGER },
        transport: { type: Type.BOOLEAN },
      },
      required: ["field", "coach", "balls", "transport"],
    },
    confidence: {
      type: Type.OBJECT,
      properties: {
        age_group: { type: Type.NUMBER },
        gender: { type: Type.NUMBER },
        participants: { type: Type.NUMBER },
        days: { type: Type.NUMBER },
        start_time: { type: Type.NUMBER },
        end_time: { type: Type.NUMBER },
        needs: { type: Type.NUMBER },
      },
      required: [
        "age_group", "gender", "participants", "days",
        "start_time", "end_time", "needs",
      ],
    },
    missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "age_group", "gender", "participants", "days",
    "start_time", "end_time", "needs", "confidence", "missing_fields",
  ],
} as const;


export function buildExtractionPrompt(text: string, currentDate: string): string {
  return `You extract a single grassroots rugby training request from a message typed
by a coach or teacher in South Africa. The message may be informal, contain
typos or abbreviations, and mix English with isiZulu, Sesotho or Afrikaans.

Today's date is ${currentDate}.

Message: """${text}"""

Return ONLY a JSON object matching the provided schema, with these fields:
- age_group: one of U12, U14, U16, U18 ("under-16s" -> U16)
- gender: girls | boys | mixed
- participants: integer
- days: array of lowercase 3-letter weekdays ("after school Tuesdays" -> ["tue"])
- start_time, end_time: HH:MM, 24h. "After school" with no time -> 15:00-17:00
  and give those fields LOW confidence.
- needs: { field: bool, coach: bool, balls: integer (0 if not mentioned),
  transport: bool }
- confidence: an object giving 0-1 confidence for every field above
- missing_fields: fields you could not determine at all

Rules:
- Never invent a number that is not stated or clearly implied. If
  participants is not given, set it to 0, list it in missing_fields and
  give confidence 0.
- Do not record any child's name, even if one is mentioned.`;
}


export function buildNarrativePrompt(impactJson: string): string {
  return `You are writing a short impact update for a rugby development sponsor in
South Africa. Use ONLY the figures in the data below. Do not invent
numbers, names, quotes or outcomes.

Data:
${impactJson}

Write 4 short paragraphs, under 180 words total:
1. What was delivered (programmes, sessions, participant-sessions).
2. Who it reached, as counts and percentages only. Never name children.
3. How the sponsor's money was used (committed vs remaining, cost per
   participant-session).
4. The one unmet need and the specific, funded request that would close it.

Plain language a sponsor's marketing manager would read. No jargon, no
hype words like "revolutionary". Label the figures as pilot data.`;
}
