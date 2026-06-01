# ZooDash V2.h — Event Store + Replay Engine Spec

> **Estado:** ✅ Implementado (v1.3.0 — 2026-05-30).
> **Autoridad:** Este documento define V2.h completo: Decision Log, Replay Engine,
> Alert Parity Checker y estrategia de migración. Suplementa
> [ARCHITECTURE.md](./ARCHITECTURE.md), [EVENT_MODEL_V1.md](./EVENT_MODEL_V1.md),
> [ROADMAP_AND_ADDENDA.md](./ROADMAP_AND_ADDENDA.md) y
> [REPLAY_DETERMINISM_CONTRACT.md](./REPLAY_DETERMINISM_CONTRACT.md).
>
> **Normativo:** Todo projector y el alerting engine DEBEN cumplir el
> [Replay Determinism Contract](./REPLAY_DETERMINISM_CONTRACT.md) (R1–R6).
> Violaciones son bugs bloqueantes.
>
> **Prerrequisito:** v1.2.1 (Conflict Trajectory Layer) — ya cerrado.

---

## 0. Contexto y tesis

v1.2.1 cerró la capa temporal:

```
event_log → lifecycle(state machine)
          → trajectory(time series model)
          → pressure function (scoring layer)
          → alerting (decision layer)
```

Esto es suficiente para que V2.h sea **trivial en lugar de riesgoso**. La pieza
que falta para "fully replayable temporal intelligence" es:

1. **Decision Log** — historial formal de qué se decidió y por qué
2. **Replay Engine** — reconstrucción determinista de todo el estado
3. **Parity Checker** — verificación de que live == replay

---

## 1. Decision Log Model

### 1.1 Tesis

El alerting engine hoy genera alertas, pero no registra **el contexto completo
de la decisión**. Para replay verificable necesitamos persistir:

- qué regla se activó
- qué datos del estado la activaron (snapshot)
- qué resultado produjo (alerta generada o no)

### 1.2 Schema

```sql
-- Decision log (V2.h) — trazabilidad de decisiones del alerting engine.
-- Cada fila = una evaluación de una regla contra el estado, con resultado.
CREATE TABLE IF NOT EXISTS decision_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id         TEXT NOT NULL,
    evaluated_at    TEXT NOT NULL,               -- ISO-8601 UTC
    entity_kind     TEXT,                        -- pr | issue | system | null
    entity_ref      TEXT,                        -- "388" | null
    state_snapshot   TEXT NOT NULL,               -- JSON: datos relevantes del estado
    pressure_snapshot TEXT,                       -- JSON: pressure_score + componentes (si aplica)
    threshold       TEXT NOT NULL,               -- JSON: regla evaluada
    triggered       INTEGER NOT NULL DEFAULT 0,  -- 1 = alerta generada, 0 = no
    alert_id        INTEGER,                     -- FK a alert.id si triggered=1
    dedupe_key      TEXT,                        -- clave de dedup si se generó
    message         TEXT,                        -- mensaje de la alerta (si triggered)
    UNIQUE(rule_id, entity_ref, evaluated_at)    -- idempotencia por evaluación
);
CREATE INDEX IF NOT EXISTS idx_decision_rule ON decision_log(rule_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_decision_entity ON decision_log(entity_kind, entity_ref);
CREATE INDEX IF NOT EXISTS idx_decision_triggered ON decision_log(triggered, evaluated_at DESC);
```

### 1.3 Contract

```typescript
// src/lib/alerting/decision-log.ts

export interface DecisionRecord {
  ruleId: string;
  evaluatedAt: string;
  entityKind: string | null;
  entityRef: string | null;
  stateSnapshot: Record<string, unknown>;
  pressureSnapshot: Record<string, unknown> | null;
  threshold: Record<string, number>;
  triggered: boolean;
  alertId: number | null;
  dedupeKey: string | null;
  message: string | null;
}

/** Registra una decisión en el decision_log. */
export function recordDecision(record: DecisionRecord): void;

/** Devuelve decisiones recientes (para auditoría). */
export function getRecentDecisions(limit?: number): DecisionRecord[];
```

