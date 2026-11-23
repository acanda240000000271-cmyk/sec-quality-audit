import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { Type, type Schema } from '@google/genai';
import { checkAdminStatus, verifyCaller, type VerifiedCaller } from './auth.js';
import { getDocument, runQuery } from './firestoreRest.js';
import { generateContentWithFallback } from './gemini.js';
import {
  extractBaselineCodes,
  fillTemplate,
  PROMPT_A_TEMPLATE,
  PROMPT_B_TEMPLATE,
  PROMPT_C_TEMPLATE,
  sanitizeUntrustedBlock,
} from './prompts.js';
import {
  computeCircleWallMetrics,
  computeHeat,
  recomputeBoardMetrics,
} from '../shared/boardMath.js';
import {
  type AffinityBoard,
  type BaselineDoc,
  type BoardImprovement,
  type BoardNote,
  type CircleSession,
  COMPLAINT_SOURCES,
  type InteractionMessage,
  NOTE_TYPES,
  ROLE_CATEGORIES,
  TOPICS,
  type UserProfile,
} from '../shared/types.js';

const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const circleRateMap = new Map<string, number[]>();

function checkCircleRateLimit(uid: string): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (circleRateMap.get(uid) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    circleRateMap.set(uid, timestamps);
    return false;
  }
  timestamps.push(now);
  circleRateMap.set(uid, timestamps);
  return true;
}

function sendError(
  res: Response,
  statusCode: number,
  error: string,
  code: string
): void {
  res.status(statusCode).json({
    error,
    code,
    requestId: crypto.randomUUID(),
  });
}

function formatToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getBaselineTextAndCodes(basisDoc: Record<string, unknown> | null): {
  baselineText: string;
  validCodes: Set<string>;
} {
  if (!basisDoc || !Array.isArray(basisDoc.documents) || basisDoc.documents.length === 0) {
    return {
      baselineText: '(No SEC quality baseline documents uploaded yet.)',
      validCodes: new Set<string>(),
    };
  }
  const docs = basisDoc.documents as BaselineDoc[];
  const combined = docs
    .map((d) => `### ${d.title || 'Baseline Document'}\n${d.text || ''}`)
    .join('\n\n');
  return {
    baselineText: combined,
    validCodes: extractBaselineCodes(combined),
  };
}

function parseProfile(raw: Record<string, unknown> | null): UserProfile | null {
  if (!raw) return null;
  if (
    typeof raw.department !== 'string' ||
    typeof raw.position !== 'string' ||
    typeof raw.jobDescription !== 'string' ||
    typeof raw.roleCategory !== 'string'
  ) {
    return null;
  }
  const roleCategory = ROLE_CATEGORIES.includes(raw.roleCategory as UserProfile['roleCategory'])
    ? (raw.roleCategory as UserProfile['roleCategory'])
    : 'Teacher';
  return {
    uid: String(raw.uid ?? ''),
    displayName: String(raw.displayName ?? 'Staff Member'),
    photoURL: String(raw.photoURL ?? ''),
    department: raw.department,
    roleCategory,
    position: raw.position,
    yearsInRole: typeof raw.yearsInRole === 'number' ? raw.yearsInRole : 0,
    jobDescription: raw.jobDescription,
  };
}

