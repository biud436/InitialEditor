import { WebRequest } from "../packages/utils/WebRequest";

// ! 이 파일의 모든 테스트가 완료된 후 함수를 실행합니다.
// afterAll(fn, timeout)
// ! 이 파일의 각 테스트가 완료된 후 함수를 실행합니다.
// afterEach(fn, timeout)
// ! 이 파일의 테스트가 실행되기 전에 함수를 실행합니다.
// beforeAll(fn, timeout)
// ! 이 파일의 각 테스트가 실행되기 전에 함수를 실행합니다.
// beforeEach(fn, timeout)
// ! 여러 관련 테스트를 그룹화하는 블록을 만듭니다.
// describe(name, fn)
// ! 데이터가 다른 동일한 테스트 스위트를 계속 복제하는 경우 사용 합니다.
// ! https://jestjs.io/docs/api#describeeachtablename-fn-timeout
// describe.each(table)(name, fn, timeout)
// ! 하나의 설명 블록만 실행하려는 경우
// describe.only(name, fn)
// ! 데이터 기반 테스트의 특정 테스트 모음만 실행하려는 경우
// describe.only.each(table)(name, fn)
// ! 특정 설명 블록을 실행하지 않으려는 경우 (주석 대체)
// describe.skip(name, fn)
// ! 일련의 데이터 기반 테스트 실행을 중지하려는 경우 사용
// describe.skip.each(table)(name, fn)
// ! 단위 테스트 시작
// test(name, fn, timeout)
// ! 테스트를 동시에 실행하려는 경우
// test.concurrent(name, fn, timeout)
// ! 다른 데이터로 동일한 테스트를 계속 복제하는 경우 사용
// test.concurrent.each(table)(name, fn, timeout)
// ! 다른 테스트 데이터로 특정 테스트만 동시에 실행하려는 경우에 사용
// test.concurrent.only.each(table)(name, fn)
// ! 비동기 데이터 기반 테스트 모음 실행을 중지하려는 경우 사용
// test.concurrent.skip.each(table)(name, fn)
// ! 다른 데이터로 동일한 테스트를 계속 복제하는 경우 사용
// test.each(table)(name, fn, timeout)
// ! 해당 테스트 파일에서 실행할 유일한 테스트를 지정할 수 있음.
// test.only(name, fn, timeout)
// ! 다른 테스트 데이터로 특정 테스트만 실행하려는 경우 사용 합니다.
// test.only.each(table)(name, fn)
// ! 큰 코드베이스를 유지 관리할 때 어떤 이유로 일시적으로 중단된 테스트를 찾을 수 있습니다.
// test.skip(name, fn)
// ! 데이터 기반 테스트 모음 실행을 중지하려는 경우 사용
// test.skip.each(table)(name, fn)
// ! 테스트 작성을 계획할 때 사용 합니다.
// test.todo(name)

// ! test의 별칭이 it이다.
// test(name, fn, timeout)

function getHelloWorld() {
    return "Hello World";
}

describe("WebRequest and Regexp Test", () => {
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

    test("정규표현식 테스트", () => {
        const result = getHelloWorld();
        expect(result).toMatch(/Hello World/);
    });
});

// 모든 테스트가 끝난 후 실행됩니다.
afterAll(() => {
    console.log("테스트가 종료되었습니다.");
});
