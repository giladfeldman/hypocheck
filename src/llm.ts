/**
 * The injected model client. hypocheck ships no provider, key or network code: the host
 * (a web app, a plugin, a test) supplies an object with one `complete` method.
 */
import { sha256 } from "./hash.js";

export interface LlmRequest {
  /** System instruction. Hosts whose provider has no system role should prepend it to `prompt`. */
  system?: string;
  /** The user prompt. */
  prompt: string;
  /** Stable id of the prompt template, e.g. "hypothesizer-extract@2026-10-18.1". */
  promptId: string;
  /** SHA-256 of the instantiated prompt, computed by `promptSha256(system, prompt)`. */
  promptSha256: string;
  /** Upper bound on output tokens the task needs (a hint; the host may ignore it). */
  maxTokens?: number;
  /** "json" when the task expects a single JSON object (a hint for providers with a JSON mode). */
  responseFormat?: "json" | "text";
  /**
   * The library's own reply parser as a predicate. A pooled host may use it to rotate to another
   * model when a reply is unusable; the library parses the returned text again either way.
   */
  accept?: (text: string) => boolean;
  signal?: AbortSignal;
}

export interface LlmResponse {
  /** Raw text answer. */
  text: string;
  /** Model the provider says it served (host-reported provenance, not proof). */
  servedModel?: string | null;
  finishReason?: string | null;
  usage?: Record<string, number | string | null> | null;
  /** Provider request id, when there is one. */
  requestId?: string | null;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Provenance recorded on every LLM-derived result. */
export interface LlmProvenance {
  promptId: string;
  promptSha256: string;
  servedModel: string | null;
  libraryVersion: string;
}

/** The exact text `promptSha256` hashes: the layout of the published prompt files. */
export function renderPromptText(system: string | undefined, prompt: string): string {
  return `${system !== undefined ? `# SYSTEM\n${system}\n` : ""}# USER\n${prompt}\n`;
}

/**
 * SHA-256 of an instantiated prompt: sha256("# SYSTEM\n" + system + "\n# USER\n" + prompt + "\n"),
 * the system block omitted when there is no system instruction.
 */
export function promptSha256(system: string | undefined, prompt: string): string {
  return sha256(renderPromptText(system, prompt));
}

/** One recorded exchange, keyed by the instantiated prompt's hash. */
export interface LlmRecording {
  promptId: string;
  promptSha256: string;
  response: LlmResponse;
}

/**
 * A client that answers from recordings, for offline tests. A request with no matching
 * recording throws (never a silent empty answer). `matchBy: "promptId"` serves the recordings
 * of a prompt id in order, for tests that do not pin the full prompt text.
 */
export function replayClient(
  recordings: LlmRecording[],
  options: { matchBy?: "promptSha256" | "promptId" } = {},
): LlmClient & { calls: LlmRequest[] } {
  const matchBy = options.matchBy ?? "promptSha256";
  const queue = [...recordings];
  const calls: LlmRequest[] = [];
  return {
    calls,
    async complete(request) {
      calls.push(request);
      const key = matchBy === "promptId" ? request.promptId : request.promptSha256;
      const i = queue.findIndex((r) => (matchBy === "promptId" ? r.promptId : r.promptSha256) === key);
      if (i < 0) throw new Error(`replayClient: no recording for ${matchBy} ${key}`);
      const [rec] = queue.splice(i, 1);
      return rec.response;
    },
  };
}

/** Wrap a live client and keep every exchange, so a run can be saved and replayed with `replayClient`. */
export function recordingClient(inner: LlmClient): LlmClient & { recordings: LlmRecording[] } {
  const recordings: LlmRecording[] = [];
  return {
    recordings,
    async complete(request) {
      const response = await inner.complete(request);
      recordings.push({ promptId: request.promptId, promptSha256: request.promptSha256, response });
      return response;
    },
  };
}
