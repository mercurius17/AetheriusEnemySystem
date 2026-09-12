export class HostSpawnPersistence {
  constructor(adapter = null) { this.adapter = adapter; }

  get(identity) {
    if (!this.adapter || typeof this.adapter.getSpawnState !== 'function') return null;
    return this.adapter.getSpawnState(identity);
  }

  save(identity, state) {
    if (!this.adapter || typeof this.adapter.saveSpawnState !== 'function') throw new Error('host spawn persistence adapter is not bound');
    return this.adapter.saveSpawnState(identity, state);
  }
}
