 -- Image Object
 -- 
 -- Author : biud436
 -- Date : 2019.04.28
 --
function Image(path, x, y, width, height, max_frames, id)

	local self = {}
	
	self.spriteId = nil
	local isReady = false
		
	function self.create(path, x, y, width, height, max_frames, id)
		isReady = TextureManager.Load(path, id)	
		self.spriteId = Sprite.Create(x, y, width, height, max_frames, id)
	end
	
	function self.update(elapsed)
		if isReady == false then return end		
		Sprite.Update(self.spriteId, elapsed)
	end
	
	function self.draw()
		if isReady == false then return end		
		Sprite.Draw(self.spriteId)
	end
	
	function self.dispose()
		if isReady == false then return end
		TextureManager.Remove(id)
	end
	
	function self.getPosition()
		if isReady == false then return end
		return Sprite.GetPosition(self.spriteId)
	end
		
	function self.getScale()
		if isReady == false then return end
		return Sprite.GetScale(self.spriteId)
	end
	
	function self.getWidth()
		if isReady == false then return end
		return Sprite.GetWidth(self.spriteId)
	end
	
	function self.getHeight()
		if isReady == false then return end
		return Sprite.GetHeight(self.spriteId)
	end
	
	function self.getRadians()
		if isReady == false then return end
		return Sprite.GetRadians(self.spriteId)
	end	
	
	function self.getAngle()
		if isReady == false then return end
		return Sprite.GetAngle(self.spriteId)
	end		
	
	function self.getVisible()
		if isReady == false then return end
		return Sprite.GetVisible(self.spriteId)
	end		

	function self.getOpacity()
		if isReady == false then return end
		return Sprite.GetOpacity(self.spriteId)
	end			
		
	function self.getFrameDelay()
		if isReady == false then return end
		return Sprite.GetFrameDelay(self.spriteId)
	end			
	
	function self.getStartFrame()
		if isReady == false then return end
		return Sprite.GetStartFrame(self.spriteId)
	end				
	
	function self.getEndFrame()
		if isReady == false then return end
		return Sprite.GetEndFrame(self.spriteId)
	end				
	
	function self.getCurrentFrame()
		if isReady == false then return end
		return Sprite.GetCurrentFrame(self.spriteId)
	end			

	function self.getAnimComplete()
		if isReady == false then return end
		return Sprite.GetAnimComplete(self.spriteId)
	end
	
	function self.getRect()
		if isReady == false then return end
		return Sprite.GetRect(self.spriteId)
	end	
	
	function self.setPosition(x, y)
		if isReady == false then return end
		Sprite.SetPosition(self.spriteId, x, y)
	end
		
	function self.setScale(n)
		if isReady == false then return end
		Sprite.SetScale(self.spriteId, n)
	end	
	
	function self.setAngle(degree)
		if isReady == false then return end
		Sprite.SetAngle(self.spriteId, degree)
	end			
	
	function self.setRadians(rotation)
		if isReady == false then return end
		Sprite.SetRadians(self.spriteId, rotation)
	end	
		
	function self.setVisible(visible)
		if isReady == false then return end
		Sprite.SetVisible(self.spriteId, visible)
	end

	function self.setOpacity(n)
		if isReady == false then return end
		Sprite.SetOpacity(self.spriteId, n)
	end			

	function self.setFrameDelay(delay)
		if isReady == false then return end
		Sprite.SetFrameDelay(self.spriteId, delay)
	end			

	function self.setFrames(s, e)
		if isReady == false then return end
		Sprite.SetFrames(self.spriteId, s, e)
	end
	
	function self.setCurrentFrame(currentFrame)
		if isReady == false then return end
		Sprite.SetCurrentFrame(self.spriteId, currentFrame)
	end

	-- 시트 분할(열, 행)을 지정한다. 기본 4x4. 가로 한 줄 시트는 (frames, 1)
	function self.setSheetGrid(cols, rows)
		if isReady == false then return end
		Sprite.SetSheetGrid(self.spriteId, cols, rows)
	end			
	
	function self.setRect(x, y, width, height)
		if isReady == false then return end
		Sprite.SetRect(self.spriteId, x, y, width, height)
	end				
	
	function self.setLoop(isLooping)
		if isReady == false then return end
		Sprite.SetLoop(self.spriteId, isLooping)
	end				

	function self.setAnimComplete(isCompletedAnimation)
		if isReady == false then return end
		Sprite.SetAnimComplete(self.spriteId, isCompletedAnimation)
	end
	
	self.create(path, x, y, width, height, max_frames, id)
	
	return self
	
end

return Image