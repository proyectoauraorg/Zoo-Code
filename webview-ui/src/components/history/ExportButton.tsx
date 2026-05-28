import { useState, useCallback } from "react"
import type { HistoryItem } from "@roo-code/types"

import { Button, StandardTooltip } from "@/components/ui"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { ExportDialog } from "./ExportDialog"

interface ExportButtonProps {
	item: HistoryItem
}

export const ExportButton = ({ item }: ExportButtonProps) => {
	const { t } = useAppTranslation()
	const [showDialog, setShowDialog] = useState(false)

	const handleExportClick = useCallback((e: React.MouseEvent) => {
		e.stopPropagation()
		setShowDialog(true)
	}, [])

	return (
		<>
			<StandardTooltip content={t("history:exportTask")}>
				<Button
					data-testid="export"
					variant="ghost"
					size="icon"
					className="group-hover:opacity-100 opacity-50 transition-opacity"
					onClick={handleExportClick}>
					<span className="codicon codicon-desktop-download scale-80" />
				</Button>
			</StandardTooltip>
			{showDialog && <ExportDialog tasks={[item]} open={showDialog} onOpenChange={setShowDialog} />}
		</>
	)
}
