// 테스트 전용 진입점: @initial-editor/core/testing (vitest 안에서만 import 한다)
export { MemoryBackend } from "./memory-backend";
export { backendConformance, waitFor, type ConformanceHarness } from "./conformance";
