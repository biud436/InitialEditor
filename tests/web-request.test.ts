import { WebRequest } from "../packages/utils/WebRequest";
import { jest } from "@jest/globals";

it("wow", () => {
    const response = WebRequest.get("https://www.google.com");
    expect(response).toBeTruthy();
});
