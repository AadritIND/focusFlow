import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../state/room';
import { forgetRoom } from '../lib/device';
import { fmtCountdown, relativeTime } from '../lib/time';
import { MODE_LABEL } from '../lib/types';
import { Logout, Pencil, People, Share } from './icons';
import { ConfirmDialog, CopyChip, useToast } from './ui';


const initials = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'FF';

export function Devices() {
  const room = useRoom();
  const navigate = useNavigate();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(room.me.name);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const shareUrl = `${window.location.origin}/r/${room.code}`;
  const online = room.members.filter((member) => room.onlineIds.has(member.deviceId));

  return (
    <section className="panel" aria-label="Devices in this room">
      <div className="panel-head">
        <span className="label">
          <People size={13} /> Devices in this room
        </span>
        <span className="chip">
          <span className="dot live" />
          {online.length} online
        </span>
      </div>
      <div className="panel-body" style={{ paddingTop: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <CopyChip value={room.code} label={room.code} onCopied={(ok) => toast(ok ? 'Room code copied' : 'Copy failed')} />
          <CopyChip
            value={shareUrl}
            label="Copy invite link"
            mono={false}
            onCopied={(ok) => toast(ok ? 'Invite link copied — open it on your other device' : 'Copy failed')}
          />
        </div>
        <p className="tiny muted" style={{ margin: '8px 0 12px' }}>
          Anyone with the code joins instantly — no account, no approval. This browser stays signed into the room
          forever, so opening it again lands you straight back here.
        </p>

        {room.members.map((member) => {
          const isMe = member.deviceId === room.me.deviceId;
          const isOnline = room.onlineIds.has(member.deviceId);
          const status = member.status;
          return (
            <div className="device" key={member.deviceId}>
              <span className={`avatar${isOnline ? ' online' : ''}`}>{initials(member.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="row" style={{ gap: 8 }}>
                  {isMe && renaming ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        room.renameDevice(draft);
                        setRenaming(false);
                        toast('Device renamed');
                      }}
                    >
                      <input
                        className="field sm"
                        value={draft}
                        maxLength={40}
                        autoFocus
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={() => setRenaming(false)}
                      />
                    </form>
                  ) : (
                    <>
                      <strong style={{ fontWeight: 550, fontSize: 14 }}>{member.name}</strong>
                      {isMe ? <span className="chip">This device</span> : null}
                      {isMe ? (
                        <button
                          className="icon-btn"
                          onClick={() => {
                            setDraft(member.name);
                            setRenaming(true);
                          }}
                          aria-label="Rename this device"
                        >
                          <Pencil size={13} />
                        </button>
                      ) : null}
                    </>
                  )}
                </span>
                <span className="tiny muted">
                  {status?.mode
                    ? `${MODE_LABEL[status.mode]}${status.running && status.endsAt ? ` · ${fmtCountdown(Math.max(0, status.endsAt - room.now))} left` : ' · paused'}${
                        status.task ? ` · ${status.task}` : ''
                      }`
                    : 'Idle'}{' '}
                  · seen {relativeTime(member.lastSeen, room.now)}
                </span>
              </span>
              <span className={`dot ${isOnline ? 'live' : ''}`} title={isOnline ? 'Online' : 'Away'} />
            </div>
          );
        })}

        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn sm" onClick={() => navigate('/')} title="Back to the home page">
            <Share size={14} />
            Home page
          </button>
          <button className="btn sm quiet danger" onClick={() => setConfirmLeave(true)}>
            <Logout size={14} />
            Leave room
          </button>
        </div>
      </div>

      {confirmLeave ? (
        <ConfirmDialog
          title="Leave this room?"
          body="Your sessions stay in the room's history for everyone else. This browser will forget the room and the next visit will ask for a code again."
          confirmLabel="Leave room"
          onClose={() => setConfirmLeave(false)}
          onConfirm={async () => {
            await room.leaveRoom();
            forgetRoom(room.code);
            toast('You left the room');
            navigate('/');
          }}
        />
      ) : null}
    </section>
  );
}
