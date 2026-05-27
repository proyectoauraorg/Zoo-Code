import { useCallback, useMemo, useState } from "react"
import type { HistoryItem } from "@roo-code/types"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
} from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"
import { truncateText, calculateTotalCost, countTotalSubtasks } from "@/utils/exportUtils"

interface BatchDeleteTaskDialogProps extends AlertDialogProps {
	taskIds: string[]
	/** Full task objects for preview (optional — if not provided, only IDs are shown) */
	tasks?: HistoryItem[]
}

export const BatchDeleteTaskDialog = ({ taskIds, tasks = [], ...props }: BatchDeleteTaskDialogProps) => {
	const { t } = useAppTranslation()
	const { onOpenChange } = props
	const [confirmText, setConfirmText] = useState("")

	const needsConfirmation = taskIds.length > 5
	const isConfirmValid = !needsConfirmation || confirmText === "DELETE"

	const totalCost = useMemo(() => calculateTotalCost(tasks), [tasks])
	const totalSubtasks = useMemo(() => countTotalSubtasks(tasks), [tasks])

	const displayTasks = useMemo(() => tasks.slice(0, 10), [tasks])

	const onDelete = useCallback(() => {
		if (taskIds.length > 0 && isConfirmValid) {
			vscode.postMessage({ type: "deleteMultipleTasksWithIds", ids: taskIds })
			onOpenChange?.(false)
		}
	}, [taskIds, isConfirmValid, onOpenChange])

	return (
		<AlertDialog {...props}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("history:deleteTasks")}</AlertDialogTitle>
					<AlertDialogDescription className="text-vscode-foreground">
						<div className="mb-2">{t("history:confirmDeleteTasks", { count: taskIds.length })}</div>

						{/* Task list preview */}
						{displayTasks.length > 0 && (
							<div className="bg-vscode-editor-background border border-vscode-panel-border rounded p-2 mb-2 max-h-40 overflow-y-auto">
								{displayTasks.map((task, i) => (
									<div
										key={task.id}
										className="flex justify-between items-start gap-2 py-1 text-xs text-vscode-editor-foreground">
										<span className="truncate flex-1">
											{i + 1}. {truncateText(task.task, 60)}
										</span>
										<span className="text-vscode-descriptionForeground shrink-0">
											${task.totalCost?.toFixed(2) || "0.00"}
										</span>
									</div>
								))}
								{taskIds.length > 10 && (
									<div className="text-vscode-descriptionForeground text-xs pt-1">
										+ {taskIds.length - 10} {t("history:moreItems")}
									</div>
								)}
							</div>
						)}

						{/* Subtask count warning */}
						{totalSubtasks > 0 && (
							<div className="text-vscode-descriptionForeground text-xs mb-2">
								⚠️ {t("history:batchDeleteSubtaskWarning", { count: totalSubtasks })}
							</div>
						)}

						{/* Cost warning */}
						{totalCost > 0 && (
							<div className="text-vscode-descriptionForeground text-xs mb-2">
								{t("history:batchDeleteCostWarning", { cost: `$${totalCost.toFixed(4)}` })}
							</div>
						)}

						{/* Confirmation field for large batches */}
						{needsConfirmation && (
							<div className="mt-2">
								<div className="text-vscode-descriptionForeground text-xs mb-1">
									{t("history:batchDeleteConfirmPrompt")}
								</div>
								<input
									type="text"
									value={confirmText}
									onChange={(e) => setConfirmText(e.target.value)}
									placeholder="DELETE"
									className="w-full bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded px-2 py-1 text-sm"
									data-testid="batch-delete-confirm-input"
									autoFocus
								/>
							</div>
						)}

						{!needsConfirmation && (
							<div className="text-vscode-editor-foreground bg-vscode-editor-background p-2 rounded text-sm">
								{t("history:deleteTasksWarning")}
							</div>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button variant="secondary">{t("history:cancel")}</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							variant="destructive"
							onClick={onDelete}
							disabled={!isConfirmValid}
							data-testid="batch-delete-confirm-button">
							<span className="codicon codicon-trash mr-1"></span>
							{t("history:deleteItems", { count: taskIds.length })}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
