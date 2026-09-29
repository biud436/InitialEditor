import { describe, expect, it } from "vitest";
import { camel, componentNameOfGraph, generatedPaths, graphPathOfComponent, isGraphPath, isLibraryPath, isLocalName, rubyClassPath, snakeCase } from "./names";

describe("그래프 이름 규칙", () => {
  it("그래프 경로와 논리 이름", () => {
    expect(componentNameOfGraph("scripts/components/flappy/bird.graph.json")).toBe("components/flappy/bird");
    expect(componentNameOfGraph("scripts/components/pipe_spawner.graph.json")).toBe("components/pipe_spawner");
    expect(componentNameOfGraph("scripts/components/Flappy/bird.graph.json")).toBeNull();
    expect(componentNameOfGraph("scripts/components/flappy/bird-2.graph.json")).toBeNull();
    expect(componentNameOfGraph("scripts/lua/components/bird.graph.json")).toBeNull();
    expect(componentNameOfGraph("scripts/components/flappy/bird.json")).toBeNull();
    expect(graphPathOfComponent("components/flappy/bird")).toBe("scripts/components/flappy/bird.graph.json");
    expect(isGraphPath("scripts/components/a.graph.json")).toBe(true);
    expect(isLibraryPath("scripts/components/flappy/common.nodes.json")).toBe(true);
    expect(isLibraryPath("resources/common.nodes.json")).toBe(false);
  });

  it("생성 파일 경로", () => {
    expect(generatedPaths("components/flappy/bird")).toEqual({
      lua: "scripts/lua/components/flappy/bird.lua",
      ruby: "scripts/ruby/components/flappy/bird.rb",
      declaration: "scripts/components/flappy/bird.json",
    });
  });

  it("Ruby 클래스 경로는 엔진 로더의 camel 과 같다", () => {
    expect(camel("pipe_spawner")).toBe("PipeSpawner");
    expect(rubyClassPath("components/flappy/bird")).toEqual(["Components", "Flappy", "Bird"]);
    expect(rubyClassPath("components/pipe_spawner")).toEqual(["Components", "PipeSpawner"]);
  });

  it("Ruby 쪽 snake_case", () => {
    expect(snakeCase("birdVy")).toBe("bird_vy");
    expect(snakeCase("readyTime")).toBe("ready_time");
    expect(snakeCase("GROUND_Y")).toBe("ground_y");
    expect(snakeCase("H")).toBe("h");
    expect(snakeCase("autoplay")).toBe("autoplay");
    expect(snakeCase("HTTPServer")).toBe("http_server");
  });

  it("지역 변수 이름", () => {
    expect(isLocalName("dt")).toBe(true);
    expect(isLocalName("birdSpeed")).toBe(true);
    for (const bad of ["Dt", "end", "st", "obj", "params", "math", "rand", "1x", "a-b", "self", "puts"]) expect(isLocalName(bad), bad).toBe(false);
  });
});
