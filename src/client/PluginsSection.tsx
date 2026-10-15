import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Dot } from '../shared/types';
import type { InstalledPlugin } from '../shared/plugin-types';
import { api } from './api';

export function PluginsSection({
  dots,
  dotId,
}: {
  dots: Dot[];
  dotId?: string;
}) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void api<InstalledPlugin[]>('/plugins', 'GET', undefined, controller.signal)
      .then(setPlugins)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);
  const change = async (request: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await request();
      setPlugins(await api<InstalledPlugin[]>('/plugins'));
      setFolder('');
      setRemoving(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update plugins.');
    } finally {
      setBusy(false);
    }
  };
  const stay = (event: KeyboardEvent) => {
    if (event.key === 'Enter') event.preventDefault();
  };
  return (
    <fieldset className="plugin-library" disabled={busy} onKeyDown={stay}>
      <legend>Plugins</legend>
      <p className="muted">
        Package your skills and reference files together, then choose which Dots
        can use them. Changes save immediately.
      </p>
      {!dotId && (
        <div className="plugin-install">
          <label className="field-label" htmlFor="plugin-folder">
            Plugin folder on the server
          </label>
          <input
            id="plugin-folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="C:\My Plugins\sims-architect"
          />
          <button
            type="button"
            disabled={!folder.trim() || !loaded}
            onClick={() =>
              void change(() =>
                api('/plugins', 'POST', { path: folder.trim() }),
              )
            }
          >
            Install plugin
          </button>
          <p className="muted">
            Install a folder containing your skills and reference files.
            Packaged tool connections will be added in a later release.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="chat-error">
          {error}
        </p>
      )}
      {!loaded && !error && <p>Loading plugins…</p>}
      {loaded && !plugins.length && (
        <p className="muted">
          No plugins installed. Your standalone skills are still available.
        </p>
      )}
      {plugins.map((plugin) => (
        <section className="plugin-card" key={plugin.id}>
          <strong>{plugin.name}</strong> <small>{plugin.version}</small>
          <p>{plugin.description}</p>
          <p className="muted">{plugin.skills.map((s) => s.name).join(', ')}</p>
          {!dotId && (
            <label>
              <input
                type="checkbox"
                checked={plugin.enabled}
                onChange={(e) =>
                  void change(() =>
                    api(`/plugins/${plugin.id}`, 'PATCH', {
                      enabled: e.target.checked,
                    }),
                  )
                }
              />{' '}
              Enabled
            </label>
          )}
          {!plugin.enabled && <p className="muted">Disabled for all Dots.</p>}
          {(dotId ? dots.filter((dot) => dot.id === dotId) : dots).map(
            (dot) => (
              <label className="plugin-assignment" key={dot.id}>
                <input
                  type="checkbox"
                  checked={plugin.dotIds.includes(dot.id)}
                  onChange={(e) =>
                    void change(() =>
                      api(`/plugins/${plugin.id}/dots/${dot.id}`, 'PUT', {
                        assigned: e.target.checked,
                      }),
                    )
                  }
                />{' '}
                Use with {dot.name}
              </label>
            ),
          )}
          {!dotId &&
            (removing === plugin.id ? (
              <div>
                <p>
                  Remove this plugin and its Dot assignments? The original
                  folder will stay intact.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void change(() => api(`/plugins/${plugin.id}`, 'DELETE'))
                  }
                >
                  Remove plugin
                </button>{' '}
                <button type="button" onClick={() => setRemoving(undefined)}>
                  Keep plugin
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-button"
                onClick={() => setRemoving(plugin.id)}
              >
                Uninstall
              </button>
            ))}
        </section>
      ))}
    </fieldset>
  );
}
