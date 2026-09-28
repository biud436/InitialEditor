import { describe, expect, it } from "vitest";
import { countText, failureText, lineLevel, nextCommands, parseDryRunLine, parseStagedLine, stagedToast } from "./stageOutput";

describe("STAGED 와 DRYRUN 줄", () => {
  it("STAGED 줄을 읽는다 (대상 경로에 공백이 있어도)", () => {
    expect(parseStagedLine("STAGED files=200 bytes=6353704 stamp=e288ba02f1df rtp=no dest=/Users/u/Initial2D/android/app/src/main/assets")).toEqual({
      files: 200,
      bytes: 6353704,
      stamp: "e288ba02f1df",
      rtp: false,
      dest: "/Users/u/Initial2D/android/app/src/main/assets",
    });
    expect(parseStagedLine("STAGED files=8 bytes=10 stamp=0123456789ab rtp=yes dest=/tmp/dest one\r\n")).toEqual({
      files: 8,
      bytes: 10,
      stamp: "0123456789ab",
      rtp: true,
      dest: "/tmp/dest one",
    });
  });

  it("모양이 다르면 null (스탬프 길이, rtp 값, 빠진 칸, 다른 줄)", () => {
    expect(parseStagedLine("STAGED files=1 bytes=2 stamp=0123 rtp=no dest=x")).toBeNull();
    expect(parseStagedLine("STAGED files=1 bytes=2 stamp=0123456789ab rtp=maybe dest=x")).toBeNull();
    expect(parseStagedLine("STAGED files=1 bytes=2 stamp=0123456789ab rtp=no")).toBeNull();
    expect(parseStagedLine("스테이징: /a -> /b")).toBeNull();
    expect(parseStagedLine("DRYRUN files=1 bytes=2 rtp=no")).toBeNull();
  });

  it("DRYRUN 줄을 읽는다", () => {
    expect(parseDryRunLine("DRYRUN files=735 bytes=26451184 rtp=yes")).toEqual({ files: 735, bytes: 26451184, rtp: true });
    expect(parseDryRunLine("DRYRUN files=0 bytes=0 rtp=no")).toEqual({ files: 0, bytes: 0, rtp: false });
    expect(parseDryRunLine("DRYRUN files=1 bytes=2")).toBeNull();
    expect(parseDryRunLine("STAGED files=1 bytes=2 stamp=0123456789ab rtp=no dest=x")).toBeNull();
  });
});

describe("문구", () => {
  it("토스트는 개수와 크기", () => {
    expect(stagedToast({ files: 200, bytes: 6353704, stamp: "e288ba02f1df", rtp: false, dest: "/x" })).toBe("안드로이드 에셋 200개, 6.1 MB");
    expect(countText({ files: 3, bytes: 1536 })).toBe("파일 3개, 1.5 KB");
  });

  it("다음 명령: SDL 소스와 Gradle 래퍼가 없으면 그것부터", () => {
    expect(nextCommands({ sdl: true, gradlew: true })).toEqual(["cd android", "./gradlew :app:assembleDebug", "adb install -r app/build/outputs/apk/debug/app-debug.apk"]);
    expect(nextCommands({ sdl: false, gradlew: false })).toEqual([
      "./android/download_sdl.sh",
      "cd android",
      "gradle wrapper --gradle-version 8.6",
      "./gradlew :app:assembleDebug",
      "adb install -r app/build/outputs/apk/debug/app-debug.apk",
    ]);
  });

  it("콘솔 수준: WARN 과 stderr 는 경고, 스크립트의 오류 줄은 오류", () => {
    expect(lineLevel("WARN rtp: RTP 변환물이 들어간다. 이 APK 는 배포하지 않는다", "stdout")).toBe("warn");
    expect(lineLevel("WARN aapt-ignored: resources/_old/a.png 는 APK 에 들어가지 않는 이름이라 뺐다", "stderr")).toBe("warn");
    expect(lineLevel("prepare_assets: game.json 이 없다: /p", "stderr")).toBe("error");
    expect(lineLevel("stage_list: [Errno 13] Permission denied", "stderr")).toBe("error");
    expect(lineLevel("cp: 무엇", "stderr")).toBe("warn");
    expect(lineLevel("스테이징: /a -> /b", "stdout")).toBe("info");
  });

  it("실패 이유는 마지막 오류 줄에서 머리를 뗀 것, 없으면 종료 코드", () => {
    expect(failureText(2, ["WARN aapt-ignored: x", "prepare_assets: game.json 이 없다: /p", ""])).toBe("game.json 이 없다: /p");
    expect(failureText(1, [])).toBe("스크립트가 종료되었습니다 (종료 코드 1)");
    expect(failureText(null, [])).toBe("스크립트가 시그널로 종료되었습니다");
  });
});
