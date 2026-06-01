# ZooDash v2 — Estrategia de pruebas y simulación

> Plano. No implementado. Objetivo: **validar v2 con datos/eventos sintéticos antes de
> conectar nada real** (sin tocar el repo upstream ni el fork). Los scripts de abajo están
> listos para materializarse bajo `sim/` cuando se ejecute v2.

## 1. Pirámide de pruebas

| Nivel | Qué | Herramienta | Dónde |
|---|---|---|---|
| **Unit** | mappers GraphQL, cálculo cycle-time/percentiles/Gini, parser discord, parser `merge-tree`, ranking difuso, projector (event→proyección), idempotencia | **vitest** (TS) + pytest (proyector/ingesta Python) | rápido, sin infra |
| **Contract** | validar JSON de GraphQL y de webhooks con **Zod** (degradar ante campos vacíos) | vitest + fixtures grabados | sin infra |
| **Integración** | webhook→NATS→projector→PG→Redis; lecturas `/api/*` con driver postgres | **testcontainers** o `compose.v2.example.yml` | infra efímera |
| **E2E** | vistas nuevas + Cmd-K + realtime (SSE invalida y refetch) | **Playwright** (solo localhost; gobernanza: nada de webs externas) | navegador headless |
| **Carga/latencia** | emitir N eventos/s y medir end-to-end (emit→SSE) p50/p95 < 30 s | generador propio + cliente SSE cronometrado | infra + simulación |
| **Paridad de datos** | dual-read SQLite vs Postgres devuelve lo mismo (migración) | script de comparación | infra |

**Gate v2** (además del gate v1 `tsc/eslint/vitest/build`): integración verde + simulación
de latencia bajo umbral + paridad de datos OK.

## 2. Arnés de simulación — visión

Tres simuladores, de menor a mayor fidelidad:

1. **Replay de snapshots reales** (cero infra, máxima fidelidad): toma el histórico que ya
   tenemos (`zSys/.context_sync` o la SQLite v1) y lo convierte en un **stream de eventos**
   diffeando polls consecutivos (reusa la lógica `pr_event` de v1). Sirve para probar el
   projector y las métricas con datos verídicos **sin** llamar a GitHub.
2. **Generador sintético** (parametrizable): inventa PRs/reviews/CI a una **tasa configurable**
   y los publica a NATS (o POST al receiver). Sirve para load/latencia y casos límite raros.
3. **Sembradores específicos**: repos git con conflictos controlados (para `merge-tree`) y
   líneas `discord.txt` falsas (para el panel Discord).

> Todos respetan la gobernanza: nada toca `Zoo-Code-Org/Zoo-Code`, ni el fork, ni hace scraping.

## 3. Simulador 1 — Replay de snapshots (Python, stdlib)

Reusa el diff de v1: dos polls → eventos. Convierte historia real en stream determinista.

