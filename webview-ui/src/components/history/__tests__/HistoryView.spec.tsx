import React from "react"
import { render, screen, fireEvent, act } from "@/utils/test-utils"

import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useHistoryPagination } from "../useHistoryPagination"

import HistoryView from "../HistoryView"

vi.mock("@src/context/ExtensionStateContext")
vi.mock("@/utils/vscode")
vi.mock("../useHistoryPagination", () => ({
	useHistoryPagination: vi.fn(() => ({
		tasks: [],
		isLoading: false,
		hasMore: false,
		loadMore: vi.fn(),
		reset: vi.fn(),
		error: null,
	})),
}))

const mockUseHistoryPagination = vi.mocked(useHistoryPagination)

// Mock react-virtuoso to render all items immediately (jsdom has no layout)
vi.mock("react-virtuoso", () => ({
	Virtuoso: ({
		data,
		itemContent,
		components,
		..._rest
	}: {
		data: unknown[]
		itemContent: (index: number, item: unknown) => React.ReactNode
		components?: Record<string, React.ComponentType>
		[key: string]: unknown
	}) => {
		const ListComponent = components?.List || "div"
		return (
			<ListComponent data-testid="virtuoso-item-list">
				{data.map((item, index) => (
					<React.Fragment key={index}>{itemContent(index, item)}</React.Fragment>
				))}
			</ListComponent>
		)
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const translations: Record<string, string> = {
				"history:history": "History",
				"history:done": "Done",
				"history:searchPlaceholder": "Search tasks...",
				"history:enterSelectionMode": "Enter Selection Mode",
				"history:exitSelectionMode": "Exit Selection Mode",
				"history:selectionMode": "Selection Mode",
				"history:exitSelection": "Exit Selection",
				"history:selectAll": "Select All",
				"history:deselectAll": "Deselect All",
				"history:deleteSelected": "Delete Selected",
				"history:clearSelection": "Clear Selection",
				"history:deleteTask": "Delete Task",
				"history:deleteTaskMessage": "Are you sure?",
				"history:cancel": "Cancel",
				"history:delete": "Delete",
				"history:deleteTasks": "Delete Tasks",
				"history:confirmDeleteTasks": `Delete ${options?.count || 0} tasks?`,
				"history:deleteTasksWarning": "Warning",
				"history:deleteItems": `Delete ${options?.count || 0}`,
				"history:workspace.prefix": "Workspace:",
				"history:workspace.current": "Current",
				"history:workspace.all": "All",
				"history:sort.prefix": "Sort:",
				"history:sort.newest": "Newest",
				"history:sort.oldest": "Oldest",
				"history:sort.mostExpensive": "Most Expensive",
				"history:sort.mostTokens": "Most Tokens",
				"history:sort.mostRelevant": "Most Relevant",
			}
			if (key === "history:selectedItems" && options) {
				return `${options.selected} of ${options.total} selected`
			}
			if (key === "history:subtasks" && options?.count !== undefined) {
				return `${options.count} Subtask${options.count === 1 ? "" : "s"}`
			}
			if (key === "history:subtaskTag") return "Subtask: "
			if (key === "history:expandSubtasks") return "Expand subtasks"
			if (key === "history:collapseSubtasks") return "Collapse subtasks"
			return translations[key] || key
		},
	}),
}))

vi.mock("@/utils/format", () => ({
	formatTimeAgo: vi.fn(() => "2 hours ago"),
	formatDate: vi.fn(() => "January 15 at 2:30 PM"),
	formatLargeNumber: vi.fn((num: number) => num.toString()),
}))

const mockTaskHistory = [
	{
		number: 1,
		id: "1",
		task: "Test task 1",
		ts: Date.now(),
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.002,
		workspace: "/test/workspace",
	},
	{
		number: 2,
		id: "2",
		task: "Test task 2",
		ts: Date.now() + 1000,
		tokensIn: 200,
		tokensOut: 100,
		totalCost: 0.003,
		workspace: "/test/workspace",
	},
	{
		number: 3,
		id: "3",
		task: "Test task 3 in other workspace",
		ts: Date.now() + 2000,
		tokensIn: 300,
		tokensOut: 150,
		totalCost: 0.005,
		workspace: "/other/workspace",
	},
]

