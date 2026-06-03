import { useState, useMemo } from "react"
import type { HistoryItem } from "@roo-code/types"

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { vscode } from "@/utils/vscode"
import {
	type ExportFormat,
	generateExportContent,
	generateExportPreview,
	downloadExport,
	truncateText,
} from "@/utils/exportUtils"

interface ExportDialogProps {
	tasks: HistoryItem[]
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Whether this is a batch export (disables Markdown option) */
	isBatch?: boolean
}

export const ExportDialog = ({ tasks, open, onOpenChange, isBatch = false }: ExportDialogProps) => {
	const { t } = useAppTranslation()
	const [format, setFormat] = useState<ExportFormat>(isBatch ? "csv" : "md")

	const availableFormats: ExportFormat[] = isBatch ? ["json", "csv"] : ["json", "md", "csv"]

	const preview = useMemo(() => {
		if (tasks.length === 0) return ""
		return generateExportPreview(tasks, format)
	}, [tasks, format])

	const extension: Record<ExportFormat, string> = {
		json: ".json",
		md: ".md",
		csv: ".csv",
	}

	const handleExport = () => {
		if (tasks.length === 0) return

		// Try backend for single-task JSON (existing behavior)
		if (tasks.length === 1 && format === "json") {
			vscode.postMessage({ type: "exportTaskWithId", text: tasks[0].id })
			onOpenChange(false)
			return
		}

		// Generate content in webview and download for other formats
		const content = generateExportContent(tasks, format)
		const taskLabel =
			tasks.length === 1
				? truncateText(tasks[0].task, 30).replace(/[^a-zA-Z0-9]/g, "_")
				: `batch_${tasks.length}_tasks`
		const filename = `task_export_${taskLabel}${extension[format]}`
		downloadExport(content, filename)
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{tasks.length > 1
							? t("history:exportDialogTitleBatch", { count: tasks.length })
							: t("history:exportDialogTitle")}
					</DialogTitle>
					<DialogDescription>
						{tasks.length > 1 ? t("history:exportDialogDescBatch") : t("history:exportDialogDesc")}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					{/* Format selector */}
					<div className="flex items-center gap-2">
						<span className="text-vscode-foreground text-sm">{t("history:exportFormat")}:</span>
						<Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
							<SelectTrigger className="w-40">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{availableFormats.map((f) => (
									<SelectItem key={f} value={f}>
										{f.toUpperCase()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Task summary */}
					{tasks.length === 1 && (
						<div className="text-vscode-descriptionForeground text-xs">
							{truncateText(tasks[0].task, 120)}
						</div>
					)}

					{/* Preview */}
					<div className="bg-vscode-editor-background border border-vscode-panel-border rounded p-3 max-h-48 overflow-auto">
						<pre className="text-vscode-editor-foreground text-xs whitespace-pre-wrap break-all m-0">
							{preview}
						</pre>
					</div>
				</div>

				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						{t("history:cancel")}
					</Button>
					<Button variant="primary" onClick={handleExport} data-testid="export-confirm-button">
						<span className="codicon codicon-desktop-download mr-1" />
						{t("history:export")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
