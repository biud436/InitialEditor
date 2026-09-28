// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NewProjectForm, TEMPLATE_HELP } from "./NewProjectDialog";
import type { ProjectTemplateOptions } from "./projectTemplates";

afterEach(cleanup);

function setup(initialName = "mygame") {
  const submitted: ProjectTemplateOptions[] = [];
  render(<NewProjectForm initialName={initialName} folder="/work/mygame" onSubmit={(o) => submitted.push(o)} onCancel={() => undefined} />);
  return { submitted };
}

const select = (id: string) => screen.getByTestId(id) as HTMLSelectElement;

describe("새 프로젝트 대화상자", () => {
  it("템플릿은 빈 프로젝트, 플래피버드, 타일맵 셋이고 처음은 빈 프로젝트", () => {
    setup();
    const options = [...select("new-project-template").options].map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ["empty", "빈 프로젝트 (씬 1개)"],
      ["flappy", "플래피버드 (씬과 컴포넌트)"],
      ["tilemap", "타일맵"],
    ]);
    expect(select("new-project-template").value).toBe("empty");
    expect(screen.getByTestId("new-project-template-help").textContent).toBe(TEMPLATE_HELP.empty);
  });

  it("타일맵을 고르면 설명이 바뀌고 만들기가 그 템플릿과 언어를 넘긴다", () => {
    const { submitted } = setup();
    fireEvent.change(select("new-project-template"), { target: { value: "tilemap" } });
    expect(screen.getByTestId("new-project-template-help").textContent).toBe(TEMPLATE_HELP.tilemap);
    expect(TEMPLATE_HELP.tilemap).toContain("resources/maps/start.json");
    fireEvent.change(select("new-project-language"), { target: { value: "mruby" } });
    expect(screen.getByTestId("new-project-language-help").textContent).toContain("mruby");
    fireEvent.click(screen.getByTestId("new-project-ok"));
    expect(submitted).toEqual([{ template: "tilemap", language: "mruby", name: "mygame" }]);
  });

  it("이름이 비면 만들 수 없다", () => {
    const { submitted } = setup("");
    const ok = screen.getByTestId("new-project-ok") as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("new-project-name"), { target: { value: "  game  " } });
    expect(ok.disabled).toBe(false);
    fireEvent.click(ok);
    expect(submitted).toEqual([{ template: "empty", language: "lua", name: "game" }]);
  });
});
