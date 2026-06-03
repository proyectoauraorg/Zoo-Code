import { memo } from "react"
import { cn } from "@/lib/utils"
import type { TaskGroup } from "./types"
import { countAllSubtasks } from "./types"
import TaskItem from "./TaskItem"
import SubtaskCollapsibleRow from "./SubtaskCollapsibleRow"
import SubtaskRow from "./SubtaskRow"

interface TaskGroupItemProps {
	/** The task group to render */
	group: TaskGroup
	/** Display variant - compact (preview) or full (history view) */
	variant: "compact" | "full"
	/** Whether to show workspace info */
	showWorkspace?: boolean
	/** Whether selection mode is active */
	isSelectionMode?: boolean
	/** Whether this group's parent is selected */
	isSelected?: boolean
	/** Callback when selection state changes */
	onToggleSelection?: (taskId: string, isSelected: boolean) => void
	/** Callback when delete is requested */
	onDelete?: (taskId: string) => void
	/** Callback when the parent group expand/collapse is toggled */
	onToggleExpand: () => void
	/** Callback when a nested subtask node expand/collapse is toggled */
	onToggleSubtaskExpand: (taskId: string) => void
	/** Optional className for styling */
	className?: string
}

/**
 * Renders a task group consisting of a parent task and its collapsible subtask tree.
 * When expanded, shows recursively nested subtask rows.
 */
const TaskGroupItem = ({
	group,
	variant,
	showWorkspace = false,
	isSelectionMode = false,
	isSelected = false,
	onToggleSelection,
	onDelete,
	onToggleExpand,
	onToggleSubtaskExpand,
	className,
}: TaskGroupItemProps) => {
	const { parent, subtasks, isExpanded } = group
	const hasSubtasks = subtasks.length > 0
	const totalSubtaskCount = hasSubtasks ? countAllSubtasks(subtasks) : 0

	return (
		<div
			data-testid={`task-group-${parent.id}`}
			className={cn(
				"bg-vscode-editor-background rounded-xl border border-transparent",
				"transition-all duration-300",
				"hover:bg-vscode-list-hoverBackground hover:border-vscode-panel-border",
				className,
			)}
			role="group"
			aria-label={parent.task}>
			{/* Parent task */}
			<TaskItem
				item={parent}
				variant={variant}
				showWorkspace={showWorkspace}
				isSelectionMode={isSelectionMode}
				isSelected={isSelected}
				onToggleSelection={onToggleSelection}
				onDelete={onDelete}
				hasSubtasks={hasSubtasks}
				subtaskCount={totalSubtaskCount}
			/>

			{/* Subtask collapsible row — shows total recursive count */}
			{hasSubtasks && (
				<SubtaskCollapsibleRow count={totalSubtaskCount} isExpanded={isExpanded} onToggle={onToggleExpand} />
			)}

			{/* Expanded subtask tree */}
			{hasSubtasks && (
				<div
					data-testid="subtask-list"
					role="list"
					aria-label={isExpanded ? "Subtask list" : undefined}
					className={cn(
						"overflow-clip transition-all duration-500",
						isExpanded ? "max-h-[2000px] pb-2" : "max-h-0",
					)}>
					{subtasks.map((node) => (
						<div key={node.item.id} role="listitem">
							<SubtaskRow node={node} depth={1} onToggleExpand={onToggleSubtaskExpand} />
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default memo(TaskGroupItem)
