import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const inviteToken = new URLSearchParams(window.location.search).get('invite');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;

        if (inviteToken) {
          const { data: { user } } = await supabase.auth.getUser();
          const { error: joinError } = await supabase.rpc('join_household_by_token', {
            p_token: inviteToken,
            p_user_id: user.id,
          });
          if (joinError) throw joinError;
          // Clear invite token from URL without reload
          window.history.replaceState({}, '', window.location.pathname);
        }
      } else {
        const { data: { user }, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (!user) {
          // Email confirmation required
          setDone(true);
          setLoading(false);
          return;
        }

        if (inviteToken) {
          const { error: joinError } = await supabase.rpc('join_household_by_token', {
            p_token: inviteToken,
            p_user_id: user.id,
          });
          if (joinError) throw joinError;
          window.history.replaceState({}, '', window.location.pathname);
        } else {
          await supabase.rpc('create_household_for_user', { uid: user.id });
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-8 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-orange-900 mb-2">Check your email</h2>
          <p className="text-sm text-orange-600">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-orange-100 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-orange-900 leading-none mb-1">Meal Planner</h1>
        <p className="text-xs text-orange-400 mb-5">HelloFresh · Spoonacular · and more</p>

        {inviteToken && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-5">
            <p className="text-sm text-green-700 font-medium">You've been invited!</p>
            <p className="text-xs text-green-600 mt-0.5">
              {mode === 'login' ? 'Sign in' : 'Create an account'} to join the shared kitchen.
            </p>
          </div>
        )}

        <p className="text-sm text-orange-600 font-medium mb-4">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
          />
          <input
            type="password"
            placeholder="Password (min. 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full border border-orange-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300"
          />
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition disabled:opacity-50 text-sm mt-1"
          >
            {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => { setMode((m) => (m === 'login' ? 'register' : 'login')); setError(''); }}
          className="w-full text-center text-sm text-orange-500 hover:text-orange-700 mt-4 transition"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
