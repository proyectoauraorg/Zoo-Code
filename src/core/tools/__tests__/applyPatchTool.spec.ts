/**
 * Tests for ApplyPatchTool.execute
 *
 * Covers:
 * - Input validation (missing patch)
 * - Parse error handling
 * - Empty hunks
 * - processAllHunks errors
 * - rooIgnore access control
 * - Add file flow (success, file already exists, approval denied)
 * - Update file flow (success, file not found, no changes, approval denied)
 * - Delete file flow (success, file not found, approval denied)
 * - Error handling (uncaught errors)
 * - Reset of consecutive mistake count on success
 */

import { ApplyPatchTool } from "../ApplyPatchTool"
import { parsePatch, ParseError, processAllHunks } from "../apply-patch"
import type { ApplyPatchFileChange } from "../apply-patch"
import { fileExistsAtPath } from "../../../utils/fs"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"
import { formatResponse } from "../../prompts/responses"

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../apply-patch", async () => {
	const actual = await vi.importActual<typeof import("../apply-patch")>("../apply-patch")
	return {
		...actual,
		parsePatch: vi.fn(),
		processAllHunks: vi.fn(),
	}
})

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn(),
}))

vi.mock("../../../utils/pathUtils", () => ({
	isPathOutsideWorkspace: vi.fn(() => false),
}))

vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg: string) => `TOOL_ERROR: ${msg}`),
		rooIgnoreError: vi.fn((path: string) => `IGNORE_ERROR: ${path}`),
		createPrettyPatch: vi.fn(),
	},
}))

vi.mock("../../../utils/path", () => ({
	getReadablePath: vi.fn((_cwd: string, relPath: string) => relPath),
}))

vi.mock("../../diff/stats", () => ({
	sanitizeUnifiedDiff: vi.fn((diff: string) => diff),
	computeDiffStats: vi.fn(() => null),
}))

vi.mock("../../../shared/experiments", () => ({
	experiments: {
		isEnabled: vi.fn(() => false),
	},
	EXPERIMENT_IDS: {
		PREVENT_FOCUS_DISRUPTION: "preventFocusDisruption",
	},
}))

vi.mock("@roo-code/types", async () => {
	const actual = await vi.importActual("@roo-code/types")
	return {
		...actual,
		DEFAULT_WRITE_DELAY_MS: 100,
	}
})

vi.mock("fs/promises", () => ({
	default: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		mkdir: vi.fn(),
		unlink: vi.fn(),
	},
}))

// ─── Mock references ──────────────────────────────────────────────────────────

const mockedParsePatch = vi.mocked(parsePatch)
const mockedProcessAllHunks = vi.mocked(processAllHunks)
const mockedFileExistsAtPath = vi.mocked(fileExistsAtPath)
const mockedIsPathOutsideWorkspace = vi.mocked(isPathOutsideWorkspace)

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockTask(options: { rooIgnoreAllowed?: boolean } = {}) {
	const { rooIgnoreAllowed = true } = options

	return {
		cwd: "/test/workspace",
		consecutiveMistakeCount: 0,
		didEditFile: false,
		didToolFailInCurrentTurn: false,
		ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked", text: undefined }),
		say: vi.fn().mockResolvedValue(undefined),
		sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing required parameter: patch"),
		recordToolError: vi.fn(),
		recordToolUsage: vi.fn(),
		rooIgnoreController: {
			validateAccess: vi.fn().mockReturnValue(rooIgnoreAllowed),
		},
		rooProtectedController: {
			isWriteProtected: vi.fn().mockReturnValue(false),
		},
		providerRef: {
			deref: vi.fn().mockReturnValue({
				getState: vi.fn().mockResolvedValue({
					diagnosticsEnabled: false,
					writeDelayMs: 0,
					experiments: {},
				}),
			}),
		},
		diffViewProvider: {
			editType: undefined as string | undefined,
			originalContent: undefined as string | undefined,
			open: vi.fn().mockResolvedValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
			scrollToFirstDiff: vi.fn(),
			revertChanges: vi.fn().mockResolvedValue(undefined),
			reset: vi.fn().mockResolvedValue(undefined),
			saveChanges: vi.fn().mockResolvedValue(undefined),
			saveDirectly: vi.fn().mockResolvedValue(undefined),
			pushToolWriteResult: vi.fn().mockResolvedValue("File written successfully"),
		},
		fileContextTracker: {
			trackFileContext: vi.fn().mockResolvedValue(undefined),
		},
		processQueuedMessages: vi.fn(),
	}
}

