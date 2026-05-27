import { useCallback, useEffect, useMemo } from "react"
import { useKeyPress } from "react-use"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"

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
import { useAppTranslation } from "@/i18n/TranslationContext"

import { vscode } from "@/utils/vscode"
import { truncateText } from "@/utils/exportUtils"

interface DeleteTaskDialogProps extends AlertDialogProps {
	taskId: string
	/** Full task text for preview */
	taskText?: string
	/** Number of subtasks that will also be deleted (for cascade delete warning) */
	subtaskCount?: number
	/** Names of subtasks for preview */
	subtaskNames?: string[]
}

export const DeleteTaskDialog = ({
	taskId,
	taskText,
	subtaskCount = 0,
	subtaskNames = [],
	...props
}: DeleteTaskDialogProps) => {
	const { t } = useAppTranslation()
	const [isEnterPressed] = useKeyPress("Enter")

	const { onOpenChange } = props

	const onDelete = useCallback(() => {
		if (taskId) {
			vscode.postMessage({ type: "deleteTaskWithId", text: taskId })
			onOpenChange?.(false)
		}
	}, [taskId, onOpenChange])

	useEffect(() => {
		if (taskId && isEnterPressed) {
			onDelete()
		}
	}, [taskId, isEnterPressed, onDelete])

	// Determine the message to show
	const message =
		subtaskCount > 0 ? t("history:deleteWithSubtasks", { count: subtaskCount }) : t("history:deleteTaskMessage")

	const previewLines = useMemo(() => {
		if (!taskText) return []
		const lines = taskText.split("\n").filter((l) => l.trim())
		return lines.slice(0, 2).map((l) => truncateText(l, 100))
	}, [taskText])

	const subtaskPreview = useMemo(() => {
		if (subtaskNames.length === 0) return ""
		const names = subtaskNames.slice(0, 3).map((n) => truncateText(n, 40))
		const suffix = subtaskNames.length > 3 ? ` (+${subtaskNames.length - 3})` : ""
		return names.join(", ") + suffix
	}, [subtaskNames])

	return (
		<AlertDialog {...props}>
			<AlertDialogContent onEscapeKeyDown={() => onOpenChange?.(false)}>
				<AlertDialogHeader>
					<AlertDialogTitle>{t("history:deleteTask")}</AlertDialogTitle>
					<AlertDialogDescription className="text-vscode-foreground">
						<div className="mb-2">{message}</div>

						{/* Task preview */}
						{previewLines.length > 0 && (
							<div className="text-vscode-editor-foreground bg-vscode-editor-background p-2 rounded text-xs mb-2 max-h-16 overflow-hidden">
								{previewLines.map((line, i) => (
									<div key={i} className="truncate">
										{line}
									</div>
								))}
							</div>
						)}

						{/* Subtask preview */}
						{subtaskCount > 0 && subtaskPreview && (
							<div className="text-vscode-descriptionForeground text-xs">
								{t("history:subtaskPreview", { names: subtaskPreview })}
							</div>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button variant="secondary">{t("history:cancel")}</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button variant="destructive" onClick={onDelete}>
							{t("history:delete")}
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
