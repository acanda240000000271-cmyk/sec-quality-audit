import { GoogleGenAI, type GenerateContentParameters } from '@google/genai';

const MODEL_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
] as const;

const PER_ATTEMPT_TIMEOUT_MS = 25_000;
const TOTAL_BUDGET_MS = 50_000;
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;

const quotaCooldownUntil = new Map<string, number>();

const forceModelFailure =
  (process.env.FORCE_MODEL_FAILURE ?? '').trim().toLowerCase() === 'true';

console.log(`FORCE_MODEL_FAILURE is ${forceModelFailure ? 'ON' : 'OFF'}`);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('The AI service is unavailable. Please tell the administrator.');
    (err as Error & { statusCode?: number; code?: string }).statusCode = 503;
    (err as Error & { statusCode?: number; code?: string }).code = 'AI_UNAVAILABLE';
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractHttpStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const anyErr = err as Record<string, unknown>;
  if (typeof anyErr.status === 'number') return anyErr.status;
  if (typeof anyErr.statusCode === 'number') return anyErr.statusCode;
  if (typeof anyErr.code === 'number') return anyErr.code;
  const msg = typeof anyErr.message === 'string' ? anyErr.message : '';
  const match = msg.match(/\b(400|401|402|403|404|429|500|502|503|504)\b/);
  if (match) return Number(match[1]);
  if (msg.includes('RESOURCE_EXHAUSTED')) return 429;
  if (msg.includes('UNAVAILABLE')) return 503;
  if (msg.includes('NOT_FOUND')) return 404;
  if (msg.includes('PERMISSION_DENIED')) return 403;
  if (msg.includes('INTERNAL')) return 500;
  return null;
}

function isRetryableStatus(status: number | null, isTimeout: boolean): boolean {
  if (isTimeout) return true;
  return status === 503 || status === 429 || status === 404 || status === 500;
}

export async function generateContentWithFallback(params: {
  contents: GenerateContentParameters['contents'];
  config?: GenerateContentParameters['config'];
}): Promise<{ text: string; modelUsed: string }> {
  const ai = getGeminiClient();
  const startedAt = Date.now();

  for (let i = 0; i < MODEL_LADDER.length; i++) {
    const model = MODEL_LADDER[i];
    const now = Date.now();
    const elapsedTotal = now - startedAt;
    const remainingBudget = TOTAL_BUDGET_MS - elapsedTotal;

    if (remainingBudget <= 0) {
      console.log(`[fallback] attempt=${i + 1} model=${model} status=BUDGET_EXHAUSTED elapsedMs=${elapsedTotal}`);
      break;
    }

    const cooldownExpiry = quotaCooldownUntil.get(model) ?? 0;
    if (cooldownExpiry > now) {
      console.log(`[fallback] attempt=${i + 1} model=${model} status=SKIPPED_COOLDOWN elapsedMs=${elapsedTotal}`);
      continue;
    }

    if (forceModelFailure && i === 0) {
      console.log(`[fallback] attempt=${i + 1} model=${model} status=503_FORCED elapsedMs=${Date.now() - startedAt}`);
      continue;
    }

    const attemptTimeoutMs = Math.min(PER_ATTEMPT_TIMEOUT_MS, remainingBudget);
    const attemptStart = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            const timeoutErr = new Error('Model attempt timed out');
            (timeoutErr as Error & { isTimeout?: boolean }).isTimeout = true;
            reject(timeoutErr);
          }, attemptTimeoutMs);
        }),
      ]);

      if (timer) clearTimeout(timer);
      const text = (response.text ?? '').trim();
      console.log(
        `[fallback] attempt=${i + 1} model=${model} status=OK elapsedMs=${Date.now() - attemptStart}`
      );
      return { text, modelUsed: model };
    } catch (err) {
      if (timer) clearTimeout(timer);
      const isTimeout = Boolean((err as { isTimeout?: boolean })?.isTimeout);
      const status = isTimeout ? 504 : extractHttpStatus(err);

      console.log(
        `[fallback] attempt=${i + 1} model=${model} status=${isTimeout ? 'TIMEOUT' : status ?? 'UNKNOWN'} elapsedMs=${Date.now() - attemptStart}`
      );

      if (status === 402 || status === 403) {
        const fatal = new Error('The AI service is unavailable. Please tell the administrator.');
        (fatal as Error & { statusCode?: number; code?: string }).statusCode = 503;
        (fatal as Error & { statusCode?: number; code?: string }).code = 'AI_UNAVAILABLE';
        throw fatal;
      }

      if (status === 429) {
        quotaCooldownUntil.set(model, Date.now() + QUOTA_COOLDOWN_MS);
      }

      if (!isRetryableStatus(status, isTimeout)) {
        const clientErr = new Error('The AI request could not be completed. Please try again.');
        (clientErr as Error & { statusCode?: number; code?: string }).statusCode =
          status && status >= 400 && status < 500 ? status : 502;
        (clientErr as Error & { statusCode?: number; code?: string }).code = 'AI_REQUEST_FAILED';
        throw clientErr;
      }
    }
  }

  const busyErr = new Error('The AI is busy right now. Please click Retry.');
  (busyErr as Error & { statusCode?: number; code?: string }).statusCode = 503;
  (busyErr as Error & { statusCode?: number; code?: string }).code = 'AI_BUSY';
  throw busyErr;
}
