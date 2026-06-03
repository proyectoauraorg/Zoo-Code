import { memo } from "react"

const SkeletonPulse = ({ className }: { className?: string }) => (
	<div className={`animate-pulse rounded bg-vscode-descriptionForeground/10 ${className ?? ""}`} />
)

const SkeletonTaskCard = () => (
	<div className="flex flex-col gap-2 rounded-xl bg-vscode-editor-background border border-transparent p-4">
		<div className="flex items-start gap-3">
			<SkeletonPulse className="h-4 w-3/4" />
			<SkeletonPulse className="h-4 w-8 shrink-0" />
		</div>
		<div className="flex items-center gap-2 mt-1">
			<SkeletonPulse className="h-3 w-16" />
			<SkeletonPulse className="h-3 w-3 rounded-full" />
			<SkeletonPulse className="h-3 w-12" />
		</div>
	</div>
)

const SkeletonGroupCard = () => (
	<div className="flex flex-col gap-0 rounded-xl bg-vscode-editor-background border border-transparent overflow-hidden">
		<div className="flex flex-col gap-2 p-4">
			<div className="flex items-start gap-3">
				<SkeletonPulse className="h-4 w-2/3" />
				<SkeletonPulse className="h-4 w-8 shrink-0" />
			</div>
			<div className="flex items-center gap-2 mt-1">
				<SkeletonPulse className="h-3 w-20" />
				<SkeletonPulse className="h-3 w-3 rounded-full" />
				<SkeletonPulse className="h-3 w-14" />
			</div>
		</div>
		<div className="flex items-center gap-1 px-4 pb-3 pt-0">
			<SkeletonPulse className="h-3 w-3" />
			<SkeletonPulse className="h-3 w-24" />
		</div>
	</div>
)

/**
 * Skeleton placeholder displayed while the task history loads.
 * Shows 5 alternating card/group skeletons with a pulsing animation.
 */
const HistorySkeleton = () => {
	return (
		<div
			className="flex flex-col gap-2 m-2"
			role="status"
			aria-label="Loading history"
			data-testid="history-skeleton">
			{Array.from({ length: 5 }).map((_, i) => (
				<div key={i}>{i % 2 === 0 ? <SkeletonTaskCard /> : <SkeletonGroupCard />}</div>
			))}
			<span className="sr-only">Loading task history…</span>
		</div>
	)
}

export default memo(HistorySkeleton)
