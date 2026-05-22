---
"zoo-code": patch
---

Resolve symlinks in the workspace-boundary check so a symlink inside the workspace that points outside is correctly treated as outside, closing a bypass of the out-of-workspace file protection (#169). Adds an opt-in `allowSymlinksOutsideWorkspace` setting (default off) for users who deliberately rely on symlinks that point outside the workspace.
