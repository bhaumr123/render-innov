// Loaded before every test file. Extends Vitest's `expect` with DOM-aware
// matchers like `.toHaveClass()` and `.toBeInTheDocument()` — without this
// import, those methods don't exist and every test using them fails at
// runtime, not at a useful error message.
import "@testing-library/jest-dom/vitest";
