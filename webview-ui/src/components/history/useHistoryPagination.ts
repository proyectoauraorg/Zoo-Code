import { useState, useCallback, useRef, useEffect } from "react"
import type { HistoryItem, ExtensionMessage } from "@roo-code/types"
import { vscode } from "@/utils/vscode"

type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

interface UseHistoryPaginationOptions {
	sortOption: SortOption
	showAllWorkspaces: boolean
	enabled?: boolean
	pageSize?: number
}

interface UseHistoryPaginationResult {
	tasks: HistoryItem[]
	isLoading: boolean
	hasMore: boolean
	loadMore: () => void
	reset: () => void
	error: string | null
}

export function useHistoryPagination(options: UseHistoryPaginationOptions): UseHistoryPaginationResult {
	const { sortOption, showAllWorkspaces, enabled = true, pageSize = 50 } = options
	const [tasks, setTasks] = useState<HistoryItem[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [hasMore, setHasMore] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const nextCursorRef = useRef<string | undefined>(undefined)
	const requestIdRef = useRef(0)
	const pendingRequestRef = useRef<string | null>(null)
	const isLoadingRef = useRef(false)

	// Keep ref in sync with state
	useEffect(() => {
		isLoadingRef.current = isLoading
	}, [isLoading])

	const loadPage = useCallback(
		(cursor?: string) => {
			if (!enabled || isLoadingRef.current) return

			setIsLoading(true)
			isLoadingRef.current = true
			setError(null)

			const requestId = `history-${++requestIdRef.current}-${Date.now()}`
			pendingRequestRef.current = requestId

			// Map sortOption: "mostRelevant" should never reach here, but guard anyway
			const serverSortOption =
				sortOption === "mostRelevant"
					? "newest"
					: (sortOption as "newest" | "oldest" | "mostExpensive" | "mostTokens")

			vscode.postMessage({
				type: "getHistoryPage",
				requestId,
				sortOption: serverSortOption,
				showAllWorkspaces,
				cursor,
				pageSize,
			})
		},
		[enabled, sortOption, showAllWorkspaces, pageSize],
	)

	// Listen for responses from extension host
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type !== "historyPageResponse") return
			if (message.historyPageRequestId !== pendingRequestRef.current) return

			pendingRequestRef.current = null
			setIsLoading(false)
			isLoadingRef.current = false

			if (message.historyPageTasks) {
				const isLoadMore = nextCursorRef.current !== undefined

				if (isLoadMore) {
					setTasks((prev) => [...prev, ...message.historyPageTasks!])
				} else {
					setTasks(message.historyPageTasks)
				}

				nextCursorRef.current = message.historyPageNextCursor
				setHasMore(message.historyPageHasMore ?? false)
			} else {
				setError("history:errorLoading")
				setIsLoading(false)
				isLoadingRef.current = false
			}
		}

		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [])

	// Reset all pagination state
	const reset = useCallback(() => {
		setTasks([])
		setHasMore(true)
		nextCursorRef.current = undefined
		pendingRequestRef.current = null
		setIsLoading(false)
		isLoadingRef.current = false
		setError(null)
	}, [])

	// Auto-reset and load first page when filters change
	useEffect(() => {
		if (!enabled) return

		reset()
		// Use setTimeout to ensure reset state takes effect before loading
		const timer = setTimeout(() => {
			loadPage(undefined)
		}, 0)

		return () => clearTimeout(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps -- loadPage identity is stable via refs
	}, [sortOption, showAllWorkspaces, enabled, pageSize])

	// Load next page
	const loadMore = useCallback(() => {
		if (!hasMore || isLoadingRef.current || !nextCursorRef.current) return
		loadPage(nextCursorRef.current)
	}, [hasMore, loadPage])

	return { tasks, isLoading, hasMore, loadMore, reset, error }
}
