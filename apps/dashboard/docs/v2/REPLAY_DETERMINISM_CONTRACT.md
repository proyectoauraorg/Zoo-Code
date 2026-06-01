# Replay Determinism Contract — ZooDash V2.h

> **Estado:** Normativo — obligatorio para todos los projectors y el alerting engine.
> **Autoridad:** Este contrato define las invariantes que garantizan que
> `replay(event_log) == live_state` siempre. Cualquier violación es un bug.

---

## 1. Tesis

Replay no es una feature. Es un **contrato de consistencia global**. Si un
projector viola cualquiera de estas reglas, el replay produce resultados
diferentes del live y todo el edificio de determinismo se derrumba.

---

## 2. Reglas de pureza (obligatorias para TODO projector)

### R1 — Sin acceso a clock global

```
PROHIBIDO:
  new Date()
  Date.now()
  datetime('now')          -- en SQL
  CURRENT_TIMESTAMP        -- en SQL
  datetime('now','utc')    -- en SQL

PERMITIDO:
  event.ts                 -- timestamp del evento
  last_seen_at de filas previas -- estado derivado del event_log
```

**Razón:** `Date.now()` varía entre ejecuciones. Si un projector usa "ahora",
dos replays del mismo event_log producirán resultados distintos.

### R2 — Sin randomness

```
PROHIBIDO:
  Math.random()
  uuid() sin semilla determinista
  cualquier fuente de entropía
```

### R3 — Sin queries fuera de event_log y proyecciones propias

```
PERMITIDO:
  SELECT ... FROM event_log WHERE ...
  SELECT ... FROM conflict_lifecycle WHERE ...    (proyección propia)
  SELECT ... FROM conflict_trajectory WHERE ...   (proyección propia)
  SELECT ... FROM projection_checkpoint WHERE ...

PROHIBIDO:
  SELECT ... FROM pr_snapshot WHERE ...           (otra proyección)
  SELECT ... FROM repo_metric WHERE ...           (otra proyección)
  SELECT ... FROM poll WHERE ...                  (estado de ingesta)
  llamadas HTTP, APIs externas
```

**Razón:** Si un projector depende de estado externo, el replay no puede
reproducirlo. Las dependencias cruzadas entre proyecciones rompen el
determinismo.

### R4 — Orden estricto por ts + aggregate_version

```
REGLA: los eventos SE PROCESAN en este orden:
  1. ts ASC (cronológico)
  2. id ASC (desempate estable)

NUNCA por:
  - event_id (texto, orden lexicográfico ≠ cronológico)
  - aggregate_version global (puede haber gaps entre entidades)
```

**Excepción:** `aggregate_version` es válido para ordenar **dentro de una
misma entidad** (mismo `entity_kind:entity_ref`), pero NO entre entidades.

### R5 — Idempotencia por event_id

```
REGLA: procesar el mismo evento N veces produce el mismo resultado.

IMPLEMENTACIÓN:
  - event_log.event_id es UNIQUE
  - INSERT OR IGNORE / ON CONFLICT DO NOTHING
  - o DELETE + replay completo (siempre produce el mismo resultado)
```

### R6 — Sin side effects fuera de la DB

```
PROHIBIDO durante replay:
  - enviar notificaciones (Apprise, Discord, etc.)
  - escribir archivos
  - emitir eventos al EventBus
  - logging que afecte flujo

PERMITIDO:
  - console.log / logger.info (solo observabilidad, no afecta estado)
  - escribir a la misma DB (proyecciones, decision_log)
```

---

## 3. Reglas específicas por componente

### 3.1 conflict_lifecycle projector

| Regla | Estado |
|---|---|
| R1 (no clock) | ✅ Usa `event.ts` para `detected_at` y `resolved_at` |
| R3 (no cross-query) | ⚠️ Solo lee `event_log`, no depende de otros projectors |
| R4 (orden) | ✅ Procesa en orden ts ASC |

### 3.2 conflict_trajectory projector

| Regla | Estado |
|---|---|
| R1 (no clock) | ✅ Usa `event.ts` y `last_seen_at` previo |
| R3 (no cross-query) | ⚠️ Lee `conflict_lifecycle` para `AVG(duration_seconds)` |

**VIOLACIÓN POTENCIAL:** [`conflict-trajectory.ts`](src/lib/projector/conflict-trajectory.ts:96)
usa `AVG(duration_seconds) FROM conflict_lifecycle`. Esto es una dependencia
cruzada. Si `conflict_lifecycle` cambia entre live y replay, el trajectory
diverge.

