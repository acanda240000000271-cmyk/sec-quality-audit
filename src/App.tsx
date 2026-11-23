import React, { useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  AlertCircle,
  BookOpen,
  ClipboardCheck,
  FileBarChart2,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquarePlus,
  User as UserIcon,
  X,
} from 'lucide-react';
import type {
  AffinityBoard,
  CircleSession,
  MeResponse,
  ProfileSnapshot,
  UserProfile,
} from '../shared/types';
import { AdminBaselineView } from './components/AdminBaselineView';
import { AdminCircleWallView } from './components/AdminCircleWallView';
import { AdminReportsView } from './components/AdminReportsView';
import { CheckInView } from './components/CheckInView';
import { HomeView } from './components/HomeView';
import { LandingPage } from './components/LandingPage';
import { MyBoardsView } from './components/MyBoardsView';
import { ErrorBoundary } from './components/NoteVisuals';
import { ProfileView } from './components/ProfileView';
import { apiFetch } from './lib/api';
import {
  auth,
  db,
  googleProvider,
  stripUndefined,
  toIsoString,
  writeWithTimeout,
} from './lib/firebase';
import { buildWelcomeMessage, toTitleCaseFirstName } from './lib/formatters';

type TabKey =
  | 'home'
  | 'checkin'
  | 'boards'
  | 'profile'
  | 'baseline'
  | 'wall'
  | 'reports';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [sessions, setSessions] = useState<CircleSession[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedBoardSessionId, setSelectedBoardSessionId] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [toastError, setToastError] = useState<string | null>(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const listenersRef = useRef<Unsubscribe[]>([]);

  function clearListeners() {
    for (const unsub of listenersRef.current) {
      try {
        unsub();
      } catch {
        // Ignore cleanup errors
      }
    }
    listenersRef.current = [];
  }

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      clearListeners();
      setUser(nextUser);
      setPhotoLoadError(false);
      setMe(null);
      setProfile(null);
      setProfileLoaded(false);
      setSessions([]);
      setActiveSessionId(null);
      setSelectedBoardSessionId(null);
      setActiveTab('home');
      setAuthReady(true);

      if (!nextUser) {
        return;
      }

      // Fetch /api/me for verified admin detection
      try {
        const idToken = await nextUser.getIdToken();
        const meRes = await apiFetch<MeResponse>('/api/me', idToken);
        setMe(meRes);
      } catch (err) {
        setToastError(
          err instanceof Error ? err.message : 'Could not verify session with server.'
        );
      }

      // Subscribe to user's own profile
      const unsubProfile = onSnapshot(
        doc(db, 'users', nextUser.uid),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setProfile({
              uid: String(d.uid ?? nextUser.uid),
              displayName: String(d.displayName ?? nextUser.displayName ?? 'Staff Member'),
              photoURL: String(d.photoURL ?? ''),
              department: String(d.department ?? ''),
              roleCategory: (d.roleCategory as UserProfile['roleCategory']) ?? 'Teacher',
              position: String(d.position ?? ''),
              yearsInRole: typeof d.yearsInRole === 'number' ? d.yearsInRole : 0,
              jobDescription: String(d.jobDescription ?? ''),
              updatedAt: toIsoString(d.updatedAt),
            });
          } else {
            setProfile(null);
          }
          setProfileLoaded(true);
        },
        (err) => {
          setProfileLoaded(true);
          setToastError(
            err instanceof Error ? err.message : 'Could not load your profile.'
          );
        }
      );

      // Subscribe to user's own circleSessions
      const unsubSessions = onSnapshot(
        collection(db, 'users', nextUser.uid, 'circleSessions'),
        (snap) => {
          const list: CircleSession[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              sessionId: String(data.sessionId ?? d.id),
              userId: String(data.userId ?? nextUser.uid),
              status: data.status === 'completed' ? 'completed' : 'open',
              answerCount: typeof data.answerCount === 'number' ? data.answerCount : 0,
              rebuildCount: typeof data.rebuildCount === 'number' ? data.rebuildCount : 0,
              profileSnapshot: data.profileSnapshot as ProfileSnapshot,
              board: (data.board as AffinityBoard | null) ?? null,
              createdAt: toIsoString(data.createdAt),
              completedAt: toIsoString(data.completedAt) || null,
            };
          });
          setSessions(list);
        },
        (err) => {
          setToastError(
            err instanceof Error ? err.message : 'Could not load your check-in sessions.'
          );
        }
      );

      listenersRef.current = [unsubProfile, unsubSessions];
    });

    return () => {
      clearListeners();
      unsubAuth();
    };
  }, []);

  async function handleSignIn() {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.'
      );
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    clearListeners();
    try {
      await signOut(auth);
    } catch (err) {
      setToastError(err instanceof Error ? err.message : 'Could not sign out.');
    }
  }

  // Creates the session and its fixed welcome message once inside the Start button handler (8.4)
  async function handleStartCheckIn() {
    if (!user || !profile || startingSession) return;
    setStartingSession(true);
    setToastError(null);

    const sessionId = crypto.randomUUID();
    const firstName = toTitleCaseFirstName(profile.displayName || user.displayName);
    const welcomeText = buildWelcomeMessage(firstName);

    const profileSnapshot: ProfileSnapshot = {
      displayName: profile.displayName,
      department: profile.department,
      roleCategory: profile.roleCategory,
      position: profile.position,
      yearsInRole: profile.yearsInRole,
      jobDescription: profile.jobDescription,
    };

    try {
      await writeWithTimeout(() =>
        setDoc(
          doc(db, 'users', user.uid, 'circleSessions', sessionId),
          stripUndefined({
            sessionId,
            userId: user.uid,
            status: 'open',
            answerCount: 0,
            rebuildCount: 0,
            profileSnapshot,
            board: null,
            createdAt: serverTimestamp(),
            completedAt: null,
          })
        )
      );

      await writeWithTimeout(() =>
        setDoc(
          doc(db, 'users', user.uid, 'interactions', `${sessionId}_welcome`),
          stripUndefined({
            sessionId,
            userId: user.uid,
            clientMessageId: 'welcome',
            role: 'assistant',
            content: welcomeText,
            topicNumber: 1,
            timestamp: serverTimestamp(),
            modelUsed: 'system',
          })
        )
      );

      setActiveSessionId(sessionId);
      setActiveTab('checkin');
      setMobileDrawerOpen(false);
    } catch (err) {
      setToastError(
        err instanceof Error
          ? err.message
          : 'Could not start a new check-in. Please check your connection and try again.'
      );
    } finally {
      setStartingSession(false);
    }
  }

  const activeSession =
    sessions.find((s) => s.sessionId === activeSessionId) ??
    sessions.find((s) => s.status === 'open') ??
    null;

  const selectedBoardSession =
    sessions.find((s) => s.sessionId === selectedBoardSessionId) ?? null;

  const firstName = toTitleCaseFirstName(
    profile?.displayName || user?.displayName || me?.displayName
  );
  const photoURL = user?.photoURL || profile?.photoURL || '';
  const isAdmin = Boolean(me?.isAdmin);

  const userTabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'home', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { key: 'checkin', label: 'Check-in', icon: <MessageSquarePlus className="w-4 h-4" /> },
    { key: 'boards', label: 'My Boards', icon: <ClipboardCheck className="w-4 h-4" /> },
    { key: 'profile', label: 'Profile', icon: <UserIcon className="w-4 h-4" /> },
  ];

  const adminTabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'baseline', label: 'Baseline', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'wall', label: 'Circle Wall', icon: <LayoutGrid className="w-4 h-4" /> },
    { key: 'reports', label: 'Reports', icon: <FileBarChart2 className="w-4 h-4" /> },
  ];

  function selectTab(key: TabKey) {
    setActiveTab(key);
    setMobileDrawerOpen(false);
    if (key !== 'boards') {
      setSelectedBoardSessionId(null);
    }
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-[#FBF7EF] text-[#1E293B]">
        {/* Slate Header */}
        <header className="bg-[#1E293B] text-white">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#F59E0B] text-[#1E293B] font-bold text-sm flex items-center justify-center shrink-0">
                QA
              </div>
              <div className="min-w-0">
                <div className="font-bold text-base leading-tight truncate">
                  SEC Quality Audit
                </div>
                <div className="text-xs text-slate-300 leading-tight truncate">
                  Surigao Education Center
                </div>
              </div>
            </div>

            {user ? (
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden sm:flex items-center gap-2">
                  {photoURL && !photoLoadError ? (
                    <img
                      src={photoURL}
                      alt={firstName}
                      referrerPolicy="no-referrer"
                      onError={() => setPhotoLoadError(true)}
                      className="w-7 h-7 rounded-full object-cover border border-slate-600"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-700 text-xs font-bold flex items-center justify-center">
                      {firstName.charAt(0)}
                    </div>
                  )}
                  <span className="text-sm font-medium text-slate-100">
                    {firstName}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen((v) => !v)}
                  aria-label="Open navigation menu"
                  className="md:hidden p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                >
                  {mobileDrawerOpen ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Menu className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : null}
          </div>

          {/* Desktop Notebook Tabs under header */}
          {user ? (
            <nav
              aria-label="Primary navigation"
              className="hidden md:block border-t border-slate-700/70 pt-2"
            >
              <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex items-end gap-1.5">
                {userTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => selectTab(tab.key)}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-[#FBF7EF] text-slate-900'
                          : 'bg-[#EFE6D2] text-slate-700 hover:bg-[#E7DAC0]'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}

                {isAdmin ? (
                  <>
                    <div className="px-2 pb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 shrink-0">
                      <span className="w-px h-4 bg-slate-500 mr-1" aria-hidden="true" />
                      Admin
                    </div>
                    {adminTabs.map((tab) => {
                      const isActive = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => selectTab(tab.key)}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isActive
                              ? 'bg-[#FBF7EF] text-slate-900'
                              : 'bg-[#EFE6D2] text-slate-700 hover:bg-[#E7DAC0]'
                          }`}
                        >
                          {tab.icon}
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </>
                ) : null}
              </div>
            </nav>
          ) : null}
        </header>

        {/* Mobile Drawer Navigation (< 768px) */}
        {user && mobileDrawerOpen ? (
          <div className="md:hidden bg-white border-b border-[#EADFCB] px-4 py-3 space-y-2 shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              {userTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => selectTab(tab.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold ${
                    activeTab === tab.key
                      ? 'bg-[#F59E0B] text-[#1E293B]'
                      : 'bg-[#FBF7EF] text-slate-700'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {isAdmin ? (
              <div className="pt-2 border-t border-[#EADFCB]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Admin
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {adminTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => selectTab(tab.key)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold ${
                        activeTab === tab.key
                          ? 'bg-[#F59E0B] text-[#1E293B]'
                          : 'bg-[#FBF7EF] text-slate-700'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Toast Error Banner */}
        {toastError ? (
          <div className="max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-4">
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-sm text-red-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{toastError}</span>
              </div>
              <button
                type="button"
                onClick={() => setToastError(null)}
                aria-label="Dismiss alert"
                className="p-1 rounded hover:bg-red-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Main Content Area */}
        <main className="flex-1 w-full">
          {!authReady ? (
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-16 text-center text-sm text-slate-500">
              Loading SEC Quality Audit…
            </div>
          ) : !user ? (
            <LandingPage
              onSignIn={() => void handleSignIn()}
              signingIn={signingIn}
              authError={authError}
            />
          ) : (
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
              {activeTab === 'home' ? (
                <HomeView
                  uid={user.uid}
                  displayName={profile?.displayName || user.displayName || 'Colleague'}
                  profile={profileLoaded ? profile : null}
                  sessions={sessions}
                  adminSetupNeeded={Boolean(me?.adminSetupNeeded)}
                  startingSession={startingSession}
                  onStartCheckIn={() => void handleStartCheckIn()}
                  onContinueSession={(s) => {
                    setActiveSessionId(s.sessionId);
                    setActiveTab('checkin');
                  }}
                  onGoProfile={() => setActiveTab('profile')}
                  onOpenBoard={(s) => {
                    setSelectedBoardSessionId(s.sessionId);
                    setActiveTab('boards');
                  }}
                />
              ) : null}

              {activeTab === 'checkin' ? (
                <CheckInView
                  user={user}
                  profile={profile}
                  activeSession={activeSession}
                  startingSession={startingSession}
                  onStartNewCheckIn={() => void handleStartCheckIn()}
                  onSessionCompleted={(completed) => {
                    setActiveSessionId(null);
                    setSelectedBoardSessionId(completed.sessionId);
                    setActiveTab('boards');
                  }}
                  onGoProfile={() => setActiveTab('profile')}
                  onToastError={(msg) => setToastError(msg)}
                />
              ) : null}

              {activeTab === 'boards' ? (
                <MyBoardsView
                  user={user}
                  sessions={sessions}
                  selectedSession={selectedBoardSession}
                  onSelectSession={(s) => setSelectedBoardSessionId(s ? s.sessionId : null)}
                  onContinueOpenSession={(s) => {
                    setActiveSessionId(s.sessionId);
                    setActiveTab('checkin');
                  }}
                  onStartNewCheckIn={() => void handleStartCheckIn()}
                  onToastError={(msg) => setToastError(msg)}
                />
              ) : null}

              {activeTab === 'profile' ? (
                <ProfileView
                  user={user}
                  savedProfile={profile}
                  onProfileSaved={(saved) => setProfile(saved)}
                />
              ) : null}

              {activeTab === 'baseline' && isAdmin ? (
                <AdminBaselineView onToastError={(msg) => setToastError(msg)} />
              ) : null}

              {activeTab === 'wall' && isAdmin ? (
                <AdminCircleWallView onToastError={(msg) => setToastError(msg)} />
              ) : null}

              {activeTab === 'reports' && isAdmin ? (
                <AdminReportsView
                  user={user}
                  onToastError={(msg) => setToastError(msg)}
                />
              ) : null}
            </div>
          )}
        </main>
      </div>
    </ErrorBoundary>
  );
}