async function fetchSessionInteractions(
  uid: string,
  sessionId: string,
  idToken: string
): Promise<InteractionMessage[]> {
  const rows = await runQuery<InteractionMessage>(
    `users/${uid}`,
    {
      from: [{ collectionId: 'interactions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'sessionId' },
          op: 'EQUAL',
          value: { stringValue: sessionId },
        },
      },
    },
    idToken
  );

  return rows
    .map((r) => ({
      ...r.data,
      id: r.id,
      timestamp: String(r.data.timestamp ?? ''),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

const PROMPT_B_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    routine: { type: Type.STRING },
    routineCode: { type: Type.STRING },
    summary: { type: Type.STRING },
    notes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          text: { type: Type.STRING },
          quote: { type: Type.STRING },
          source: { type: Type.STRING },
          code: { type: Type.STRING },
        },
        required: ['type', 'text', 'quote', 'source', 'code'],
      },
    },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          noteIndexes: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
          cause: { type: Type.STRING },
          code: { type: Type.STRING },
        },
        required: ['title', 'noteIndexes', 'cause', 'code'],
      },
    },
    priority: {
      type: Type.OBJECT,
      properties: {
        themeIndex: { type: Type.INTEGER, nullable: true },
        reason: { type: Type.STRING },
        signOfSuccess: { type: Type.STRING },
      },
      required: ['themeIndex', 'reason', 'signOfSuccess'],
    },
    improvements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          idea: { type: Type.STRING },
          origin: { type: Type.STRING },
          themeIndex: { type: Type.INTEGER, nullable: true },
          owner: { type: Type.STRING },
          firstStep: { type: Type.STRING },
          code: { type: Type.STRING },
        },
        required: ['idea', 'origin', 'themeIndex', 'owner', 'firstStep', 'code'],
      },
    },
  },
  required: ['routine', 'routineCode', 'summary', 'notes', 'themes', 'priority', 'improvements'],
};

const PROMPT_C_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING },
    schoolThemes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          themeIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          whatStaffSaid: { type: Type.STRING },
          likelyCauses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          recommendedAction: { type: Type.STRING },
          owner: { type: Type.STRING },
          code: { type: Type.STRING },
        },
        required: [
          'name',
          'themeIds',
          'whatStaffSaid',
          'likelyCauses',
          'recommendedAction',
          'owner',
          'code',
        ],
      },
    },
    strengthsToKeep: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    nextSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['overview', 'schoolThemes', 'strengthsToKeep', 'nextSteps'],
};

function sanitizeCode(code: unknown, validCodes: Set<string>): string {
  if (typeof code !== 'string') return 'None';
  const trimmed = code.trim();
  if (!trimmed || trimmed === 'None') return 'None';
  return validCodes.has(trimmed) ? trimmed : 'None';
}

function clampWords(text: string, maxChars: number): string {
  const clean = text.trim();
  return clean.length > maxChars ? clean.slice(0, maxChars).trim() : clean;
}

export const app = express();

// Top-level JSON parsing BEFORE any routes
app.use(express.json({ limit: '1mb' }));
app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    sendError(res, 400, 'Invalid JSON request body.', 'INVALID_JSON');
    return;
  }
  next(err);
});

