import { memo } from "react"

import { Button } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"

interface BatchActionBarProps {
	selectedCount: number
	totalCount: number
	onClearSelection: () => void
	onDeleteSelected: () => void
	onExportSelected: () => void
	onSelectAllInView: () => void
	onSelectByWorkspace: () => void
	onSelectByDateRange: (days: number) => void
	onSelectExpensive: () => void
}

export const BatchActionBar = memo(function BatchActionBar({
	selectedCount,
	totalCount,
	onClearSelection,
	onDeleteSelected,
	onExportSelected,
	onSelectAllInView,
	onSelectByWorkspace,
	onSelectByDateRange,
	onSelectExpensive,
}: BatchActionBarProps) {
	const { t } = useAppTranslation()

	return (
		<div className="fixed bottom-0 left-0 right-2 bg-vscode-editor-background border-t border-vscode-panel-border p-2 flex flex-col gap-2">
			{/* Smart selection buttons */}
			<div className="flex gap-1 flex-wrap">
				<Button variant="ghost" size="sm" onClick={onSelectAllInView} data-testid="select-all-in-view">
					<span className="codicon codicon-list-selection mr-1 text-xs" />
					{t("history:selectAllInView")}
				</Button>
				<Button variant="ghost" size="sm" onClick={onSelectByWorkspace} data-testid="select-by-workspace">
					<span className="codicon codicon-folder mr-1 text-xs" />
					{t("history:selectByWorkspace")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onSelectByDateRange(7)}
					data-testid="select-last-7-days">
					<span className="codicon codicon-calendar mr-1 text-xs" />
					{t("history:selectLast7Days")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onSelectByDateRange(30)}
					data-testid="select-last-30-days">
					<span className="codicon codicon-calendar mr-1 text-xs" />
					{t("history:selectLast30Days")}
				</Button>
				<Button variant="ghost" size="sm" onClick={onSelectExpensive} data-testid="select-expensive">
					<span className="codicon codicon-credit-card mr-1 text-xs" />
					{t("history:selectExpensive")}
				</Button>
			</div>

			{/* Action buttons */}
			<div className="flex justify-between items-center">
				<div className="text-vscode-foreground text-sm">
					{t("history:selectedItems", { selected: selectedCount, total: totalCount })}
				</div>
				<div className="flex gap-2">
					<Button variant="secondary" size="sm" onClick={onClearSelection}>
						{t("history:clearSelection")}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={onExportSelected}
						data-testid="export-selected-button">
						<span className="codicon codicon-desktop-download mr-1" />
						{t("history:exportSelected")}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={onDeleteSelected}
						data-testid="delete-selected-button">
						<span className="codicon codicon-trash mr-1" />
						{t("history:deleteSelected")}
					</Button>
				</div>
			</div>
		</div>
	)
})
