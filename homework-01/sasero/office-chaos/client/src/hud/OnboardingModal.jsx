import { useState } from 'react';
import AvatarCreator from '../avatar/AvatarCreator.jsx';

// S5-8: first-time onboarding — avatar → invite → play
export default function OnboardingModal({ needsAvatar, onAvatarSaved, onCopyInvite, onDone }) {
  const [step, setStep] = useState(needsAvatar ? 0 : 1);
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="panel p-6 max-w-2xl w-full my-8">
        <div className="flex items-center gap-2 mb-4 text-xs text-slate-400">
          {['1 · Your avatar', '2 · Invite colleagues', '3 · Wreak havoc'].map((label, i) => (
            <span key={label} className={`px-2 py-1 rounded ${step === i ? 'bg-chaos-red text-white font-bold' : 'bg-white/5'}`}>
              {label}
            </span>
          ))}
        </div>

        {step === 0 && (
          <>
            <h2 className="text-xl font-bold mb-4">Build your office persona</h2>
            <AvatarCreator
              onSaved={(user) => {
                onAvatarSaved(user);
                setStep(1);
              }}
            />
          </>
        )}

        {step === 1 && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3">📨</p>
            <h2 className="text-xl font-bold mb-2">Chaos is better with witnesses</h2>
            <p className="text-slate-400 mb-5">
              Send your colleagues an invite link. It expires in 48 hours — like their patience.
            </p>
            <button
              className="btn-primary"
              onClick={async () => {
                await onCopyInvite();
                setCopied(true);
              }}
            >
              {copied ? '✅ Link copied!' : '🔗 Copy invite link'}
            </button>
            <div className="mt-4">
              <button className="text-sm text-slate-400 hover:text-white" onClick={() => setStep(2)}>
                {copied ? 'Continue →' : 'Skip for now →'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="text-center py-6">
            <p className="text-4xl mb-3">🔨</p>
            <h2 className="text-xl font-bold mb-2">How to survive the office</h2>
            <ul className="text-left text-sm text-slate-300 space-y-2 max-w-md mx-auto mb-6">
              <li>🚶 <b>WASD / arrows</b> to roam freely; hold <b>Left Shift</b> to sprint (limited stamina, recharges when you stop); <b>drag</b> to orbit, <b>scroll</b> to zoom.</li>
              <li>🎒 <b>Switch tools with keys 1 / 2 / 3</b> (or click the slots, bottom-left):
                <b> 1</b> hands/weapon · <b>2</b> extinguisher · <b>3</b> lighter. Then just <b>click</b> to use the active tool — as much as you like.</li>
              <li>🪑 <b>Walk over office objects</b> (keyboard, stapler, chair, monitor) to arm slot 1 — each hits harder and knocks enemies further.</li>
              <li>🥊 On <b>slot 1</b>, click a colleague to swing at them (knockback!) or an offline colleague's desk to smash it to rubble.</li>
              <li>🔥 <b>Slot 3 (lighter)</b>: hold click and sweep to set the floor ablaze. <b>Slot 2 (extinguisher)</b>: hold click to spray foam and put fires out. Both unlimited.</li>
              <li>📅 <b>Log meetings</b> (+10 stress). At <b>100 stress</b>: RAGE MODE — faster, harder, knockback galore.</li>
            </ul>
            <button className="btn-primary" onClick={onDone}>Enter the chaos</button>
          </div>
        )}
      </div>
    </div>
  );
}
