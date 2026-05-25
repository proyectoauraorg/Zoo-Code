// npx vitest run src/api/providers/fetchers/__tests__/opencode-go.spec.ts

import axios from "axios"

import { opencodeGoDefaultModelInfo } from "@roo-code/types"

import { getOpencodeGoModels, parseOpencodeGoModel } from "../opencode-go"

vitest.mock("axios")
const mockedAxios = axios as any

describe("Opencode Go Fetchers", () => {
	beforeEach(() => {
		vitest.clearAllMocks()
	})

	describe("getOpencodeGoModels", () => {
		it("maps the /models response and sends the API key as a Bearer header", async () => {
			mockedAxios.get.mockResolvedValue({
				data: {
					data: [
						{
							id: "glm-5.1",
							name: "GLM-5.1",
							description: "Zhipu GLM 5.1",
							context_window: 202752,
							max_output_tokens: 32768,
						},
						{ id: "deepseek-v4-pro", context_length: 1048576 },
					],
				},
			})

			const models = await getOpencodeGoModels("test-key")

			expect(mockedAxios.get).toHaveBeenCalledWith("https://opencode.ai/zen/go/v1/models", {
				headers: { Authorization: "Bearer test-key" },
				timeout: 10_000,
			})

			expect(Object.keys(models).sort()).toEqual(["deepseek-v4-pro", "glm-5.1"])
			expect(models["glm-5.1"]).toMatchObject({
				contextWindow: 202752,
				maxTokens: 32768,
				supportsPromptCache: false,
				description: "Zhipu GLM 5.1",
			})
			expect(models["deepseek-v4-pro"].contextWindow).toBe(1048576)
		})

		it("falls back to default context/max tokens when metadata is absent", async () => {
			mockedAxios.get.mockResolvedValue({ data: { data: [{ id: "kimi-k2.6" }] } })

			const models = await getOpencodeGoModels("k")

			expect(models["kimi-k2.6"]).toMatchObject({
				contextWindow: opencodeGoDefaultModelInfo.contextWindow,
				maxTokens: opencodeGoDefaultModelInfo.maxTokens,
				supportsPromptCache: false,
			})
		})

		it("returns an empty map on network error", async () => {
			mockedAxios.get.mockRejectedValue(new Error("network"))
			expect(await getOpencodeGoModels("k")).toEqual({})
		})
	})

	describe("parseOpencodeGoModel", () => {
		it("treats a model with no cache pricing as not cache-capable", () => {
			const info = parseOpencodeGoModel({ id: "x", context_window: 100000, max_tokens: 8000 })
			expect(info.supportsPromptCache).toBe(false)
			expect(info.contextWindow).toBe(100000)
			expect(info.maxTokens).toBe(8000)
		})
	})
})
