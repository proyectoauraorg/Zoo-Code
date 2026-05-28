import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"

/** Narrow an unknown error to a Node errno exception with the given `code`. */
function isErrnoException(err: unknown, code: string): boolean {
	return err instanceof Error && (err as NodeJS.ErrnoException).code === code
}

/**
 * Resolves a path to its canonical form, following symlinks.
 *
 * If the path does not exist yet (e.g. a file that is about to be created), the
 * realpath of the nearest existing ancestor is resolved and the remaining
 * segments are re-appended. This ensures a symlink anywhere along the path is
 * still followed, while paths that don't exist yet can still be evaluated.
 *
 * Only `ENOENT` (a not-yet-existing segment) triggers the walk-up. Any other
 * error — e.g. `EACCES` on a symlink whose target has restricted permissions —
 * is re-thrown rather than swallowed: silently walking up would mask the symlink
 * and could let an out-of-workspace target look "inside". Callers performing a
 * security check are expected to fail closed on a thrown error. See issue #169.
 */
function realPathOrNearest(target: string): string {
	let current = path.resolve(target)
	const trailing: string[] = []

	// Walk up until an existing path can be resolved, bounded by the filesystem root.
	while (true) {
		try {
			const resolved = fs.realpathSync.native(current)
			return trailing.length > 0 ? path.join(resolved, ...trailing.reverse()) : resolved
		} catch (err) {
			if (!isErrnoException(err, "ENOENT")) {
				// Non-ENOENT (e.g. EACCES): don't mask it with a walk-up — propagate so the
				// caller's security check can fail closed instead of falling through to the
				// lexical path.
				throw err
			}
			const parent = path.dirname(current)
			if (parent === current) {
				// Reached the root without finding an existing path; fall back to the
				// lexically resolved path.
				return path.resolve(target)
			}
			trailing.push(path.basename(current))
			current = parent
		}
	}
}

/**
 * Checks if a file path is outside all workspace folders
 * @param filePath The file path to check
 * @returns true if the path is outside all workspace folders, false otherwise
 */
export function isPathOutsideWorkspace(
	filePath: string,
	options: { allowSymlinksOutsideWorkspace?: boolean } = {},
): boolean {
	// If there are no workspace folders, consider everything outside workspace for safety
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return true
	}

	// By default we resolve symlinks (not just "." / "..") so a symlink that lives
	// inside the workspace but points outside it is correctly treated as outside.
	// Without this, the out-of-workspace read protection was trivially bypassed by
	// symlinking to a file outside the workspace (#169).
	//
	// When the user opts in via `allowSymlinksOutsideWorkspace`, we compare lexical
	// paths instead (path.resolve, no symlink resolution) — restoring the pre-#169
	// behavior for those who deliberately rely on symlinks pointing outside.
	const resolvePath = options.allowSymlinksOutsideWorkspace ? (p: string) => path.resolve(p) : realPathOrNearest

	let absolutePath: string
	try {
		absolutePath = resolvePath(filePath)
	} catch {
		// Could not safely resolve the target (e.g. EACCES on a symlink). Fail closed:
		// treat it as outside the workspace rather than risk a false "inside".
		return true
	}

	// On case-insensitive filesystems (macOS APFS/HFS+, Windows) `realpath` may return a
	// different case than VS Code registered for the workspace folder, which would make a
	// path that is actually inside the workspace compare as "outside" (a false negative on
	// the security boundary). Normalize case before comparing on those platforms only.
	const caseInsensitive = process.platform === "darwin" || process.platform === "win32"
	const normalize = (p: string) => (caseInsensitive ? p.toLowerCase() : p)
	const target = normalize(absolutePath)

	// Check if the path is within any workspace folder
	return !vscode.workspace.workspaceFolders.some((folder) => {
		// Resolve the workspace folder too, in case it is itself reached via a symlink.
		let folderPath: string
		try {
			folderPath = resolvePath(folder.uri.fsPath)
		} catch {
			// Can't resolve this folder safely; it can't be used to prove containment.
			return false
		}
		// Path is inside a workspace if it equals the workspace path or is a subfolder
		const base = normalize(folderPath)
		return target === base || target.startsWith(base + path.sep)
	})
}
