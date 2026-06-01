# Deploy — scheduling del historian (macOS launchd)

El dashboard necesita que el **historian** corra periódicamente para construir las
series temporales (tendencias, aging, merged-esta-semana). En macOS se programa con
**launchd**.

## Instalar

```bash
cp deploy/launchd/com.zoodash.historian.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.zoodash.historian.plist 2>/dev/null || true
launchctl load -w ~/Library/LaunchAgents/com.zoodash.historian.plist
```

- Corre `python3 ingest/historian.py` **cada 15 min** (`StartInterval=900`) y una vez al
  cargar (`RunAtLoad`). Append idempotente: si el `fetched_at` no cambió, no duplica filas.
- Log en `/tmp/zoodash-historian.log`.
- **Sin `--notify`** a propósito (evita re-alertar PRs stale en cada poll). Para
  notificaciones, corre `python3 ingest/historian.py --notify` a mano o crea un job aparte
  con menor frecuencia.

## Verificar

```bash
launchctl list | grep zoodash
tail -f /tmp/zoodash-historian.log
sqlite3 data/control-plane.db "SELECT COUNT(*) FROM poll;"   # debe crecer con el tiempo
```

## Quitar

```bash
launchctl unload ~/Library/LaunchAgents/com.zoodash.historian.plist
rm ~/Library/LaunchAgents/com.zoodash.historian.plist
```

> El runtime Context-Sync ya regenera `github.json` por su cuenta; el historian solo lee el
> último snapshot y lo historiza. Ajusta `StartInterval` si quieres más/menos resolución.
