
#if defined(WIN32) || defined(_WIN32) || defined(__WIN32__) || defined(__NT__)
	#include <Windows.h>
#endif

#ifdef __APPLE__
	#include <unistd.h>
#endif

#include <iostream>
#include <string>

int main(int argc, char **argv) {
	if(argc < 2) {
		std::cout << "a file can't find" << std::endl;
	}
	
#if defined(WIN32) || defined(_WIN32) || defined(__WIN32__) || defined(__NT__)
	HWND hWnd = FindWindowA(argv[1], 0);
	
	if(hWnd == 0) {
		std::cout << "the process is not exists" << std::endl;
	}
	
	ShowWindow(hWnd, SW_SHOWMAXIMIZED);
	SetForegroundWindow(hWnd);
#else if defined(__APPLE__)
	std::string cwd = "open ";
	cwd += argv[1];
	system(&cwd[0]);
#endif

	return 0;
}