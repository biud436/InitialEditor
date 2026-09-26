// 인스펙터 자리. 공통 속성은 코어, 타입별 속성은 registerObjectType 의 Inspector 컴포넌트가 준다 (E2).
export function InspectorPanel() {
  return (
    <div className="panel-body">
      <div className="panel-hint">선택한 오브젝트나 자산의 속성이 여기 보인다 (E2)</div>
    </div>
  );
}
