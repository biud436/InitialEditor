import { WebRequest } from "../packages/utils/WebRequest";

it("WebRequest 유틸 테스트", () => {
    const response = WebRequest.get("https://www.google.com");
    response
        .then((res) => {
            expect(res.status).toBeTruthy();
        })
        .catch((err) => {
            console.log(err);
        });
});
