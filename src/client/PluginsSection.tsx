import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Dot } from '../shared/types.js';
import type {
  InstalledPlugin,
  InstalledPluginToolService,
  PluginPreview,
} from '../shared/plugin-types.js';
import { api } from './api.js';

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
  const [updating, setUpdating] = useState<string>();
  const [updateFolder, setUpdateFolder] = useState('');
  const [preview, setPreview] = useState<PluginPreview | null>(null);
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});

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
      setUpdateFolder('');
      setRemoving(undefined);
      setUpdating(undefined);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update plugins.');
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async (path: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await api<PluginPreview>('/plugins/preview', 'POST', {
        path: path.trim(),
      });
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not preview plugin.');
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
        Package your skills, reference files, and MCP tool connections together,
        then choose which Dots can use them. Changes save immediately.
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
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              disabled={!folder.trim() || !loaded}
              onClick={() => void handlePreview(folder)}
            >
              Preview
            </button>
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
          </div>
          <p className="muted">
            Install a folder containing your skills, reference files, or
            declared MCP tool connections.
          </p>
        </div>
      )}

      {preview && (
        <section className="plugin-card plugin-preview-card">
          <h4>
            {preview.isUpdate ? 'Update Preview' : 'Install Preview'}:{' '}
            {preview.name} <small>{preview.version}</small>
          </h4>
          {preview.isUpdate && (
            <p className="muted">
              Updating currently installed version {preview.existingVersion}.
            </p>
          )}
          <p>{preview.description}</p>
          {preview.skills.length > 0 && (
            <div>
              <strong>Skills:</strong>
              <ul>
                {preview.skills.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong>:{' '}
                    {s.description || 'No description'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.services.length > 0 && (
            <div>
              <strong>Tool Services:</strong>
              <ul>
                {preview.services.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong> ({s.url})
                    {s.requiresToken && <em> (requires token)</em>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.requiredConfiguration.length > 0 && (
            <div className="preview-warnings">
              <strong>Configuration notes:</strong>
              <ul>
                {preview.requiredConfiguration.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
            <button
              type="button"
              onClick={() => {
                const targetPath = folder.trim() || updateFolder.trim();
                if (preview.isUpdate) {
                  const existingPlugin = plugins.find(
                    (p) => p.name === preview.name,
                  );
                  if (existingPlugin) {
                    void change(() =>
                      api(`/plugins/${existingPlugin.id}/update`, 'POST', {
                        path: targetPath,
                        expectedVersion: preview.version,
                        expectedFingerprint: preview.packageFingerprint,
                      }),
                    );
                  }
                } else {
                  void change(() =>
                    api('/plugins', 'POST', { path: targetPath }),
                  );
                }
              }}
            >
              {preview.isUpdate ? 'Confirm update' : 'Confirm install'}
            </button>
            <button type="button" onClick={() => setPreview(null)}>
              Dismiss preview
            </button>
          </div>
        </section>
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <strong>{plugin.name}</strong> <small>{plugin.version}</small>
          </div>
          <p>{plugin.description}</p>
          {plugin.skills.length > 0 && (
            <p className="muted">
              Skills: {plugin.skills.map((s) => s.name).join(', ')}
            </p>
          )}

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

          {plugin.services && plugin.services.length > 0 && (
            <div className="plugin-services-section">
              <h4>Packaged Tool Services</h4>
              {plugin.services.map((service) => {
                const tokenKey = `${plugin.id}:${service.name}`;
                return (
                  <div className="plugin-service-card" key={service.name}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{service.name}</strong>{' '}
                        <small className="muted">{service.url}</small>
                      </div>
                      {!dotId && (
                        <label>
                          <input
                            type="checkbox"
                            checked={service.enabled}
                            onChange={(e) =>
                              void change(() =>
                                api(
                                  `/plugins/${plugin.id}/services/${service.name}/config`,
                                  'POST',
                                  { enabled: e.target.checked },
                                ),
                              )
                            }
                          />{' '}
                          Service enabled
                        </label>
                      )}
                    </div>
                    {service.description && (
                      <p className="muted">{service.description}</p>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.8rem',
                        margin: '0.4rem 0',
                      }}
                    >
                      {service.requiresToken ? (
                        <span
                          className={
                            service.hasToken ? 'badge-success' : 'badge-warning'
                          }
                        >
                          {service.hasToken
                            ? 'Token configured'
                            : 'Token required'}
                        </span>
                      ) : (
                        <span className="muted">No token required</span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void change(() =>
                            api(
                              `/plugins/${plugin.id}/services/${service.name}/refresh`,
                              'POST',
                            ),
                          )
                        }
                      >
                        Refresh tools
                      </button>
                    </div>

                    {!dotId && (
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.4rem',
                          margin: '0.4rem 0',
                        }}
                      >
                        <input
                          type="password"
                          placeholder={
                            service.hasToken
                              ? 'Change bearer token…'
                              : 'Enter bearer token…'
                          }
                          value={tokenInputs[tokenKey] ?? ''}
                          onChange={(e) =>
                            setTokenInputs((prev) => ({
                              ...prev,
                              [tokenKey]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          disabled={!tokenInputs[tokenKey]?.trim()}
                          onClick={() => {
                            const val = tokenInputs[tokenKey]?.trim();
                            if (!val) return;
                            void change(async () => {
                              await api(
                                `/plugins/${plugin.id}/services/${service.name}/config`,
                                'POST',
                                { token: val },
                              );
                              setTokenInputs((prev) => ({
                                ...prev,
                                [tokenKey]: '',
                              }));
                            });
                          }}
                        >
                          Save token
                        </button>
                      </div>
                    )}

                    {service.error && (
                      <p className="chat-error" role="alert">
                        {service.error}
                      </p>
                    )}

                    {!service.tools.length && !service.error && (
                      <p className="muted">
                        No tools discovered yet. Refresh after configuring.
                      </p>
                    )}

                    {service.tools.length > 0 && (
                      <ul className="connection-tools">
                        {service.tools.map((tool) => {
                          const patchTool = async (patch: {
                            enabled?: boolean;
                            requiresApproval?: boolean;
                          }) => {
                            await change(() =>
                              api(
                                `/plugins/${plugin.id}/services/${service.name}/tools/${encodeURIComponent(tool.name)}`,
                                'PATCH',
                                patch,
                              ),
                            );
                          };
                          return (
                            <li key={tool.name}>
                              <label className="permission-row">
                                <input
                                  type="checkbox"
                                  checked={tool.enabled}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void patchTool({
                                      enabled: e.target.checked,
                                    })
                                  }
                                />
                                <span>
                                  <strong>
                                    {tool.title}{' '}
                                    {tool.readOnly && <em>read-only</em>}
                                  </strong>
                                  {tool.description && (
                                    <small>{tool.description}</small>
                                  )}
                                </span>
                              </label>
                              {tool.enabled && (
                                <label className="approval-toggle">
                                  <input
                                    type="checkbox"
                                    checked={tool.requiresApproval}
                                    disabled={busy}
                                    onChange={(e) =>
                                      void patchTool({
                                        requiresApproval: e.target.checked,
                                      })
                                    }
                                  />
                                  <span>Require owner approval</span>
                                </label>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!dotId && (
            <div
              style={{
                display: 'flex',
                gap: '0.6rem',
                marginTop: '0.8rem',
                alignItems: 'center',
              }}
            >
              {updating === plugin.id ? (
                <div style={{ display: 'grid', gap: '0.4rem', width: '100%' }}>
                  <input
                    value={updateFolder}
                    onChange={(e) => setUpdateFolder(e.target.value)}
                    placeholder="New folder path for update…"
                  />
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      disabled={!updateFolder.trim()}
                      onClick={() => void handlePreview(updateFolder)}
                    >
                      Preview update
                    </button>
                    <button
                      type="button"
                      disabled={!updateFolder.trim()}
                      onClick={() =>
                        void change(() =>
                          api(`/plugins/${plugin.id}/update`, 'POST', {
                            path: updateFolder.trim(),
                          }),
                        )
                      }
                    >
                      Apply update
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUpdating(undefined);
                        setUpdateFolder('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setUpdating(plugin.id)}
                >
                  Update from folder…
                </button>
              )}

              {removing === plugin.id ? (
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
              )}
            </div>
          )}
        </section>
      ))}
    </fieldset>
  );
}
