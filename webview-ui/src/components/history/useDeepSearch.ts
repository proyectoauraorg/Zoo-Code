import { useState, useEffect, useRef, useCallback } from "react"

import { vscode } from "@/utils/vscode"

export interface DeepSearchResult {
	id: string
	snippet: string
}

export const useDeepSearch = () => {
	const [query, setQuery] = useState("")
	const [deepResults, setDeepResults] = useState<Map<string, string>>(new Map())
	const [isSearching, setIsSearching] = useState(false)
	const requestIdRef = useRef(0)
	const debounceRef = useRef<ReturnType<typeof setTimeout>>()

	const triggerSearch = useCallback((searchQuery: string) => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}

		if (searchQuery.trim().length < 3) {
			setDeepResults(new Map())
			setIsSearching(false)
			return
		}

		setIsSearching(true)
		debounceRef.current = setTimeout(() => {
			const requestId = String(++requestIdRef.current)

			const handler = (event: MessageEvent) => {
				const message = event.data

				if (message.type === "historyContentSearchResults" && message.requestId === requestId) {
					window.removeEventListener("message", handler)

					const payload: DeepSearchResult[] = message.payload || []
					const map = new Map<string, string>()
					for (const item of payload) {
						map.set(item.id, item.snippet)
					}
					setDeepResults(map)
					setIsSearching(false)
				}
			}

			window.addEventListener("message", handler)
			vscode.postMessage({
				type: "searchHistoryContent",
				text: searchQuery,
				requestId,
			})
		}, 300)
	}, [])

	useEffect(() => {
		triggerSearch(query)

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current)
			}
		}
	}, [query, triggerSearch])

	return {
		deepQuery: query,
		setDeepQuery: setQuery,
		deepResults,
		isSearching,
	}
}
