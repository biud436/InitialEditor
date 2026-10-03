// 분석기 워커가 에디터에 묻는 요청 (LSP 밖의 이름). 에디터 쪽은 client.ts 의 workspace 가 답한다.

/** 프로젝트 스크립트 전부: 요청 {} → WorkspaceFile[] */
export const WORKSPACE_FILES = "initial/workspaceFiles";
/** 파일 하나: 요청 { uri } → 글 또는 null */
export const READ_FILE = "initial/readFile";

export interface WorkspaceFile {
  uri: string;
  text: string;
}
