import { memo } from "react"
import { ArrowRight, Folder, GitBranch } from "lucide-react"
import type { DisplayHistoryItem } from "./types"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { useAppTranslation } from "@/i18n/TranslationContext"

import TaskItemFooter from "./TaskItemFooter"
import { StandardTooltip } from "../ui"

interface TaskItemProps {
	item: DisplayHistoryItem
	variant: "compact" | "full"
	showWorkspace?: boolean
	hasSubtasks?: boolean
	subtaskCount?: number
	isSelectionMode?: boolean
	isSelected?: boolean
	onToggleSelection?: (taskId: string, isSelected: boolean) => void
	onDelete?: (taskId: string) => void
	className?: string
}

const statusConfig = {
	active: {
		icon: "●",
		colorClass: "text-green-500",
	},
	completed: {
		icon: "✓",
		colorClass: "text-vscode-descriptionForeground",
	},
	delegated: {
		icon: "◆",
		colorClass: "text-yellow-500",
	},
} as const

const TaskItem = ({
	item,
	variant,
	showWorkspace = false,
	hasSubtasks = false,
	subtaskCount,
	isSelectionMode = false,
	isSelected = false,
	onToggleSelection,
	onDelete,
	className,
}: TaskItemProps) => {
	const { t } = useAppTranslation()

	const handleClick = () => {
		if (isSelectionMode && onToggleSelection) {
			onToggleSelection(item.id, !isSelected)
		} else {
			vscode.postMessage({ type: "showTaskWithId", text: item.id })
		}
	}

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleClick()
		} else if (e.key === "Delete" && onDelete) {
			onDelete(item.id)
		}
	}

	const isCompact = variant === "compact"
	const status = item.status ? statusConfig[item.status] : undefined

	return (
		<div
			key={item.id}
			data-testid={`task-item-${item.id}`}
			className={cn(
				"cursor-pointer group relative overflow-hidden",
				"text-vscode-foreground/80 hover:text-vscode-foreground",
				"hover:bg-vscode-list-hoverBackground transition-all duration-300",
				hasSubtasks ? "rounded-t-xl" : "rounded-xl",
				className,
			)}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			role="button"
			tabIndex={0}
			aria-label={t("history:taskListItem", { task: item.task })}
			aria-selected={isSelectionMode ? isSelected : undefined}>
			<div className={(!isCompact && isSelectionMode ? "pl-3 pb-3" : "pl-4") + " flex gap-3 px-3 pt-3 pb-1"}>
				{/* Selection checkbox - only in full variant */}
				{!isCompact && isSelectionMode && (
					<div
						className="task-checkbox mt-1"
						onClick={(e) => {
							e.stopPropagation()
						}}>
						<Checkbox
							checked={isSelected}
							onCheckedChange={(checked: boolean) => onToggleSelection?.(item.id, checked === true)}
							variant="description"
						/>
					</div>
				)}

				<div className="flex-1 min-w-0">
					<div className="flex items-start gap-1">
						{item.highlight ? (
							<div
								className={cn(
									"flex-1 min-w-0 overflow-hidden whitespace-pre-wrap font-light text-ellipsis line-clamp-3",
									{
										"text-base": !isCompact,
									},
									!isCompact && isSelectionMode ? "mb-1" : "",
								)}
								data-testid="task-content"
								dangerouslySetInnerHTML={{ __html: item.highlight }}
							/>
						) : (
							<div
								className={cn(
									"flex-1 min-w-0 overflow-hidden whitespace-pre-wrap font-light text-ellipsis line-clamp-3",
									{
										"text-base": !isCompact,
									},
									!isCompact && isSelectionMode ? "mb-1" : "",
								)}
								data-testid="task-content">
								<StandardTooltip content={item.task}>
									<span>{item.task}</span>
								</StandardTooltip>
							</div>
						)}
						{/* Arrow icon that appears on hover */}
						<ArrowRight className="size-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
					</div>

					{/* Status badge and subtask indicator */}
					{!isCompact && (status || (hasSubtasks && subtaskCount)) && (
						<div className="flex items-center gap-2 mt-1">
							{status && (
								<span
									className={cn(
										"inline-flex items-center gap-1 text-xs font-medium",
										status.colorClass,
									)}
									data-testid={`task-status-${item.status}`}>
									<span aria-hidden="true">{status.icon}</span>
									{t(`history:status${item.status!.charAt(0).toUpperCase() + item.status!.slice(1)}`)}
								</span>
							)}
							{hasSubtasks && subtaskCount != null && subtaskCount > 0 && (
								<StandardTooltip content={t("history:expandSubtasks")}>
									<span
										className="inline-flex items-center gap-1 text-xs text-vscode-descriptionForeground"
										data-testid="subtask-count-badge">
										<GitBranch className="size-3" aria-hidden="true" />
										<span>{subtaskCount}</span>
									</span>
								</StandardTooltip>
							)}
						</div>
					)}

					{showWorkspace && item.workspace && (
						<div className="flex items-center font-mono gap-1 text-vscode-descriptionForeground text-xs mt-1">
							<Folder className="size-3" />
							<span>{item.workspace}</span>
						</div>
					)}

					<TaskItemFooter
						item={item}
						variant={variant}
						isSelectionMode={isSelectionMode}
						isSubtask={item.isSubtask}
						onDelete={onDelete}
					/>
				</div>
			</div>
		</div>
	)
}

export default memo(TaskItem)
