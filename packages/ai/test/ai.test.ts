import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearExtractionCache,
  extractNeed,
  lowConfidenceFields,
  type AgentEvent,
} from "../src/extract.js";
import { ExtractionError, type AiProvider } from "../src/provider.js";
import { MockProvider, templatedReport } from "../src/providers/mock.js";
import { hashKey, normalise } from "../src/cache.js";
import {
  ExtractionResponseSchema,
  type ExtractionErrorCode,
  type ExtractionSource,
  type ProviderExtraction,
} from "../src/types.js";

const DEMO_TEXT =
  "We've got 28 under-16 girls who can train Tuesdays after school. " +
  "We need a field, a coach and six balls.";

const DATE = "2026-09-27";

class FailingProvider implements AiProvider {
  calls = 0;
  constructor(
    readonly source: ExtractionSource,
    private readonly code: ExtractionErrorCode,
  ) {}
  async extractNeed(): Promise<ProviderExtraction> {
    this.calls++;
    throw new ExtractionError(this.code, `${this.source} deliberately failed`);
  }
}

class GarbageProvider implements AiProvider {
  calls = 0;
  readonly source = "gemini-flash" as const;
  async extractNeed(): Promise<ProviderExtraction> {
    this.calls++;
    return {
      extracted: { age_group: "U99", participants: "twenty-eight" },
    } as unknown as ProviderExtraction;
  }
}

class CountingMock extends MockProvider {
  calls = 0;
  constructor() {
    super(0); // no artificial delay in tests
  }
  override async extractNeed(text: string, date: string) {
    this.calls++;
    return super.extractNeed(text, date);
  }
}

beforeEach(() => {
  clearExtractionCache();
});


describe("cache", () => {
  it("normalises whitespace, case and trailing punctuation", () => {
    expect(normalise("  We've GOT 28   girls.  ")).toBe("we've got 28 girls");
  });

  it("hashes cosmetically different text to the same key", () => {
    expect(hashKey(DEMO_TEXT)).toBe(hashKey(`  ${DEMO_TEXT.toUpperCase()}  `));
  });

  it("serves the second identical call without calling the provider", async () => {
    const provider = new CountingMock();

    const first = await extractNeed(DEMO_TEXT, DATE, [provider]);
    const second = await extractNeed(DEMO_TEXT, DATE, [provider]);

    expect(provider.calls).toBe(1);
    expect(first.success && first.source).toBe("mock");
    expect(second.success && second.source).toBe("cache");
  });

  it("hits cache even when the coach retypes with different spacing", async () => {
    const provider = new CountingMock();
    await extractNeed(DEMO_TEXT, DATE, [provider]);
    await extractNeed(`  ${DEMO_TEXT}  `, DATE, [provider]);
    expect(provider.calls).toBe(1);
  });
});


describe("fallback chain", () => {
  it("falls through to the next provider on RATE_LIMITED", async () => {
    const flash = new FailingProvider("gemini-flash", "RATE_LIMITED");
    const lite = new CountingMock();

    const res = await extractNeed(DEMO_TEXT, DATE, [flash, lite]);

    expect(flash.calls).toBe(1);
    expect(lite.calls).toBe(1);
    expect(res.success).toBe(true);
  });

  it("falls through on TIMEOUT", async () => {
    const flash = new FailingProvider("gemini-flash", "TIMEOUT");
    const rules = new CountingMock();
    const res = await extractNeed(DEMO_TEXT, DATE, [flash, rules]);
    expect(res.success).toBe(true);
    expect(rules.calls).toBe(1);
  });

  it("walks the whole chain when every model fails", async () => {
    const flash = new FailingProvider("gemini-flash", "RATE_LIMITED");
    const lite = new FailingProvider("gemini-flash-lite", "RATE_LIMITED");
    const rules = new CountingMock();

    const res = await extractNeed(DEMO_TEXT, DATE, [flash, lite, rules]);

    expect(flash.calls).toBe(1);
    expect(lite.calls).toBe(1);
    expect(rules.calls).toBe(1);
    expect(res.success && res.source).toBe("mock");
  });

  it("returns a typed error when nothing succeeds", async () => {
    const res = await extractNeed(DEMO_TEXT, DATE, [
      new FailingProvider("gemini-flash", "TIMEOUT"),
      new FailingProvider("rules", "TIMEOUT"),
    ]);

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe("TIMEOUT");
      expect(res.extracted).toBeNull();
    }
  });

  it("does NOT cache a failure", async () => {
    const flash = new FailingProvider("gemini-flash", "TIMEOUT");
    await extractNeed(DEMO_TEXT, DATE, [flash]);

    const recovered = new CountingMock();
    const res = await extractNeed(DEMO_TEXT, DATE, [recovered]);

    expect(recovered.calls).toBe(1);
    expect(res.success).toBe(true);
  });
});