**MITIGACIÓN:** El replay DEBE ejecutar projectors en orden de dependencia:
1. conflict_lifecycle (primero)
2. conflict_trajectory (después, lee lifecycle ya actualizado)
3. alerting (último, lee ambos)

### 3.3 alerting engine

| Regla | Estado |
|---|---|
| R1 (no clock) | ⚠️ Usa `datetime('now')` en queries SQL |
| R3 (no cross-query) | Lee `conflict_lifecycle`, `conflict_trajectory`, `system_snapshot` |
| R6 (no side effects) | ⚠️ Genera notificaciones en modo live |

**MITIGACIÓN para R1:** En modo replay, el alerting engine DEBE recibir
`now` como parámetro (no usar `datetime('now')` del SQL).

**MITIGACIÓN para R6:** En modo replay, las notificaciones se deshabilitan.
Solo se escribe a `decision_log`.

---

## 4. Projection DAG (formal)

### 4.1 Grafo de dependencias

```
                ┌────────────────────┐
                │     event_log      │
                └─────────┬──────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌────────────────────┐        ┌────────────────────────┐
│ conflict_lifecycle │        │  issue / system proj   │
└─────────┬──────────┘        └─────────┬──────────────┘
          │                               │
          ▼                               ▼
┌────────────────────────┐     ┌────────────────────────┐
│ conflict_trajectory    │     │ contributor_metrics    │
└─────────┬──────────────┘     └─────────┬──────────────┘
          │                               │
          └───────────────┬───────────────┘
                          ▼
              ┌────────────────────┐
              │   alerting engine  │
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │   decision_log     │
              └────────────────────┘
```

### 4.2 IR formal (Projection Nodes)

```typescript
type ProjectionNode = {
  name: string;
  inputs: string[];
  dependsOn: string[];
  deterministic: true;
  sideEffects: "none" | "allowed(alerting)";
};

const PROJECTION_DAG: ProjectionNode[] = [
  {
    name: "conflict_lifecycle",
    inputs: ["event_log"],
    dependsOn: [],
    deterministic: true,
    sideEffects: "none"
  },
  {
    name: "conflict_trajectory",
    inputs: ["event_log", "conflict_lifecycle"],
    dependsOn: ["conflict_lifecycle"],
    deterministic: true,
    sideEffects: "none"
  },
  {
    name: "alerting",
    inputs: ["conflict_lifecycle", "conflict_trajectory"],
    dependsOn: ["conflict_trajectory"],
    deterministic: true,
    sideEffects: "allowed(alerting)"
  }
];
```

### 4.3 Regla de ejecución (topológica)

```
REGLA: los projectors se ejecutan en orden topológico del DAG.
Un projector SOLO puede leer nodos upstream (dependsOn).
NUNCA nodos del mismo nivel ni downstream.

Ejecución: topologicalSort(PROJECTION_DAG) → lifecycle → trajectory → alerting
```

**Razón:** Esto elimina race conditions semánticas, divergencia replay/live
y orden implícito frágil. El DAG es verificable estáticamente.

### 4.4 Replay isolation rule

```
REGLA: durante replay en shadow mode:
  - Las tablas _replay son un snapshot aislado
  - Ningún otro proceso lee _replay durante el replay
  - El alerting en replay NO genera side effects (notificaciones)
  - Las writes a decision_log_replay están en la misma transacción que las proyecciones
```

**Razón:** Sin aislamiento, un replay parcial puede contaminar lecturas concurrentes
o generar decisiones basadas en estado intermedio.

---

## 5. Causal grouping (correlation layer)

### 5.1 Problema

Un PR puede generar múlt eventos en el mismo poll:
- `pr.conflict` + `pr.state_changed` + `pr.ci_red`

Estos eventos están **causalmente relacionados** pero actualmente no tienen
vínculo formal. El alerting puede evaluarlos en orden incorrecto.

### 5.2 Solución: correlation_id

```typescript
// Extensión del EventBase:
export interface EventBase {
  event_id: string;
  schema_version: number;
  ts: string;
  source: "historian" | "backfill" | "manual";
  correlation_id: string;   // NUEVO: agrupa eventos del mismo poll/batch
  causation_id: string | null;  // NUEVO: qué evento causó este (null = root)
}
```

### 5.3 SQL

```sql
-- Migración: añadir columnas a event_log
ALTER TABLE event_log ADD COLUMN correlation_id TEXT;
ALTER TABLE event_log ADD COLUMN causation_id TEXT;
CREATE INDEX idx_event_correlation ON event_log(correlation_id);
```

### 5.4 Global ordering rule (CRÍTICO)