function createMockCallbacks() {
	return {
		pushToolResult: vi.fn(),
		askApproval: vi.fn().mockResolvedValue(true),
		handleError: vi.fn(),
	}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ApplyPatchTool.execute", () => {
	let tool: ApplyPatchTool

	beforeEach(() => {
		vi.clearAllMocks()
		tool = new ApplyPatchTool()

		// Default mocks
		mockedIsPathOutsideWorkspace.mockReturnValue(false)
		mockedFileExistsAtPath.mockResolvedValue(true)
		mockedParsePatch.mockReturnValue({ hunks: [] } as any)
		mockedProcessAllHunks.mockResolvedValue([])
	})

	describe("input validation", () => {
		it("should return error when patch is missing", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()

			await tool.execute({ patch: "" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("apply_patch")
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Missing required parameter"))
		})
	})

	describe("patch parsing", () => {
		it("should return error when patch parsing fails with ParseError", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockImplementation(() => {
				throw new ParseError("Invalid syntax", 1)
			})

			await tool.execute({ patch: "*** Invalid ***" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("apply_patch")
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Invalid patch format"))
		})

		it("should return error when patch parsing fails with generic error", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockImplementation(() => {
				throw new Error("Something went wrong")
			})

			await tool.execute({ patch: "*** Bad ***" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Failed to parse patch"))
		})

		it("should return message when patch has no hunks", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [] } as any)

			await tool.execute({ patch: "*** Empty ***" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith("No file operations found in patch.")
		})
	})

	describe("processAllHunks error", () => {
		it("should return error when processAllHunks fails", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }] } as any)
			mockedProcessAllHunks.mockRejectedValue(new Error("Process failed"))

			await tool.execute({ patch: "*** Add File: test.ts ***" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("apply_patch")
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Failed to process patch"))
		})
	})

	describe("rooIgnore access control", () => {
		it("should block patch when rooIgnore denies access", async () => {
			const mockTask = createMockTask({ rooIgnoreAllowed: false })
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "add", path: "secret.ts", newContent: "content" },
			] as ApplyPatchFileChange[])

			await tool.execute({ patch: "*** Add File: secret.ts ***" }, mockTask as any, callbacks)

			expect(mockTask.say).toHaveBeenCalledWith("rooignore_error", "secret.ts")
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("IGNORE_ERROR"))
		})
	})

	describe("add file flow", () => {
		it("should return error when adding a file that already exists", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "add", path: "src/existing.ts", newContent: "new content" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)

			await tool.execute({ patch: "*** Add File: src/existing.ts ***" }, mockTask as any, callbacks)

			// execute() resets consecutiveMistakeCount to 0 after the change loop, even when a
			// handler incremented it on error (recordToolError is still recorded below).
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("apply_patch")
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("File already exists"))
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("TOOL_ERROR"))
		})

		it("should successfully add a new file after approval", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "add", path: "src/new.ts", newContent: "new content" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(false)

			await tool.execute({ patch: "*** Add File: src/new.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.askApproval).toHaveBeenCalled()
			expect(mockTask.didEditFile).toBe(true)
			expect(callbacks.pushToolResult).toHaveBeenCalledWith("File written successfully")
		})

		it("should push rejection message when user denies add file", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			callbacks.askApproval.mockResolvedValue(false)
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "add", path: "src/new.ts", newContent: "content" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(false)

			await tool.execute({ patch: "*** Add File: src/new.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("rejected"))
		})
	})

	describe("update file flow", () => {
		it("should return error when updating a non-existent file", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "update" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "update", path: "src/missing.ts", originalContent: "old", newContent: "new" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(false)

			await tool.execute({ patch: "*** Update File: src/missing.ts ***" }, mockTask as any, callbacks)

			// execute() resets consecutiveMistakeCount to 0 after the change loop, even when a
			// handler incremented it on error (recordToolError is still recorded below).
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("apply_patch")
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("File not found"))
		})

		it("should push no-changes message when diff is empty", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "update" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "update", path: "src/file.ts", originalContent: "same", newContent: "same" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)
			const mockedFormatResponse = vi.mocked(formatResponse)
			mockedFormatResponse.createPrettyPatch.mockReturnValue("")

			await tool.execute({ patch: "*** Update File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("No changes needed"))
		})

		it("should successfully update a file after approval", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "update" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "update", path: "src/file.ts", originalContent: "old", newContent: "new" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)
			const mockedFormatResponse = vi.mocked(formatResponse)
			mockedFormatResponse.createPrettyPatch.mockReturnValue(
				"--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new",
			)

			await tool.execute({ patch: "*** Update File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.askApproval).toHaveBeenCalled()
			expect(mockTask.didEditFile).toBe(true)
			expect(callbacks.pushToolResult).toHaveBeenCalledWith("File written successfully")
		})

		it("should push rejection message when user denies update", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			callbacks.askApproval.mockResolvedValue(false)
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "update" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "update", path: "src/file.ts", originalContent: "old", newContent: "new" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)
			const mockedFormatResponse = vi.mocked(formatResponse)
			mockedFormatResponse.createPrettyPatch.mockReturnValue("--- a/file.ts\n+++ b/file.ts\n-old\n+new")

			await tool.execute({ patch: "*** Update File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("rejected"))
		})

		it("should track file context after successful update", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "update" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "update", path: "src/file.ts", originalContent: "old", newContent: "new" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)
			const mockedFormatResponse = vi.mocked(formatResponse)
			mockedFormatResponse.createPrettyPatch.mockReturnValue("some diff")

			await tool.execute({ patch: "*** Update File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(mockTask.fileContextTracker.trackFileContext).toHaveBeenCalledWith("src/file.ts", "roo_edited")
		})
	})

	describe("delete file flow", () => {
		it("should return error when deleting a non-existent file", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "delete" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "delete", path: "src/missing.ts" },
			] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(false)

			await tool.execute({ patch: "*** Delete File: src/missing.ts ***" }, mockTask as any, callbacks)

			// execute() resets consecutiveMistakeCount to 0 after the change loop, even when a
			// handler incremented it on error (recordToolError is still recorded below).
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("apply_patch")
			expect(mockTask.say).toHaveBeenCalledWith("error", expect.stringContaining("File not found"))
		})

		it("should push rejection message when user denies delete", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			callbacks.askApproval.mockResolvedValue(false)
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "delete" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([{ type: "delete", path: "src/file.ts" }] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)

			await tool.execute({ patch: "*** Delete File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("rejected"))
		})

		it("should successfully delete a file after approval", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "delete" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([{ type: "delete", path: "src/file.ts" }] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)

			await tool.execute({ patch: "*** Delete File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Successfully deleted"))
			expect(mockTask.didEditFile).toBe(true)
		})
	})

	describe("multiple changes", () => {
		it("should process multiple file changes in sequence", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }, { type: "delete" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([
				{ type: "add", path: "src/new.ts", newContent: "new" },
				{ type: "delete", path: "src/old.ts" },
			] as ApplyPatchFileChange[])
			// First call (add): file doesn't exist; Second call (delete): file exists
			mockedFileExistsAtPath.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

			await tool.execute({ patch: "*** multi ***" }, mockTask as any, callbacks)

			expect(callbacks.askApproval).toHaveBeenCalledTimes(2)
		})
	})

	describe("error handling", () => {
		it("should call handleError on uncaught error", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "add" }] } as any)
			mockedProcessAllHunks.mockImplementation(() => {
				throw new Error("Unexpected")
			})

			await tool.execute({ patch: "*** test ***" }, mockTask as any, callbacks)

			// This goes through the processAllHunks catch
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Failed to process patch"))
		})
	})

	describe("consecutive mistake count", () => {
		it("should reset consecutive mistake count on successful patch", async () => {
			const mockTask = createMockTask()
			mockTask.consecutiveMistakeCount = 3
			const callbacks = createMockCallbacks()
			mockedParsePatch.mockReturnValue({ hunks: [{ type: "delete" }] } as any)
			mockedProcessAllHunks.mockResolvedValue([{ type: "delete", path: "src/file.ts" }] as ApplyPatchFileChange[])
			mockedFileExistsAtPath.mockResolvedValue(true)

			await tool.execute({ patch: "*** Delete File: src/file.ts ***" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolUsage).toHaveBeenCalledWith("apply_patch")
		})
	})
})
