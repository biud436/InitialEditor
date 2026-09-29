// 그래프 파일 하나를 읽어 검사하고, 오류가 없으면 생성 코드를 만든다. 에디터의 저장과 엔진 교차 검사가 같은 길을 쓴다.

import { generateComponent, type GeneratedComponent } from "./codegen";
import { GraphFormatError, parseGraph, type GraphFile } from "./format";
import { NodeLibraryError, parseNodeLibrary, type NodeLibrary } from "./library";
import { componentNameOfGraph } from "./names";
import { validateGraph, type GraphAnalysis, type GraphProblem } from "./validate";

/** 프로젝트 파일을 읽는다. 없으면 null */
export type ReadProjectText = (path: string) => Promise<string | null>;

export async function loadGraphLibraries(graph: GraphFile, read: ReadProjectText): Promise<Map<string, NodeLibrary | string>> {
  const out = new Map<string, NodeLibrary | string>();
  for (const path of graph.uses) {
    if (out.has(path)) continue;
    const text = await read(path);
    if (text === null) {
      out.set(path, "파일이 없습니다");
      continue;
    }
    try {
      out.set(path, parseNodeLibrary(path, text));
    } catch (e) {
      if (!(e instanceof NodeLibraryError)) throw e;
      out.set(path, e.message);
    }
  }
  return out;
}

export interface GraphCompileResult {
  graph: GraphFile | null;
  analysis: GraphAnalysis | null;
  problems: GraphProblem[];
  /** 오류가 없을 때만 */
  generated: GeneratedComponent | null;
}

export async function compileGraph(path: string, text: string, read: ReadProjectText): Promise<GraphCompileResult> {
  const logical = componentNameOfGraph(path);
  if (!logical) {
    return { graph: null, analysis: null, generated: null, problems: [{ severity: "error", message: `그래프 파일은 scripts/components/<폴더>/<이름>.graph.json 이어야 하고 이름은 소문자, 숫자, _ 로 씁니다: ${path}` }] };
  }
  let graph: GraphFile;
  try {
    graph = parseGraph(text);
  } catch (e) {
    if (!(e instanceof GraphFormatError)) throw e;
    return { graph: null, analysis: null, generated: null, problems: [{ severity: "error", message: e.message }] };
  }
  const analysis = validateGraph(graph, { libraries: await loadGraphLibraries(graph, read) });
  const generated = analysis.errors === 0 ? generateComponent(analysis, logical, path) : null;
  return { graph, analysis, problems: analysis.problems, generated };
}
