import {
  AffinityBoard,
  BoardNote,
  BoardStats,
  BoardTheme,
  CircleSession,
  COMPLAINT_SOURCES,
  type ComplaintSource,
  HeatLevel,
  NON_STEP_NOTE_TYPES,
  NoteType,
  RoleCategory,
} from './types.js';

export function computeHeat(painNotes: number): HeatLevel {
  if (painNotes >= 3) return 'Hot';
  if (painNotes === 2) return 'Warm';
  return 'Mild';
}

export function recomputeBoardMetrics(
  board: Omit<AffinityBoard, 'stats'> & { stats?: BoardStats }
): AffinityBoard {
  const notes: BoardNote[] = Array.isArray(board.notes) ? board.notes : [];
  const rawThemes = Array.isArray(board.themes) ? board.themes : [];

  const byType: Record<NoteType, number> = {
    Step: 0,
    Difficulty: 0,
    Complaint: 0,
    Strength: 0,
    Suggestion: 0,
  };

  const complaintSources: Record<(typeof COMPLAINT_SOURCES)[number], number> = {
    Learners: 0,
    Parents: 0,
    Colleagues: 0,
    Office: 0,
    Self: 0,
    Other: 0,
  };

  for (const note of notes) {
    if (note.type in byType) {
      byType[note.type] += 1;
    }
    if (note.type === 'Complaint') {
      const src = COMPLAINT_SOURCES.includes(note.source as (typeof COMPLAINT_SOURCES)[number])
        ? (note.source as (typeof COMPLAINT_SOURCES)[number])
        : 'Other';
      complaintSources[src] += 1;
    }
  }

  const themes: BoardTheme[] = rawThemes.map((t) => {
    let difficulties = 0;
    let complaints = 0;
    let strengths = 0;
    let suggestions = 0;
    const validIndexes = (t.noteIndexes || []).filter(
      (idx) => Number.isInteger(idx) && idx >= 0 && idx < notes.length && notes[idx].type !== 'Step'
    );

    for (const idx of validIndexes) {
      const n = notes[idx];
      if (n.type === 'Difficulty') difficulties += 1;
      else if (n.type === 'Complaint') complaints += 1;
      else if (n.type === 'Strength') strengths += 1;
      else if (n.type === 'Suggestion') suggestions += 1;
    }

    const painNotes = difficulties + complaints;
    return {
      title: t.title,
      noteIndexes: validIndexes,
      cause: t.cause || '',
      code: t.code || 'None',
      difficulties,
      complaints,
      strengths,
      suggestions,
      painNotes,
      heat: computeHeat(painNotes),
    };
  });

  let priorityThemeIndex = board.priority?.themeIndex ?? null;
  if (
    priorityThemeIndex !== null &&
    (!Number.isInteger(priorityThemeIndex) ||
      priorityThemeIndex < 0 ||
      priorityThemeIndex >= themes.length)
  ) {
    priorityThemeIndex = null;
  }

  const totalNonStepNotes =
    byType.Difficulty + byType.Complaint + byType.Strength + byType.Suggestion;
  const painPoints = byType.Difficulty + byType.Complaint;
  const improvements = Array.isArray(board.improvements) ? board.improvements : [];

  return {
    routine: board.routine || '',
    routineCode: board.routineCode || 'None',
    summary: board.summary || '',
    notes,
    themes,
    priority: {
      themeIndex: priorityThemeIndex,
      reason: board.priority?.reason || '',
      signOfSuccess: board.priority?.signOfSuccess || '',
    },
    improvements,
    stats: {
      byType,
      totalNotes: notes.length,
      totalNonStepNotes,
      painPoints,
      improvementIdeas: improvements.length,
      complaintSources,
    },
    ...(board.modelUsed ? { modelUsed: board.modelUsed } : {}),
    ...(board.employeeEdited !== undefined ? { employeeEdited: board.employeeEdited } : {}),
  };
}

export function removeNoteFromBoard(
  board: AffinityBoard,
  noteIndexToRemove: number
): AffinityBoard {
  if (noteIndexToRemove < 0 || noteIndexToRemove >= board.notes.length) {
    return board;
  }
  const nextNotes = board.notes.filter((_, idx) => idx !== noteIndexToRemove);
  const nextThemes = board.themes.map((theme) => ({
    ...theme,
    noteIndexes: theme.noteIndexes
      .filter((idx) => idx !== noteIndexToRemove)
      .map((idx) => (idx > noteIndexToRemove ? idx - 1 : idx)),
  }));

  return recomputeBoardMetrics({
    ...board,
    notes: nextNotes,
    themes: nextThemes,
    employeeEdited: true,
  });
}

