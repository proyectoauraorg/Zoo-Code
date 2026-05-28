import { render, screen, fireEvent } from "@/utils/test-utils"

import type { HistoryItem } from "@roo-code/types"

import TaskGroupItem from "../TaskGroupItem"
import TaskItem from "../TaskItem"
import SubtaskCollapsibleRow from "../SubtaskCollapsibleRow"
import type { TaskGroup, DisplayHistoryItem, SubtaskTreeNode } from "../types"

vi.mock("@/utils/vscode")
vi.mock("@/utils/format", () => ({
	formatTimeAgo: vi.fn(() => "2 hours ago"),
	formatDate: vi.fn(() => "January 15 at 2:30 PM"),
	formatLargeNumber: vi.fn((num: number) => num.toString()),
}))
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === "history:subtasks" && options?.count !== undefined) {
				return `${options.count} Subtask${options.count === 1 ? "" : "s"}`
			}
			if (key === "history:subtaskTag") return "Subtask: "
			if (key === "history:expandSubtasks") return "Expand subtasks"
			if (key === "history:collapseSubtasks") return "Collapse subtasks"
			return key
		},
	}),
}))

const createMockDisplayHistoryItem = (overrides: Partial<DisplayHistoryItem> = {}): DisplayHistoryItem => ({
	id: "task-1",
	number: 1,
	task: "Test task",
	ts: Date.now(),
	tokensIn: 100,
	tokensOut: 50,
	totalCost: 0.01,
	workspace: "/workspace/project",
	...overrides,
})

const createMockSubtaskNode = (
	itemOverrides: Partial<DisplayHistoryItem> = {},
	children: SubtaskTreeNode[] = [],
	isExpanded = false,
): SubtaskTreeNode => ({
	item: createMockDisplayHistoryItem(itemOverrides),
	children,
	isExpanded,
})

const createMockGroup = (overrides: Partial<TaskGroup> = {}): TaskGroup => ({
	parent: createMockDisplayHistoryItem({ id: "parent-1", task: "Parent task" }),
	subtasks: [],
	isExpanded: false,
	...overrides,
})

describe("Accessibility — History components", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("SubtaskCollapsibleRow accessibility", () => {
		it("has role='button' on the collapsible row", () => {
			render(<SubtaskCollapsibleRow count={3} isExpanded={false} onToggle={vi.fn()} />)

			const row = screen.getByTestId("subtask-collapsible-row")
			expect(row).toHaveAttribute("role", "button")
		})

		it("has aria-expanded='false' when collapsed", () => {
			render(<SubtaskCollapsibleRow count={3} isExpanded={false} onToggle={vi.fn()} />)

			const row = screen.getByTestId("subtask-collapsible-row")
			expect(row).toHaveAttribute("aria-expanded", "false")
		})

		it("has aria-expanded='true' when expanded", () => {
			render(<SubtaskCollapsibleRow count={3} isExpanded={true} onToggle={vi.fn()} />)

			const row = screen.getByTestId("subtask-collapsible-row")
			expect(row).toHaveAttribute("aria-expanded", "true")
		})

		it("has aria-label describing expand action when collapsed", () => {
			render(<SubtaskCollapsibleRow count={3} isExpanded={false} onToggle={vi.fn()} />)

			const row = screen.getByTestId("subtask-collapsible-row")
			expect(row).toHaveAttribute("aria-label", "Expand subtasks")
		})

		it("has aria-label describing collapse action when expanded", () => {
			render(<SubtaskCollapsibleRow count={3} isExpanded={true} onToggle={vi.fn()} />)

			const row = screen.getByTestId("subtask-collapsible-row")
			expect(row).toHaveAttribute("aria-label", "Collapse subtasks")
		})

		it("renders null (nothing) when count is 0", () => {
			render(<SubtaskCollapsibleRow count={0} isExpanded={false} onToggle={vi.fn()} />)

			expect(screen.queryByTestId("subtask-collapsible-row")).not.toBeInTheDocument()
		})
	})

	describe("TaskGroupItem accessibility", () => {
		it("has correct data-testid on group container", () => {
			const group = createMockGroup({
				parent: createMockDisplayHistoryItem({ id: "my-task-id" }),
			})

			render(
				<TaskGroupItem group={group} variant="full" onToggleExpand={vi.fn()} onToggleSubtaskExpand={vi.fn()} />,
			)

			expect(screen.getByTestId("task-group-my-task-id")).toBeInTheDocument()
		})

		it("renders aria-expanded on collapsible row for subtasks", () => {
			const group = createMockGroup({
				subtasks: [createMockSubtaskNode({ id: "child-1", task: "Child 1" })],
				isExpanded: true,
			})

			render(
				<TaskGroupItem group={group} variant="full" onToggleExpand={vi.fn()} onToggleSubtaskExpand={vi.fn()} />,
			)

			const collapsibleRow = screen.getByTestId("subtask-collapsible-row")
			expect(collapsibleRow).toHaveAttribute("aria-expanded", "true")
		})
	})

	describe("TaskItem accessibility", () => {
		it("has data-testid on task item element", () => {
			const item = createMockDisplayHistoryItem({ id: "task-abc" })

			render(<TaskItem item={item} variant="full" isSelectionMode={false} />)

			expect(screen.getByTestId("task-item-task-abc")).toBeInTheDocument()
		})

		it("checkbox has role='checkbox' in selection mode", () => {
			const item = createMockDisplayHistoryItem()

			render(
				<TaskItem
					item={item}
					variant="full"
					isSelectionMode={true}
					isSelected={false}
					onToggleSelection={vi.fn()}
				/>,
			)

			const checkbox = screen.getByRole("checkbox")
			expect(checkbox).toBeInTheDocument()
		})

		it("task content has data-testid", () => {
			const item = createMockDisplayHistoryItem({ task: "My accessible task" })

			render(<TaskItem item={item} variant="full" isSelectionMode={false} />)

			const content = screen.getByTestId("task-content")
			expect(content).toBeInTheDocument()
		})
	})

	describe("Tab navigation", () => {
		it("SubtaskRow rendered by TaskGroupItem has role='button' and tabIndex=0", () => {
			const group = createMockGroup({
				isExpanded: true,
				subtasks: [createMockSubtaskNode({ id: "child-1", task: "Subtask content" })],
			})

			render(
				<TaskGroupItem group={group} variant="full" onToggleExpand={vi.fn()} onToggleSubtaskExpand={vi.fn()} />,
			)

			const subtaskRow = screen.getByTestId("subtask-row-child-1")
			// SubtaskRow renders an inner div with role="button" and tabIndex={0}
			const buttonDiv = subtaskRow.querySelector('[role="button"]')
			expect(buttonDiv).toBeTruthy()
			expect(buttonDiv).toHaveAttribute("tabindex", "0")
		})
	})
})