async function requireAuth(
  req: Request,
  res: Response
): Promise<VerifiedCaller | null> {
  try {
    return await verifyCaller(req);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 401;
    const code = (err as { code?: string }).code ?? 'UNAUTHORIZED';
    sendError(res, status, err instanceof Error ? err.message : 'Unauthorized', code);
    return null;
  }
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/me', async (req: Request, res: Response) => {
  const caller = await requireAuth(req, res);
  if (!caller) return;

  try {
    const adminState = await checkAdminStatus(caller);
    res.json({
      uid: caller.uid,
      displayName: caller.displayName,
      isAdmin: adminState.isAdmin,
      adminSetupNeeded: adminState.adminSetupNeeded,
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR';
    sendError(res, status, 'Could not verify account status.', code);
  }
});

app.post('/api/circle/reply', async (req: Request, res: Response) => {
  const caller = await requireAuth(req, res);
  if (!caller) return;

  if (!checkCircleRateLimit(caller.uid)) {
    sendError(
      res,
      429,
      'Too many requests. Please wait a few minutes and try again.',
      'RATE_LIMITED'
    );
    return;
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const clientMessageId =
    typeof body.clientMessageId === 'string' ? body.clientMessageId.trim() : '';
  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';

  if (!SESSION_ID_REGEX.test(sessionId)) {
    sendError(res, 400, 'Invalid sessionId.', 'INVALID_SESSION_ID');
    return;
  }
  if (!UUID_REGEX.test(clientMessageId)) {
    sendError(res, 400, 'Invalid clientMessageId.', 'INVALID_CLIENT_MESSAGE_ID');
    return;
  }
  if (rawMessage.length < 1 || rawMessage.length > 2000) {
    sendError(
      res,
      400,
      'Message must be between 1 and 2,000 characters.',
      'INVALID_MESSAGE_LENGTH'
    );
    return;
  }

  try {
    const [profileDoc, basisDoc, interactions] = await Promise.all([
      getDocument(`users/${caller.uid}`, caller.idToken),
      getDocument('settings/companyBasis', caller.idToken),
      fetchSessionInteractions(caller.uid, sessionId, caller.idToken),
    ]);

    const profile = parseProfile(profileDoc);
    if (!profile) {
      sendError(res, 400, 'Please complete your profile first.', 'PROFILE_REQUIRED');
      return;
    }

    const userMessages = interactions.filter((m) => m.role === 'user');
    const answerCount = userMessages.length;

    const closing = answerCount >= 6;
    const nextTopic = closing ? 6 : Math.min(6, answerCount + 1);
    const topicName = TOPICS[nextTopic - 1]?.name ?? 'Priority';

    const progressInstruction = !closing
      ? `Now ask about topic ${nextTopic}: ${topicName}.`
      : 'The check-in is complete. In two sentences, name the routine and the problem the employee wants fixed first, then tell them to click "Build My Affinity Board". Ask no question.';

    const { baselineText } = getBaselineTextAndCodes(basisDoc);

    const systemInstruction = fillTemplate(PROMPT_A_TEMPLATE, {
      today: formatToday(),
      displayName: sanitizeUntrustedBlock(profile.displayName),
      department: sanitizeUntrustedBlock(profile.department),
      roleCategory: sanitizeUntrustedBlock(profile.roleCategory),
      position: sanitizeUntrustedBlock(profile.position),
      jobDescription: sanitizeUntrustedBlock(profile.jobDescription),
      yearsInRole: String(profile.yearsInRole),
      baselineText: sanitizeUntrustedBlock(baselineText),
      answerCount: String(answerCount),
      progressInstruction,
    });

    // Build clean alternating user/model contents from transcript
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const msg of interactions) {
      const mappedRole = msg.role === 'assistant' ? 'model' : 'user';
      const safeText =
        msg.role === 'user'
          ? `<employee_message>\n${sanitizeUntrustedBlock(msg.content)}\n</employee_message>`
          : msg.content;

      if (contents.length === 0 && mappedRole === 'model') {
        contents.push({
          role: 'user',
          parts: [{ text: '[Check-in session started]' }],
        });
      }

      const last = contents[contents.length - 1];
      if (last && last.role === mappedRole) {
        last.parts.push({ text: safeText });
      } else {
        contents.push({ role: mappedRole, parts: [{ text: safeText }] });
      }
    }

    // Ensure last turn is user (in case transcript ended on model or was empty)
    if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
      contents.push({
        role: 'user',
        parts: [
          {
            text: `<employee_message>\n${sanitizeUntrustedBlock(rawMessage)}\n</employee_message>`,
          },
        ],
      });
    }

    const { text: reply, modelUsed } = await generateContentWithFallback({
      contents,
      config: {
        systemInstruction,
      },
    });

    res.json({
      reply: reply || 'Could you share a little more detail on that?',
      topicNumber: nextTopic,
      answerCount,
      closing,
      modelUsed,
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code ?? 'SERVER_ERROR';
    const msg =
      status === 503 || status === 403 || status === 401 || status === 400
        ? err instanceof Error
          ? err.message
          : 'Request failed.'
        : 'Could not generate Facilitator reply.';
    sendError(res, status, msg, code);
  }
});

app.post('/api/circle/board', async (req: Request, res: Response) => {
  const caller = await requireAuth(req, res);
  if (!caller) return;

  if (!checkCircleRateLimit(caller.uid)) {
    sendError(
      res,
      429,
      'Too many requests. Please wait a few minutes and try again.',
      'RATE_LIMITED'
    );
    return;
  }

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!SESSION_ID_REGEX.test(sessionId)) {
    sendError(res, 400, 'Invalid sessionId.', 'INVALID_SESSION_ID');
    return;
  }

  try {
    const [profileDoc, sessionDoc, basisDoc, interactions] = await Promise.all([
      getDocument(`users/${caller.uid}`, caller.idToken),
      getDocument(`users/${caller.uid}/circleSessions/${sessionId}`, caller.idToken),
      getDocument('settings/companyBasis', caller.idToken),
      fetchSessionInteractions(caller.uid, sessionId, caller.idToken),
    ]);

    const profile = parseProfile(profileDoc);
    if (!profile) {
      sendError(res, 400, 'Please complete your profile first.', 'PROFILE_REQUIRED');
      return;
    }

    const userAnswers = interactions.filter((m) => m.role === 'user');
    if (userAnswers.length < 4) {
      sendError(
        res,
        400,
        'Please answer at least 4 questions before building your Affinity Board.',
        'TOO_FEW_ANSWERS'
      );
      return;
    }

    const { baselineText, validCodes } = getBaselineTextAndCodes(basisDoc);

    const profileBlock = [
      `Name: ${profile.displayName}`,
      `Department: ${profile.department}`,
      `Role category: ${profile.roleCategory}`,
      `Position: ${profile.position}`,
      `Job description: ${profile.jobDescription}`,
      `Years in role: ${profile.yearsInRole}`,
    ].join('\n');

    const transcriptBlock = interactions
      .map((m) => {
        const speaker = m.role === 'assistant' ? 'Facilitator' : 'Employee';
        return `[Topic ${m.topicNumber}] ${speaker}: ${m.content}`;
      })
      .join('\n\n');

    const sessionDate =
      typeof sessionDoc?.createdAt === 'string'
        ? sessionDoc.createdAt.slice(0, 10)
        : formatToday();

    const prompt = fillTemplate(PROMPT_B_TEMPLATE, {
      profile: sanitizeUntrustedBlock(profileBlock),
      baselineText: sanitizeUntrustedBlock(baselineText),
      transcript: sanitizeUntrustedBlock(transcriptBlock),
      sessionDate,
    });

    const { text, modelUsed } = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: PROMPT_B_SCHEMA,
      },
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      sendError(res, 502, 'The AI returned an unreadable board. Please click Retry.', 'INVALID_AI_JSON');
      return;
    }

    const rawNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
    const notes: BoardNote[] = [];
    for (const item of rawNotes) {
      if (!item || typeof item !== 'object') continue;
      const n = item as Record<string, unknown>;
      const type = NOTE_TYPES.includes(n.type as BoardNote['type'])
        ? (n.type as BoardNote['type'])
        : 'Difficulty';
      const noteText = clampWords(String(n.text ?? ''), 260);
      if (!noteText) continue;
      const quote = clampWords(String(n.quote ?? ''), 320);
      let source: BoardNote['source'] = '';
      if (type === 'Complaint') {
        const rawSrc = String(n.source ?? '').trim();
        source = COMPLAINT_SOURCES.includes(rawSrc as (typeof COMPLAINT_SOURCES)[number])
          ? (rawSrc as (typeof COMPLAINT_SOURCES)[number])
          : 'Other';
      }
      notes.push({
        type,
        text: noteText,
        quote,
        source,
        code: sanitizeCode(n.code, validCodes),
        editedByEmployee: false,
        addedByEmployee: false,
      });
    }

    const usedNonStepIndexes = new Set<number>();
    const rawThemes = Array.isArray(parsed.themes) ? parsed.themes : [];
    const cleanedThemes: Array<{
      title: string;
      noteIndexes: number[];
      cause: string;
      code: string;
    }> = [];

    for (const item of rawThemes) {
      if (!item || typeof item !== 'object') continue;
      const t = item as Record<string, unknown>;
      const title = clampWords(String(t.title ?? ''), 120) || 'General theme';
      const rawIdxs = Array.isArray(t.noteIndexes) ? t.noteIndexes : [];
      const noteIndexes: number[] = [];
      for (const idx of rawIdxs) {
        if (
          typeof idx === 'number' &&
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < notes.length &&
          notes[idx].type !== 'Step' &&
          !usedNonStepIndexes.has(idx)
        ) {
          usedNonStepIndexes.add(idx);
          noteIndexes.push(idx);
        }
      }
      cleanedThemes.push({
        title,
        noteIndexes,
        cause: clampWords(String(t.cause ?? ''), 260),
        code: sanitizeCode(t.code, validCodes),
      });
    }

    // Any non-Step note in no theme goes into an extra theme "Other notes"
    const orphanIndexes: number[] = [];
    notes.forEach((n, idx) => {
      if (n.type !== 'Step' && !usedNonStepIndexes.has(idx)) {
        orphanIndexes.push(idx);
      }
    });
    if (orphanIndexes.length > 0) {
      cleanedThemes.push({
        title: 'Other notes',
        noteIndexes: orphanIndexes,
        cause: '',
        code: 'None',
      });
    }

    const rawPriority =
      parsed.priority && typeof parsed.priority === 'object'
        ? (parsed.priority as Record<string, unknown>)
        : {};
    let themeIndex: number | null =
      typeof rawPriority.themeIndex === 'number' &&
      Number.isInteger(rawPriority.themeIndex) &&
      rawPriority.themeIndex >= 0 &&
      rawPriority.themeIndex < cleanedThemes.length
        ? rawPriority.themeIndex
        : null;

    if (themeIndex === null && cleanedThemes.length > 0) {
      themeIndex = 0;
    }

    const rawImps = Array.isArray(parsed.improvements) ? parsed.improvements : [];
    const improvements: BoardImprovement[] = [];
    for (const item of rawImps) {
      if (!item || typeof item !== 'object') continue;
      const imp = item as Record<string, unknown>;
      const idea = clampWords(String(imp.idea ?? ''), 320);
      if (!idea) continue;
      const origin = imp.origin === 'Employee' ? 'Employee' : 'Facilitator';
      const impThemeIndex =
        typeof imp.themeIndex === 'number' &&
        Number.isInteger(imp.themeIndex) &&
        imp.themeIndex >= 0 &&
        imp.themeIndex < cleanedThemes.length
          ? imp.themeIndex
          : null;
      improvements.push({
        idea,
        origin,
        themeIndex: impThemeIndex,
        owner: clampWords(String(imp.owner ?? 'Staff'), 140) || 'Staff',
        firstStep: clampWords(String(imp.firstStep ?? ''), 240),
        code: sanitizeCode(imp.code, validCodes),
      });
    }

    const assembled: Omit<AffinityBoard, 'stats'> = {
      routine: clampWords(String(parsed.routine ?? 'Daily work routine'), 140) || 'Daily work routine',
      routineCode: sanitizeCode(parsed.routineCode, validCodes),
      summary: clampWords(String(parsed.summary ?? ''), 900),
      notes,
      themes: cleanedThemes.map((t) => ({
        ...t,
        difficulties: 0,
        complaints: 0,
        strengths: 0,
        suggestions: 0,
        painNotes: 0,
        heat: 'Mild',
      })),
      priority: {
        themeIndex,
        reason: clampWords(String(rawPriority.reason ?? ''), 300),
        signOfSuccess: clampWords(String(rawPriority.signOfSuccess ?? ''), 320),
      },
      improvements,
      modelUsed,
      employeeEdited: false,
    };

    const board = recomputeBoardMetrics(assembled);
    res.json({ board, modelUsed });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code ?? 'SERVER_ERROR';
    const msg =
      status === 503 || status === 403 || status === 401 || status === 400
        ? err instanceof Error
          ? err.message
          : 'Request failed.'
        : 'Could not build Affinity Board.';
    sendError(res, status, msg, code);
  }
});

