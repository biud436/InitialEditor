#include <iostream>
#include <Windows.h>

int main(int argc, char** argv) {
	if(argc < 2) {
		std::cout << "a file can't find" << std::endl;
	}
	
	HWND hWnd = FindWindowA(argv[1], 0);
	
	if(hWnd == 0) {
		std::cout << "the process is not exists" << std::endl;
	}
	
	ShowWindow(hWnd, SW_SHOWMAXIMIZED);
	SetForegroundWindow(hWnd);
	
	return 0;
}