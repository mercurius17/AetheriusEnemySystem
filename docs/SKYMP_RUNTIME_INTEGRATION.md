# Integração de runtime com o SkyMP

Este documento descreve como conectar o AetheriusEnemySystem ao fork do SkyMP para administrar spawn, morte e ciclo de geração das dungeons. O núcleo deste repositório permanece independente do host: o projeto definitivo de integração fornece os callbacks, a persistência e as operações concretas do servidor.

## Visão geral

```text
SkyMP
  |
  +-- jogador muda de célula
  |        |
  |        v
  |  DungeonLifecycleManager
  |        |
  |        v
  |  inicia ou reutiliza uma geração
  |        |
  |        v
  |  AetheriusEnemySystem resolve os inimigos
  |        |
  |        v
  |  SkyMP cria os atores e persiste o resultado
  |
  +-- onDeath(vítima, assassino)
           |
           v
     DeathBridge
           +-- atualiza o estado da dungeon
           +-- impede respawn automático dentro da mesma geração
           +-- publica evento para o AetheriusLevelingSystem
```

## 1. Inicialização

Ao iniciar o servidor, o módulo de integração deve carregar:

- catálogo de dungeons;
- catálogo de inimigos;
- resultados da análise das listas `LVLN`;
- regras de classificação e progressão;
- estado persistido das gerações;
- uma seed permanente e privada do servidor.

Também deve construir dois índices rápidos:

```ts
const cellToDungeon = new Map<CanonicalCellId, DungeonId>();
const runtimeActorToSpawn = new Map<RuntimeActorId, PersistedSpawn>();
```

Antes de aceitar jogadores, a integração deve confirmar que os snapshots de plugins, inimigos, listas e dungeons pertencem ao mesmo epoch do MO2. Deve verificar também a presença das autoridades configuradas e a igualdade da quantidade de plugins ativos entre os dois perfis. O sistema não deve persistir essa quantidade nem índices da load order.

Se uma autoridade, identidade ou referência crítica estiver indefinida, o conteúdo afetado deve permanecer bloqueado pelo comportamento fail-closed.

## 2. Identificação da dungeon

O fork já expõe `getActorCellOrWorld`, `getDescFromId` e `getIdFromDesc`. Uma primeira integração pode acompanhar periodicamente a célula dos jogadores conectados:

```ts
const actorId = mp.getUserActor(userId);
const runtimeCellId = mp.getActorCellOrWorld(actorId);
const canonicalCell = mp.getDescFromId(runtimeCellId);
const dungeonId = cellToDungeon.get(canonicalCell);
```

Quando o valor mudar, o host chama:

```ts
lifecycle.playerLeftDungeon(userId, previousDungeonId);
lifecycle.playerEnteredDungeon(userId, dungeonId);
```

Uma otimização futura pode adicionar ao fork um evento nativo `onCellChanged`, emitido apenas quando o servidor confirmar uma troca real de célula. Isso evita polling, mas não é necessário para o primeiro protótipo.

## 3. Estado e ciclo da dungeon

Cada dungeon possui uma geração compartilhada por todos os jogadores:

```ts
interface DungeonRuntimeState {
  dungeonId: string;
  generation: number;
  status: "DORMANT" | "ACTIVE" | "CLEARED" | "RESET_PENDING";
  playersInside: number[];
  liveSpawnIds: string[];
  deadSpawnIds: string[];
  resetAt: number | null;
}
```

O ciclo recomendado é:

```text
DORMANT
  | primeiro jogador entra
  v
ACTIVE
  | todos os inimigos gerenciados morrem
  v
CLEARED
  | tempo de reset terminou e não há jogadores dentro
  v
RESET_PENDING
  | remove atores, restaura loot e incrementa generation
  v
DORMANT
```

Regras multiplayer:

- jogadores na mesma dungeon compartilham a geração;
- um segundo jogador não provoca outro sorteio;
- sair, desconectar ou reconectar não reinicia a dungeon;
- abandonar a dungeon durante o combate não apaga seu estado;
- somente um reset confirmado incrementa `generation`;
- se ainda houver jogadores dentro, o reset é adiado;
- o loot original é restaurado somente na criação de uma nova geração ou em um reset explícito.

## 4. Resolução e criação de inimigos

Para cada ponto gerenciado, o host consulta o resolvedor server-authoritative:

```ts
const resolution = spawnResolver.resolve({
  spawnStableIdentity,
  generation: dungeon.generation,
  dungeonId,
  profile,
  families,
  roles,
  bossPolicy
});
```

Uma decisão persistida para o mesmo ponto e geração é reutilizada. Uma nova decisão usa os pesos derivados das listas originais; candidatos sem peso comprovado não recebem probabilidade uniforme inventada.

A identidade canônica escolhida é convertida para a load order atual somente na borda do host:

```ts
const runtimeBaseId = mp.getIdFromDesc(
  toSkyMpFormDesc(resolution.resolvedNpcStableIdentity)
);
```

O fork já permite criar um ator a partir de um NPC-base com `mp.place(baseId)`. Em seguida, o host aplica localização e ponto de respawn:

```ts
const actorId = mp.place(runtimeBaseId);

const location = {
  cellOrWorldDesc: canonicalCell,
  pos: spawn.position,
  rot: spawn.rotation
};

mp.set(actorId, "locationalData", location);
mp.set(actorId, "spawnPoint", location);
mp.set(actorId, "private.aetherius.spawnId", spawnStableIdentity);
mp.set(actorId, "private.aetherius.dungeonId", dungeonId);
mp.set(actorId, "private.aetherius.generation", dungeon.generation);
mp.set(actorId, "private.aetherius.enemyIdentity", resolution.resolvedNpcStableIdentity);
```

