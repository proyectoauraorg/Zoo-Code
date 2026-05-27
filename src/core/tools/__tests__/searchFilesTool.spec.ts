/**
 * Tests for SearchFilesTool
 *
 * Covers:
 * - Input validation (missing path, missing regex)
 * - Successful search
 * - Approval flow (approve, deny)
 * - Workspace boundary detection
 * - handlePartial streaming
 * - Error handling
 */

import path from "path"

import { searchFilesTool, SearchFilesTool } from "../SearchFilesTool"
import { regexSearchFiles } from "../../../services/ripgrep"
import { isPathOutsideWorkspace } from "../../../utils/pathUtils"

vi.mock("path", async () => {
	const originalPath = await vi.importActual("path")
	return {
		default: originalPath,
		...originalPath,
		resolve: vi.fn().mockImplementation((...args: string[]) => args.join("/")),
	}
})

vi.mock("../../../services/ripgrep", () => ({
	regexSearchFiles: vi.fn(),
}))

vi.mock("../../../utils/pathUtils", () => ({
	isPathOutsideWorkspace: vi.fn(() => false),
}))

vi.mock("../../../utils/path", () => ({
	getReadablePath: vi.fn((_cwd: string, relPath: string) => relPath),
}))

const mockedRegexSearchFiles = vi.mocked(regexSearchFiles)
const mockedIsPathOutsideWorkspace = vi.mocked(isPathOutsideWorkspace)

function createMockTask(options: { rooIgnoreAllowed?: boolean; allowSymlinksOutsideWorkspace?: boolean } = {}) {
	const { rooIgnoreAllowed = true, allowSymlinksOutsideWorkspace = false } = options
	return {
		cwd: "/test/workspace",
		consecutiveMistakeCount: 0,
		didToolFailInCurrentTurn: false,
		ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked", text: undefined }),
		say: vi.fn().mockResolvedValue(undefined),
		sayAndCreateMissingParamError: vi
			.fn()
			.mockImplementation((_tool: string, param: string) =>
				Promise.resolve(`Missing required parameter: ${param}`),
			),
		recordToolError: vi.fn(),
		rooIgnoreController: { validateAccess: vi.fn().mockReturnValue(rooIgnoreAllowed) },
		providerRef: {
			deref: vi.fn().mockReturnValue({
				getState: vi.fn().mockResolvedValue({ allowSymlinksOutsideWorkspace }),
			}),
		},
	}
}

function createMockCallbacks() {
	return {
		pushToolResult: vi.fn(),
		askApproval: vi.fn().mockResolvedValue(true),
		handleError: vi.fn(),
	}
}

