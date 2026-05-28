import type { HistoryItem } from "@roo-code/types"

export type ExportFormat = "json" | "md" | "csv"

/**
 * Escapes a CSV field value, wrapping in quotes if it contains commas, quotes, or newlines.
 */
function escapeCsvField(value: string | number | undefined | null): string {
	if (value === undefined || value === null) return ""
	const str = String(value)
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`
	}
	return str
}

/**
 * Format a timestamp to a human-readable date string.
 */
function formatDate(ts: number): string {
	return new Date(ts).toLocaleString()
}

/**
 * Format cost as a USD string.
 */
function formatCost(cost: number | undefined): string {
	if (cost === undefined || cost === null) return "$0.00"
	return `$${cost.toFixed(4)}`
}

/**
 * Truncate text to a given number of characters, adding ellipsis if needed.
 */
export function truncateText(text: string, maxLen: number): string {
	if (text.length <= maxLen) return text
	return text.slice(0, maxLen) + "…"
}

/**
 * Generate a JSON export string for one or more tasks.
 */
export function generateJsonExport(tasks: HistoryItem[]): string {
	return JSON.stringify(tasks, null, 2)
}

/**
 * Generate a Markdown export for a single task.
 */
export function generateMarkdownExport(task: HistoryItem): string {
	const lines: string[] = []

	lines.push(`# Task Export`)
	lines.push("")
	lines.push(`## Metadata`)
	lines.push("")
	lines.push(`| Field | Value |`)
	lines.push(`| --- | --- |`)
	lines.push(`| ID | ${task.id} |`)
	lines.push(`| Number | ${task.number} |`)
	lines.push(`| Date | ${formatDate(task.ts)} |`)
	lines.push(`| Tokens In | ${task.tokensIn} |`)
	lines.push(`| Tokens Out | ${task.tokensOut} |`)
	if (task.cacheWrites !== undefined) {
		lines.push(`| Cache Writes | ${task.cacheWrites} |`)
	}
	if (task.cacheReads !== undefined) {
		lines.push(`| Cache Reads | ${task.cacheReads} |`)
	}
	lines.push(`| Total Cost | ${formatCost(task.totalCost)} |`)
	if (task.workspace) {
		lines.push(`| Workspace | ${task.workspace} |`)
	}
	if (task.mode) {
		lines.push(`| Mode | ${task.mode} |`)
	}
	if (task.status) {
		lines.push(`| Status | ${task.status} |`)
	}
	if (task.parentTaskId) {
		lines.push(`| Parent Task ID | ${task.parentTaskId} |`)
	}
	lines.push("")
	lines.push(`## Task Content`)
	lines.push("")
	lines.push("```")
	lines.push(task.task)
	lines.push("```")
	lines.push("")
	lines.push(`---`)
	lines.push(`*Exported on ${new Date().toISOString()}*`)

	return lines.join("\n")
}

/**
 * Generate a CSV export for one or more tasks.
 * Columns: id, number, task, ts, tokensIn, tokensOut, cacheWrites, cacheReads, totalCost, workspace, mode, status
 */
export function generateCsvExport(tasks: HistoryItem[]): string {
	const headers = [
		"id",
		"number",
		"task",
		"ts",
		"tokensIn",
		"tokensOut",
		"cacheWrites",
		"cacheReads",
		"totalCost",
		"workspace",
		"mode",
		"status",
	]

	const rows = tasks.map((task) =>
		[
			escapeCsvField(task.id),
			escapeCsvField(task.number),
			escapeCsvField(truncateText(task.task, 200)),
			escapeCsvField(task.ts),
			escapeCsvField(task.tokensIn),
			escapeCsvField(task.tokensOut),
			escapeCsvField(task.cacheWrites),
			escapeCsvField(task.cacheReads),
			escapeCsvField(task.totalCost),
			escapeCsvField(task.workspace),
			escapeCsvField(task.mode),
			escapeCsvField(task.status),
		].join(","),
	)

	return [headers.join(","), ...rows].join("\n")
}

/**
 * Generate export content based on format.
 * For single-task Markdown, generates a rich document.
 * For batch, only JSON and CSV are supported.
 */
export function generateExportContent(tasks: HistoryItem[], format: ExportFormat): string {
	if (tasks.length === 0) return ""

	if (format === "json") {
		return generateJsonExport(tasks)
	}

	if (format === "csv") {
		return generateCsvExport(tasks)
	}

	// Markdown only supported for single task
	if (format === "md" && tasks.length === 1) {
		return generateMarkdownExport(tasks[0])
	}

	// Fallback for batch markdown: generate CSV instead
	return generateCsvExport(tasks)
}

/**
 * Trigger a browser download of text content.
 */
export function downloadExport(content: string, filename: string): void {
	const mimeTypes: Record<ExportFormat, string> = {
		json: "application/json",
		md: "text/markdown",
		csv: "text/csv",
	}

	const ext = filename.split(".").pop() as ExportFormat
	const mime = mimeTypes[ext] || "text/plain"
	const blob = new Blob([content], { type: mime })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

/**
 * Generate a preview string (first N lines) of the export content.
 */
export function generateExportPreview(tasks: HistoryItem[], format: ExportFormat, maxLines = 15): string {
	const content = generateExportContent(tasks, format)
	const lines = content.split("\n")
	if (lines.length <= maxLines) return content
	return lines.slice(0, maxLines).join("\n") + "\n..."
}

/**
 * Calculate the total cost of a list of tasks.
 */
export function calculateTotalCost(tasks: HistoryItem[]): number {
	return tasks.reduce((sum, t) => sum + (t.totalCost || 0), 0)
}

/**
 * Count total subtasks (direct children) across all tasks.
 */
export function countTotalSubtasks(tasks: HistoryItem[]): number {
	return tasks.reduce((sum, t) => sum + (t.childIds?.length || 0), 0)
}