### 1.4 Integración con alerting engine

El alerting engine actual ([`engine.ts`](src/lib/alerting/engine.ts)) se modifica
para registrar cada evaluación:

```typescript
// Pseudo-diff del alerting engine:
for (const rule of rules) {
  // ... evaluación existente ...
  for (const candidate of candidates) {
    const shouldAlert = !isInCooldown(db, rule.id, dedupeKey, ...);
    recordDecision({
      ruleId: rule.id,
      evaluatedAt: now,
      entityKind: "pr",
      entityRef: String(candidate.pr_number),
      stateSnapshot: { /* datos que activaron la regla */ },
      pressureSnapshot: rule.id === "conflict_pressure"
        ? { pressure: candidate.pressure_score, ... }
        : null,
      threshold,
      triggered: shouldAlert,
      alertId: shouldAlert ? lastInsertId : null,
      dedupeKey: shouldAlert ? dedupeKey : null,
      message: shouldAlert ? msg : null,
    });
  }
}
```

---

## 2. Replay Engine

### 2.1 Tesis

El replay engine reconstruye **todo el estado derivado** desde `event_log`.
Es la verificación de que las proyecciones son deterministas.

### 2.2 Pipeline de replay

```
replay(event_log, from?, to?)
  │
  ├─ 1. Limpiar proyecciones (DELETE)
  ├─ 2. Re-leer eventos del rango [from, to]
  ├─ 3. Para cada evento, en orden:
  │     ├─ projectConflictEvent → conflict_lifecycle
  │     ├─ projectConflictTrajectory → conflict_trajectory
  │     └─ (otros projectors según tipos)
  ├─ 4. Re-evaluar alerting engine → alert + decision_log
  └─ 5. Retornar: { events, decisions, alerts, parity }
```

### 2.3 Contract

```typescript
// src/lib/replay/engine.ts

export interface ReplayOptions {
  from?: string;           // ISO-8601, default: inicio del event_log
  to?: string;             // ISO-8601, default: ahora
  only?: "all" | "conflicts" | "contributors" | "metrics";
  intoTarget?: "live" | "shadow";  // shadow = tablas temporales _replay
  dryRun?: boolean;        // true = solo calcular, no persistir
}

export interface ReplayResult {
  eventsProcessed: number;
  decisionsRecorded: number;
  alertsGenerated: number;
  durationMs: number;
  parityCheck?: ParityResult;
}

export interface ParityResult {
  match: boolean;
  differences: ParityDiff[];
}

export interface ParityDiff {
  table: string;
  column: string;
  entityId: string;
  liveValue: unknown;
  replayValue: unknown;
}

/** Ejecuta replay completo desde event_log. */
export function executeReplay(options?: ReplayOptions): ReplayResult;
```

### 2.4 Implementación (esquema)

```typescript
export function executeReplay(options?: ReplayOptions): ReplayResult {
  const db = getDb();
  const start = Date.now();

  // 1. Determinar rango de eventos
  const events = readEventsInRange(db, options?.from, options?.to);

  // 2. Limpiar proyecciones target
  if (options?.intoTarget === "shadow") {
    createShadowTables(db);  // conflict_lifecycle_replay, etc.
  } else {
    clearProjections(db, options?.only);
  }

  // 3. Replay en orden
  let decisions = 0;
  for (const ev of events) {
    // Proyectar
    projectConflictEvent(ev);
    projectConflictTrajectory(ev);
    // ... otros projectors ...

    // Evaluar alerting después de cada evento relevante
    if (isAlertableEvent(ev)) {
      decisions += evaluateAlertRules().length;
    }
  }

  // 4. Parity check (si shadow mode)
  let parity: ParityResult | undefined;
  if (options?.intoTarget === "shadow") {
    parity = checkParity(db);
  }

  return {
    eventsProcessed: events.length,
    decisionsRecorded: decisions,
    alertsGenerated: countAlerts(db),
    durationMs: Date.now() - start,
    parityCheck: parity,
  };
}
```

