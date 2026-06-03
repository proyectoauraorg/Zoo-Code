import { render, screen, fireEvent } from "@/utils/test-utils"

import { ExportButton } from "../ExportButton"

vi.mock("@src/utils/vscode")

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

const mockItem = {
	id: "1",
	number: 1,
	ts: Date.now(),
	task: "Test task",
	tokensIn: 100,
	tokensOut: 50,
	totalCost: 0.05,
}

describe("ExportButton", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("opens export dialog when clicked", () => {
		render(<ExportButton item={mockItem} />)

		const exportButton = screen.getByTestId("export")
		fireEvent.click(exportButton)

		// Should open the export dialog (the dialog renders a select for format)
		expect(screen.getByText("history:exportDialogTitle")).toBeInTheDocument()
	})

	it("shows export confirm button in dialog", () => {
		render(<ExportButton item={mockItem} />)

		const exportButton = screen.getByTestId("export")
		fireEvent.click(exportButton)

		expect(screen.getByTestId("export-confirm-button")).toBeInTheDocument()
	})
})
