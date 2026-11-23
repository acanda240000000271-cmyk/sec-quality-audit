export type RoleCategory =
  | 'Teacher'
  | 'Librarian'
  | 'School Leader'
  | 'Office'
  | 'Support Staff';

export const ROLE_CATEGORIES: RoleCategory[] = [
  'Teacher',
  'Librarian',
  'School Leader',
  'Office',
  'Support Staff',
];

export type NoteType =
  | 'Step'
  | 'Difficulty'
  | 'Complaint'
  | 'Strength'
  | 'Suggestion';

export const NOTE_TYPES: NoteType[] = [
  'Step',
  'Difficulty',
  'Complaint',
  'Strength',
  'Suggestion',
];

export const NON_STEP_NOTE_TYPES: Exclude<NoteType, 'Step'>[] = [
  'Difficulty',
  'Complaint',
  'Strength',
  'Suggestion',
];

export type ComplaintSource =
  | 'Learners'
  | 'Parents'
  | 'Colleagues'
  | 'Office'
  | 'Self'
  | 'Other'
  | '';

export const COMPLAINT_SOURCES = [
  'Learners',
  'Parents',
  'Colleagues',
  'Office',
  'Self',
  'Other',
] as const;

export type HeatLevel = 'Hot' | 'Warm' | 'Mild';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  department: string;
  roleCategory: RoleCategory;
  position: string;
  yearsInRole: number;
  jobDescription: string;
  updatedAt?: string;
}

export interface ProfileSnapshot {
  displayName: string;
  department: string;
  roleCategory: RoleCategory;
  position: string;
  yearsInRole: number;
  jobDescription: string;
}

export interface BoardNote {
  type: NoteType;
  text: string;
  quote: string;
  source: ComplaintSource;
  code: string;
}

export interface BoardTheme {
  title: string;
  noteIndexes: number[];
  cause: string;
  code: string;
  difficulties: number;
  complaints: number;
  strengths: number;
  suggestions: number;
  painNotes: number;
  heat: HeatLevel;
}

export interface BoardPriority {
  themeIndex: number | null;
  reason: string;
  signOfSuccess: string;
}

export interface BoardImprovement {
  idea: string;
  origin: 'Employee' | 'Facilitator';
  themeIndex: number | null;
  owner: string;
  firstStep: string;
  code: string;
}

export interface BoardStats {
  byType: Record<NoteType, number>;
  totalNotes: number;
  totalNonStepNotes: number;
  painPoints: number;
  improvementIdeas: number;
  complaintSources: Record<(typeof COMPLAINT_SOURCES)[number], number>;
}

export interface AffinityBoard {
  routine: string;
  routineCode: string;
  summary: string;
  notes: BoardNote[];
  themes: BoardTheme[];
  priority: BoardPriority;
  improvements: BoardImprovement[];
  stats: BoardStats;
  modelUsed?: string;
}

export interface CircleSession {
  sessionId: string;
  userId: string;
  status: 'open' | 'completed';
  answerCount: number;
  rebuildCount: number;
  profileSnapshot: ProfileSnapshot;
  board: AffinityBoard | null;
  createdAt: string;
  completedAt: string | null;
}

export interface InteractionMessage {
  id?: string;
  sessionId: string;
  userId: string;
  clientMessageId: string;
  role: 'user' | 'assistant';
  content: string;
  topicNumber: number;
  timestamp: string;
  modelUsed: string;
}

export interface BaselineDoc {
  id: string;
  title: string;
  text: string;
  sizeChars: number;
  uploadedAt: string;
}

export interface WallReport {
  id: string;
  title: string;
  markdown: string;
  stats: Record<string, unknown>;
  modelUsed: string;
  createdAt: string;
  createdBy: string;
}

export interface MeResponse {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  adminSetupNeeded: boolean;
}

export const TOPICS: { number: number; name: string; label: string }[] = [
  { number: 1, name: 'Routine', label: 'Routine & steps' },
  { number: 2, name: 'Difficulties', label: 'What makes it hard' },
  { number: 3, name: 'Complaints', label: 'What people complain about' },
  { number: 4, name: 'What works', label: 'What already works' },
  { number: 5, name: 'Suggestions', label: 'Ideas to improve' },
  { number: 6, name: 'Priority', label: 'First problem to fix' },
];