export function editNoteInBoard(
  board: AffinityBoard,
  noteIndex: number,
  updates: {
    text: string;
    type: NoteType;
    targetThemeIndex: number | null;
    source?: ComplaintSource;
  }
): AffinityBoard {
  if (noteIndex < 0 || noteIndex >= board.notes.length) {
    return board;
  }
  const existing = board.notes[noteIndex];
  const nextText = updates.text.trim().slice(0, 200);
  if (!nextText) return board;

  const nextType = updates.type;
  const nextSource: ComplaintSource =
    nextType === 'Complaint'
      ? updates.source && COMPLAINT_SOURCES.includes(updates.source as (typeof COMPLAINT_SOURCES)[number])
        ? updates.source
        : existing.source && COMPLAINT_SOURCES.includes(existing.source as (typeof COMPLAINT_SOURCES)[number])
        ? existing.source
        : 'Other'
      : '';

  const nextNotes = board.notes.map((n, idx) =>
    idx === noteIndex
      ? {
          ...n,
          type: nextType,
          text: nextText,
          source: nextSource,
          editedByEmployee: true,
          addedByEmployee: Boolean(n.addedByEmployee),
        }
      : n
  );

  // Remove noteIndex from all themes first
  const nextThemes = board.themes.map((t) => ({
    ...t,
    noteIndexes: t.noteIndexes.filter((idx) => idx !== noteIndex),
  }));

  if (nextType !== 'Step') {
    let destIdx =
      updates.targetThemeIndex !== null &&
      updates.targetThemeIndex >= 0 &&
      updates.targetThemeIndex < nextThemes.length
        ? updates.targetThemeIndex
        : 0;
    if (nextThemes.length === 0) {
      nextThemes.push({
        title: 'Other notes',
        noteIndexes: [noteIndex],
        cause: '',
        code: 'None',
        difficulties: 0,
        complaints: 0,
        strengths: 0,
        suggestions: 0,
        painNotes: 0,
        heat: 'Mild',
      });
    } else {
      nextThemes[destIdx] = {
        ...nextThemes[destIdx],
        noteIndexes: [...nextThemes[destIdx].noteIndexes, noteIndex],
      };
    }
  }

  return recomputeBoardMetrics({
    ...board,
    notes: nextNotes,
    themes: nextThemes,
    employeeEdited: true,
  });
}

export function addNoteToBoard(
  board: AffinityBoard,
  input: {
    text: string;
    type: NoteType;
    targetThemeIndex: number | null;
    source?: ComplaintSource;
  }
): AffinityBoard {
  const cleanText = input.text.trim().slice(0, 200);
  if (!cleanText) return board;

  const nextSource: ComplaintSource =
    input.type === 'Complaint'
      ? input.source && COMPLAINT_SOURCES.includes(input.source as (typeof COMPLAINT_SOURCES)[number])
        ? input.source
        : 'Other'
      : '';

  const newIndex = board.notes.length;
  const newNote: BoardNote = {
    type: input.type,
    text: cleanText,
    quote: '',
    source: nextSource,
    code: 'None',
    editedByEmployee: false,
    addedByEmployee: true,
  };

  const nextNotes = [...board.notes, newNote];
  const nextThemes = board.themes.map((t) => ({ ...t, noteIndexes: [...t.noteIndexes] }));

  if (input.type !== 'Step') {
    const destIdx =
      input.targetThemeIndex !== null &&
      input.targetThemeIndex >= 0 &&
      input.targetThemeIndex < nextThemes.length
        ? input.targetThemeIndex
        : 0;
    if (nextThemes.length === 0) {
      nextThemes.push({
        title: 'Other notes',
        noteIndexes: [newIndex],
        cause: '',
        code: 'None',
        difficulties: 0,
        complaints: 0,
        strengths: 0,
        suggestions: 0,
        painNotes: 0,
        heat: 'Mild',
      });
    } else {
      nextThemes[destIdx].noteIndexes.push(newIndex);
    }
  }

  return recomputeBoardMetrics({
    ...board,
    notes: nextNotes,
    themes: nextThemes,
    employeeEdited: true,
  });
}

export function renameThemeInBoard(
  board: AffinityBoard,
  themeIndex: number,
  newTitle: string
): AffinityBoard {
  const clean = newTitle.trim().slice(0, 60);
  if (!clean || themeIndex < 0 || themeIndex >= board.themes.length) {
    return board;
  }
  const nextThemes = board.themes.map((t, idx) =>
    idx === themeIndex ? { ...t, title: clean } : t
  );
  return recomputeBoardMetrics({
    ...board,
    themes: nextThemes,
    employeeEdited: true,
  });
}

