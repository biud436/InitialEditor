import { WebRequest } from "../packages/utils/WebRequest";

// test의 별칭이 it이다.
// test(name, fn, timeout)
test("WebRequest 유틸 테스트", () => {
    const response = WebRequest.get("https://www.google.com");
    response
        .then((res) => {
            expect(res.status).toEqual(true);
        })
        .catch((err) => {
            console.log(err);
        });
});