```python
# sim/replay_snapshots.py  (PLANTILLA v2 — no ejecutar aún)
# Uso: python3 sim/replay_snapshots.py <dir_con_snapshots/*.json> [--emit nats|stdout] [--rate 5]
import json, sys, time, glob, hashlib

def kanban_column(state, rd, draft):   # espejo de v1 ingest/historian.py
    if state == "MERGED": return "Merged"
    if state == "CLOSED": return None
    if draft: return "Draft"
    if rd == "CHANGES_REQUESTED": return "Changes Requested"
    if rd == "APPROVED": return "Approved"
    return "Review"

def prs_of(snap):
    out = {}
    for it in snap.get("items", []):
        if it.get("kind") != "pr": continue
        m = it.get("meta", {}) or {}; ci = m.get("ci", {}) or {}
        out[int(it["id"])] = {
            "state": it.get("state",""), "rd": m.get("reviewDecision",""),
            "mergeable": m.get("mergeable","UNKNOWN"), "draft": bool(m.get("isDraft")),
            "ci": ci.get("state","none"), "title": it.get("title",""), "ts": it.get("ts","")}
    return out

def diff_events(prev, cur, ts):
    ev = []
    for n, c in cur.items():
        p = prev.get(n)
        if p is None: ev.append((n,"new",None,c["state"])); 
        else:
            if p["state"]!="MERGED" and c["state"]=="MERGED": ev.append((n,"merged",p["state"],"MERGED"))
            elif kanban_column(**colargs(p))!=kanban_column(**colargs(c)): ev.append((n,"state_change",None,None))
            if p["ci"]!="fail" and c["ci"]=="fail": ev.append((n,"ci_red",p["ci"],"fail"))
            if p["mergeable"]!="CONFLICTING" and c["mergeable"]=="CONFLICTING": ev.append((n,"conflict",None,"CONFLICTING"))
    return [{"event_id": f"sim:{n}:{k}:{ts}", "ts": ts, "type":"pr","action":k,
             "entity":{"kind":"pr","number":n}, "from":fr,"to":to} for (n,k,fr,to) in ev]

def colargs(d): return {"state": d["state"], "rd": d["rd"], "draft": d["draft"]}

def main():
    files = sorted(glob.glob(sys.argv[1]))
    prev = {}
    for f in files:
        snap = json.load(open(f)); ts = snap.get("fetched_at","")
        for e in diff_events(prev, prs_of(snap), ts):
            print(json.dumps(e, ensure_ascii=False))   # o publicar a NATS
        prev = prs_of(snap)

if __name__ == "__main__": main()
```

**Prueba que valida:** el projector consumiendo este stream debe reconstruir las mismas
proyecciones y `pr_event` que el historian v1 sobre los mismos snapshots (**paridad**).

## 4. Simulador 2 — Generador sintético + medición de latencia

Emite eventos a tasa fija y mide el end-to-end emit→SSE para verificar **<30s**.

```python
# sim/gen_events.py  (PLANTILLA v2 — requiere nats-py)
# Uso: python3 sim/gen_events.py --rate 10 --secs 60 --nats nats://localhost:4222
import asyncio, json, random, time, argparse
# import nats   # pip install nats-py

ACTIONS = ["opened","synchronize","review_submitted","ci_completed","closed","merged"]
async def main(a):
    # nc = await nats.connect(a.nats)
    end = time.time() + a.secs; n = 0
    while time.time() < end:
        n += 1
        num = random.randint(300, 420)
        ev = {"event_id": f"syn:{num}:{n}:{time.time_ns()}",
              "emit_ns": time.time_ns(),               # marca para medir latencia
              "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "type": "pr", "action": random.choice(ACTIONS),
              "entity": {"kind":"pr","number":num},
              "payload": {"state":"OPEN","mergeable":random.choice(["MERGEABLE","CONFLICTING"]),
                          "ci":{"state":random.choice(["pass","fail","pending"])}}}
        # await nc.publish(f"zoodash.gh.pr", json.dumps(ev).encode())
        print(json.dumps(ev))
        await asyncio.sleep(1.0 / a.rate)
    # await nc.drain()

if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("--rate",type=float,default=10)
    p.add_argument("--secs",type=int,default=60); p.add_argument("--nats",default="nats://localhost:4222")
    asyncio.run(main(p.parse_args()))
```

```js
// sim/sse_latency.mjs  (PLANTILLA v2) — cronometra emit_ns → recepción SSE
// Uso: node sim/sse_latency.mjs   (con el server v2 levantado y gen_events.py emitiendo)
import { EventSource } from "eventsource"; // o el nativo en Node 22+
const lat = [];
const es = new EventSource("http://localhost:3939/api/stream");
es.addEventListener("changed", (e) => {
  const { emit_ns } = JSON.parse(e.data);
  if (emit_ns) lat.push(Number(process.hrtime.bigint() ? Date.now()*1e6 - emit_ns : 0) / 1e6);
});
process.on("SIGINT", () => {
  lat.sort((a,b)=>a-b);
  const p=(q)=>lat[Math.floor(lat.length*q)]?.toFixed(0);
  console.log(`n=${lat.length} p50=${p(.5)}ms p95=${p(.95)}ms max=${Math.max(...lat).toFixed(0)}ms`);
  process.exit(0);
});
```

