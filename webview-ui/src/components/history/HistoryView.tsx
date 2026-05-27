import React, { memo, useState, useMemo, useCallback } from "react"
import type { HistoryItem } from "@roo-code/types"
import { ArrowLeft } from "lucide-react"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { BatchDeleteTaskDialog } from "./BatchDeleteTaskDialog"
import { ExportDialog } from "./ExportDialog"
import { BatchActionBar } from "./BatchActionBar"
import { Virtuoso } from "react-virtuoso"

import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import {
	Button,
	Checkbox,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	StandardTooltip,
} from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"

import { Tab, TabContent, TabHeader } from "../common/Tab"
import { useTaskSearch } from "./useTaskSearch"
import { useGroupedTasks } from "./useGroupedTasks"
import { countAllSubtasks } from "./types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import TaskItem from "./TaskItem"
import TaskGroupItem from "./TaskGroupItem"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const {
		tasks,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
	} = useTaskSearch()
	const { t } = useAppTranslation()
	const { cwd } = useExtensionState()

	// Use grouped tasks hook
	const { groups, flatTasks, toggleExpand, isSearchMode } = useGroupedTasks(tasks, searchQuery)

	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
	const [deleteSubtaskCount, setDeleteSubtaskCount] = useState<number>(0)
	const [deleteTaskText, setDeleteTaskText] = useState<string | undefined>(undefined)
	const [deleteSubtaskNames, setDeleteSubtaskNames] = useState<string[]>([])
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)
	const [showExportDialog, setShowExportDialog] = useState<boolean>(false)
	const [exportTasks, setExportTasks] = useState<HistoryItem[]>([])

	// Get subtask count for a task (recursive total)
	const getSubtaskCount = useMemo(() => {
		const countMap = new Map<string, number>()
		for (const group of groups) {
			countMap.set(group.parent.id, countAllSubtasks(group.subtasks))
		}
		return (taskId: string) => countMap.get(taskId) || 0
	}, [groups])

	// Handle delete with subtask count and preview
	const handleDelete = (taskId: string) => {
		setDeleteTaskId(taskId)
		setDeleteSubtaskCount(getSubtaskCount(taskId))
		// Find the task text for preview
		const task = tasks.find((t) => t.id === taskId)
		setDeleteTaskText(task?.task)
		// Collect subtask names
		const group = groups.find((g) => g.parent.id === taskId)
		if (group) {
			setDeleteSubtaskNames(group.subtasks.map((st) => st.item.task))
		} else {
			setDeleteSubtaskNames([])
		}
	}

	// Toggle selection mode
	const toggleSelectionMode = () => {
		setIsSelectionMode(!isSelectionMode)
		if (isSelectionMode) {
			setSelectedTaskIds([])
		}
	}

	// Toggle selection for a single task
	const toggleTaskSelection = (taskId: string, isSelected: boolean) => {
		if (isSelected) {
			setSelectedTaskIds((prev) => [...prev, taskId])
		} else {
			setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId))
		}
	}

	// Toggle select all tasks
	const toggleSelectAll = (selectAll: boolean) => {
		if (selectAll) {
			setSelectedTaskIds(tasks.map((task) => task.id))
		} else {
			setSelectedTaskIds([])
		}
	}

	// Get selected task objects for batch operations
	const selectedTaskObjects = useMemo(() => {
		return tasks.filter((t) => selectedTaskIds.includes(t.id))
	}, [tasks, selectedTaskIds])

	// Handle batch delete button click
	const handleBatchDelete = () => {
		if (selectedTaskIds.length > 0) {
			setShowBatchDeleteDialog(true)
		}
	}

	// Handle batch export button click
	const handleBatchExport = useCallback(() => {
		if (selectedTaskIds.length > 0) {
			setExportTasks(selectedTaskObjects)
			setShowExportDialog(true)
		}
	}, [selectedTaskIds, selectedTaskObjects])

	// Smart selection: all in current view
	const handleSelectAllInView = useCallback(() => {
		setSelectedTaskIds(tasks.map((t) => t.id))
	}, [tasks])

	// Smart selection: by workspace (current workspace)
	const handleSelectByWorkspace = useCallback(() => {
		const workspaceTasks = tasks.filter((t) => t.workspace === cwd)
		setSelectedTaskIds(workspaceTasks.map((t) => t.id))
	}, [tasks, cwd])

	// Smart selection: by date range (last N days)
	const handleSelectByDateRange = useCallback(
		(days: number) => {
			const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
			const recentTasks = tasks.filter((t) => t.ts >= cutoff)
			setSelectedTaskIds(recentTasks.map((t) => t.id))
		},
		[tasks],
	)

	// Smart selection: expensive tasks (totalCost > 1.0)
	const handleSelectExpensive = useCallback(() => {
		const expensiveTasks = tasks.filter((t) => (t.totalCost || 0) > 1.0)
		setSelectedTaskIds(expensiveTasks.map((t) => t.id))
	}, [tasks])

	return (
		<Tab>
			<TabHeader className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							className="px-1.5 -ml-2"
							onClick={onDone}
							aria-label={t("history:done")}
							data-testid="history-done-button">
							<ArrowLeft />
							<span className="sr-only">{t("history:done")}</span>
						</Button>
						<h3 className="text-vscode-foreground m-0">{t("history:history")}</h3>
					</div>
					<StandardTooltip
						content={
							isSelectionMode ? `${t("history:exitSelectionMode")}` : `${t("history:enterSelectionMode")}`
						}>
						<Button
							variant={isSelectionMode ? "primary" : "secondary"}
							onClick={toggleSelectionMode}
							data-testid="toggle-selection-mode-button">
							<span
								className={`codicon ${isSelectionMode ? "codicon-check-all" : "codicon-checklist"} mr-1`}
							/>
							{isSelectionMode ? t("history:exitSelection") : t("history:selectionMode")}
						</Button>
					</StandardTooltip>
				</div>
				<div className="flex flex-col gap-2">
					<VSCodeTextField
						className="w-full"
						placeholder={t("history:searchPlaceholder")}
						value={searchQuery}
						data-testid="history-search-input"
						onInput={(e) => {
							const newValue = (e.target as HTMLInputElement)?.value
							setSearchQuery(newValue)
							if (newValue && !searchQuery && sortOption !== "mostRelevant") {
								setLastNonRelevantSort(sortOption)
								setSortOption("mostRelevant")
							}
						}}>
						<div slot="start" className="codicon codicon-search mt-0.5 opacity-80 text-sm!" />
						{searchQuery && (
							<div
								className="input-icon-button codicon codicon-close flex justify-center items-center h-full"
								aria-label="Clear search"
								onClick={() => setSearchQuery("")}
								slot="end"
							/>
						)}
					</VSCodeTextField>
					<div className="flex gap-2">
						<Select
							value={showAllWorkspaces ? "all" : "current"}
							onValueChange={(value) => setShowAllWorkspaces(value === "all")}>
							<SelectTrigger className="flex-1">
								<SelectValue>
									{t("history:workspace.prefix")}{" "}
									{t(`history:workspace.${showAllWorkspaces ? "all" : "current"}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="current">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-folder" />
										{t("history:workspace.current")}
									</div>
								</SelectItem>
								<SelectItem value="all">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-folder-opened" />
										{t("history:workspace.all")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
						<Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
							<SelectTrigger className="flex-1">
								<SelectValue>
									{t("history:sort.prefix")} {t(`history:sort.${sortOption}`)}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="newest" data-testid="select-newest">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-arrow-down" />
										{t("history:newest")}
									</div>
								</SelectItem>
								<SelectItem value="oldest" data-testid="select-oldest">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-arrow-up" />
										{t("history:oldest")}
									</div>
								</SelectItem>
								<SelectItem value="mostExpensive" data-testid="select-most-expensive">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-credit-card" />
										{t("history:mostExpensive")}
									</div>
								</SelectItem>
								<SelectItem value="mostTokens" data-testid="select-most-tokens">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-symbol-numeric" />
										{t("history:mostTokens")}
									</div>
								</SelectItem>
								<SelectItem
									value="mostRelevant"
									disabled={!searchQuery}
									data-testid="select-most-relevant">
									<div className="flex items-center gap-2">
										<span className="codicon codicon-search" />
										{t("history:mostRelevant")}
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Select all control in selection mode */}
					{isSelectionMode && tasks.length > 0 && (
						<div className="flex items-center py-1">
							<div className="flex items-center gap-2">
								<Checkbox
									checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
									onCheckedChange={(checked) => toggleSelectAll(checked === true)}
									variant="description"
								/>
								<span className="text-vscode-foreground">
									{selectedTaskIds.length === tasks.length
										? t("history:deselectAll")
										: t("history:selectAll")}
								</span>
								<span className="ml-auto text-vscode-descriptionForeground text-xs">
									{t("history:selectedItems", {
										selected: selectedTaskIds.length,
										total: tasks.length,
									})}
								</span>
							</div>
						</div>
					)}
				</div>
			</TabHeader>

			<TabContent className="px-2 py-0">
				{isSearchMode && flatTasks ? (
					// Search mode: flat list with subtask prefix
					<Virtuoso
						className="flex-1 overflow-y-scroll"
						data={flatTasks}
						data-testid="virtuoso-container"
						initialTopMostItemIndex={0}
						components={{
							List: React.forwardRef((props, ref) => (
								<div {...props} ref={ref} data-testid="virtuoso-item-list" />
							)),
						}}
						itemContent={(_index, item) => (
							<TaskItem
								key={item.id}
								item={item}
								variant="full"
								showWorkspace={showAllWorkspaces}
								isSelectionMode={isSelectionMode}
								isSelected={selectedTaskIds.includes(item.id)}
								onToggleSelection={toggleTaskSelection}
								onDelete={handleDelete}
								className="m-2"
							/>
						)}
					/>
				) : (
					// Grouped mode: task groups with expandable subtasks
					<Virtuoso
						className="flex-1 overflow-y-scroll"
						data={groups}
						data-testid="virtuoso-container"
						initialTopMostItemIndex={0}
						components={{
							List: React.forwardRef((props, ref) => (
								<div {...props} ref={ref} data-testid="virtuoso-item-list" />
							)),
						}}
						itemContent={(_index, group) => (
							<TaskGroupItem
								key={group.parent.id}
								group={group}
								variant="full"
								showWorkspace={showAllWorkspaces}
								isSelectionMode={isSelectionMode}
								isSelected={selectedTaskIds.includes(group.parent.id)}
								onToggleSelection={toggleTaskSelection}
								onDelete={handleDelete}
								onToggleExpand={() => toggleExpand(group.parent.id)}
								onToggleSubtaskExpand={toggleExpand}
								className="m-2"
							/>
						)}
					/>
				)}
			</TabContent>

			{/* Batch action bar at bottom - only shown in selection mode with selected items */}
			{isSelectionMode && selectedTaskIds.length > 0 && (
				<BatchActionBar
					selectedCount={selectedTaskIds.length}
					totalCount={tasks.length}
					onClearSelection={() => setSelectedTaskIds([])}
					onDeleteSelected={handleBatchDelete}
					onExportSelected={handleBatchExport}
					onSelectAllInView={handleSelectAllInView}
					onSelectByWorkspace={handleSelectByWorkspace}
					onSelectByDateRange={handleSelectByDateRange}
					onSelectExpensive={handleSelectExpensive}
				/>
			)}

			{/* Delete dialog */}
			{deleteTaskId && (
				<DeleteTaskDialog
					taskId={deleteTaskId}
					taskText={deleteTaskText}
					subtaskCount={deleteSubtaskCount}
					subtaskNames={deleteSubtaskNames}
					onOpenChange={(open) => {
						if (!open) {
							setDeleteTaskId(null)
							setDeleteSubtaskCount(0)
							setDeleteTaskText(undefined)
							setDeleteSubtaskNames([])
						}
					}}
					open
				/>
			)}

			{/* Batch delete dialog */}
			{showBatchDeleteDialog && (
				<BatchDeleteTaskDialog
					taskIds={selectedTaskIds}
					tasks={selectedTaskObjects}
					open={showBatchDeleteDialog}
					onOpenChange={(open) => {
						if (!open) {
							setShowBatchDeleteDialog(false)
							setSelectedTaskIds([])
							setIsSelectionMode(false)
						}
					}}
				/>
			)}

			{/* Export dialog (single and batch) */}
			{showExportDialog && (
				<ExportDialog
					tasks={exportTasks}
					open={showExportDialog}
					onOpenChange={(open) => {
						if (!open) {
							setShowExportDialog(false)
							setExportTasks([])
						}
					}}
					isBatch={exportTasks.length > 1}
				/>
			)}
		</Tab>
	)
}

export default memo(HistoryView)
