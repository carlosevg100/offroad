/** Immediate route feedback while the next server-rendered workspace surface is prepared. */
export default function WorkspaceLoading() {
  return (
    <main aria-busy="true" aria-label="Carregando workspace" className="app-canvas workspace-route-loading" role="status">
      <div className="workspace-route-loading__bar" />
      <header>
        <span />
        <strong />
        <p />
      </header>
      <section>
        <i /><i /><i />
      </section>
      <span className="sr-only">Carregando…</span>
    </main>
  );
}
