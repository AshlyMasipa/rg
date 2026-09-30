import type {
  ExtractionErrorCode,
  ExtractionSource,
  ImpactSummary,
  ProviderExtraction,
} from "./types.js";

export interface AiProvider {
  /** Tag written into the response so D and the audit log know what ran. */
  readonly source: ExtractionSource;

  /** Coach's message -> structured need. Throws ExtractionError on failure. */
  extractNeed(text: string, currentDate: string): Promise<ProviderExtraction>;

  /**
   * Impact metrics -> streamed sponsor report.
   * Optional until the H20 narrative block; the chain does not use it.
   */
  streamReport?(
    metrics: ImpactSummary,
    onToken: (token: string) => void,
  ): Promise<void>;
}

export class ExtractionError extends Error {
  constructor(
    public readonly code: ExtractionErrorCode,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "ExtractionError";
  }
}

/** True for errors where trying the next provider is worth it. */
export function isRecoverable(err: unknown): err is ExtractionError {
  return (
    err instanceof ExtractionError &&
    (err.code === "TIMEOUT" ||
      err.code === "RATE_LIMITED" ||
      err.code === "PARSE_FAILED")
  );
}
