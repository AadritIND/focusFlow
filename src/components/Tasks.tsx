import { useMemo, useState } from 'react';
import { useRoom } from '../state/room';
import { todayKey } from '../lib/time';
import type { Task } from '../lib/types';
import { Check, Pencil, Plus, Trash } from './icons';
import { Empty } from './ui';

export function Tasks() {
  const room = useRoom();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [est, setEst] = useState(2);
  const [editing, setEditing] = useState<string | null>(null);

  const today = todayKey(room.meta.tz);

  const doneToday = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of room.sessions) {
      if (session.kind !== 'focus' || session.day !== today || !session.taskId) continue;
      map.set(session.taskId, (map.get(session.taskId) ?? 0) + 1);
    }
    return map;
  }, [room.sessions, today]);

  const open = room.doc.tasks.filter((task) => !task.done);
  const done = room.doc.tasks.filter((task) => task.done);

  const submit = () => {
    if (!text.trim()) return;
    room.addTask(text, est);
    setText('');
    setEst(2);
    setAdding(false);
  };

  const renderTask = (task: Task) => {
    const count = doneToday.get(task.id) ?? 0;
    const isEditing = editing === task.id;
    if (isEditing) {
      return (
        <form
          key={task.id}
          className="task"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const nextText = (form.elements.namedItem('text') as HTMLInputElement).value.trim();
            const nextEst = Number((form.elements.namedItem('est') as HTMLInputElement).value);
            if (nextText) room.updateTask(task.id, { text: nextText, est: nextEst });
            setEditing(null);
          }}
        >
          <input className="field sm" name="text" defaultValue={task.text} maxLength={120} autoFocus style={{ flex: 1 }} />
          <input
            className="field sm num"
            name="est"
            type="number"
            min={1}
            max={99}
            defaultValue={task.est}
            style={{ width: 58 }}
          />
          <button className="btn sm primary" type="submit">
            Save
          </button>
        </form>
      );
    }
    return (
      <div
        key={task.id}
        className={`task${task.done ? ' done' : ''}${room.doc.activeTaskId === task.id ? ' active' : ''}`}
      >
        <button
          className="check"
          onClick={() => room.updateTask(task.id, { done: !task.done })}
          aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
        >
          <Check size={12} />
        </button>
        <span className="text" onClick={() => room.selectTask(task.id)} title="Focus on this task">
          {task.text}
        </span>
        <span className="meta num" title="Focus sessions today against the estimate">
          {count}/{task.est}
        </span>
        <span className="tools">
          <button className="icon-btn" onClick={() => setEditing(task.id)} aria-label="Edit task">
            <Pencil size={14} />
          </button>
          <button className="icon-btn" onClick={() => room.removeTask(task.id)} aria-label="Delete task">
            <Trash size={14} />
          </button>
        </span>
      </div>
    );
  };

  return (
    <section className="panel" aria-label="Tasks">
      <div className="panel-head">
        <span className="label">
          Tasks <span className="muted">· {open.length} open</span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          {done.length ? (
            <button className="btn sm quiet" onClick={room.clearCompletedTasks}>
              Clear done
            </button>
          ) : null}
          <button className="btn sm" onClick={() => setAdding(true)}>
            <Plus size={14} />
            Add
          </button>
        </span>
      </div>
      <div className="panel-body" style={{ paddingTop: 10 }}>
        {adding ? (
          <form
            className="row"
            style={{ gap: 8, marginBottom: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              className="field"
              style={{ flex: 1 }}
              placeholder="What are you working on?"
              value={text}
              maxLength={120}
              autoFocus
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAdding(false);
              }}
            />
            <input
              className="field num"
              style={{ width: 64 }}
              type="number"
              min={1}
              max={99}
              value={est}
              onChange={(event) => setEst(Math.max(1, Math.min(99, Number(event.target.value) || 1)))}
              title="Estimated focus sessions"
            />
            <button className="btn primary" type="submit">
              Add
            </button>
          </form>
        ) : null}

        {room.doc.tasks.length === 0 ? (
          <Empty>
            No tasks yet. Add the next thing you are going to finish — it shows up on every device in the room.
          </Empty>
        ) : (
          <>
            {open.map(renderTask)}
            {done.length ? (
              <p className="label" style={{ margin: '14px 0 4px' }}>
                Done
              </p>
            ) : null}
            {done.map(renderTask)}
          </>
        )}

        {room.doc.tasks.some((task) => !task.done && !doneToday.get(task.id)) ? (
          <p className="tiny muted" style={{ marginTop: 12 }}>
            Tip: tap a task to make it the focus of this session — everyone in the room sees the same intention.
          </p>
        ) : null}
      </div>
    </section>
  );
}