**Prueba que valida:** con `--rate 10` durante 60 s, **p95(emit→SSE) < 30 000 ms** (objetivo
real esperado: pocos segundos; ver presupuesto en ARCHITECTURE §4). También: el consumer del
projector no acumula lag (queda al día).

## 5. Simulador 3 — Conflictos git (para `merge-tree`)

```bash
# sim/seed_conflict.sh  (PLANTILLA v2) — crea un repo con conflicto controlado
set -e
d=$(mktemp -d); cd "$d"; git init -q
printf 'linea1\nlinea2\n' > f.txt; git add f.txt; git commit -qm base
git switch -qc feat; printf 'linea1\nFEAT\n' > f.txt; git commit -qam feat
git switch -qc main2 main 2>/dev/null || git switch -q main
printf 'linea1\nMAIN\n' > f.txt; git commit -qam main-change
echo "=== merge-tree (archivos en conflicto) ==="
git merge-tree --write-tree main feat || true   # o: git merge-tree $(git merge-base main feat) main feat
echo "repo de prueba: $d"
```

**Prueba que valida:** el parser de `merge-tree` extrae `f.txt` como archivo en conflicto; el
detector marca `conflict`/`conflict_file` correctamente; **`git status` del fork real sigue
limpio** (el sembrado ocurre en un dir temporal, jamás en `Zoo-Code-contrib`).

## 6. Simulador 4 — Discord intake

```python
# sim/gen_discord.py  (PLANTILLA v2) — líneas falsas estilo .context_inbox/discord.txt
import random, time
USERS=["zoo_dev","ana","marco","bot_ci"]; CH=["#general","#dev","#releases","#support"]
for _ in range(50):
    ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time()-random.randint(0,86400)))
    print(f"{ts}\t{random.choice(CH)}\t{random.choice(USERS)}\tmessage\tmensaje de prueba")
```

**Prueba que valida:** el historizador de Discord parsea estas líneas → `discord_activity`; los
agregados por canal/usuario cuadran con el conteo del fixture.

## 7. Pruebas unitarias clave (TS, vitest) — ejemplos a escribir

- `cycleTime.test.ts` — percentiles p50/p90 sobre PRs fixture con `created_at/merged_at` conocidos.
- `reviewLoad.test.ts` — conteo y balance (Gini) por reviewer.
- `projector.test.ts` — aplicar una secuencia de eventos → proyección esperada; **reaplicar →
  idempotente** (sin duplicados, mismo resultado).
- `mergeTreeParse.test.ts` — parsear salida de `merge-tree` → lista de paths.
- `search.test.ts` — ranking difuso (número exacto > prefijo de título > substring).
- `sseClient.test.ts` — `changed {entity}` → `invalidateQueries([entity])` (mock QueryClient).

## 8. Criterios de aceptación de la fase de pruebas/simulación

1. **Paridad:** projector(replay de snapshots) == historian v1 sobre los mismos datos.
2. **Latencia:** p95(emit→SSE) **< 30 s** (esperado ~segundos) con `--rate 10` 60 s.
3. **Idempotencia:** reprocesar el mismo `event_id` no duplica filas (event_log UNIQUE + upsert).
4. **No-daño:** tras toda la simulación, `git -C <fork>` y `.context_sync/` quedan **intactos**.
5. **Migración:** dual-read SQLite vs Postgres devuelve series/listas equivalentes.
6. **a11y/gate:** vistas nuevas pasan el gate v1 + axe 0 (desktop) como en v1.
