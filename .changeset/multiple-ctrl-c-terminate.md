---
"zoo-code": patch
---

Retry Ctrl+C when cancelling a task so processes that ignore a single SIGINT actually terminate (#266). The terminal abort path now re-sends Ctrl+C a bounded number of times, verifying between attempts whether the process exited, before the terminal is torn down. Follow-up to #245/#261; the ExecaTerminal backend is unaffected.