### 2.5 Shadow mode (paridad sin destruir live)

Para verificación de paridad sin tocar el estado live:

```sql
-- Tablas shadow (temporales, solo para parity check)
CREATE TABLE conflict_lifecycle_replay AS SELECT * FROM conflict_lifecycle WHERE 0;
CREATE TABLE conflict_trajectory_replay AS SELECT * FROM conflict_trajectory WHERE 0;
CREATE TABLE alert_replay AS SELECT * FROM alert WHERE 0;
CREATE TABLE decision_log_replay AS SELECT * FROM decision_log WHERE 0;
```

El replay escribe en `_replay`, luego el parity checker compara.

---

## 3. Alert Parity Checker

### 3.1 Tesis

La paridad es la propiedad fundamental: `replay(event_log) == live_state`.
Si no hay paridad, el replay no es confiable y V2.h no puede cerrarse.

### 3.2 Invariantes a verificar

| Tabla | Invariante |
|---|---|
| `conflict_lifecycle` | Mismo número de filas, mismos estados, mismas duraciones |
| `conflict_trajectory` | Mismos pressure_scores, mismos streaks, mismos breaches |
| `alert` | Mismas alertas abiertas, mismos dedupe_keys |
| `decision_log` | Mismas decisiones triggered/not-triggered |

### 3.3 Contract

```typescript
// src/lib/replay/parity-checker.ts

export interface ParityResult {
  match: boolean;
  checked: number;       // filas comparadas
  differences: ParityDiff[];
  timestamp: string;
}

export interface ParityDiff {
  table: string;
  column: string;
  entityId: string;
  liveValue: unknown;
  replayValue: unknown;
}

/**
 * Compara tablas live vs _replay.
 * Retorna diferencias encontradas (vacío = paridad perfecta).
 */
export function checkParity(db: Database.Database): ParityResult;

/**
 * Ejecuta replay en shadow mode + parity check.
 * Atajo para: executeReplay({ intoTarget: "shadow" }) → checkParity()
 */
export function verifyReplayIntegrity(): ParityResult;
```

### 3.4 Dos niveles de paridad

