import { WebRequest } from "../packages/utils/WebRequest";
import { jest } from "@jest/globals";

it("WebRequest 유틸 테스트", () => {
    const response = WebRequest.get("https://www.google.com");
    expect(response).toBeTruthy();
});
