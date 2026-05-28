// npx vitest run core/webview/__tests__/webviewMessageHandler.getHistoryPage.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/mock/workspace" } }],
	},
}))

vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	readdir: vi.fn().mockResolvedValue([]),
	readFile: vi.fn().mockResolvedValue("[]"),
	writeFile: vi.fn().mockResolvedValue(undefined),
	unlink: vi.fn().mockResolvedValue(undefined),
	rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../utils/storage", () => ({
	getStorageBasePath: vi.fn().mockImplementation((defaultPath: string) => defaultPath),
}))

vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../../i18n", () => ({
	t: vi.fn((key: string) => key),
}))

import { webviewMessageHandler } from "../webviewMessageHandler"
import type { ClineProvider } from "../ClineProvider"
import type { HistoryItem } from "@roo-code/types"

function makeHistoryItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
	return {
		id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
		number: 1,
		ts: Date.now(),
		task: "Test task",
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.01,
		workspace: "/mock/workspace",
		...overrides,
	}
}

describe("webviewMessageHandler - getHistoryPage", () => {
	let mockProvider: {
		taskHistoryStore: {
			getPaginated: ReturnType<typeof vi.fn>
		}
		getCurrentTask: ReturnType<typeof vi.fn>
		postMessageToWebview: ReturnType<typeof vi.fn>
		cwd: string
	}

	beforeEach(() => {
		vi.clearAllMocks()

		mockProvider = {
			taskHistoryStore: {
				getPaginated: vi.fn(),
			},
			getCurrentTask: vi.fn().mockReturnValue({ cwd: "/mock/workspace" }),
			postMessageToWebview: vi.fn(),
			cwd: "/mock/workspace",
		}
	})

	it("calls getPaginated with correct defaults and posts historyPageResponse", async () => {
		const items = [makeHistoryItem({ id: "t1", ts: 1000 })]
		mockProvider.taskHistoryStore.getPaginated.mockReturnValue({
			items,
			nextCursor: undefined,
			hasMore: false,
		})

		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "getHistoryPage",
			requestId: "req-1",
		})

		expect(mockProvider.taskHistoryStore.getPaginated).toHaveBeenCalledWith({
			sortOption: "newest",
			workspace: "/mock/workspace",
			cursor: undefined,
			pageSize: 50,
		})

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "historyPageResponse",
			historyPageTasks: items,
			historyPageNextCursor: undefined,
			historyPageHasMore: false,
			historyPageRequestId: "req-1",
		})
	})

	it("passes through sortOption and cursor from message", async () => {
		mockProvider.taskHistoryStore.getPaginated.mockReturnValue({
			items: [],
			nextCursor: undefined,
			hasMore: false,
		})

		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "getHistoryPage",
			requestId: "req-2",
			sortOption: "mostExpensive",
			cursor: "some-cursor",
			pageSize: 10,
		})

		expect(mockProvider.taskHistoryStore.getPaginated).toHaveBeenCalledWith({
			sortOption: "mostExpensive",
			workspace: "/mock/workspace",
			cursor: "some-cursor",
			pageSize: 10,
		})
	})

	it("omits workspace filter when showAllWorkspaces is true", async () => {
		mockProvider.taskHistoryStore.getPaginated.mockReturnValue({
			items: [],
			hasMore: false,
		})

		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "getHistoryPage",
			requestId: "req-3",
			showAllWorkspaces: true,
		})

		expect(mockProvider.taskHistoryStore.getPaginated).toHaveBeenCalledWith({
			sortOption: "newest",
			workspace: undefined,
			cursor: undefined,
			pageSize: 50,
		})
	})

	it("falls back to provider.cwd when no current task", async () => {
		mockProvider.getCurrentTask.mockReturnValue(null)
		mockProvider.taskHistoryStore.getPaginated.mockReturnValue({
			items: [],
			hasMore: false,
		})

		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "getHistoryPage",
			requestId: "req-4",
		})

		expect(mockProvider.taskHistoryStore.getPaginated).toHaveBeenCalledWith(
			expect.objectContaining({ workspace: "/mock/workspace" }),
		)
	})

	it("posts error response when getPaginated throws", async () => {
		mockProvider.taskHistoryStore.getPaginated.mockImplementation(() => {
			throw new Error("boom")
		})

		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "getHistoryPage",
			requestId: "req-5",
		})

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith({
			type: "historyPageResponse",
			historyPageTasks: [],
			historyPageHasMore: false,
			historyPageRequestId: "req-5",
			error: "boom",
		})
	})

	it("includes nextCursor and hasMore from paginated result", async () => {
		mockProvider.taskHistoryStore.getPaginated.mockReturnValue({
			items: [makeHistoryItem({ id: "t1" })],
			nextCursor: "t1",
			hasMore: true,
		})

		await webviewMessageHandler(mockProvider as unknown as ClineProvider, {
			type: "getHistoryPage",
			requestId: "req-6",
		})

		expect(mockProvider.postMessageToWebview).toHaveBeenCalledWith(
			expect.objectContaining({
				historyPageNextCursor: "t1",
				historyPageHasMore: true,
				historyPageRequestId: "req-6",
			}),
		)
	})
})