El parity checker opera en **dos niveles** (ver [Determinism Contract §6](./REPLAY_DETERMINISM_CONTRACT.md#6-parity-levels)):

**Nivel 1 — Structural parity:** mismas filas, mismos estados.
**Nivel 2 — Semantic parity:** mismas decisiones, mismos scores, mismas alertas.

```typescript
export interface ParityResult {
  match: boolean;
  structural: { checked: number; differences: ParityDiff[] };
  semantic: { checked: number; differences: ParityDiff[] };
  timestamp: string;
}
```

### 3.5 Algoritmo de comparación

```typescript
export function checkParity(db: Database.Database): ParityResult {
  const structuralDiffs: ParityDiff[] = [];
  const semanticDiffs: ParityDiff[] = [];
  let structuralChecked = 0;
  let semanticChecked = 0;

  // ── Nivel 1: Structural ──

  // conflict_lifecycle: comparar por pr_number + aggregate_version
  const live = db.prepare("SELECT * FROM conflict_lifecycle").all();
  const replay = db.prepare("SELECT * FROM conflict_lifecycle_replay").all();
  const replayMap = new Map(replay.map(r => [`${r.pr_number}:${r.aggregate_version}`, r]));
  for (const row of live) {
    const key = `${row.pr_number}:${row.aggregate_version}`;
    const shadow = replayMap.get(key);
    structuralChecked++;
    if (!shadow) {
      structuralDiffs.push({ table: "conflict_lifecycle", column: "*", entityId: key,
                    liveValue: row, replayValue: null, level: "structural" });
    } else {
      for (const col of ["state", "duration_seconds", "detected_at", "resolved_at"]) {
        if (row[col] !== shadow[col]) {
          structuralDiffs.push({ table: "conflict_lifecycle", column: col, entityId: key,
                        liveValue: row[col], replayValue: shadow[col], level: "structural" });
        }
      }
    }
  }
  // conflict_trajectory: misma estructura
  // alert: misma estructura

  // ── Nivel 2: Semantic (decision parity) ──

  const liveDecisions = db.prepare(
    "SELECT * FROM decision_log ORDER BY rule_id, entity_ref, evaluated_at"
  ).all();
  const replayDecisions = db.prepare(
    "SELECT * FROM decision_log_replay ORDER BY rule_id, entity_ref, evaluated_at"
  ).all();
  const decisionMap = new Map(
    replayDecisions.map(d => [`${d.rule_id}:${d.entity_ref}:${d.evaluated_at}`, d])
  );
  for (const live of liveDecisions) {
    const key = `${live.rule_id}:${live.entity_ref}:${live.evaluated_at}`;
    const shadow = decisionMap.get(key);
    semanticChecked++;
    if (!shadow) {
      semanticDiffs.push({ table: "decision_log", column: "*", entityId: key,
                    liveValue: live, replayValue: null, level: "semantic" });
    } else {
      if (live.triggered !== shadow.triggered) {
        semanticDiffs.push({ table: "decision_log", column: "triggered", entityId: key,
                      liveValue: live.triggered, replayValue: shadow.triggered, level: "semantic" });
      }
      if (live.message !== shadow.message) {
        semanticDiffs.push({ table: "decision_log", column: "message", entityId: key,
                      liveValue: live.message, replayValue: shadow.message, level: "semantic" });
      }
    }
  }

  const allDiffs = [...structuralDiffs, ...semanticDiffs];
  return {
    match: allDiffs.length === 0,
    structural: { checked: structuralChecked, differences: structuralDiffs },
    semantic: { checked: semanticChecked, differences: semanticDiffs },
    timestamp: new Date().toISOString(),
  };
}
```

---

## 4. Migración v1.2.1 → V2.h

### 4.1 Principios

- **Zero downtime:** el sistema sigue funcionando durante la migración
- **Backward compatible:** las APIs existentes no cambian
- **Reversible:** cada paso puede revertirse sin pérdida de datos
- **Idempotente:** re-ejecutar la migración es seguro

### 4.2 Pasos de migración

```
PASO 1: Schema (sin breaking changes)
  └─ CREATE TABLE decision_log (si no existe)
  └─ CREATE INDEX ...
  └─ No toca tablas existentes

PASO 2: Correlation layer (migración event_log)
  └─ ALTER TABLE event_log ADD COLUMN correlation_id TEXT
  └─ ALTER TABLE event_log ADD COLUMN causation_id TEXT
  └─ CREATE INDEX idx_event_correlation
  └─ Backfill: generar correlation_id para eventos existentes

PASO 3: Endurecer projectors (Determinism Contract)
  └─ Verificar R1–R6 en conflict_lifecycle
  └─ Verificar R1–R6 en conflict_trajectory
  └─ Corregir alerting engine: aceptar `now` como parámetro
  └─ Orden de ejecución: lifecycle → trajectory → alerting

PASO 4: Instrumentar alerting engine
  └─ Modificar engine.ts para llamar recordDecision()
  └─ Backward compatible: si decision_log no existe, skip silencioso
  └─ Pasar `now` como parámetro (no usar datetime('now'))

PASO 5: Crear replay module
  └─ src/lib/replay/engine.ts
  └─ src/lib/replay/parity-checker.ts (structural + semantic)
  └─ No toca nada existente

PASO 6: Backfill decision_log
  └─ Script: re-evaluar alertas históricas contra event_log
  └─ Genera decision_log para el historial completo
  └─ Idempotente: DELETE + replay

PASO 7: Verificar paridad (dos niveles)
  └─ Ejecutar verifyReplayIntegrity() → structural parity
  └─ Ejecutar checkSemanticParity() → semantic parity
  └─ Si hay diferencias: diagnosticar y corregir projectors
  └─ Paridad = 100% (structural + semantic) antes de cerrar V2.h

PASO 8: Exponer CLI / endpoint
  └─ POST /api/replay  (admin only)
  └─ GET  /api/replay/status
```

### 4.3 Rollback

Cada paso es independiente:
- Paso 1: DROP TABLE decision_log
- Paso 2: DROP COLUMN correlation_id, causation_id (SQLite: recrear tabla)
- Paso 3: revert projectors a versión sin validación R1–R6
- Paso 4: revert alerting engine a versión sin recordDecision
- Paso 5: eliminar módulos replay/
- Paso 6: DELETE FROM decision_log

---

## 5. Decisiones de diseño (ADRs)

### ADR-V2H-1: Decision Log como tabla, no como evento

**Contexto:** Podríamos guardar decisiones como eventos en event_log.
**Decisión:** Tabla separada `decision_log`.
**Razón:** Las decisiones son **derivadas** del estado, no eventos primarios.
Generarlas como eventos contaminaría el event log con datos que pueden
recalcularse. El event_log es source of truth; decision_log es una proyección.

### ADR-V2H-2: Shadow mode para paridad

**Contexto:** Verificar paridad requiere comparar estado live vs replay.
**Decisión:** Tablas `_replay` temporales, no destruir live.
**Razón:** Permite verificar paridad sin downtime ni riesgo. Si hay divergencia,
el live no se afectó.

### ADR-V2H-3: Replay es función pura sobre event_log

**Contexto:** ¿Debería el replay leer de event_log o de snapshots?
**Decisión:** Siempre desde event_log.
**Razón:** event_log es el source of truth. Leer de snapshots introduciría
dependencia en estado que podría estar corrupto (justamente lo que replay
debería detectar y corregir).

### ADR-V2H-4: Parity check es obligatorio antes de cerrar V2.h

**Contexto:** ¿Cuándo consideramos V2.h "cerrado"?
**Decisión:** Cuando `verifyReplayIntegrity()` retorna `match: true`
en AMBOS niveles (structural + semantic) sobre el historial completo.
**Razón:** Sin paridad verificada, el replay no es confiable y toda la
cadena de determinismo se rompe. Structural sin semantic es insuficiente:
los datos pueden ser iguales pero las decisiones diferentes.

### ADR-V2H-5: Correlation layer para causalidad

**Contexto:** Eventos del mismo poll/batch pueden tener ts idéntico.
**Decisión:** Añadir `correlation_id` + `causation_id` a event_log.
**Razón:** Sin agrupamiento causal, el replay puede procesar eventos
en orden incorrecto dentro de un batch. Ver [Determinism Contract §5](./REPLAY_DETERMINISM_CONTRACT.md#5-causal-grouping-correlation-layer).

### ADR-V2H-6: Replay determinism contract es normativo

**Contexto:** ¿Cómo garantizamos que los projectors son deterministas?
**Decisión:** El [Replay Determinism Contract](./REPLAY_DETERMINISM_CONTRACT.md) (R1–R6)
es obligatorio. Violaciones son bugs bloqueantes.
**Razón:** Sin contrato formal, los projectors acumulan deuda de determinismo
silenciosamente. El contrato lo hace explícito y verificable.

---

## 6. Archivos a crear/modificar

### Nuevos

| Archivo | Propósito |
|---|---|
| `src/lib/alerting/decision-log.ts` | Decision log model + queries |
| `src/lib/replay/engine.ts` | Replay engine principal |
| `src/lib/replay/parity-checker.ts` | Comparación live vs replay (structural + semantic) |
| `src/lib/replay/index.ts` | Barrel exports |
| `src/app/api/replay/route.ts` | Endpoint admin para replay |
| `ingest/backfill_decision_log.py` | Backfill decision_log desde historial |
| `docs/v2/V2H_SPEC.md` | Este documento |
| `docs/v2/REPLAY_DETERMINISM_CONTRACT.md` | Contrato de determinismo (normativo) |
| `src/lib/__tests__/replay-determinism.test.ts` | Test suite de determinismo |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/lib/alerting/engine.ts` | Integrar `recordDecision()` + aceptar `now` como parámetro |
| `src/lib/db.ts` | Crear tabla decision_log si no existe (init) |
| `src/lib/events/types.ts` | Añadir `correlation_id` + `causation_id` a EventBase |
| `ingest/schema.sql` | Añadir CREATE TABLE decision_log + columnas correlation |

---

## 7. Criterios de aceptación

| # | Criterio | Verificación |
|---|---|---|
| 1 | decision_log se crea y persiste correctamente | INSERT + SELECT manual |
| 2 | Alerting engine registra decisiones | Ejecutar evaluateAlertRules(), verificar decision_log tiene filas |
| 3 | Replay reconstruye conflict_lifecycle idéntico | Parity check = match |
| 4 | Replay reconstruye conflict_trajectory idéntico | Parity check = match |
| 5 | Replay reconstruye alertas idénticas | Parity check = match |
| 6 | Shadow mode no afecta estado live | Ejecutar replay en shadow, verificar live intacto |
| 7 | Backfill genera decision_log para historial completo | Verificar conteo > 0 |
| 8 | Endpoint /api/replay funciona (admin) | POST + verificar resultado |
| 9 | Build + tests pasan | `pnpm build && pnpm test` |
| 10 | Documentación actualizada | Este spec + CHANGELOG |

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Paridad structural OK pero semantic FAIL | Alta | Alto | Verificar ambos niveles; alerting engine es el punto más sensible |
| Violación de Determinism Contract (R1–R6) | Media | Alto | Checklist obligatorio antes de cerrar; lint rules para detectar `Date.now()` |
| Correlation layer incompleto | Media | Medio | Orden de projectors mitiga; correlation_id es mejora, no bloqueante |
| Performance de replay sobre historial grande | Media | Bajo | Paginar eventos; SQLite es eficiente para <1M eventos |
| Alerting engine usa datetime('now') en replay | Alta | Alto | Pasar `now` como parámetro; verificar en parity check |
| decision_log crece mucho | Baja | Bajo | Retención: borrar decisiones >90 días con triggered=0 |

---

## 9. Ejecución recomendada

```
PASO 1 (schema)       → devops mode    (~5 min)
PASO 2 (correlation)  → code mode      (~20 min)
PASO 3 (endurecer)    → code mode      (~30 min)
PASO 4 (instrument)   → code mode      (~30 min)
PASO 5 (replay)       → code mode      (~1 hora)
PASO 6 (backfill)     → devops mode    (~15 min)
PASO 7 (parity)       → tester mode    (~30 min)
PASO 8 (endpoint)     → code mode      (~20 min)
```

**Total estimado:** ~3.5 horas de implementación.

---

## 10. Replay modes (ampliado)

| Modo | Destino | Destruye live | Uso |
|---|---|---|---|
| `live` | Proyecciones reales | **SÍ** | Recovery, migración, formula tuning |
| `shadow` | Tablas `_replay` | No | Parity check (structural + semantic) |
| `dry-run` | Nada (solo cálculo) | No | Estimación de impacto |

Sub-tipos de replay:

| Tipo | Reconstruye | Uso |
|---|---|---|
| `structural` | Solo tablas (lifecycle, trajectory) | Verificar projectors |
| `semantic` | Tablas + decisiones (alerting → decision_log) | Verificar sistema completo |

---

## 11. Post-V2.h: qué se desbloquea

Con V2.h cerrado (paridad structural + semantic verificada):

- **V2.i** (Conflict Tracker Fase B) puede construirse con confianza sobre replay
- **Time-travel debugging**: `replay(event_log, { to: "2026-05-15" })` → ver estado en el pasado
- **Formula tuning**: cambiar pesos de pressure function → replay → comparar alertas
- **Counterfactual replay**: "¿qué habría pasado si la regla X tuviera threshold Y?"
- **Audit trail**: decision_log permite responder "¿por qué se generó esta alerta?"
- **Recovery**: si una proyección se corrompe → replay → estado correcto