describe("HistoryView", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
		;(useExtensionState as ReturnType<typeof vi.fn>).mockReturnValue({
			taskHistory: mockTaskHistory,
			cwd: "/test/workspace",
		})
		mockUseHistoryPagination.mockReturnValue({
			tasks: mockTaskHistory.filter((t) => t.workspace === "/test/workspace"),
			isLoading: false,
			hasMore: false,
			loadMore: vi.fn(),
			reset: vi.fn(),
			error: null,
		})
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("renders the history interface", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Check for main UI elements
		expect(screen.getByText("History")).toBeInTheDocument()
		expect(screen.getByText("Done")).toBeInTheDocument()
		expect(screen.getByPlaceholderText("Search tasks...")).toBeInTheDocument()
	})

	it("calls onDone when done button is clicked", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		const doneButton = screen.getByTestId("history-done-button")
		fireEvent.click(doneButton)

		expect(onDone).toHaveBeenCalled()
	})

	it("displays search input", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		const searchInput = screen.getByPlaceholderText("Search tasks...")
		expect(searchInput).toBeInTheDocument()
	})

	it("displays selection mode toggle button", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		const selectionButton = screen.getByTestId("toggle-selection-mode-button")
		expect(selectionButton).toBeInTheDocument()
		expect(selectionButton).toHaveTextContent("Selection Mode")
	})

	it("toggles selection mode when button is clicked", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		const selectionButton = screen.getByTestId("toggle-selection-mode-button")
		expect(selectionButton).toHaveTextContent("Selection Mode")

		fireEvent.click(selectionButton)
		expect(selectionButton).toHaveTextContent("Exit Selection")

		// Click again to exit
		fireEvent.click(selectionButton)
		expect(selectionButton).toHaveTextContent("Selection Mode")
	})

	it("shows empty state when task history is empty", () => {
		;(useExtensionState as ReturnType<typeof vi.fn>).mockReturnValue({
			taskHistory: [],
			cwd: "/test/workspace",
		})
		mockUseHistoryPagination.mockReturnValue({
			tasks: [],
			isLoading: false,
			hasMore: false,
			loadMore: vi.fn(),
			reset: vi.fn(),
			error: null,
		})

		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Advance past the loading skeleton timeout (800ms)
		act(() => {
			vi.advanceTimersByTime(800)
		})

		// Should still render the search and controls
		expect(screen.getByPlaceholderText("Search tasks...")).toBeInTheDocument()
		// No task items should be present
		expect(screen.queryByTestId(/task-item-/)).not.toBeInTheDocument()
		expect(screen.queryByTestId(/task-group-/)).not.toBeInTheDocument()
	})

	it("renders task groups for current workspace by default", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Advance past the loading skeleton timeout (800ms)
		act(() => {
			vi.advanceTimersByTime(800)
		})

		// Should show tasks from current workspace only
		expect(screen.getByText("Test task 1")).toBeInTheDocument()
		expect(screen.getByText("Test task 2")).toBeInTheDocument()
		// Task 3 is in other workspace, should not be visible
		expect(screen.queryByText("Test task 3 in other workspace")).not.toBeInTheDocument()
	})

	it("renders workspace filter with current workspace selected by default", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Should show "Workspace: Current" by default (text split across child spans in Select)
		expect(screen.getByText(/Workspace:/)).toBeInTheDocument()
		expect(screen.getByText(/Current/)).toBeInTheDocument()
	})

	it("renders sort control", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Should show sort selector (text split across child spans in Select)
		expect(screen.getByText(/Sort:/)).toBeInTheDocument()
		expect(screen.getByText(/Newest/)).toBeInTheDocument()
	})

	it("renders with selection mode active and shows select all control", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Enter selection mode
		const selectionButton = screen.getByTestId("toggle-selection-mode-button")
		fireEvent.click(selectionButton)

		// Should show select all option
		expect(screen.getByText("Select All")).toBeInTheDocument()
	})

	it("shows task count in selection mode", () => {
		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Enter selection mode
		const selectionButton = screen.getByTestId("toggle-selection-mode-button")
		fireEvent.click(selectionButton)

		// Should show selection count
		expect(screen.getByText("0 of 2 selected")).toBeInTheDocument()
	})

	it("handles parent-child task relationships", () => {
		const tasksWithChildren = [
			{
				number: 1,
				id: "parent-1",
				task: "Parent task",
				ts: Date.now(),
				tokensIn: 100,
				tokensOut: 50,
				totalCost: 0.002,
				workspace: "/test/workspace",
			},
			{
				number: 2,
				id: "child-1",
				task: "Child task",
				ts: Date.now() - 1000,
				tokensIn: 50,
				tokensOut: 25,
				totalCost: 0.001,
				workspace: "/test/workspace",
				parentTaskId: "parent-1",
			},
		]

		;(useExtensionState as ReturnType<typeof vi.fn>).mockReturnValue({
			taskHistory: tasksWithChildren,
			cwd: "/test/workspace",
		})
		mockUseHistoryPagination.mockReturnValue({
			tasks: tasksWithChildren,
			isLoading: false,
			hasMore: false,
			loadMore: vi.fn(),
			reset: vi.fn(),
			error: null,
		})

		const onDone = vi.fn()
		render(<HistoryView onDone={onDone} />)

		// Advance past the loading skeleton timeout (800ms)
		act(() => {
			vi.advanceTimersByTime(800)
		})

		// Parent should be visible (rendered by mocked Virtuoso)
		expect(screen.getByText("Parent task")).toBeInTheDocument()
		// Should show subtask collapsible row with count
		expect(screen.getByTestId("subtask-collapsible-row")).toBeInTheDocument()
		expect(screen.getByText("1 Subtask")).toBeInTheDocument()
	})
})
