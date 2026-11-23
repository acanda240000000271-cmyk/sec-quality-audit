import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import type { User } from 'firebase/auth';
import { ROLE_CATEGORIES, type RoleCategory, type UserProfile } from '../../shared/types';
import {
  db,
  handleFirestoreError,
  OperationType,
  stripUndefined,
  writeWithTimeout,
} from '../lib/firebase';

export function ProfileView({
  user,
  savedProfile,
  onProfileSaved,
}: {
  user: User;
  savedProfile: UserProfile | null;
  onProfileSaved: (profile: UserProfile) => void;
}) {
  const [department, setDepartment] = useState('');
  const [roleCategory, setRoleCategory] = useState<RoleCategory>('Teacher');
  const [position, setPosition] = useState('');
  const [yearsInRole, setYearsInRole] = useState('1');
  const [jobDescription, setJobDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reload fields from the saved document every time Profile opens or savedProfile changes
  useEffect(() => {
    if (savedProfile) {
      setDepartment(savedProfile.department || '');
      setRoleCategory(savedProfile.roleCategory || 'Teacher');
      setPosition(savedProfile.position || '');
      setYearsInRole(String(savedProfile.yearsInRole ?? 0));
      setJobDescription(savedProfile.jobDescription || '');
    } else {
      setDepartment('');
      setRoleCategory('Teacher');
      setPosition('');
      setYearsInRole('1');
      setJobDescription('');
    }
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [savedProfile]);

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const deptTrim = department.trim();
    const posTrim = position.trim();
    const jobTrim = jobDescription.trim();
    const parsedYears = Number(yearsInRole);

    if (!deptTrim || deptTrim.length > 100) {
      setErrorMsg('Please enter your department (1 to 100 characters).');
      return;
    }
    if (!ROLE_CATEGORIES.includes(roleCategory)) {
      setErrorMsg('Please choose a valid role category.');
      return;
    }
    if (!posTrim || posTrim.length > 100) {
      setErrorMsg('Please enter your position title (1 to 100 characters).');
      return;
    }
    if (!Number.isInteger(parsedYears) || parsedYears < 0 || parsedYears > 50) {
      setErrorMsg('Years in role must be a whole number from 0 to 50.');
      return;
    }
    if (!jobTrim || jobTrim.length > 500) {
      setErrorMsg('Please enter a short job description (1 to 500 characters).');
      return;
    }

    const displayName = (user.displayName ?? 'Staff Member').trim().slice(0, 120) || 'Staff Member';
    const photoURL = (user.photoURL ?? '').trim().slice(0, 500);

    const payload = stripUndefined({
      uid: user.uid,
      displayName,
      photoURL,
      department: deptTrim,
      roleCategory,
      position: posTrim,
      yearsInRole: parsedYears,
      jobDescription: jobTrim,
      updatedAt: serverTimestamp(),
    });

    setSaving(true);
    try {
      await writeWithTimeout(() => setDoc(doc(db, 'users', user.uid), payload));
      const localProfile: UserProfile = {
        uid: user.uid,
        displayName,
        photoURL,
        department: deptTrim,
        roleCategory,
        position: posTrim,
        yearsInRole: parsedYears,
        jobDescription: jobTrim,
        updatedAt: new Date().toISOString(),
      };
      onProfileSaved(localProfile);
      setSuccessMsg('Your profile has been saved. You are ready for a Quality Circle check-in.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not save your profile.';
      setErrorMsg(message);
      if (message.includes('Missing or insufficient permissions')) {
        try {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        } catch {
          // Logged structured info for diagnostics; keep UI error banner visible
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto fade-in-panel">
      <div className="sec-card p-6 md:p-8">
        <h2 className="text-xl font-bold text-slate-800">
          {savedProfile ? 'Your Staff Profile' : 'Complete Your Staff Profile'}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          This helps the Facilitator tailor your check-in to your role at Surigao Education Center.
          Your email address is never saved in your profile.
        </p>

        {errorMsg ? (
          <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 shrink-0"
            >
              Retry Save
            </button>
          </div>
        ) : null}

        {successMsg ? (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        ) : null}

        <form onSubmit={(e) => void handleSave(e)} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="profile-department"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Department / Unit
              </label>
              <input
                id="profile-department"
                type="text"
                maxLength={100}
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g., Senior High School / Computer Lab"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              />
            </div>

            <div>
              <label
                htmlFor="profile-role-category"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Role category
              </label>
              <select
                id="profile-role-category"
                value={roleCategory}
                onChange={(e) => setRoleCategory(e.target.value as RoleCategory)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              >
                {ROLE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="profile-position"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Position title
              </label>
              <input
                id="profile-position"
                type="text"
                maxLength={100}
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g., ICT Teacher"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              />
            </div>

            <div>
              <label
                htmlFor="profile-years"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Years in role (0–50)
              </label>
              <input
                id="profile-years"
                type="number"
                min={0}
                max={50}
                step={1}
                required
                value={yearsInRole}
                onChange={(e) => setYearsInRole(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 tabular-nums focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="profile-job"
                className="block text-sm font-semibold text-slate-700"
              >
                Short job description
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {jobDescription.length}/500
              </span>
            </div>
            <textarea
              id="profile-job"
              rows={3}
              maxLength={500}
              required
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Briefly describe your main weekly responsibilities..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#EADFCB] bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F59E0B]"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#F59E0B] text-[#1E293B] font-bold text-sm hover:bg-[#D97706] transition-colors disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
