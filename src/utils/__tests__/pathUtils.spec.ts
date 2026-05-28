import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { isPathOutsideWorkspace } from "../pathUtils"

// Mutable workspaceFolders the mocked vscode module reads from.
const { mockWorkspace } = vi.hoisted(() => ({
	mockWorkspace: { folders: [] as Array<{ uri: { fsPath: string } }> },
}))

vi.mock("vscode", () => ({
	workspace: {
		get workspaceFolders() {
			return mockWorkspace.folders.length > 0 ? mockWorkspace.folders : undefined
		},
	},
}))

describe("isPathOutsideWorkspace", () => {
	let tmpRoot: string
	let workspaceDir: string
	let outsideDir: string

	beforeEach(() => {
		// realpath the tmp dir because macOS resolves /var -> /private/var
		tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "zoo-pathutils-")))
		workspaceDir = path.join(tmpRoot, "workspace")
		outsideDir = path.join(tmpRoot, "outside")
		fs.mkdirSync(workspaceDir)
		fs.mkdirSync(outsideDir)
		mockWorkspace.folders = [{ uri: { fsPath: workspaceDir } }]
	})

	afterEach(() => {
		mockWorkspace.folders = []
		fs.rmSync(tmpRoot, { recursive: true, force: true })
	})

	it("treats a real file inside the workspace as inside", () => {
		const inside = path.join(workspaceDir, "file.ts")
		fs.writeFileSync(inside, "x")
		expect(isPathOutsideWorkspace(inside)).toBe(false)
	})

	it("treats a real file outside the workspace as outside", () => {
		const outside = path.join(outsideDir, "secret.txt")
		fs.writeFileSync(outside, "secret")
		expect(isPathOutsideWorkspace(outside)).toBe(true)
	})

	it("treats a not-yet-existing file inside the workspace as inside", () => {
		// File about to be created — realpath of the parent (workspace) still resolves.
		expect(isPathOutsideWorkspace(path.join(workspaceDir, "new-file.ts"))).toBe(false)
	})

	it("treats a symlink inside the workspace that points outside as OUTSIDE (#169)", () => {
		const secret = path.join(outsideDir, "secret.txt")
		fs.writeFileSync(secret, "secret")
		const link = path.join(workspaceDir, "link-to-secret.txt")
		fs.symlinkSync(secret, link)

		// Lexically the link lives inside the workspace, but it resolves outside.
		expect(isPathOutsideWorkspace(link)).toBe(true)
	})

	it("treats a symlinked directory inside the workspace that points outside as OUTSIDE (#169)", () => {
		fs.writeFileSync(path.join(outsideDir, "deep.txt"), "secret")
		const linkDir = path.join(workspaceDir, "linked-dir")
		fs.symlinkSync(outsideDir, linkDir)

		expect(isPathOutsideWorkspace(path.join(linkDir, "deep.txt"))).toBe(true)
	})

	it("treats a not-yet-existing file under a symlinked ancestor directory as OUTSIDE (#169)", () => {
		// Intersection of the ENOENT walk-up and symlink resolution: linked-dir is a
		// symlink to outsideDir and the target file doesn't exist yet. The walk-up resolves
		// the symlinked ancestor and re-appends the basename, landing outside the workspace.
		const linkDir = path.join(workspaceDir, "linked-dir")
		fs.symlinkSync(outsideDir, linkDir)

		expect(isPathOutsideWorkspace(path.join(linkDir, "new-file.ts"))).toBe(true)
		// Opt-in (#246) keeps the lexical (inside) location and does not resolve the symlink.
		expect(isPathOutsideWorkspace(path.join(linkDir, "new-file.ts"), { allowSymlinksOutsideWorkspace: true })).toBe(
			false,
		)
	})

	it("allows a symlink pointing outside when allowSymlinksOutsideWorkspace is enabled (#246)", () => {
		const secret = path.join(outsideDir, "secret.txt")
		fs.writeFileSync(secret, "secret")
		const link = path.join(workspaceDir, "link-to-secret.txt")
		fs.symlinkSync(secret, link)

		// Default (secure, #169): the link resolves outside the workspace.
		expect(isPathOutsideWorkspace(link)).toBe(true)
		// Opt-in (#246): symlinks are not resolved, so the link's lexical location
		// (inside the workspace) wins and it is treated as inside.
		expect(isPathOutsideWorkspace(link, { allowSymlinksOutsideWorkspace: true })).toBe(false)
	})

	it("fails closed when symlink resolution throws a non-ENOENT error such as EACCES (#169)", () => {
		const restricted = path.join(workspaceDir, "restricted.txt")
		fs.writeFileSync(restricted, "x")

		// Simulate realpath failing with EACCES (e.g. a symlink whose target has
		// restricted permissions). The path lexically lives inside the workspace, but
		// an unresolvable symlink must be treated as outside, not silently allowed.
		const spy = vi.spyOn(fs.realpathSync, "native").mockImplementation(() => {
			const err: NodeJS.ErrnoException = new Error("permission denied")
			err.code = "EACCES"
			throw err
		})

		try {
			expect(isPathOutsideWorkspace(restricted)).toBe(true)
		} finally {
			spy.mockRestore()
		}
	})

	it("falls back to the lexical path when no ancestor resolves up to the root (#169)", () => {
		const inside = path.join(workspaceDir, "a", "b", "new-file.ts")

		// Force realpath to report ENOENT for every segment, so the walk-up reaches the
		// filesystem root without resolving anything and falls back to the lexical path.
		// Both the target and the workspace folder resolve lexically, so containment holds.
		const spy = vi.spyOn(fs.realpathSync, "native").mockImplementation(() => {
			const err: NodeJS.ErrnoException = new Error("no entry")
			err.code = "ENOENT"
			throw err
		})

		try {
			expect(isPathOutsideWorkspace(inside)).toBe(false)
		} finally {
			spy.mockRestore()
		}
	})

	it("treats a path as outside when the workspace folder itself cannot be resolved (#169)", () => {
		const inside = path.join(workspaceDir, "file.ts")
		fs.writeFileSync(inside, "x")

		// The target resolves fine, but realpath on the workspace folder throws EACCES.
		// A folder that can't be resolved can't prove containment, so we fail closed.
		const realNative = fs.realpathSync.native
		const spy = vi.spyOn(fs.realpathSync, "native").mockImplementation(((p: string) => {
			if (p === workspaceDir) {
				const err: NodeJS.ErrnoException = new Error("permission denied")
				err.code = "EACCES"
				throw err
			}
			return realNative(p)
		}) as typeof fs.realpathSync.native)

		try {
			expect(isPathOutsideWorkspace(inside)).toBe(true)
		} finally {
			spy.mockRestore()
		}
	})

	it("returns true when there are no workspace folders", () => {
		mockWorkspace.folders = []
		expect(isPathOutsideWorkspace(path.join(workspaceDir, "file.ts"))).toBe(true)
	})

	it("normalizes case on case-insensitive platforms so a differently-cased inside path is still inside (#241)", () => {
		const originalPlatform = process.platform
		Object.defineProperty(process, "platform", { value: "darwin", configurable: true })

		const inside = path.join(workspaceDir, "File.ts")
		fs.writeFileSync(inside, "x")

		// On case-insensitive macOS/Windows, realpath can return a different case for the
		// resolved file than VS Code registered for the workspace folder. Simulate that by
		// upper-casing the "workspace" segment only for the target file's resolution.
		const realNative = fs.realpathSync.native
		const spy = vi.spyOn(fs.realpathSync, "native").mockImplementation(((p: string) => {
			const resolved = realNative(p)
			return p === inside
				? resolved.replace(`${path.sep}workspace${path.sep}`, `${path.sep}WORKSPACE${path.sep}`)
				: resolved
		}) as typeof fs.realpathSync.native)

		try {
			// Without case normalization the case mismatch would wrongly report "outside".
			expect(isPathOutsideWorkspace(inside)).toBe(false)
		} finally {
			spy.mockRestore()
			Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
		}
	})
})
