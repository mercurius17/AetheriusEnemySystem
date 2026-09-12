const CAPABILITY_FIELDS = Object.freeze(['stats', 'perks', 'spells', 'abilities', 'combatStyle', 'equipment', 'armorRating', 'weaponDamage', 'spellDamage', 'resistances', 'block', 'shouts', 'scriptedAbilities']);

export class EnemyCapabilityScanner {
  scan(enemies = []) {
    return enemies.map((enemy) => {
      const present = CAPABILITY_FIELDS.filter((field) => {
        const value = enemy[field] ?? enemy.capabilities?.[field];
        return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
      });
      return {
        stableEnemyIdentity: enemy.stableEnemyIdentity,
        sourcePlugin: enemy.sourcePlugin,
        present,
        status: enemy.runtimeCapabilitiesVerified ? 'SUPPORTED_SERVER_AUTHORITATIVE' : (present.length ? 'UNVERIFIED' : 'UNSUPPORTED_PENDING_REVIEW'),
        adapters: []
      };
    });
  }
}

export function buildCompatibilityMatrix(capabilities) {
  return {
    matrixVersion: 1,
    generatedFrom: 'record metadata and explicit adapter capabilities only',
    capabilities,
    statuses: ['SUPPORTED_SERVER_AUTHORITATIVE', 'SUPPORTED_CLIENT_BEHAVIOR', 'PARTIALLY_SUPPORTED', 'REQUIRES_ADAPTER', 'REQUIRES_SKYMP_PATCH', 'UNVERIFIED', 'UNSUPPORTED_PENDING_REVIEW']
  };
}
