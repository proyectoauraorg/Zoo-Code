import React, { memo, useState, useMemo, useEffect } from "react"
import { ArrowLeft, Inbox, SearchX } from "lucide-react"
import { DeleteTaskDialog } from "./DeleteTaskDialog"
import { BatchDeleteTaskDialog } from "./BatchDeleteTaskDialog"
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
import TaskItem from "./TaskItem"
import TaskGroupItem from "./TaskGroupItem"
import HistorySkeleton from "./HistorySkeleton"

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

	// Use grouped tasks hook
	const { groups, flatTasks, toggleExpand, isSearchMode } = useGroupedTasks(tasks, searchQuery)

	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
	const [deleteSubtaskCount, setDeleteSubtaskCount] = useState<number>(0)
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)
	const [isLoading, setIsLoading] = useState(true)

	// Show skeleton while initial task data loads from extension
	useEffect(() => {
		if (tasks.length > 0) {
			setIsLoading(false)
		}
	}, [tasks.length])

	// After a brief timeout, stop loading even if no tasks exist
	useEffect(() => {
		const timeout = setTimeout(() => setIsLoading(false), 800)
		return () => clearTimeout(timeout)
	}, [])

	// Get subtask count for a task (recursive total)
	const getSubtaskCount = useMemo(() => {
		const countMap = new Map<string, number>()
		for (const group of groups) {
			countMap.set(group.parent.id, countAllSubtasks(group.subtasks))
		}
		return (taskId: string) => countMap.get(taskId) || 0
	}, [groups])

	// Handle delete with subtask count
	const handleDelete = (taskId: string) => {
		setDeleteTaskId(taskId)
		setDeleteSubtaskCount(getSubtaskCount(taskId))
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

	// Handle batch delete button click
	const handleBatchDelete = () => {
		if (selectedTaskIds.length > 0) {
			setShowBatchDeleteDialog(true)
		}
	}

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
								<span
									className="ml-auto text-vscode-descriptionForeground text-xs"
									aria-live="polite"
									data-testid="selection-count">
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
				{isLoading ? (
					<HistorySkeleton />
				) : tasks.length === 0 && !searchQuery ? (
					/* Empty state: no tasks at all */
					<div
						className="flex flex-col items-center justify-center py-12 px-4 text-center"
						data-testid="history-empty-state"
						role="status"
						aria-live="polite">
						<Inbox className="size-12 text-vscode-descriptionForeground/40 mb-4" />
						<h3 className="text-lg font-medium text-vscode-foreground mb-1">{t("history:emptyTitle")}</h3>
						<p className="text-sm text-vscode-descriptionForeground">{t("history:emptyDescription")}</p>
					</div>
				) : tasks.length === 0 && searchQuery ? (
					/* Empty state: search with no results */
					<div
						className="flex flex-col items-center justify-center py-12 px-4 text-center"
						data-testid="history-empty-search-state"
						role="status"
						aria-live="polite">
						<SearchX className="size-12 text-vscode-descriptionForeground/40 mb-4" />
						<h3 className="text-lg font-medium text-vscode-foreground mb-1">
							{t("history:emptySearchTitle")}
						</h3>
						<p className="text-sm text-vscode-descriptionForeground mb-3">
							{t("history:emptySearchDescription")}
						</p>
						<Button
							variant="secondary"
							onClick={() => setSearchQuery("")}
							data-testid="clear-search-button">
							{t("history:clearSearch")}
						</Button>
					</div>
				) : isSearchMode && flatTasks ? (
					// Search mode: flat list with subtask prefix
					<Virtuoso
						className="flex-1 overflow-y-scroll"
						data={flatTasks}
						data-testid="virtuoso-container"
						initialTopMostItemIndex={0}
						components={{
							List: React.forwardRef((props, ref) => (
								<div
									{...props}
									ref={ref}
									data-testid="virtuoso-item-list"
									role="list"
									aria-label={t("history:taskList")}
								/>
							)),
						}}
						itemContent={(_index, item) => (
							<div role="listitem">
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
							</div>
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
								<div
									{...props}
									ref={ref}
									data-testid="virtuoso-item-list"
									role="list"
									aria-label={t("history:taskList")}
								/>
							)),
						}}
						itemContent={(_index, group) => (
							<div role="listitem">
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
							</div>
						)}
					/>
				)}
			</TabContent>

			{/* Fixed action bar at bottom - only shown in selection mode with selected items */}
			<div
				className={`fixed bottom-0 left-0 right-2 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex justify-between items-center transition-all duration-300 ${
					isSelectionMode && selectedTaskIds.length > 0
						? "translate-y-0 opacity-100"
						: "translate-y-full opacity-0 pointer-events-none"
				}`}
				role="toolbar"
				aria-label={t("history:deleteSelected")}>
				<div className="text-vscode-foreground" aria-live="polite">
					{t("history:selectedItems", { selected: selectedTaskIds.length, total: tasks.length })}
				</div>
				<div className="flex gap-2">
					<Button variant="secondary" onClick={() => setSelectedTaskIds([])}>
						{t("history:clearSelection")}
					</Button>
					<Button variant="primary" onClick={handleBatchDelete}>
						{t("history:deleteSelected")}
					</Button>
				</div>
			</div>

			{/* Delete dialog */}
			{deleteTaskId && (
				<DeleteTaskDialog
					taskId={deleteTaskId}
					subtaskCount={deleteSubtaskCount}
					onOpenChange={(open) => {
						if (!open) {
							setDeleteTaskId(null)
							setDeleteSubtaskCount(0)
						}
					}}
					open
				/>
			)}

			{/* Batch delete dialog */}
			{showBatchDeleteDialog && (
				<BatchDeleteTaskDialog
					taskIds={selectedTaskIds}
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
		</Tab>
	)
}

export default memo(HistoryView)
