// 컴포넌트 매개변수 선언 파일(scripts/components/**/*.json)의 JSON 스키마. Monaco 의 JSON 진단과 자동 완성이 쓴다
// (monaco.ts 가 등록한다). 규칙의 정본은 코어의 parseComponentDeclaration 과 엔진 docs/plans/r1-scene-loader.md 5.4절이다.

import { COMPONENT_DECLARATION_VERSION, COMPONENT_FIELD_TYPES } from "@initial-editor/core";

export const DECLARATION_SCHEMA_URI = "initial://schemas/component-declaration.json";
export const DECLARATION_FILE_MATCH = ["**/scripts/components/*.json", "**/scripts/components/**/*.json"];

export const DECLARATION_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "컴포넌트 매개변수 선언",
  type: "object",
  required: ["version"],
  properties: {
    version: { const: COMPONENT_DECLARATION_VERSION, description: "선언 파일 판 (1)" },
    fields: { type: "array", description: "매개변수 목록. 배열 순서가 인스펙터의 표시 순서", items: { $ref: "#/definitions/field" } },
  },
  definitions: {
    field: {
      type: "object",
      required: ["key", "type"],
      properties: {
        key: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$", description: "컴포넌트가 읽는 이름 (영문자나 _로 시작하는 영문, 숫자, _)" },
        type: { enum: [...COMPONENT_FIELD_TYPES], description: "string, text(여러 줄), number, integer, boolean, enum(values 중 하나), object(씬 오브젝트 id)" },
        label: { type: "string", description: "인스펙터에 보이는 이름" },
        default: { description: "기본값. 형식에 맞아야 함" },
        values: { type: "array", minItems: 1, items: { type: "string", minLength: 1 }, description: "enum 의 값 목록" },
        min: { type: "number", description: "number, integer 의 최솟값" },
        max: { type: "number", description: "number, integer 의 최댓값" },
      },
      allOf: [
        { if: { properties: { type: { const: "enum" } } }, then: { required: ["values"] }, else: { not: { required: ["values"] } } },
        { if: { properties: { type: { enum: ["string", "text", "boolean", "enum", "object"] } } }, then: { not: { anyOf: [{ required: ["min"] }, { required: ["max"] }] } } },
      ],
    },
  },
} as const;