app.post('/api/admin/wall-report', async (req: Request, res: Response) => {
  const caller = await requireAuth(req, res);
  if (!caller) return;

  try {
    const adminState = await checkAdminStatus(caller);
    if (!adminState.isAdmin) {
      sendError(res, 403, 'Administrator access required.', 'FORBIDDEN');
      return;
    }

    const sessionRows = await runQuery<CircleSession>(
      '',
      {
        from: [{ collectionId: 'circleSessions', allDescendants: true }],
      },
      caller.idToken
    );

    const completedSessions: CircleSession[] = sessionRows
      .map((r) => r.data)
      .filter((s) => s && s.status === 'completed' && s.board !== null);

    if (completedSessions.length === 0) {
      sendError(
        res,
        400,
        'There are no completed Affinity Boards yet to generate a report.',
        'NO_COMPLETED_BOARDS'
      );
      return;
    }

    const wallMetrics = computeCircleWallMetrics(completedSessions);

    // Prepare anonymized theme list for PROMPT C
    const themeLookup = new Map<
      string,
      {
        id: string;
        sessionId: string;
        userId: string;
        title: string;
        cause: string;
        code: string;
        painNotes: number;
        suggestions: number;
        isPriority: boolean;
        roleCategory: string;
        notesText: string[];
      }
    >();

    const improvementsPayload: Array<{
      idea: string;
      origin: string;
      owner: string;
      firstStep: string;
      code: string;
    }> = [];
    const strengthsPayload: string[] = [];

    for (const s of completedSessions) {
      const board = recomputeBoardMetrics(s.board!);
      board.themes.forEach((theme, tIdx) => {
        const id = `${s.sessionId}__theme_${tIdx}`;
        const notesText = theme.noteIndexes
          .map((nIdx) => board.notes[nIdx]?.text)
          .filter(Boolean);
        themeLookup.set(id, {
          id,
          sessionId: s.sessionId,
          userId: s.userId,
          title: theme.title,
          cause: theme.cause,
          code: theme.code,
          painNotes: theme.painNotes,
          suggestions: theme.suggestions,
          isPriority: board.priority.themeIndex === tIdx,
          roleCategory: s.profileSnapshot.roleCategory,
          notesText,
        });
      });

      for (const imp of board.improvements) {
        improvementsPayload.push({
          idea: imp.idea,
          origin: imp.origin,
          owner: imp.owner,
          firstStep: imp.firstStep,
          code: imp.code,
        });
      }

      for (const note of board.notes) {
        if (note.type === 'Strength') {
          strengthsPayload.push(note.text);
        }
      }
    }

    const themesForPrompt = Array.from(themeLookup.values()).map((t) => ({
      id: t.id,
      title: sanitizeUntrustedBlock(t.title),
      cause: sanitizeUntrustedBlock(t.cause),
      code: t.code,
      roleCategory: t.roleCategory,
      isPriority: t.isPriority,
      notes: t.notesText.map((n) => sanitizeUntrustedBlock(n)),
    }));

    const today = formatToday();
    const prompt = fillTemplate(PROMPT_C_TEMPLATE, {
      themesJson: JSON.stringify(themesForPrompt),
      improvementsJson: JSON.stringify(
        improvementsPayload.map((i) => ({
          ...i,
          idea: sanitizeUntrustedBlock(i.idea),
          firstStep: sanitizeUntrustedBlock(i.firstStep),
        }))
      ),
      strengthsJson: JSON.stringify(
        strengthsPayload.map((s) => sanitizeUntrustedBlock(s))
      ),
      today,
    });

    const { text, modelUsed } = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: PROMPT_C_SCHEMA,
      },
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      sendError(res, 502, 'The AI returned an unreadable report. Please click Retry.', 'INVALID_AI_JSON');
      return;
    }

    const usedThemeIds = new Set<string>();
    const rawSchoolThemes = Array.isArray(parsed.schoolThemes) ? parsed.schoolThemes : [];

    interface ComputedSchoolTheme {
      name: string;
      themeIds: string[];
      whatStaffSaid: string;
      likelyCauses: string[];
      recommendedAction: string;
      owner: string;
      code: string;
      staff: number;
      boards: number;
      painNotes: number;
      suggestions: number;
      priorityVotes: number;
      heat: 'Hot' | 'Warm' | 'Mild';
    }

    const schoolThemes: ComputedSchoolTheme[] = [];

    const buildStatsForGroup = (ids: string[]) => {
      const staffSet = new Set<string>();
      const boardSet = new Set<string>();
      let painNotes = 0;
      let suggestions = 0;
      let priorityVotes = 0;

      for (const id of ids) {
        const entry = themeLookup.get(id);
        if (!entry) continue;
        staffSet.add(entry.userId);
        boardSet.add(entry.sessionId);
        painNotes += entry.painNotes;
        suggestions += entry.suggestions;
        if (entry.isPriority) priorityVotes += 1;
      }

      return {
        staff: staffSet.size,
        boards: boardSet.size,
        painNotes,
        suggestions,
        priorityVotes,
        heat: computeHeat(painNotes),
      };
    };

    for (const item of rawSchoolThemes) {
      if (!item || typeof item !== 'object') continue;
      const st = item as Record<string, unknown>;
      const rawIds = Array.isArray(st.themeIds) ? st.themeIds : [];
      const validIds: string[] = [];
      for (const rawId of rawIds) {
        if (typeof rawId === 'string' && themeLookup.has(rawId) && !usedThemeIds.has(rawId)) {
          usedThemeIds.add(rawId);
          validIds.push(rawId);
        }
      }
      if (validIds.length === 0) continue;
      const counts = buildStatsForGroup(validIds);
      schoolThemes.push({
        name: clampWords(String(st.name ?? 'School theme'), 120) || 'School theme',
        themeIds: validIds,
        whatStaffSaid: clampWords(String(st.whatStaffSaid ?? ''), 400),
        likelyCauses: Array.isArray(st.likelyCauses)
          ? st.likelyCauses.map((c) => String(c).trim()).filter(Boolean)
          : [],
        recommendedAction: clampWords(String(st.recommendedAction ?? ''), 300),
        owner: clampWords(String(st.owner ?? 'Quality Coordinator'), 100) || 'Quality Coordinator',
        code: typeof st.code === 'string' && st.code.trim() ? st.code.trim() : 'None',
        ...counts,
      });
    }

    // Any unused theme becomes its own school-wide theme
    for (const [id, entry] of themeLookup.entries()) {
      if (!usedThemeIds.has(id)) {
        usedThemeIds.add(id);
        const counts = buildStatsForGroup([id]);
        schoolThemes.push({
          name: entry.title,
          themeIds: [id],
          whatStaffSaid: entry.notesText.slice(0, 3).join('; ') || entry.title,
          likelyCauses: entry.cause ? [entry.cause] : [],
          recommendedAction: 'Review this theme with the unit lead and confirm next action.',
          owner: entry.roleCategory,
          code: entry.code || 'None',
          ...counts,
        });
      }
    }

    schoolThemes.sort((a, b) => {
      if (b.painNotes !== a.painNotes) return b.painNotes - a.painNotes;
      return b.staff - a.staff;
    });

    // Role breakdown for Scope (no names)
    const roleCounts = new Map<string, { boards: number; users: Set<string> }>();
    for (const s of completedSessions) {
      const role = s.profileSnapshot.roleCategory;
      if (!roleCounts.has(role)) {
        roleCounts.set(role, { boards: 0, users: new Set<string>() });
      }
      const entry = roleCounts.get(role)!;
      entry.boards += 1;
      entry.users.add(s.userId);
    }

    const scopeLines = Array.from(roleCounts.entries()).map(
      ([role, val]) => `- **${role}**: ${val.boards} board(s), ${val.users.size} staff member(s)`
    );

    const themeTableRows = schoolThemes
      .map(
        (t) =>
          `| ${t.name} | ${t.staff} | ${t.painNotes} | ${t.priorityVotes} | ${t.heat} | ${t.code} |`
      )
      .join('\n');

    const themeDetailSections = schoolThemes
      .map(
        (t, idx) => `### 4.${idx + 1} ${t.name} (${t.heat} · ${t.code})
- **What staff said:** ${t.whatStaffSaid}
- **Likely causes:** ${t.likelyCauses.length > 0 ? t.likelyCauses.join('; ') : 'Not specified'}
- **Recommended action:** ${t.recommendedAction}
- **Owner:** ${t.owner}
- **Counts:** ${t.staff} staff, ${t.boards} board(s), ${t.painNotes} pain note(s), ${t.suggestions} suggestion(s), ${t.priorityVotes} priority vote(s)`
      )
      .join('\n\n');

    const complaintRows = COMPLAINT_SOURCES.map(
      (src) => `| ${src} | ${wallMetrics.complaintSources[src] ?? 0} |`
    ).join('\n');

    const strengthsList = (
      Array.isArray(parsed.strengthsToKeep) ? parsed.strengthsToKeep : []
    )
      .map((s) => `- ${String(s).trim()}`)
      .filter((s) => s.length > 2)
      .join('\n');

    const nextStepsList = (
      Array.isArray(parsed.nextSteps) ? parsed.nextSteps : []
    )
      .map((s, idx) => `${idx + 1}. ${String(s).trim()}`)
      .filter((s) => s.length > 3)
      .join('\n');

    const preliminaryNote =
      completedSessions.length < 2
        ? ' Note: Because fewer than 2 boards have been saved so far, these findings are **preliminary**.'
        : '';

    const overview = String(parsed.overview ?? '').trim();

    const markdown = `# SEC Quality Audit — School-wide Quality Circle Report
**Date:** ${today}

## 1. Scope
- **Total staff interviewed:** ${wallMetrics.staffInterviewed}
- **Total Affinity Boards saved:** ${wallMetrics.boardsSaved}
- **Total notes collected:** ${wallMetrics.notesCollected} (${wallMetrics.painPoints} pain points, ${wallMetrics.improvementIdeas} improvement ideas)

${scopeLines.join('\n')}

## 2. Overview
${overview}

## 3. School-wide Themes
| Theme | Staff | Pain Notes | Priority Votes | Heat | Code |
| :--- | ---: | ---: | ---: | :--- | :--- |
${themeTableRows}

## 4. Each Theme
${themeDetailSections}

## 5. Complaint Sources
| Source | Complaint Notes |
| :--- | ---: |
${complaintRows}

## 6. Strengths to Keep
${strengthsList || '- No specific strength notes recorded yet.'}

## 7. Next Steps
${nextStepsList || '1. Review top priority themes with department heads.'}

## 8. Method Note
This report follows the Total Quality Management affinity diagram (KJ method) from individual employee Quality Circle check-ins at Surigao Education Center. Every count, total, heat rating, and staff figure in this report was calculated deterministically by the application from saved Affinity Boards.${preliminaryNote}
`;

    res.json({
      markdown,
      stats: {
        staffInterviewed: wallMetrics.staffInterviewed,
        boardsSaved: wallMetrics.boardsSaved,
        notesCollected: wallMetrics.notesCollected,
        painPoints: wallMetrics.painPoints,
        improvementIdeas: wallMetrics.improvementIdeas,
        themeCount: schoolThemes.length,
        preliminary: completedSessions.length < 2,
      },
      modelUsed,
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code ?? 'SERVER_ERROR';
    const msg =
      status === 503 || status === 403 || status === 401 || status === 400
        ? err instanceof Error
          ? err.message
          : 'Request failed.'
        : 'Could not generate school-wide report.';
    sendError(res, status, msg, code);
  }
});