Como melhoria de produção, o fork pode expor `placeAt(baseId, location)`, construindo o ator diretamente na célula correta. Isso evita criar o ator inicialmente na origem de Tamriel antes do teleporte.

## 5. Referências originais

Os `ACHR` originais não podem permanecer ativos ao mesmo tempo que os atores gerados. Cada `ACHR` gerenciado funciona como identidade lógica e fonte do ponto de spawn.

A primeira implementação pode resolver o runtime FormID do `ACHR`, desativar a referência original e criar o ator dinâmico correspondente. Para produção, recomenda-se um filtro nativo antes da materialização:

```cpp
bool ShouldAttachPlacedNpc(FormDesc achr, FormDesc cell);
```

Quando a referência pertence a uma dungeon administrada, o SkyMP não materializa o NPC original. Isso evita duplicação ou uma aparição breve antes da desativação. NPCs únicos autorizados como bosses são criados explicitamente pelo sistema, sem colocá-los nos pools genéricos.

## 6. Morte e bloqueio do respawn automático

O fork publica `onDeath(actorId, killerId)`. Deve existir um único roteador para não sobrescrever handlers de outros sistemas:

```ts
mp.onDeath = (victimId: number, killerId: number) => {
  const spawn = runtimeActorToSpawn.get(victimId);

  if (!spawn) {
    return true; // comportamento original para um ator não gerenciado
  }

  const result = deathBridge.publish({
    victimId,
    killerId,
    enemy: spawn.enemyDescriptor,
    progressionContext: spawn.progressionContext,
    respawnGeneration: spawn.generation,
    deathGeneration: spawn.deathGeneration
  });

  if (!result.duplicate && result.errors.length === 0) {
    persistence.markDeadIfAlive(
      spawn.spawnStableIdentity,
      spawn.generation,
      result.event.eventId
    );
    lifecycle.enemyDied(spawn.dungeonId, spawn.spawnStableIdentity);
    levelingBridge.consume(result.event);
  }

  return false;
};
```

No SkyMP atual, uma morte aceita pelo gamemode executa `DeathEvent::OnFireSuccess` e agenda `RespawnWithDelay`. Para atores gerenciados, o handler retorna `false`: o inimigo permanece morto e somente o `DungeonLifecycleManager` pode substituí-lo em uma nova geração. Para atores não gerenciados, o handler retorna `true` e preserva o comportamento original.

O `killerId` igual a zero continua significando que não há assassino atribuível. A deduplicação usa uma identidade de evento derivada do spawn e das gerações, e não apenas do NPC-base.

## 7. Reset

Quando o reset for permitido, o host:

1. destrói os atores dinâmicos vivos ou mortos;
2. remove os runtime IDs dos índices transitórios;
3. incrementa `generation` de forma atômica;
4. restaura a composição original do loot;
5. muda a dungeon para `DORMANT`;
6. cria a próxima população quando um jogador entrar novamente.

```ts
for (const actorId of dungeon.runtimeActorIds) {
  mp.destroyActor(actorId);
}

const nextGeneration = await persistence.beginNextGeneration(dungeonId);

adapter.resetDungeon({
  dungeonId,
  generation: nextGeneration
});
```

O runtime actor ID pode mudar entre gerações e reinicializações do servidor. Ele nunca é a identidade persistente do spawn.

## 8. Persistência

O armazenamento permanente deve registrar pelo menos:

```ts
interface PersistedSpawn {
  spawnStableIdentity: string;
  dungeonId: string;
  generation: number;
  resolvedNpcStableIdentity: string;
  status: "ALIVE" | "DEAD";
  eventId?: string;
}
```

As operações críticas devem ser atômicas:

```ts
markDeadIfAlive(spawnId, generation, eventId);
beginNextGeneration(dungeonId);
```

Isso impede que dois relatos da mesma morte concedam XP duas vezes e evita que duas entradas simultâneas iniciem gerações diferentes.

## 9. Componentes do projeto definitivo de integração

Estrutura sugerida:

```text
integration/aetherius-enemy/
  bootstrap.ts
  SkyMpEnemyHost.ts
  SkyMpDeathRouter.ts
  DungeonLifecycleManager.ts
  DungeonOccupancyTracker.ts
  repositories/
    DungeonStateRepository.ts
    SpawnStateRepository.ts
```

O projeto deve ligar essas implementações às portas existentes em `src/adapters/skymp-adapter.mjs`, `src/persistence/spawn-state.mjs`, `src/events/event-hub.mjs` e `src/loot-integration/policy.mjs`.

## 10. Pré-requisito de dados

O catálogo global atual identifica 333 dungeons, mas o snapshot gerado precisa incorporar os pontos concretos de spawn. Cada dungeon deve conter seus `ACHR`, NPCs-base originais, posição, rotação, célula, papel e proveniência.

Enquanto `spawnRefs` estiver vazio, o ciclo pode reconhecer a entrada em uma dungeon, mas não sabe onde criar os inimigos. A captura houseCARL deve fechar essa associação antes da ativação do runtime.

## 11. Validação multiplayer

A integração deve ser validada com:

- NPCs fixos, dinâmicos e baseados em template;
- listas `LVLN` simples e aninhadas;
- bosses únicos e Dragon Priests;
- jogadores entrando simultaneamente na mesma dungeon;
- saída, desconexão, reconexão e reinício do servidor;
- mortes simultâneas e prevenção de eventos duplicados;
- reset e nova geração;
- equipamento, inventário, magias e efeitos dos NPCs criados;
- restauração de loot e containers esvaziados.

O runtime só deve ser considerado pronto quando os snapshots estiverem no mesmo epoch, as referências críticas estiverem resolvidas e essa matriz tiver sido executada no servidor real.
