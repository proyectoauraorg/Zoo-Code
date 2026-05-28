import React, { memo, useState, useMemo, useCallback, useEffect } from "react"
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
import { useHistoryPagination } from "./useHistoryPagination"
import { useGroupedTasks } from "./useGroupedTasks"
import { countAllSubtasks } from "./types"
import type { TaskGroup, TimePeriod } from "./types"
import TaskItem from "./TaskItem"
import TaskGroupItem from "./TaskGroupItem"
import HistorySkeleton from "./HistorySkeleton"

type HistoryViewProps = {
	onDone: () => void
}

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

type TimeGroupListItem = { type: "header"; label: string } | { type: "group"; group: TaskGroup }

const TIME_PERIOD_I18N_KEYS: Record<TimePeriod, string> = {
	today: "history:timeGroup.today",
	yesterday: "history:timeGroup.yesterday",
	thisWeek: "history:timeGroup.thisWeek",
	thisMonth: "history:timeGroup.thisMonth",
	lastMonth: "history:timeGroup.lastMonth",
	older: "history:timeGroup.older",
}

const HistoryView = ({ onDone }: HistoryViewProps) => {
	const {
		tasks: clientTasks,
		searchQuery,
		setSearchQuery,
		sortOption,
		setSortOption,
		setLastNonRelevantSort,
		showAllWorkspaces,
		setShowAllWorkspaces,
		isDeepSearching,
	} = useTaskSearch()
	const { t } = useAppTranslation()

	const [isLoading, setIsLoading] = useState(true)

	// Simulate loading state for skeleton
	useEffect(() => {
		const timer = setTimeout(() => setIsLoading(false), 800)
		return () => clearTimeout(timer)
	}, [])

	// Server-side pagination for non-search sort options
	const isServerSidePagination = sortOption !== "mostRelevant"

	const pagination = useHistoryPagination({
		sortOption,
		showAllWorkspaces,
		enabled: isServerSidePagination,
	})

	// Determine the active tasks based on sort mode:
	// - "mostRelevant" (fuzzy search) uses client-side filtering from useTaskSearch
	// - All other sorts use server-side pagination from useHistoryPagination
	const tasks = useMemo(() => {
		if (isServerSidePagination) {
			return pagination.tasks
		}
		return clientTasks
	}, [isServerSidePagination, pagination.tasks, clientTasks])

	// Use grouped tasks hook
	const { groups, flatTasks, toggleExpand, isSearchMode, timeGroups } = useGroupedTasks(tasks, searchQuery)

	const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
	const [deleteSubtaskCount, setDeleteSubtaskCount] = useState<number>(0)
	const [isSelectionMode, setIsSelectionMode] = useState(false)
	const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
	const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState<boolean>(false)

	// Flatten timeGroups into a mixed list for Virtuoso rendering
	const timeGroupListItems = useMemo((): TimeGroupListItem[] => {
		const items: TimeGroupListItem[] = []
		for (const tg of timeGroups) {
			items.push({ type: "header", label: t(TIME_PERIOD_I18N_KEYS[tg.period]) })
			for (const group of tg.groups) {
				items.push({ type: "group", group })
			}
		}
		return items
	}, [timeGroups, t])

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

	// Infinite scroll: load more when reaching the end
	const handleEndReached = useCallback(() => {
		if (isServerSidePagination && pagination.hasMore && !pagination.isLoading) {
			pagination.loadMore()
		}
	}, [isServerSidePagination, pagination])

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
					{isDeepSearching && (
						<div
							className="flex items-center gap-2 text-vscode-descriptionForeground text-xs py-1"
							data-testid="deep-search-loading">
							<span className="codicon codicon-loading codicon-modifier-spin" />
							<span>{t("history:searchingContent")}</span>
						</div>
					)}
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
								<span className="ml-auto text-vscode-descriptionForeground text-xs" aria-live="polite">
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
					<div className="flex flex-col items-center justify-center py-12 text-vscode-descriptionForeground" data-testid="history-empty-state">
						<Inbox className="size-12 mb-4 opacity-50" />
						<p className="text-lg font-medium">{t("history:emptyTitle")}</p>
						<p className="text-sm mt-1">{t("history:emptyDescription")}</p>
					</div>
				) : tasks.length === 0 && searchQuery ? (
					<div className="flex flex-col items-center justify-center py-12 text-vscode-descriptionForeground" data-testid="history-empty-search-state">
						<SearchX className="size-12 mb-4 opacity-50" />
						<p className="text-lg font-medium">{t("history:emptySearchTitle")}</p>
						<p className="text-sm mt-1">{t("history:emptySearchDescription")}</p>
						<button
							className="mt-3 text-sm text-vscode-textLink-foreground hover:underline cursor-pointer"
							onClick={() => setSearchQuery("")}
							data-testid="clear-search-button">
							{t("history:clearSearch")}
						</button>
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
								<div {...props} ref={ref} data-testid="virtuoso-item-list" role="list" />
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
					// Grouped mode: time-grouped sections with sticky headers
					<Virtuoso
						className="flex-1 overflow-y-scroll"
						data={timeGroupListItems}
						data-testid="virtuoso-container"
						initialTopMostItemIndex={0}
						endReached={isServerSidePagination ? handleEndReached : undefined}
						overscan={200}
						components={{
							List: React.forwardRef((props, ref) => (
								<div {...props} ref={ref} data-testid="virtuoso-item-list" role="list" />
							)),
							Footer: () => {
								if (!isServerSidePagination) return null

								if (pagination.isLoading) {
									return (
										<div
											className="flex items-center justify-center py-4 text-vscode-descriptionForeground"
											data-testid="loading-more-indicator">
											<span className="codicon codicon-loading animate-spin mr-2" />
											{t("history:loadingMore")}
										</div>
									)
								}

								if (pagination.error) {
									return (
										<div
											className="flex items-center justify-center py-4 text-vscode-errorForeground"
											data-testid="error-indicator">
											<span className="codicon codicon-error mr-2" />
											{t(pagination.error)}
										</div>
									)
								}

								if (!pagination.hasMore && groups.length > 0) {
									return (
										<div
											className="flex items-center justify-center py-4 text-vscode-descriptionForeground text-xs"
											data-testid="end-of-list-indicator">
											{t("history:endOfList")}
										</div>
									)
								}

								return null
							},
						}}
						itemContent={(_index, item) => {
							if (item.type === "header") {
								return (
									<div
										className="sticky top-0 z-10 bg-vscode-editor-background px-2 py-1.5 text-xs font-medium text-vscode-descriptionForeground uppercase tracking-wider border-b border-vscode-panel-border"
										data-testid="time-group-header">
										{item.label}
									</div>
								)
							}
							const group = item.group
							return (
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
							)
						}}
					/>
				)}
			</TabContent>

			{/* Fixed action bar at bottom - only shown in selection mode with selected items */}
			{isSelectionMode && selectedTaskIds.length > 0 && (
				<div className="fixed bottom-0 left-0 right-2 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex justify-between items-center transition-all duration-300 translate-y-0 opacity-100">
					<div className="text-vscode-foreground">
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
			)}

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