export function editImprovementInBoard(
  board: AffinityBoard,
  improvementIndex: number,
  updates: { owner: string; firstStep: string }
): AffinityBoard {
  if (improvementIndex < 0 || improvementIndex >= board.improvements.length) {
    return board;
  }
  const cleanOwner = updates.owner.trim().slice(0, 140) || 'Staff';
  const cleanFirstStep = updates.firstStep.trim().slice(0, 240);

  const nextImprovements = board.improvements.map((imp, idx) =>
    idx === improvementIndex
      ? { ...imp, owner: cleanOwner, firstStep: cleanFirstStep }
      : imp
  );
  return recomputeBoardMetrics({
    ...board,
    improvements: nextImprovements,
    employeeEdited: true,
  });
}

export function finalizeBoardForSave(board: AffinityBoard): AffinityBoard {
  const normalizedNotes = board.notes.map((n) => ({
    ...n,
    editedByEmployee: Boolean(n.editedByEmployee),
    addedByEmployee: Boolean(n.addedByEmployee),
  }));
  const recomputed = recomputeBoardMetrics({
    ...board,
    notes: normalizedNotes,
    employeeEdited: Boolean(board.employeeEdited),
  });
  return {
    ...recomputed,
    employeeEdited: Boolean(board.employeeEdited),
  };
}

export interface WallThemeRow {
  id: string;
  sessionId: string;
  userId: string;
  title: string;
  heat: HeatLevel;
  difficulties: number;
  complaints: number;
  strengths: number;
  suggestions: number;
  painNotes: number;
  code: string;
  roleCategory: RoleCategory;
  isPriority: boolean;
  date: string;
  cause: string;
  routine: string;
}

export interface WallStandardRow {
  code: string;
  boards: number;
  difficulties: number;
  complaints: number;
  strengths: number;
  suggestions: number;
}

export interface WallStickyNote {
  sessionId: string;
  noteIndex: number;
  type: Exclude<NoteType, 'Step'>;
  text: string;
  quote: string;
  source: ComplaintSource;
  code: string;
  roleCategory: RoleCategory;
  editedByEmployee?: boolean;
  addedByEmployee?: boolean;
}

export interface WallBoardRow {
  sessionId: string;
  userId: string;
  displayName: string;
  roleCategory: RoleCategory;
  position: string;
  routine: string;
  date: string;
  noteCount: number;
  topTheme: string;
  topThemeHeat: HeatLevel;
}

export interface NotesByTypeStat {
  type: Exclude<NoteType, 'Step'>;
  count: number;
  percent: number;
}

export interface CircleWallMetrics {
  staffInterviewed: number;
  boardsSaved: number;
  notesCollected: number;
  painPoints: number;
  improvementIdeas: number;
  notesByType: NotesByTypeStat[];
  totalNonStepNotes: number;
  themes: WallThemeRow[];
  byStandard: WallStandardRow[];
  complaintSources: Record<(typeof COMPLAINT_SOURCES)[number], number>;
  stickyNotes: WallStickyNote[];
  boards: WallBoardRow[];
}

