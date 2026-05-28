import React from "react"
import type { HistoryItem } from "@roo-code/types"
import { formatTimeAgo } from "@/utils/format"
import { CopyButton } from "./CopyButton"
import { ExportButton } from "./ExportButton"
import { DeleteButton } from "./DeleteButton"
import { StandardTooltip } from "../ui/standard-tooltip"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Split } from "lucide-react"

export interface TaskItemFooterProps {
	item: HistoryItem
	variant: "compact" | "full"
	isSelectionMode?: boolean
	isSubtask?: boolean
	onDelete?: (taskId: string) => void
}

const TaskItemFooter: React.FC<TaskItemFooterProps> = ({
	item,
	variant,
	isSelectionMode = false,
	isSubtask = false,
	onDelete,
}) => {
	const { t } = useAppTranslation()

	const tokensIn = item.tokensIn || 0
	const tokensOut = item.tokensOut || 0
	const cacheWrites = item.cacheWrites || 0
	const cacheReads = item.cacheReads || 0
	const totalTokens = tokensIn + tokensOut + cacheWrites + cacheReads

	const metadataTooltip = [
		item.totalCost ? `Cost: $${item.totalCost.toFixed(2)}` : null,
		totalTokens > 0 ? `Tokens: ${totalTokens.toLocaleString()}` : null,
		item.workspace ? `Workspace: ${item.workspace}` : null,
		item.mode ? `Mode: ${item.mode}` : null,
	]
		.filter(Boolean)
		.join(" · ")

	return (
		<div className="text-xs text-vscode-descriptionForeground flex justify-between items-center">
			<div className="flex gap-1 items-center text-vscode-descriptionForeground/60">
				{/* Subtask tag */}
				{isSubtask && (
					<>
						<Split className="size-3" />
						<span>{t("history:subtaskTag")}</span>
						<span>·</span>
					</>
				)}
				{/* Datetime with time-ago format */}
				<StandardTooltip content={new Date(item.ts).toLocaleString()}>
					<span className="first-letter:uppercase">{formatTimeAgo(item.ts)}</span>
				</StandardTooltip>

				{/* Cost */}
				{!!item.totalCost && (
					<>
						<span>·</span>
						<span className="flex items-center" data-testid="cost-footer-compact">
							{"$" + item.totalCost.toFixed(2)}
						</span>
					</>
				)}

				{/* Metadata tooltip trigger */}
				{metadataTooltip && (
					<StandardTooltip content={metadataTooltip}>
						<span
							className="ml-0.5 cursor-help opacity-60 hover:opacity-100 transition-opacity"
							aria-label="Task metadata">
							⋯
						</span>
					</StandardTooltip>
				)}
			</div>

			{/* Action Buttons — grouped with separator */}
			{!isSelectionMode && (
				<div className="flex items-center gap-0 -mx-1.5 text-vscode-descriptionForeground/60 hover:text-vscode-descriptionForeground opacity-0 group-hover:opacity-100 transition-opacity">
					{/* Non-destructive actions */}
					<CopyButton itemTask={item.task} />
					{variant === "full" && <ExportButton itemId={item.id} />}
					{/* Visual separator before destructive action */}
					{onDelete && (
						<span className="mx-0.5 text-vscode-descriptionForeground/30 select-none" aria-hidden="true">
							│
						</span>
					)}
					{/* Destructive action */}
					{onDelete && <DeleteButton itemId={item.id} onDelete={onDelete} />}
				</div>
			)}
		</div>
	)
}

export default TaskItemFooter
