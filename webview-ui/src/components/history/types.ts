import type { HistoryItem } from "@roo-code/types"

/**
 * Extended HistoryItem with display-related fields for search highlighting and subtask indication
 */
export interface DisplayHistoryItem extends HistoryItem {
	/** HTML string with search match highlighting */
	highlight?: string
	/** Whether this task is a subtask (has a parent in the current task list) */
	isSubtask?: boolean
}

/**
 * A node in the subtask tree, representing a task and its recursively nested children.
 */
export interface SubtaskTreeNode {
	/** The task at this tree node */
	item: DisplayHistoryItem
	/** Recursively nested child subtasks */
	children: SubtaskTreeNode[]
	/** Whether this node's children are expanded in the UI */
	isExpanded: boolean
}

/**
 * Recursively counts all subtasks in a tree of SubtaskTreeNodes.
 */
export function countAllSubtasks(nodes: SubtaskTreeNode[]): number {
	let count = 0
	for (const node of nodes) {
		count += 1 + countAllSubtasks(node.children)
	}
	return count
}

/**
 * A group of tasks consisting of a parent task and its nested subtask tree
 */
export interface TaskGroup {
	/** The parent task */
	parent: DisplayHistoryItem
	/** Tree of subtasks (supports arbitrary nesting depth) */
	subtasks: SubtaskTreeNode[]
	/** Whether the subtask list is expanded */
	isExpanded: boolean
}

export type TimePeriod = "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "older"

/**
 * Returns the time period bucket for a given timestamp.
 * Pure function — exported for independent testing.
 */
export function getTimePeriod(ts: number): TimePeriod {
	const date = new Date(ts)
	const now = new Date()
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const yesterday = new Date(today.getTime() - 86400000)
	const weekAgo = new Date(today.getTime() - 7 * 86400000)
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
	const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

	if (date >= today) return "today"
	if (date >= yesterday) return "yesterday"
	if (date >= weekAgo) return "thisWeek"
	if (date >= monthStart) return "thisMonth"
	if (date >= lastMonthStart) return "lastMonth"
	return "older"
}

/**
 * A group of tasks bucketed by time period.
 */
export interface TimeGroup {
	/** The time period label */
	period: TimePeriod
	/** Task groups within this time period */
	groups: TaskGroup[]
}

/**
 * Result from the useGroupedTasks hook
 */
export interface GroupedTasksResult {
	/** Groups of tasks (parent + subtasks) - used in normal view */
	groups: TaskGroup[]
	/** Flat list of tasks with isSubtask flag - used in search mode */
	flatTasks: DisplayHistoryItem[] | null
	/** Function to toggle expand/collapse state of a group */
	toggleExpand: (taskId: string) => void
	/** Whether search mode is active */
	isSearchMode: boolean
	/** Groups bucketed by time period - used in normal view */
	timeGroups: TimeGroup[]
}
