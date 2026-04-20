import React, { useState } from 'react';
import { X, Sparkles, ChevronRight, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Anchored to real competitor pricing: Mealime €2.99, Plan to Eat €5.49, Samsung Food €6.49
const PRICE_OPTIONS = ['€1–2 / month', '€3–4 / month', '€5–7 / month', '€8+ / month'];

export default function WillingnessModal({ household, onClose }) {
  const [step, setStep] = useState('intro');   // 'intro' | 'price' | 'done'
  const [willing, setWilling] = useState(null);
  const [price, setPrice] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function markDone() {
    await supabase.from('household_preferences').upsert(
      { household_id: household.id, survey_completed_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
  }

  async function handleWilling(answer) {
    setWilling(answer);
    if (answer === 'no') {
      setSaving(true);
      await supabase.from('survey_responses').insert({
        household_id: household.id, willing: 'no',
      });
      await markDone();
      setStep('done');
      setSaving(false);
    } else {
      setStep('price');
    }
  }

  async function handleSubmit() {
    setSaving(true);
    await supabase.from('survey_responses').insert({
      household_id: household.id,
      willing,
      price_point: price || null,
      message: message.trim() || null,
    });
    await markDone();
    setStep('done');
    setSaving(false);
  }

  async function handleDismiss() {
    await markDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Done */}
        {step === 'done' && (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={22} className="text-green-600" />
            </div>
            <h2 className="text-base font-bold text-orange-900 mb-1">Thanks for the feedback!</h2>
            <p className="text-sm text-orange-600 mb-5">It helps us decide what to build next.</p>
            <button onClick={onClose}
              className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition">
              Back to cooking
            </button>
          </div>
        )}

        {/* Intro step */}
        {step === 'intro' && (
          <>
            <div className="flex items-start justify-between px-5 pt-5 pb-1">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                <Sparkles size={18} className="text-orange-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-base font-bold text-orange-900">Quick question</h2>
                <p className="text-xs text-orange-400 mt-0.5">Takes 30 seconds — helps us a lot</p>
              </div>
              <button onClick={handleDismiss}
                className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition ml-2">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-5 mt-3">
              <p className="text-sm text-orange-900 leading-relaxed mb-1">
                We're considering a <span className="font-semibold">premium tier</span> with:
              </p>
              <ul className="text-sm text-orange-900 space-y-1 mb-4 ml-1">
                <li>✦ Unlimited AI recipe suggestions</li>
                <li>✦ Expanded recipe library</li>
                <li>✦ A more powerful AI model</li>
              </ul>
              <p className="text-sm font-semibold text-orange-900 mb-3">Would you pay for this?</p>
              <div className="space-y-2">
                {[
                  { value: 'yes',   label: 'Yes, definitely' },
                  { value: 'maybe', label: 'Maybe — depends on the price' },
                  { value: 'no',    label: 'No, free is enough for me' },
                ].map(({ value, label }) => (
                  <button key={value} onClick={() => handleWilling(value)} disabled={saving}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-orange-200 text-sm text-orange-900 font-medium hover:bg-orange-50 hover:border-orange-400 transition disabled:opacity-50">
                    {label}
                    <ChevronRight size={15} className="text-orange-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Price step */}
        {step === 'price' && (
          <>
            <div className="flex items-center justify-between px-5 pt-5 pb-1">
              <h2 className="text-base font-bold text-orange-900">What feels fair?</h2>
              <button onClick={handleDismiss}
                className="w-8 h-8 flex items-center justify-center rounded-full text-orange-400 hover:bg-orange-50 transition">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-5 mt-3 space-y-3">
              <p className="text-sm text-orange-600">Pick the monthly price you'd be happy paying:</p>
              <div className="grid grid-cols-2 gap-2">
                {PRICE_OPTIONS.map((p) => (
                  <button key={p} onClick={() => setPrice(p)}
                    className={`py-3 rounded-xl border-2 text-sm font-semibold transition ${
                      price === p
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-orange-200 text-orange-900 hover:border-orange-400'
                    }`}>
                    {p}
                  </button>
                ))}
              </div>

              <textarea
                rows={2}
                placeholder="Anything you'd love to see? (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-orange-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-orange-300 resize-none"
              />

              <button onClick={handleSubmit} disabled={saving || !price}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50">
                {saving ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
