// npx vitest run api/providers/__tests__/openai-codex-responses.spec.ts

import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"
import { Anthropic } from "@anthropic-ai/sdk"
import { openAiModelInfoSaneDefaults } from "@roo-code/types"

const mockChatCreate = vitest.fn()
const mockResponsesCreate = vitest.fn()

vitest.mock("openai", () => {
	const mockConstructor = vitest.fn()
	return {
		__esModule: true,
		default: mockConstructor.mockImplementation(() => ({
			chat: {
				completions: {
					create: mockChatCreate,
				},
			},
			responses: {
				create: mockResponsesCreate,
			},
		})),
		AzureOpenAI: mockConstructor.mockImplementation(() => ({
			chat: {
				completions: {
					create: mockChatCreate,
				},
			},
			responses: {
				create: mockResponsesCreate,
			},
		})),
	}
})

describe("OpenAiHandler - Codex model detection", () => {
	let handler: OpenAiHandler

	beforeEach(() => {
		mockChatCreate.mockClear()
		mockResponsesCreate.mockClear()
	})

	describe("_isCodexModel", () => {
		it("should detect gpt-5.3-codex as a codex model", () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiBaseUrl: "https://test.openai.azure.com/openai/deployments/gpt5.3",
				openAiUseAzure: true,
			})
			// Access the protected method via any cast
			expect((handler as any)._isCodexModel("gpt-5.3-codex")).toBe(true)
		})

		it("should detect gpt-5.1-codex as a codex model", () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.1-codex",
			})
			expect((handler as any)._isCodexModel("gpt-5.1-codex")).toBe(true)
		})

		it("should detect codex in a case-insensitive manner", () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "GPT-5.3-CODEX",
			})
			expect((handler as any)._isCodexModel("GPT-5.3-CODEX")).toBe(true)
		})

		it("should not detect regular models as codex", () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-4",
			})
			expect((handler as any)._isCodexModel("gpt-4")).toBe(false)
			expect((handler as any)._isCodexModel("gpt-4o")).toBe(false)
			expect((handler as any)._isCodexModel("o3-mini")).toBe(false)
		})
	})

	describe("createMessage with codex model", () => {
		it("should use Responses API for codex models instead of Chat Completions", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiBaseUrl: "https://test.openai.azure.com/openai/deployments/gpt5.3",
				openAiUseAzure: true,
			})

			// Mock the responses.create to return a streaming async iterable
			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						type: "response.output_text.delta",
						delta: "Hello from codex!",
					}
					yield {
						type: "response.done",
						response: {
							usage: {
								input_tokens: 10,
								output_tokens: 5,
							},
						},
					}
				},
			})

			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const chunks: any[] = []
			for await (const chunk of handler.createMessage("You are a helpful assistant", messages, {
				taskId: "test",
			})) {
				chunks.push(chunk)
			}

			// Verify responses.create was called, NOT chat.completions.create
			expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
			expect(mockChatCreate).not.toHaveBeenCalled()

			// Verify the request body structure
			const requestBody = mockResponsesCreate.mock.calls[0][0]
			expect(requestBody.model).toBe("gpt-5.3-codex")
			expect(requestBody.stream).toBe(true)
			expect(requestBody.instructions).toBe("You are a helpful assistant")
			expect(requestBody.input).toBeDefined()
			expect(Array.isArray(requestBody.input)).toBe(true)

			// Verify chunks
			const textChunks = chunks.filter((c) => c.type === "text")
			expect(textChunks.length).toBe(1)
			expect(textChunks[0].text).toBe("Hello from codex!")

			const usageChunks = chunks.filter((c) => c.type === "usage")
			expect(usageChunks.length).toBe(1)
			expect(usageChunks[0].inputTokens).toBe(10)
			expect(usageChunks[0].outputTokens).toBe(5)
		})

		it("should use Chat Completions for non-codex models", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-4",
				openAiBaseUrl: "https://api.openai.com/v1",
			})

			mockChatCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [{ delta: { content: "Hello" }, index: 0 }],
						usage: null,
					}
					yield {
						choices: [{ delta: {}, index: 0 }],
						usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
					}
				},
			})

			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const chunks: any[] = []
			for await (const chunk of handler.createMessage("System", messages, { taskId: "test" })) {
				chunks.push(chunk)
			}

			// Verify chat.completions.create was called, NOT responses.create
			expect(mockChatCreate).toHaveBeenCalledTimes(1)
			expect(mockResponsesCreate).not.toHaveBeenCalled()
		})
	})

	describe("createMessage codex conversation formatting", () => {
		it("should format conversation with tool use correctly for Responses API", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiBaseUrl: "https://test.openai.azure.com/openai/deployments/gpt5.3",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						type: "response.output_text.delta",
						delta: "Done.",
					}
					yield {
						type: "response.done",
						response: {
							usage: { input_tokens: 20, output_tokens: 3 },
						},
					}
				},
			})

			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "What is 1+1?" },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Let me calculate that." },
						{ type: "tool_use", id: "call_123", name: "calculator", input: { expression: "1+1" } },
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "call_123",
							content: "2",
						},
					],
				},
			]

			for await (const _chunk of handler.createMessage("You are helpful", messages, { taskId: "test" })) {
				// consume
			}

			const requestBody = mockResponsesCreate.mock.calls[0][0]
			const input = requestBody.input

			// First item: user message
			expect(input[0].role).toBe("user")
			expect(input[0].content[0].type).toBe("input_text")
			expect(input[0].content[0].text).toBe("What is 1+1?")

			// Second item: assistant text
			expect(input[1].role).toBe("assistant")
			expect(input[1].content[0].type).toBe("output_text")

			// Third item: function_call
			expect(input[2].type).toBe("function_call")
			expect(input[2].name).toBe("calculator")

			// Fourth item: function_call_output
			expect(input[3].type).toBe("function_call_output")
			expect(input[3].output).toBe("2")
		})

		it("converts tools to the flat Responses API schema (not nested under `function`)", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiBaseUrl: "https://test.openai.azure.com/openai/deployments/gpt5.3",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield { type: "response.done", response: { usage: { input_tokens: 1, output_tokens: 1 } } }
				},
			})

			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }]
			// Chat Completions nested tool shape (what the rest of the handler receives).
			const tools = [
				{
					type: "function",
					function: {
						name: "calculator",
						description: "Evaluate a math expression",
						parameters: {
							type: "object",
							properties: { expression: { type: "string" } },
							required: ["expression"],
						},
					},
				},
			]

			for await (const _chunk of handler.createMessage("You are helpful", messages, {
				taskId: "test",
				tools,
			} as any)) {
				// Consume the stream so responses.create is invoked.
			}

			const requestBody = mockResponsesCreate.mock.calls[0][0]
			expect(Array.isArray(requestBody.tools)).toBe(true)
			expect(requestBody.tools).toHaveLength(1)

			const tool = requestBody.tools[0]
			// Flat structure: fields live at the top level, not under `function`.
			expect(tool.type).toBe("function")
			expect(tool.name).toBe("calculator")
			expect(tool.description).toBe("Evaluate a math expression")
			expect(tool.function).toBeUndefined()
			expect(tool.parameters).toBeDefined()
			expect(tool.parameters.properties).toBeDefined()
			// Non-MCP tools are sent with strict schema validation enabled.
			expect(tool.strict).toBe(true)
		})
	})

	describe("createMessage codex tool call streaming", () => {
		it("should handle tool call events from the Responses API", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						type: "response.output_item.added",
						item: {
							type: "function_call",
							call_id: "call_abc",
							name: "read_file",
						},
					}
					yield {
						type: "response.function_call_arguments.delta",
						call_id: "call_abc",
						name: "read_file",
						delta: '{"path":',
						index: 0,
					}
					yield {
						type: "response.function_call_arguments.delta",
						call_id: "call_abc",
						name: "read_file",
						delta: '"test.ts"}',
						index: 0,
					}
					yield {
						type: "response.function_call_arguments.done",
						call_id: "call_abc",
					}
					yield {
						type: "response.done",
						response: {
							usage: { input_tokens: 5, output_tokens: 10 },
						},
					}
				},
			})

			const chunks: any[] = []
			for await (const chunk of handler.createMessage("System", [{ role: "user", content: "Read test.ts" }], {
				taskId: "test",
			})) {
				chunks.push(chunk)
			}

			const partialCalls = chunks.filter((c) => c.type === "tool_call_partial")
			expect(partialCalls.length).toBe(2)
			expect(partialCalls[0].id).toBe("call_abc")
			expect(partialCalls[0].name).toBe("read_file")
			expect(partialCalls[0].arguments).toBe('{"path":')
			expect(partialCalls[1].arguments).toBe('"test.ts"}')
		})

		it("should handle complete tool calls from output_item.done", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						type: "response.output_item.added",
						item: {
							type: "function_call",
							call_id: "call_xyz",
							name: "write_file",
						},
					}
					yield {
						type: "response.output_item.done",
						item: {
							type: "function_call",
							call_id: "call_xyz",
							name: "write_file",
							arguments: '{"path":"out.txt","content":"hello"}',
						},
					}
					yield {
						type: "response.done",
						response: {
							usage: { input_tokens: 5, output_tokens: 10 },
						},
					}
				},
			})

			const chunks: any[] = []
			for await (const chunk of handler.createMessage("System", [{ role: "user", content: "Write file" }], {
				taskId: "test",
			})) {
				chunks.push(chunk)
			}

			const toolCalls = chunks.filter((c) => c.type === "tool_call")
			expect(toolCalls.length).toBe(1)
			expect(toolCalls[0].id).toBe("call_xyz")
			expect(toolCalls[0].name).toBe("write_file")
			expect(toolCalls[0].arguments).toBe('{"path":"out.txt","content":"hello"}')
		})
	})

	describe("completePrompt with codex model", () => {
		it("should use Responses API for codex models in completePrompt", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiBaseUrl: "https://test.openai.azure.com/openai/deployments/gpt5.3",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								text: "Completed prompt response",
							},
						],
					},
				],
			})

			const result = await handler.completePrompt("Complete this")

			expect(mockResponsesCreate).toHaveBeenCalledTimes(1)
			expect(mockChatCreate).not.toHaveBeenCalled()

			const requestBody = mockResponsesCreate.mock.calls[0][0]
			expect(requestBody.model).toBe("gpt-5.3-codex")
			expect(requestBody.stream).toBe(false)
			expect(requestBody.input[0].role).toBe("user")

			expect(result).toBe("Completed prompt response")
		})

		it("should use Chat Completions for non-codex models in completePrompt", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-4",
				openAiBaseUrl: "https://api.openai.com/v1",
			})

			mockChatCreate.mockResolvedValue({
				choices: [
					{
						message: { role: "assistant", content: "Chat completion response" },
						finish_reason: "stop",
						index: 0,
					},
				],
				usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
			})

			const result = await handler.completePrompt("Complete this")

			expect(mockChatCreate).toHaveBeenCalledTimes(1)
			expect(mockResponsesCreate).not.toHaveBeenCalled()
			expect(result).toBe("Chat completion response")
		})
	})

	describe("createMessage codex error handling", () => {
		it("should handle API errors from Responses API", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockRejectedValue(new Error("API rate limit exceeded"))

			await expect(async () => {
				for await (const _chunk of handler.createMessage("System", [{ role: "user", content: "Hello" }], {
					taskId: "test",
				})) {
					// consume
				}
			}).rejects.toThrow()
		})

		it("should handle error events in the stream", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						type: "response.error",
						error: { message: "Something went wrong" },
					}
				},
			})

			await expect(async () => {
				for await (const _chunk of handler.createMessage("System", [{ role: "user", content: "Hello" }], {
					taskId: "test",
				})) {
					// consume
				}
			}).rejects.toThrow("Responses API error: Something went wrong")
		})

		it("throws on an error event even when it carries no error/message details", async () => {
			handler = new OpenAiHandler({
				openAiApiKey: "test-key",
				openAiModelId: "gpt-5.3-codex",
				openAiUseAzure: true,
			})

			mockResponsesCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield { type: "response.failed" }
				},
			})

			await expect(async () => {
				for await (const _chunk of handler.createMessage("System", [{ role: "user", content: "Hello" }], {
					taskId: "test",
				})) {
					// consume
				}
			}).rejects.toThrow("Response failed: Unknown failure")
		})
	})

	const codexOptions = (overrides: Partial<ApiHandlerOptions> = {}): ApiHandlerOptions => ({
		openAiApiKey: "test-key",
		openAiModelId: "gpt-5.3-codex",
		openAiUseAzure: true,
		...overrides,
	})

	const collect = async (
		h: OpenAiHandler,
		messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hi" }],
	) => {
		const chunks: any[] = []
		for await (const chunk of h.createMessage("System", messages, { taskId: "test" })) {
			chunks.push(chunk)
		}
		return chunks
	}

	const streamOf = (...events: any[]) => ({
		[Symbol.asyncIterator]: async function* () {
			for (const e of events) yield e
		},
	})

	describe("createMessage codex non-streaming path", () => {
		it("extracts tool calls, text, message content, reasoning and usage from a non-streaming response", async () => {
			handler = new OpenAiHandler(codexOptions({ openAiStreamingEnabled: false }))

			mockResponsesCreate.mockResolvedValue({
				output: [
					{ type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.ts"}' },
					{ type: "output_text", text: "top-level text" },
					{ type: "message", content: [{ type: "output_text", text: "message text" }] },
					{ type: "reasoning", summary: [{ text: "thinking out loud" }] },
				],
				usage: {
					input_tokens: 7,
					output_tokens: 11,
					cache_read_input_tokens: 2,
					cache_creation_input_tokens: 3,
				},
			})

			const chunks = await collect(handler)

			expect(mockResponsesCreate.mock.calls[0][0].stream).toBe(false)

			const toolCalls = chunks.filter((c) => c.type === "tool_call")
			expect(toolCalls).toHaveLength(1)
			expect(toolCalls[0]).toMatchObject({ id: "c1", name: "read_file", arguments: '{"path":"a.ts"}' })

			const texts = chunks.filter((c) => c.type === "text").map((c) => c.text)
			expect(texts).toEqual(["top-level text", "message text"])

			const reasoning = chunks.filter((c) => c.type === "reasoning")
			expect(reasoning[0].text).toBe("thinking out loud")

			const usage = chunks.find((c) => c.type === "usage")
			expect(usage).toMatchObject({ inputTokens: 7, outputTokens: 11, cacheReadTokens: 2, cacheWriteTokens: 3 })
		})

		it("stringifies object tool-call arguments in the non-streaming path", async () => {
			handler = new OpenAiHandler(codexOptions({ openAiStreamingEnabled: false }))

			mockResponsesCreate.mockResolvedValue({
				output: [{ type: "tool_call", id: "c2", name: "search", input: { query: "x" } }],
			})

			const chunks = await collect(handler)
			const toolCalls = chunks.filter((c) => c.type === "tool_call")
			expect(toolCalls[0]).toMatchObject({ id: "c2", name: "search", arguments: '{"query":"x"}' })
		})

		it("wraps non-streaming API errors via handleOpenAIError", async () => {
			handler = new OpenAiHandler(codexOptions({ openAiStreamingEnabled: false }))
			mockResponsesCreate.mockRejectedValue(new Error("boom"))
			await expect(collect(handler)).rejects.toThrow()
		})
	})

	describe("createMessage codex streaming event variants", () => {
		it("emits text from a done-only event when no delta was seen", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(streamOf({ type: "response.output_text.done", text: "final text" }))
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["final text"])
		})

		it("emits text from a content_part event when no delta was seen", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(
				streamOf({ type: "response.content_part.added", part: { type: "output_text", text: "part text" } }),
			)
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["part text"])
		})

		it("emits reasoning from reasoning delta events", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(
				streamOf({ type: "response.reasoning_summary_text.delta", delta: "step 1" }),
			)
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "reasoning").map((c) => c.text)).toEqual(["step 1"])
		})

		it("emits refusal text from refusal delta events", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(streamOf({ type: "response.refusal.delta", delta: "cannot help" }))
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["[Refusal] cannot help"])
		})

		it("emits text from an output_item.added message", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(
				streamOf({
					type: "response.output_item.added",
					item: { type: "message", content: [{ type: "output_text", text: "added msg" }] },
				}),
			)
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["added msg"])
		})

		it("falls back to text from an output_item.done message when no text was streamed", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(
				streamOf({
					type: "response.output_item.done",
					item: { type: "message", content: [{ type: "output_text", text: "done msg" }] },
				}),
			)
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["done msg"])
		})

		it("extracts fallback text and usage from a response.done payload when nothing streamed", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(
				streamOf({
					type: "response.completed",
					response: {
						output: [{ type: "message", content: [{ type: "output_text", text: "completed text" }] }],
						usage: { input_tokens: 4, output_tokens: 6 },
					},
				}),
			)
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["completed text"])
			expect(chunks.find((c) => c.type === "usage")).toMatchObject({ inputTokens: 4, outputTokens: 6 })
		})

		it("supports the older choices/usage fallback shape", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(
				streamOf({
					choices: [{ delta: { content: "legacy chunk" } }],
					usage: { prompt_tokens: 9, completion_tokens: 2 },
				}),
			)
			const chunks = await collect(handler)
			expect(chunks.filter((c) => c.type === "text").map((c) => c.text)).toEqual(["legacy chunk"])
			expect(chunks.find((c) => c.type === "usage")).toMatchObject({ inputTokens: 9, outputTokens: 2 })
		})
	})

	describe("createMessage codex request body + conversation formatting", () => {
		it("includes max_output_tokens when includeMaxTokens is enabled", async () => {
			handler = new OpenAiHandler(codexOptions({ includeMaxTokens: true, modelMaxTokens: 1234 }))
			mockResponsesCreate.mockResolvedValue(streamOf({ type: "response.output_text.delta", delta: "x" }))
			await collect(handler)
			expect(mockResponsesCreate.mock.calls[0][0].max_output_tokens).toBe(1234)
		})

		it("formats image blocks, array tool_result content and assistant string content", async () => {
			handler = new OpenAiHandler(codexOptions())
			mockResponsesCreate.mockResolvedValue(streamOf({ type: "response.output_text.delta", delta: "ok" }))

			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "look" },
						{
							type: "image",
							source: { type: "base64", media_type: "image/png", data: "AAAA" },
						},
					],
				},
				{ role: "assistant", content: "sure thing" },
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "call_1",
							content: [{ type: "text", text: "result body" }],
						},
					],
				},
			]

			await collect(handler, messages)
			const input = mockResponsesCreate.mock.calls[0][0].input

			const userImage = input[0].content.find((c: any) => c.type === "input_image")
			expect(userImage.image_url).toBe("data:image/png;base64,AAAA")

			const assistant = input.find((i: any) => i.role === "assistant")
			expect(assistant.content[0]).toMatchObject({ type: "output_text", text: "sure thing" })

			const toolOutput = input.find((i: any) => i.type === "function_call_output")
			expect(toolOutput.output).toBe("result body")
		})
	})
})
