import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"

/**
 * Resolves a path to its canonical form, following symlinks.
 *
 * If the path does not exist yet (e.g. a file that is about to be created), the
 * realpath of the nearest existing ancestor is resolved and the remaining
 * segments are re-appended. This ensures a symlink anywhere along the path is
 * still followed, while paths that don't exist yet can still be evaluated.
 */
function realPathOrNearest(target: string): string {
	let current = path.resolve(target)
	const trailing: string[] = []

	// Walk up until an existing path can be resolved, bounded by the filesystem root.
	while (true) {
		try {
			const resolved = fs.realpathSync.native(current)
			return trailing.length > 0 ? path.join(resolved, ...trailing.reverse()) : resolved
		} catch {
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
export function isPathOutsideWorkspace(filePath: string): boolean {
	// If there are no workspace folders, consider everything outside workspace for safety
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return true
	}

	// Resolve symlinks (not just "." / "..") so a symlink that lives inside the
	// workspace but points outside it is correctly treated as outside. Without
	// this, the out-of-workspace read protection was trivially bypassed by
	// symlinking to a file outside the workspace. See issue #169.
	const absolutePath = realPathOrNearest(filePath)

	// Check if the path is within any workspace folder
	return !vscode.workspace.workspaceFolders.some((folder) => {
		// Resolve the workspace folder too, in case it is itself reached via a symlink.
		const folderPath = realPathOrNearest(folder.uri.fsPath)
		// Path is inside a workspace if it equals the workspace path or is a subfolder
		return absolutePath === folderPath || absolutePath.startsWith(folderPath + path.sep)
	})
}
