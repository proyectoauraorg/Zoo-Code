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

	it("returns true when there are no workspace folders", () => {
		mockWorkspace.folders = []
		expect(isPathOutsideWorkspace(path.join(workspaceDir, "file.ts"))).toBe(true)
	})
})
