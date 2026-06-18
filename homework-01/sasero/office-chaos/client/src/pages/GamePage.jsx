import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getStoredUser } from '../api.js';
import { createSocket } from '../game/socket.js';
import ThreeGame from '../game/ThreeGame.jsx';
import StressMeter from '../hud/StressMeter.jsx';
import SprintMeter from '../hud/SprintMeter.jsx';
import HpHearts from '../hud/HpHearts.jsx';
import LeaderboardPanel from '../hud/LeaderboardPanel.jsx';
import MembersPanel from '../hud/MembersPanel.jsx';
import ActionBar from '../hud/ActionBar.jsx';
import Inventory from '../hud/Inventory.jsx';
import Toasts from '../hud/Toasts.jsx';
import OnboardingModal from '../hud/OnboardingModal.jsx';
import AvatarCreator from '../avatar/AvatarCreator.jsx';

let toastId = 0;

const WEAPON_NAMES = { fists: 'Bare Hands', keyboard: 'Keyboard', stapler: 'Stapler', chair: 'Office Chair', monitor: 'Monitor' };
const weaponName = (w) => WEAPON_NAMES[w] || 'Bare Hands';

export default function GamePage() {
  const { id: workspaceId } = useParams();
  const navigate = useNavigate();
  const me = getStoredUser();

  const [ws, setWs] = useState(null);
  const [map, setMap] = useState(null);
  const [socket, setSocket] = useState(null);
  const [joined, setJoined] = useState(false);
  const [self, setSelf] = useState({ stress: 0, hp: 3, ko: false, rageUntil: 0, weapon: 'fists' });
  const [presence, setPresence] = useState({});
  const [toasts, setToasts] = useState([]);
  const [boardKey, setBoardKey] = useState(0);
  const [slot, setSlotState] = useState(1); // 1 weapon/hands · 2 extinguisher · 3 lighter
  const [sprint, setSprint] = useState({ stamina: 100, locked: false });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAvatarEditor, setShowAvatarEditor] = useState(false);
  const [fatal, setFatal] = useState('');
  const slotRef = useRef({ current: 1 });
  const socketRef = useRef(null);

  const selectSlot = useCallback((n) => {
    if (![1, 2, 3].includes(n)) return;
    slotRef.current.current = n;
    setSlotState(n);
    socketRef.current?.emit('slot', { slot: n });
  }, []);

  const pushToast = useCallback((text, kind = 'info', ttl = 4500) => {
    if (!text) return;
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ttl);
  }, []);

  const loadWorkspace = useCallback(() => {
    api(`/api/workspaces/${workspaceId}`).then(setWs).catch((err) => setFatal(err.message));
  }, [workspaceId]);

  // initial data: workspace, map, victim notifications (FR-5.4)
  useEffect(() => {
    loadWorkspace();
    api(`/api/workspaces/${workspaceId}/map`).then((d) => setMap(d.map)).catch((err) => setFatal(err.message));
    api(`/api/workspaces/${workspaceId}/notifications`)
      .then(({ notifications }) => {
        if (!notifications.length) return;
        notifications.forEach((n, i) => {
          if (n.type === 'desk_destroyed') {
            setTimeout(
              () => pushToast(`🪑💥 While you were away, ${n.payload.byName} completely annihilated your desk!`, 'victim', 7000),
              1200 + i * 800
            );
          }
        });
        api(`/api/workspaces/${workspaceId}/notifications/read`, {
          method: 'POST',
          body: { ids: notifications.map((n) => n.id) },
        }).catch(() => {});
      })
      .catch(() => {});
  }, [workspaceId, loadWorkspace, pushToast]);

  // onboarding for users without an avatar yet (S5-8)
  useEffect(() => {
    if (me && !me.avatar) setShowOnboarding(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // socket lifecycle
  useEffect(() => {
    const s = createSocket();
    setSocket(s);
    socketRef.current = s;

    s.on('connect_error', (err) => {
      if (err.message === 'Unauthorized') navigate('/login');
    });
    s.on('kicked', () => {
      pushToast('You were removed from this workspace by an admin.', 'error');
      setTimeout(() => navigate('/'), 1500);
    });
    s.on('leaderboard:dirty', () => setBoardKey((k) => k + 1));
    s.on('player:joined', (p) => setPresence((pr) => ({ ...pr, [p.userId]: p.afk ? 'afk' : 'online' })));
    s.on('player:left', ({ userId }) => setPresence((pr) => ({ ...pr, [userId]: 'offline' })));
    s.on('presence', ({ userId, status }) => setPresence((pr) => ({ ...pr, [userId]: status })));

    const meId = me?.id;
    s.on('stress:update', ({ userId, stress }) => {
      if (userId === meId) setSelf((v) => ({ ...v, stress }));
    });
    s.on('stress:batch', (updates) => {
      const mine = updates.find((u) => u.userId === meId);
      if (mine) setSelf((v) => ({ ...v, stress: mine.stress }));
    });
    s.on('rage:start', ({ userId, until }) => {
      if (userId === meId) {
        setSelf((v) => ({ ...v, rageUntil: until, stress: 0 }));
        pushToast('😡 RAGE MODE! +50% speed, one-punch KOs — 30 seconds!', 'error');
      }
    });
    s.on('rage:end', ({ userId }) => {
      if (userId === meId) setSelf((v) => ({ ...v, rageUntil: 0 }));
    });
    s.on('player:hit', ({ targetId, hp }) => {
      if (targetId === meId) setSelf((v) => ({ ...v, hp }));
    });
    s.on('player:ko', ({ userId, byName }) => {
      if (userId === meId) {
        setSelf((v) => ({ ...v, ko: true, hp: 0 }));
        pushToast(`💫 ${byName} knocked you out! Respawning at your desk in 5s…`, 'error', 5000);
      }
    });
    s.on('player:respawn', ({ userId, hp }) => {
      if (userId === meId) setSelf((v) => ({ ...v, ko: false, hp }));
    });
    s.on('equip', ({ userId, weapon }) => {
      if (userId === meId) {
        setSelf((v) => ({ ...v, weapon }));
        pushToast(`🤜 Picked up: ${weaponName(weapon)}`, 'info', 2500);
      }
    });
    s.on('combo', ({ userId }) => {
      if (userId === meId) pushToast('⛓️🔥 COMBO! Score multiplier x2 active!');
    });
    s.on('desk:destroyed', ({ victim, byName }) => {
      if (victim === meId) pushToast(`🪑💥 ${byName} just trashed your desk. Live. In front of everyone.`, 'victim', 6000);
    });
    s.on('meeting:logged', ({ userId }) => {
      if (userId === meId) pushToast('📅 Meeting logged. +10 stress. My condolences.', 'info', 2500);
    });

    return () => {
      s.disconnect();
      setSocket(null);
      socketRef.current = null;
    };
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const bridge = useMemo(
    () => ({
      slotRef: slotRef.current,
      onSlot: selectSlot,
      onStamina: (stamina, locked) => setSprint({ stamina, locked }),
      onError: (msg) => pushToast(msg, 'error'),
      onMembersChanged: () => loadWorkspace(),
      onJoined: (state) => {
        setJoined(true);
        const initial = {};
        for (const p of state.players) initial[p.userId] = p.afk ? 'afk' : 'online';
        setPresence(initial);
        const mine = state.players.find((p) => p.userId === me?.id);
        if (mine) {
          setSelf({
            stress: mine.stress, hp: mine.hp, ko: mine.state === 'ko',
            rageUntil: mine.rageUntil, weapon: mine.weapon || 'fists',
          });
          if (mine.activeSlot) { slotRef.current.current = mine.activeSlot; setSlotState(mine.activeSlot); }
        }
      },
    }),
    [pushToast, selectSlot, loadWorkspace, me?.id]
  );

  async function copyInvite() {
    const { token } = await api(`/api/workspaces/${workspaceId}/invites`, { method: 'POST' });
    const url = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast('🔗 Invite link copied! Valid for 48 hours.');
    } catch {
      pushToast(`Invite link: ${url}`, 'info', 10000);
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.displayName} from this workspace?`)) return;
    try {
      await api(`/api/workspaces/${workspaceId}/members/${member.userId}`, { method: 'DELETE' });
      pushToast(`${member.displayName} was escorted out of the building.`);
      loadWorkspace();
    } catch (err) {
      pushToast(err.message, 'error');
    }
  }

  if (fatal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="panel p-8 text-center">
          <p className="text-3xl mb-2">🚧</p>
          <p className="font-semibold mb-4">{fatal}</p>
          <Link to="/" className="btn-ghost">Back to hub</Link>
        </div>
      </div>
    );
  }

  const raging = self.rageUntil > Date.now();
  const ready = map && socket && me?.avatar && !showOnboarding;

  return (
    <div className="h-screen w-screen overflow-hidden relative select-none">
      {ready && (
        <ThreeGame map={map} socket={socket} meId={me.id} workspaceId={workspaceId} bridge={bridge} />
      )}
      {!ready && !showOnboarding && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">Loading the office…</div>
      )}

      {/* rage vignette (FR-3.5 visual FX) */}
      {raging && <div className="rage-overlay absolute inset-0 pointer-events-none z-30" />}

      {/* top bar */}
      <div className="absolute top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-chaos-dark/95 to-transparent pointer-events-none">
        <div className="flex items-center gap-4 pointer-events-auto">
          <Link to="/" className="font-black text-lg whitespace-nowrap">
            <span className="text-chaos-red">■</span> {ws?.workspace.name || 'OFFICE CHAOS'}
          </Link>
          <button className="btn-ghost text-sm" onClick={copyInvite}>🔗 Invite</button>
          <button className="btn-ghost text-sm" onClick={() => setShowAvatarEditor(true)}>🎨 Avatar</button>
        </div>
        <div className="flex items-center gap-5 pointer-events-auto">
          <HpHearts hp={self.hp} ko={self.ko} />
          <SprintMeter stamina={sprint.stamina} locked={sprint.locked} />
          <StressMeter stress={self.stress} rageUntil={self.rageUntil} />
        </div>
      </div>

      {/* right panel: dual leaderboard (FR-7.4) + members */}
      <div className="absolute top-16 right-3 z-40 flex flex-col gap-3">
        {ws && <LeaderboardPanel workspaceId={workspaceId} refreshKey={boardKey} />}
        {ws && (
          <MembersPanel
            members={ws.members}
            presence={presence}
            isAdmin={ws.you.role === 'admin'}
            meId={me?.id}
            onRemove={removeMember}
          />
        )}
      </div>

      {/* inventory: selectable tool slots (1 weapon · 2 extinguisher · 3 lighter) */}
      <div className="absolute bottom-3 left-3 z-40">
        <Inventory activeSlot={slot} onSelect={selectSlot} weapon={self.weapon} />
      </div>

      {/* bottom action bar */}
      <div className="absolute bottom-0 inset-x-0 z-40 flex justify-center pb-3 pointer-events-none">
        <div className="panel px-3 py-2 pointer-events-auto">
          <ActionBar
            onMeeting={() => socket?.emit('meeting:log', {}, (res) => res?.error && pushToast(res.error, 'error'))}
            onEmoji={(emoji) => socket?.emit('emoji', { emoji })}
          />
        </div>
      </div>

      <Toasts toasts={toasts} />

      {showOnboarding && (
        <OnboardingModal
          needsAvatar={!me?.avatar}
          onAvatarSaved={() => {}}
          onCopyInvite={copyInvite}
          onDone={() => {
            setShowOnboarding(false);
            window.location.reload(); // pick up the fresh avatar in the game scene
          }}
        />
      )}

      {showAvatarEditor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="panel p-6 max-w-2xl w-full my-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Edit your avatar</h2>
              <button className="btn-ghost text-sm" onClick={() => setShowAvatarEditor(false)}>✕</button>
            </div>
            <AvatarCreator
              initial={me?.avatar}
              onSaved={() => window.location.reload()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