export function computeCircleWallMetrics(sessions: CircleSession[]): CircleWallMetrics {
  const completed = sessions.filter((s) => s.status === 'completed' && s.board !== null);

  const distinctUsers = new Set<string>();
  let notesCollected = 0;
  let painPoints = 0;
  let improvementIdeas = 0;

  const nonStepCounts: Record<Exclude<NoteType, 'Step'>, number> = {
    Difficulty: 0,
    Complaint: 0,
    Strength: 0,
    Suggestion: 0,
  };

  const complaintSources: Record<(typeof COMPLAINT_SOURCES)[number], number> = {
    Learners: 0,
    Parents: 0,
    Colleagues: 0,
    Office: 0,
    Self: 0,
    Other: 0,
  };

  const themes: WallThemeRow[] = [];
  const stickyNotes: WallStickyNote[] = [];
  const boards: WallBoardRow[] = [];

  const standardMap = new Map<
    string,
    {
      boardIds: Set<string>;
      difficulties: number;
      complaints: number;
      strengths: number;
      suggestions: number;
    }
  >();

  const ensureStd = (code: string) => {
    if (!standardMap.has(code)) {
      standardMap.set(code, {
        boardIds: new Set<string>(),
        difficulties: 0,
        complaints: 0,
        strengths: 0,
        suggestions: 0,
      });
    }
    return standardMap.get(code)!;
  };

  for (const session of completed) {
    const board = recomputeBoardMetrics(session.board!);
    distinctUsers.add(session.userId);
    const dateStr = session.completedAt || session.createdAt || '';
    const roleCategory = session.profileSnapshot.roleCategory;

    notesCollected += board.notes.length;
    painPoints += board.stats.painPoints;
    improvementIdeas += board.improvements.length;

    for (const t of NON_STEP_NOTE_TYPES) {
      nonStepCounts[t] += board.stats.byType[t];
    }

    for (const src of COMPLAINT_SOURCES) {
      complaintSources[src] += board.stats.complaintSources[src] || 0;
    }

    board.notes.forEach((note, idx) => {
      if (note.type !== 'Step') {
        stickyNotes.push({
          sessionId: session.sessionId,
          noteIndex: idx,
          type: note.type,
          text: note.text,
          quote: note.quote,
          source: note.source || '',
          code: note.code || 'None',
          roleCategory,
          ...(note.editedByEmployee !== undefined ? { editedByEmployee: note.editedByEmployee } : {}),
          ...(note.addedByEmployee !== undefined ? { addedByEmployee: note.addedByEmployee } : {}),
        });
      }
      if (note.code && note.code !== 'None') {
        const st = ensureStd(note.code);
        st.boardIds.add(session.sessionId);
        if (note.type === 'Difficulty') st.difficulties += 1;
        else if (note.type === 'Complaint') st.complaints += 1;
        else if (note.type === 'Strength') st.strengths += 1;
        else if (note.type === 'Suggestion') st.suggestions += 1;
      }
    });

    board.themes.forEach((theme, tIdx) => {
      const themeCode = theme.code && theme.code !== 'None' ? theme.code : 'None';
      if (themeCode !== 'None') {
        const st = ensureStd(themeCode);
        st.boardIds.add(session.sessionId);
      }

      themes.push({
        id: `${session.sessionId}__theme_${tIdx}`,
        sessionId: session.sessionId,
        userId: session.userId,
        title: theme.title,
        heat: theme.heat,
        difficulties: theme.difficulties,
        complaints: theme.complaints,
        strengths: theme.strengths,
        suggestions: theme.suggestions,
        painNotes: theme.painNotes,
        code: themeCode,
        roleCategory,
        isPriority: board.priority.themeIndex === tIdx,
        date: dateStr,
        cause: theme.cause,
        routine: board.routine,
      });
    });

    const sortedBoardThemes = [...board.themes].sort((a, b) => b.painNotes - a.painNotes);
    const priorityTheme =
      board.priority.themeIndex !== null && board.themes[board.priority.themeIndex]
        ? board.themes[board.priority.themeIndex]
        : sortedBoardThemes[0];

    boards.push({
      sessionId: session.sessionId,
      userId: session.userId,
      displayName: session.profileSnapshot.displayName,
      roleCategory,
      position: session.profileSnapshot.position,
      routine: board.routine,
      date: dateStr,
      noteCount: board.notes.length,
      topTheme: priorityTheme ? priorityTheme.title : '—',
      topThemeHeat: priorityTheme ? priorityTheme.heat : 'Mild',
    });
  }

  themes.sort((a, b) => {
    if (b.painNotes !== a.painNotes) return b.painNotes - a.painNotes;
    return b.date.localeCompare(a.date);
  });

  boards.sort((a, b) => b.date.localeCompare(a.date));

  const totalNonStepNotes =
    nonStepCounts.Difficulty +
    nonStepCounts.Complaint +
    nonStepCounts.Strength +
    nonStepCounts.Suggestion;

  const notesByType: NotesByTypeStat[] = NON_STEP_NOTE_TYPES.map((type) => {
    const count = nonStepCounts[type];
    const percent = totalNonStepNotes > 0 ? Math.round((count / totalNonStepNotes) * 1000) / 10 : 0;
    return { type, count, percent };
  });

  const byStandard: WallStandardRow[] = Array.from(standardMap.entries())
    .map(([code, val]) => ({
      code,
      boards: val.boardIds.size,
      difficulties: val.difficulties,
      complaints: val.complaints,
      strengths: val.strengths,
      suggestions: val.suggestions,
    }))
    .sort((a, b) => {
      const aPain = a.difficulties + a.complaints;
      const bPain = b.difficulties + b.complaints;
      if (bPain !== aPain) return bPain - aPain;
      return a.code.localeCompare(b.code);
    });

  return {
    staffInterviewed: distinctUsers.size,
    boardsSaved: completed.length,
    notesCollected,
    painPoints,
    improvementIdeas,
    notesByType,
    totalNonStepNotes,
    themes,
    byStandard,
    complaintSources,
    stickyNotes,
    boards,
  };
}
