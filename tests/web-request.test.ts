import { WebRequest } from "../packages/utils/WebRequest";

// beforeEach(() => {
//     console.log("왜 어지럽지");
// });
// afterAll(fn, timeout)
// afterEach(fn, timeout)
// beforeAll(fn, timeout)
// beforeEach(fn, timeout)
// describe(name, fn)
// describe.each(table)(name, fn, timeout)
// describe.only(name, fn)
// describe.only.each(table)(name, fn)
// describe.skip(name, fn)
// describe.skip.each(table)(name, fn)
// test(name, fn, timeout)
// test.concurrent(name, fn, timeout)
// test.concurrent.each(table)(name, fn, timeout)
// test.concurrent.only.each(table)(name, fn)
// test.concurrent.skip.each(table)(name, fn)
// test.each(table)(name, fn, timeout)
// test.only(name, fn, timeout)
// test.only.each(table)(name, fn)
// test.skip(name, fn)
// test.skip.each(table)(name, fn)
// test.todo(name)

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

// 모든 테스트가 끝난 후 실행됩니다.
afterAll(() => {
    console.log("테스트가 종료되었습니다.");
});