describe("SearchFilesTool", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockedRegexSearchFiles.mockResolvedValue("src/file.ts:1: matching line content")
		mockedIsPathOutsideWorkspace.mockReturnValue(false)
	})

	describe("input validation", () => {
		it("should return error when path is missing", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()

			await searchFilesTool.execute({ path: "", regex: "test" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_files")
			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("search_files", "path")
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Missing required parameter"))
		})

		it("should return error when regex is missing", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()

			await searchFilesTool.execute({ path: "src", regex: "" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("search_files")
			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("search_files", "regex")
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(expect.stringContaining("Missing required parameter"))
		})
	})

	describe("successful search", () => {
		it("should search files and return results", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			const searchResults = "src/file.ts:1: matching line content\nsrc/utils.ts:5: another match"
			mockedRegexSearchFiles.mockResolvedValue(searchResults)

			await searchFilesTool.execute({ path: "src", regex: "matching" }, mockTask as any, callbacks)

			// path.resolve is mocked to join args, so cwd + "src" = "/test/workspace/src"
			expect(mockedRegexSearchFiles).toHaveBeenCalledWith(
				"/test/workspace",
				"/test/workspace/src",
				"matching",
				undefined,
				mockTask.rooIgnoreController,
			)
			expect(callbacks.askApproval).toHaveBeenCalledWith("tool", expect.any(String))
			expect(callbacks.pushToolResult).toHaveBeenCalledWith(searchResults)
		})

		it("should pass file_pattern when provided", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()

			await searchFilesTool.execute(
				{ path: "src", regex: "test", file_pattern: "*.ts" },
				mockTask as any,
				callbacks,
			)

			// path.resolve is mocked to join args, so cwd + "src" = "/test/workspace/src"
			expect(mockedRegexSearchFiles).toHaveBeenCalledWith(
				"/test/workspace",
				"/test/workspace/src",
				"test",
				"*.ts",
				mockTask.rooIgnoreController,
			)
		})

		it("should send correct message payload with tool name searchFiles", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()

			await searchFilesTool.execute({ path: "src", regex: "test" }, mockTask as any, callbacks)

			const approvalCall = callbacks.askApproval.mock.calls[0]
			const message = JSON.parse(approvalCall[1])
			expect(message.tool).toBe("searchFiles")
			expect(message.path).toBe("src")
			expect(message.regex).toBe("test")
		})
	})

	describe("approval flow", () => {
		it("should push result when user approves", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			callbacks.askApproval.mockResolvedValue(true)
			mockedRegexSearchFiles.mockResolvedValue("found matches")

			await searchFilesTool.execute({ path: "src", regex: "test" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).toHaveBeenCalledWith("found matches")
		})

		it("should not push result when user denies", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			callbacks.askApproval.mockResolvedValue(false)

			await searchFilesTool.execute({ path: "src", regex: "test" }, mockTask as any, callbacks)

			expect(callbacks.pushToolResult).not.toHaveBeenCalled()
		})

		it("should reset consecutive mistake count on success", async () => {
			const mockTask = createMockTask()
			mockTask.consecutiveMistakeCount = 3
			const callbacks = createMockCallbacks()

			await searchFilesTool.execute({ path: "src", regex: "test" }, mockTask as any, callbacks)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
		})
	})

	describe("workspace boundary", () => {
		it("should detect paths outside workspace", async () => {
			mockedIsPathOutsideWorkspace.mockReturnValue(true)
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()

			await searchFilesTool.execute({ path: "../outside", regex: "test" }, mockTask as any, callbacks)

			const approvalCall = callbacks.askApproval.mock.calls[0]
			const message = JSON.parse(approvalCall[1])
			expect(message.isOutsideWorkspace).toBe(true)
		})
	})

	describe("error handling", () => {
		it("should handle regexSearchFiles errors gracefully", async () => {
			const mockTask = createMockTask()
			const callbacks = createMockCallbacks()
			mockedRegexSearchFiles.mockRejectedValue(new Error("ripgrep failed"))

			await searchFilesTool.execute({ path: "src", regex: "test" }, mockTask as any, callbacks)

			expect(callbacks.handleError).toHaveBeenCalledWith("searching files", expect.any(Error))
		})
	})

	describe("handlePartial", () => {
		it("should show partial message with path and regex", async () => {
			const mockTask = createMockTask()
			const tool = new SearchFilesTool()

			const block = {
				type: "tool_use" as const,
				name: "search_files" as const,
				params: { path: "src", regex: "test" },
				partial: true,
			}

			await tool.handlePartial(mockTask as any, block)

			expect(mockTask.ask).toHaveBeenCalledWith("tool", expect.any(String), true)
			const payload = JSON.parse(mockTask.ask.mock.calls[0][1])
			expect(payload.tool).toBe("searchFiles")
			expect(payload.path).toBe("src")
			expect(payload.regex).toBe("test")
		})

		it("should handle missing path and regex in partial", async () => {
			const mockTask = createMockTask()
			const tool = new SearchFilesTool()

			const block = {
				type: "tool_use" as const,
				name: "search_files" as const,
				params: {},
				partial: true,
			}

			await tool.handlePartial(mockTask as any, block)

			const payload = JSON.parse(mockTask.ask.mock.calls[0][1])
			expect(payload.tool).toBe("searchFiles")
			expect(payload.path).toBe("")
			expect(payload.regex).toBe("")
		})

		it("should include filePattern in partial message when provided", async () => {
			const mockTask = createMockTask()
			const tool = new SearchFilesTool()

			const block = {
				type: "tool_use" as const,
				name: "search_files" as const,
				params: { path: "src", regex: "test", file_pattern: "*.ts" },
				partial: true,
			}

			await tool.handlePartial(mockTask as any, block)

			const payload = JSON.parse(mockTask.ask.mock.calls[0][1])
			expect(payload.filePattern).toBe("*.ts")
		})
	})
})