```
REGLA DE ORDEN TOTAL PARA REPLAY:

  ORDER BY:
    1. correlation_id ASC
    2. aggregate_version ASC
    3. event_id ASC  (tie-break determinista)

IMPLEMENTACIÓN:

  export function globalOrder(a: ZooEvent, b: ZooEvent): number {
    const corr = a.correlation_id.localeCompare(b.correlation_id);
    if (corr !== 0) return corr;
    const agg = a.aggregate_version - b.aggregate_version;
    if (agg !== 0) return agg;
    return a.event_id.localeCompare(b.event_id);
  }
```

**Razón:** Sin orden total formal, dos replays del mismo event_log pueden
procesar eventos en orden diferente cuando `ts` es idéntico (batch ingestion).
`event_id` como tie-break garantiza determinismo incluso con correlation_id nulos.

### 5.5 Replay isolation

```
REGLA: durante replay en shadow mode:
  - Las tablas _replay son un snapshot aislado (logical snapshot isolation)
  - Ningún otro proceso lee _replay durante el replay en curso
  - Las writes a _replay están en la misma transacción que las proyecciones
  - Si el replay se interrumpe, las tablas _replay se descartan (no parcial)
```

**Razón:** Sin aislamiento, un replay parcial puede contaminar lecturas
concurrentes o generar decisiones basadas en estado intermedio inconsistente.

---

## 6. Parity levels

### Nivel 1: Structural parity

Compara filas y columnas directamente:

```
conflict_lifecycle_live == conflict_lifecycle_replay  (mismas filas, mismos valores)
conflict_trajectory_live == conflict_trajectory_replay
alert_live == alert_replay
```

### Nivel 2: Semantic parity

Compara **decisiones**, no solo datos:

```
Para cada evaluación de regla en decision_log:
  - ¿Se activó la misma regla?
  - ¿Con los mismos datos de estado?
  - ¿Con el mismo resultado (triggered/not-triggered)?
  - ¿Con el mismo mensaje?
```

**IMPLEMENTACIÓN:**

```typescript
export function checkSemanticParity(db: Database.Database): ParityResult {
  const diffs: ParityDiff[] = [];

  // Comparar decision_log vs decision_log_replay
  const liveDecisions = db.prepare(
    "SELECT * FROM decision_log ORDER BY rule_id, entity_ref, evaluated_at"
  ).all();
  const replayDecisions = db.prepare(
    "SELECT * FROM decision_log_replay ORDER BY rule_id, entity_ref, evaluated_at"
  ).all();

  // Match por (rule_id, entity_ref, evaluated_at)
  const replayMap = new Map(
    replayDecisions.map(d => [`${d.rule_id}:${d.entity_ref}:${d.evaluated_at}`, d])
  );

  for (const live of liveDecisions) {
    const key = `${live.rule_id}:${live.entity_ref}:${live.evaluated_at}`;
    const replay = replayMap.get(key);

    if (!replay) {
      diffs.push({
        table: "decision_log", column: "*", entityId: key,
        liveValue: live, replayValue: null,
        level: "semantic",
      });
      continue;
    }

    // Comparar resultado de la decisión
    if (live.triggered !== replay.triggered) {
      diffs.push({
        table: "decision_log", column: "triggered", entityId: key,
        liveValue: live.triggered, replayValue: replay.triggered,
        level: "semantic",
      });
    }
    if (live.message !== replay.message) {
      diffs.push({
        table: "decision_log", column: "message", entityId: key,
        liveValue: live.message, replayValue: replay.message,
        level: "semantic",
      });
    }

    // Comparar pressure_snapshot (si existe)
    if (live.pressure_snapshot && replay.pressure_snapshot) {
      const livePressure = JSON.parse(live.pressure_snapshot);
      const replayPressure = JSON.parse(replay.pressure_snapshot);
      if (Math.abs(livePressure.pressure - replayPressure.pressure) > 0.001) {
        diffs.push({
          table: "decision_log", column: "pressure", entityId: key,
          liveValue: livePressure.pressure, replayValue: replayPressure.pressure,
          level: "semantic",
        });
      }
    }
  }

  return {
    match: diffs.length === 0,
    checked: liveDecisions.length,
    differences: diffs,
    timestamp: new Date().toISOString(),
  };
}
```

---

## 7. Replay modes

| Modo | Destino | Destruye live | Uso |
|---|---|---|---|
| `live` | Proyecciones reales | **SÍ** | Recovery, migración, formula tuning |
| `shadow` | Tablas `_replay` | No | Parity check, debugging |
| `dry-run` | Nada (solo cálculo) | No | Estimación de impacto |

