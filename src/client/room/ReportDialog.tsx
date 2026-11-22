// Report a room, or a person in it (#21). Admins see reports, with the
// room's recent chat, on the platform settings page.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '../../shared/platform';
import { api, loadSession } from '../api';
import { Icon } from '../ui';

export function ReportDialog({ code, target, onClose }: { code: string; target: { userId: string; name: string; host?: boolean } | null; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const onCancel = () => onClose();
    d.addEventListener('close', onCancel);
    return () => d.removeEventListener('close', onCancel);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    setBusy(true); setError(null);
    try {
      await api(`/rooms/${code}/report`, { method: 'POST', token: loadSession()?.token, body: { reason, details, ...(target ? { userId: target.userId } : {}) } });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
    }
  };

  const title = target ? `Report ${target.name}` : 'Report this room';
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="report-title">
      <div className="dialog-head">
        <h2 id="report-title">{title}</h2>
        <button className="icon-btn" aria-label="Close" onClick={() => ref.current?.close()}><Icon name="close" /></button>
      </div>
      <div className="dialog-body">
        {done ? (
          <>
            <p>Thanks for telling us. An admin will look at it, with the room’s recent chat.</p>
            <p className="hint">{target && !target.host ? 'The room’s host can also remove someone straight away, from the People tab.' : 'You can leave the room at any time.'}</p>
            <div className="dialog-actions"><button className="btn primary" onClick={() => ref.current?.close()}>Close</button></div>
          </>
        ) : (
          <form onSubmit={submit} className="report-form">
            <fieldset>
              <legend>What’s wrong?</legend>
              {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
                <label key={r} className="report-reason"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {REPORT_REASONS[r]}</label>
              ))}
            </fieldset>
            <label className="field"><span>What happened (optional)</span>
              <textarea value={details} maxLength={REPORT_DETAILS_MAX} rows={4} onChange={(e) => setDetails(e.target.value)} />
            </label>
            <p className="hint">Only admins see reports. {target ? `${target.name} isn’t told who reported them.` : 'The host isn’t told who reported the room.'}</p>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
              <button className="btn primary" disabled={!reason || busy}>{busy ? 'Sending…' : 'Send the report'}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
