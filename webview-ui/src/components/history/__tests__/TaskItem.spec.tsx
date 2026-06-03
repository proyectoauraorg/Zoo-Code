import { render, screen, fireEvent } from "@/utils/test-utils"

import TaskItem from "../TaskItem"
import { vscode } from "@/utils/vscode"

vi.mock("@/utils/vscode")
vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/utils/format", () => ({
	formatTimeAgo: vi.fn(() => "2 hours ago"),
	formatDate: vi.fn(() => "January 15 at 2:30 PM"),
	formatLargeNumber: vi.fn((num: number) => num.toString()),
}))

const mockTask = {
	id: "1",
	number: 1,
	task: "Test task",
	ts: Date.now(),
	tokensIn: 100,
	tokensOut: 50,
	totalCost: 0.002,
	workspace: "/test/workspace",
}

describe("TaskItem", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders task information", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		expect(screen.getByText("Test task")).toBeInTheDocument()
		expect(screen.getByText("$0.00")).toBeInTheDocument() // Component shows $0.00 for small amounts
	})

	it("handles selection in selection mode", () => {
		const onToggleSelection = vi.fn()
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={onToggleSelection}
				isSelectionMode={true}
			/>,
		)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onToggleSelection).toHaveBeenCalledWith("1", true)
	})

	it("shows action buttons", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		// Should show copy and export buttons
		expect(screen.getByTestId("copy-prompt-button")).toBeInTheDocument()
		expect(screen.getByTestId("export")).toBeInTheDocument()
	})

	it("displays time ago information", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		// Should display time ago format
		expect(screen.getByText(/ago/)).toBeInTheDocument()
	})

	it("applies hover effect class", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		const taskItem = screen.getByTestId("task-item-1")
		expect(taskItem).toHaveClass("hover:text-vscode-foreground")
	})

	it("sends showTaskWithId message when clicked in non-selection mode", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		const taskItem = screen.getByTestId("task-item-1")
		fireEvent.click(taskItem)

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "showTaskWithId",
			text: "1",
		})
	})

	it("does not send showTaskWithId when in selection mode", () => {
		const onToggleSelection = vi.fn()
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelected={false}
				onToggleSelection={onToggleSelection}
				isSelectionMode={true}
			/>,
		)

		const taskItem = screen.getByTestId("task-item-1")
		fireEvent.click(taskItem)

		// Should toggle selection instead of navigating
		expect(onToggleSelection).toHaveBeenCalledWith("1", true)
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "showTaskWithId" }))
	})

	it("renders highlight content with dangerouslySetInnerHTML when highlight prop is provided", () => {
		render(
			<TaskItem
				item={{ ...mockTask, highlight: "<mark>Test</mark> task" } as any}
				variant="full"
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		const content = screen.getByTestId("task-content")
		expect(content.innerHTML).toContain("<mark>")
	})

	it("shows workspace path when showWorkspace is true", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				showWorkspace={true}
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		expect(screen.getByText("/test/workspace")).toBeInTheDocument()
	})

	it("does not show workspace path when showWorkspace is false", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				showWorkspace={false}
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		expect(screen.queryByText("/test/workspace")).not.toBeInTheDocument()
	})

	it("applies rounded-t-xl class when hasSubtasks is true", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				hasSubtasks={true}
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		const taskItem = screen.getByTestId("task-item-1")
		expect(taskItem).toHaveClass("rounded-t-xl")
	})

	it("applies rounded-xl class when hasSubtasks is false", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				hasSubtasks={false}
				isSelected={false}
				onToggleSelection={vi.fn()}
				isSelectionMode={false}
			/>,
		)

		const taskItem = screen.getByTestId("task-item-1")
		expect(taskItem).toHaveClass("rounded-xl")
	})

	it("does not show checkbox in compact variant even in selection mode", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="compact"
				isSelectionMode={true}
				isSelected={false}
				onToggleSelection={vi.fn()}
			/>,
		)

		expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
	})

	it("shows checkbox in full variant when in selection mode", () => {
		render(
			<TaskItem
				item={mockTask}
				variant="full"
				isSelectionMode={true}
				isSelected={false}
				onToggleSelection={vi.fn()}
			/>,
		)

		expect(screen.getByRole("checkbox")).toBeInTheDocument()
	})
})