/* ---------------- schema defence ---------------- */

describe("schema validation", () => {
  it("rejects a malformed model response and falls through", async () => {
    const garbage = new GarbageProvider();
    const rules = new CountingMock();

    const res = await extractNeed(DEMO_TEXT, DATE, [garbage, rules]);

    expect(garbage.calls).toBe(1);
    expect(rules.calls).toBe(1);
    expect(res.success).toBe(true);
  });

  it("returns a response matching the published contract", async () => {
    const res = await extractNeed(DEMO_TEXT, DATE, [new MockProvider(0)]);
    expect(ExtractionResponseSchema.safeParse(res).success).toBe(true);
  });
});

/* ---------------- confidence ---------------- */

describe("confidence flagging", () => {
  it("flags the time fields the coach must check", async () => {
    const res = await extractNeed(DEMO_TEXT, DATE, [new MockProvider(0)]);
    expect(res.success).toBe(true);
    if (res.success) {
      const flagged = lowConfidenceFields(res.confidence);
      expect(flagged).toContain("start_time");
      expect(flagged).toContain("end_time");
      expect(flagged).not.toContain("participants");
    }
  });

  it("never invents a participant count when none is given", async () => {
    const res = await extractNeed(
      "Our u18 boys need a field and a coach on Fridays, plus transport.",
      DATE,
      [new MockProvider(0)],
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.extracted.participants).toBe(0);
      expect(res.missing_fields).toContain("participants");
      expect(res.confidence.participants).toBe(0);
    }
  });
});

/* ---------------- agent events ---------------- */

describe("agent events", () => {
  it("emits a fail event when a provider falls back", async () => {
    const events: AgentEvent[] = [];
    await extractNeed(
      DEMO_TEXT,
      DATE,
      [new FailingProvider("gemini-flash", "RATE_LIMITED"), new MockProvider(0)],
      (e) => events.push(e),
    );

    expect(events.some((e) => e.status === "fail")).toBe(true);
    expect(events.some((e) => e.status === "pass")).toBe(true);
    expect(events.every((e) => e.agent === "extraction")).toBe(true);
  });

  it("numbers steps monotonically so D can order the timeline", async () => {
    const events: AgentEvent[] = [];
    await extractNeed(DEMO_TEXT, DATE, [new MockProvider(0)], (e) =>
      events.push(e),
    );
    const steps = events.map((e) => e.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });
});

/* ---------------- narrative fallback ---------------- */

describe("templated report", () => {
  const metrics = {
    needs: { unmet: 1, matched: 0, approved: 1, delivered: 1 },
    participant_sessions: 214,
    programmes_delivered: 1,
    female_participation_pct: 100,
    sponsor_spend: {
      "sponsor-women-rugby": { committed: 11600, remaining: 8400 },
    },
    cost_per_participant_session: 54.2,
    unmet_requests: [
      {
        need_id: "need-3",
        sponsor_request: "Fund safeguarding certification for 1 coach.",
      },
    ],
  };

  it("uses only the numbers it was given", () => {
    // Strip separators before asserting. en-ZA renders 11600 as
    // "11 600", en-US as "11,600" — the test cares about the figure,
    // not the punctuation.
    const bare = templatedReport(metrics).replace(/[\s,\u00a0]/g, "");
    expect(bare).toContain("214");
    expect(bare).toContain("11600");
    expect(bare).toContain("8400");
  });

  it("names no individuals", () => {
    const text = templatedReport(metrics).toLowerCase();
    for (const forbidden of ["thandiwe", "naidoo", "dlamini", "mokoena"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("labels the figures as pilot data", () => {
    expect(templatedReport(metrics).toLowerCase()).toContain("pilot");
  });

  it("streams in chunks", async () => {
    const chunks: string[] = [];
    await new MockProvider(0).streamReport(metrics, (t) => chunks.push(t));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(templatedReport(metrics));
  });
});