### 7.1 Structural replay

Reconstruye solo el **estado** (tablas), sin evaluar decisiones:

```
event_log → lifecycle + trajectory → fin
```

**Uso:** verificar que projectors son deterministas.

### 7.2 Semantic replay

Reconstruye estado **Y** decisiones:

```
event_log → lifecycle + trajectory → alerting → decision_log
```

**Uso:** verificar que el sistema completo es determinista.
Este es el modo obligatorio para parity check.

---

## 8. Verificación automática (test suite)

```typescript
// src/lib/__tests__/replay-determinism.test.ts

describe("Replay Determinism Contract", () => {
  test("replay(idempotent): ejecutar dos veces produce mismo resultado", () => {
    const result1 = executeReplay({ intoTarget: "shadow" });
    const result2 = executeReplay({ intoTarget: "shadow" });
    expect(result1.eventsProcessed).toBe(result2.eventsProcessed);
    // Los resultados deben ser idénticos
  });

  test("structural parity: conflict_lifecycle coincide", () => {
    const parity = checkStructuralParity(db);
    expect(parity.match).toBe(true);
  });

  test("semantic parity: decisiones coinciden", () => {
    const parity = checkSemanticParity(db);
    expect(parity.match).toBe(true);
  });

  test("projectors no usan Date.now()", () => {
    // Análisis estático: buscar Date.now() en projectors
    // Esto debería ser un lint rule, no un test runtime
  });
});
```

---

## 9. Determinism linting (estático)

### 9.1 Reglas de lint

El código de projectors y alerting engine DEBE pasar estas reglas estáticas:

```yaml
# .eslintrc-rules/determinism.yml (conceptual)

no-restricted-globals:
  - error
  - name: Date
    message: "Prohibido en projectors. Usa event.ts o parámetro now."

no-restricted-syntax:
  - error
  - selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']"
    message: "Math.random() prohibido en projectors."
  - selector: "NewExpression[callee.name='Date']"
    message: "new Date() prohibido en projectors. Usa event.ts."
  - selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']"
    message: "Date.now() prohibido en projectors. Usa event.ts."

no-restricted-imports:
  - error
  - patterns:
      - group: ["fs", "fs/*"]
        message: "File I/O prohibido en projectors durante replay."
```

### 9.2 Scope de aplicación

| Archivo | Lint obligatorio |
|---|---|
| `src/lib/projector/*.ts` | Sí (R1, R2, R3, R6) |
| `src/lib/alerting/engine.ts` | Sí (R1 con parámetro `now`, R6 en modo replay) |
| `src/lib/replay/*.ts` | Sí (R4, R5) |
| `src/lib/alerting/decision-log.ts` | Sí (R1, R6) |

---

## 10. Audit de riesgos semánticos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **Hidden non-determinism en alerting** (usa time implícito) | Alta | Alto | `now` como parámetro obligatorio |
| 2 | **Projection dependency drift** (reorder de projectors) | Media | Alto | DAG formal + topological execution |
| 3 | **Partial replay inconsistency** (replay subset rompe downstream) | Media | Alto | Replay siempre full DAG slice |
| 4 | **Silent schema evolution** (event_log evoluciona sin versioning) | Media | Medio | `correlation_id` + `causation_id` + `schema_version` obligatorio |
| 5 | **Dual-write drift** (alert generado pero decision_log falla) | Baja | Alto | Single transaction boundary |
| 6 | **Semantic parity false positive** (structural OK pero lógica distinta) | Media | Alto | Comparar `triggered` + `message` + `threshold inputs` |
| 7 | **Replay non-isolated side effects** (alerting ejecuta notificaciones reales) | Baja | Alto | `replay mode = side-effect disabled` |

---

## 11. Checklist de cierre V2.h

Antes de marcar V2.h como cerrado:

- [ ] Todo projector pasa R1–R6
- [ ] Alerting engine acepta `now` como parámetro
- [ ] Projection DAG formal definido y ejecutado topológicamente
- [ ] Global ordering rule implementada (correlation → aggregate_version → event_id)
- [ ] Replay isolation rule verificada (shadow mode no contamina live)
- [ ] Determinism linting pasa (sin Date.now(), Math.random(), fs I/O en projectors)
- [ ] Correlation layer implementado (o mitigado con orden de projectors)
- [ ] Structural parity = 100%
- [ ] Semantic parity = 100%
- [ ] Test de idempotencia pasa
- [ ] Los 7 riesgos semánticos tienen mitigación verificada
- [ ] Replay determinism test suite pasa
- [ ] Documentación actualizada
