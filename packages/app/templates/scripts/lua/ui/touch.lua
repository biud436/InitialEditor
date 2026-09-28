-- 터치와 마우스를 포인터 목록 하나로 합친다 — 범용 UI 모듈 (T1)
--
-- 엔진에 멀티터치 API(Input.GetTouchCount/GetTouch)가 있으면 손가락들을,
-- 마우스(눌려 있거나 이번 틱에 떨어진 경우)를 포인터로 만들어 한 목록에 담는다.
-- 터치 API가 없는 표면(옛 빌드, 테스트의 가짜 Input)에서는 자연히 마우스만 남아
-- 기존 단일 터치 동작과 같다.
--
-- SDL은 첫 손가락을 마우스로도 흉내내므로 같은 손가락이 터치와 마우스로 두 번
-- 보일 수 있다. 방향과 버튼 판정은 합집합이라 중복은 무해하고, 포인터를 잡는
-- (소유권) 쪽은 id로 잡으므로 중복이 상태를 흔들지 않는다.
--
-- 포인터: { id, x, y, down, held, up }
--   down: 이번 틱에 눌리기 시작    held: 눌려 있음 (down인 틱 포함)
--   up:   이번 틱에 떨어짐 (이 틱을 끝으로 목록에서 사라진다)

local M = {}

--- input(엔진 Input과 같은 표면)에서 이번 틱의 포인터 목록을 만든다.
function M.pointers(input)
	local list = {}

	if input.GetTouchCount ~= nil then
		local n = input.GetTouchCount()
		for i = 1, n do
			local id, x, y, phase = input.GetTouch(i)
			if id ~= nil then
				list[#list + 1] = {
					id = id, x = x, y = y,
					down = phase == "down",
					held = phase ~= "up",
					up = phase == "up",
				}
			end
		end
	end

	local down = input.IsMouseDown(0)
	local held = down or input.IsMousePress(0)
	local up = input.IsMouseUp(0)
	if held or up then
		list[#list + 1] = {
			id = "mouse", x = input.GetMouseX(), y = input.GetMouseY(),
			down = down, held = held, up = up,
		}
	end

	return list
end

return M
