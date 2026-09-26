// Initial2D 웹 로더 (R3, docs/plans/r3-emscripten.md).
//
// 번들러 없는 ES 모듈이다. 에디터(InitialEditor E4)와 데모 페이지(index.html)가 같은 함수로
// 엔진을 띄운다. 흐름은 넷이다.
//   1. createInitial2D 로 wasm 모듈을 만든다 (canvas, print 훅, 설정 객체).
//   2. 프로젝트 파일을 MEMFS 의 /project 아래에 쓰고 cwd 를 거기로 옮긴다.
//      (엔진은 ./game.json, ./scripts/lua/main.lua 나 ./scripts/ruby/main.rb, ./resources/ 를 상대 경로로 연다)
//   3. callMain 으로 엔진을 시작한다. main 은 루프를 requestAnimationFrame 에 걸고 바로 돌아온다.
//   4. { module, reload, quit, frames, errorText ... } 핸들을 돌려준다.
//
// 오류는 네이티브 엔진과 같게 다룬다 (docs/plans/r3-emscripten.md 8절).
//   - 스크립트 오류는 JS 예외로 나오지 않는다. 네이티브와 같은 줄("Lua error in update: ./scripts/lua/main.lua:5: boom",
//     Ruby 는 "mruby: uncaught exception in update" 와 역추적)이 printErr 로 나오고, 시작 때와 Update, Render 의
//     오류는 루프를 내린다 (onExit(1)).
//   - reload() 의 스크립트 오류는 false 를 돌려주고 루프는 돈다 (스크립트만 멈춘다). 고친 파일로 다시
//     reload() 하면 true 이고 게임이 다시 그려진다.
//   - 프레임 밖으로 빠지려는 C++ 예외는 엔진이 "fatal: 타입: 메시지" 한 줄로 적고 루프를 내린다 (onExit(1)).
//     callMain 밖으로 나온 C++ 예외는 로더가 errorText 로 같은 형식을 적는다. 그 밖의 JS 오류는 "fatal: 메시지",
//     abort 는 "fatal: aborted: 이유" 다. mruby 바인딩의 C++ 예외는 여기까지 오지 않는다 (Ruby 의 RuntimeError).
//
// 설정(env)은 네이티브의 INITIAL2D_* 환경 변수와 같은 이름이다. 두 곳에 넣는다.
//   - Module.initial2dEnv: C++ 의 Platform::GetEnv 가 먼저 보는 곳 (reload 때 바꿀 수 있다)
//   - Module.ENV:          libc getenv. Lua 의 os.getenv 가 여기를 본다 (런타임이 뜨기 전에 넣어야 한다)
//   Ruby 의 System.env 는 C++ 쪽이라 Module.initial2dEnv 를 본다. 언어는 네이티브와 같은 순서로 고른다
//   (INITIAL2D_SCRIPT, game.json 의 "script", main.lua 가 없고 main.rb 만 있으면 mruby).

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas   SDL 이 그릴 canvas. 키보드는 이 canvas 가 포커스를 가질 때만 받는다
 * @param {Record<string, Uint8Array|ArrayBuffer|string>} [options.files]  경로("scripts/lua/main.lua") -> 내용
 * @param {Record<string, string|number|boolean>} [options.env]  INITIAL2D_* 설정
 * @param {(line: string) => void} [options.print]     stdout (Lua print)
 * @param {(line: string) => void} [options.printErr]  stderr (SDL_Log, Lua error ...)
 * @param {(code: number) => void} [options.onExit]  엔진 루프가 멈추면 한 번 부른다. 0 은 quit() 이나 정상 종료, 1 은 오류
 * @param {string} [options.wasmUrl]  Initial2D.wasm 의 위치. 기본은 Initial2D.js 옆
 * @param {string} [options.jsUrl]    Initial2D.js 의 위치. 기본은 이 파일 옆
 * @param {string} [options.cwd]      MEMFS 안의 프로젝트 루트 (기본 "/project")
 * @param {object} [options.moduleOverrides]  Module 설정에 더할 것 (고급)
 */
export async function bootInitial2D({
	canvas,
	files = {},
	env = {},
	print,
	printErr,
	onExit,
	wasmUrl,
	jsUrl,
	cwd = "/project",
	moduleOverrides = {},
} = {}) {
	if (!canvas) {
		throw new Error("bootInitial2D: canvas 가 필요합니다");
	}

	const factoryUrl = jsUrl
		? new URL(jsUrl, document.baseURI).href
		: new URL("./Initial2D.js", import.meta.url).href;
	const { default: createInitial2D } = await import(factoryUrl);

	// SDL 은 키 이벤트를 canvas 에서 받는다 (엔진이 SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT 를 #canvas 로 둔다).
	// 포커스를 받을 수 있어야 하므로 tabindex 를 준다.
	if (canvas.tabIndex < 0) {
		canvas.tabIndex = 0;
	}

	const envStrings = normalizeEnv(env);
	const out = print || ((line) => console.log(line));
	const err = printErr || ((line) => console.error(line));

	// onExit 은 루프가 멈출 때 한 번만 부른다. 엔진의 호출 스택 안에서 부르지 않도록 마이크로태스크로 미룬다.
	let started = false;
	let exited = false;
	const finish = (code) => {
		if (exited) {
			return;
		}
		exited = true;
		if (typeof onExit === "function") {
			queueMicrotask(() => {
				try {
					onExit(code);
				} catch (e) {
					console.error(e);
				}
			});
		}
	};
	let module = null;
	const describe = (e) => errorText(module, e);

	const userOnExit = moduleOverrides.initial2dOnExit;
	const userOnAbort = moduleOverrides.onAbort;
	module = await createInitial2D({
		canvas,
		print: out,
		printErr: err,
		locateFile: (path, prefix) => (wasmUrl && path.endsWith(".wasm") ? wasmUrl : prefix + path),
		// libc 의 environ 은 런타임이 뜰 때 ENV 에서 만들어진다. os.getenv 가 보게 하려면 그 전에 넣는다.
		preRun: [(m) => { Object.assign(m.ENV, envStrings); }],
		initial2dEnv: { ...envStrings },
		...moduleOverrides,
		// 엔진(WebMain.cpp)이 루프를 내린 뒤 종료 코드와 함께 부른다
		initial2dOnExit: (code) => {
			if (typeof userOnExit === "function") {
				userOnExit(code);
			}
			finish(code === 0 ? 0 : 1);
		},
		// abort 는 C++ 가 잡을 수 없다. 모듈은 더 쓸 수 없으므로 fatal 로 적고 onExit(1)
		onAbort: (what) => {
			if (typeof userOnAbort === "function") {
				userOnAbort(what);
			}
			if (started && !exited) {
				err(`fatal: aborted: ${what}`);
				finish(1);
			}
		},
	});

	const FS = module.FS;
	stageFiles(FS, cwd, files);
	FS.chdir(cwd);

	started = true;
	let exitCode;
	try {
		exitCode = module.callMain([]);
	} catch (e) {
		// 스크립트 오류는 여기까지 오지 않는다 (엔진이 printErr 로 적는다). C++ 예외(엔진의 fatal 줄과 같은 형식),
		// 브라우저의 호출 스택 한계 같은 JS 오류, abort 만 온다
		if (!exited) {
			err(`fatal: ${describe(e)}`);
		}
		exitCode = 1;
		finish(1);
	}
	// 창이나 렌더러를 만들지 못해 루프 없이 main 이 끝났다
	if (!exited && typeof module._initial2d_running === "function" && !module._initial2d_running()) {
		finish(exitCode === 0 ? 0 : 1);
	}
	if (typeof canvas.focus === "function") {
		canvas.focus({ preventScroll: true });
	}

	return {
		module,
		exitCode,
		/** 파일을 더 올린다 (재시작 없이). 경로는 프로젝트 루트 기준 */
		stage(more) {
			stageFiles(FS, cwd, more || {});
		},
		/**
		 * 바뀐 파일을 올리고 스크립트 VM 을 재시작한다 (핫 리로드 서버의 번들 수신과 같다. 진행 상태는 초기화).
		 * VM 이 오류 없이 올라오면 true. 스크립트 오류면 false 이고 오류 줄은 이미 printErr 로 나갔다.
		 * 이때 루프는 돌고 스크립트만 멈춘다. 스크립트 오류로 예외를 던지지 않는다.
		 */
		reload(more, envPatch) {
			if (more) {
				stageFiles(FS, cwd, more);
			}
			if (envPatch) {
				Object.assign(module.initial2dEnv, normalizeEnv(envPatch));
			}
			try {
				return module._initial2d_reload() === 1;
			} catch (e) {
				err(`fatal: ${describe(e)}`);
				return false;
			}
		},
		/** 게임을 끝낸다. 다음 프레임에 루프가 내려가고 SDL 이 정리된다. 다시 띄우려면 새로 boot 한다 */
		quit() {
			module._initial2d_quit();
		},
		/** 이 빌드의 언어 목록 ("lua mruby wasm", mruby 없이 빌드하면 "lua wasm") */
		features() {
			return module.ccall("initial2d_features", "string", [], []);
		},
		/** 지금까지 돈 엔진 프레임 수. 루프가 멈춘 뒤에는 마지막 값 */
		frames() {
			return typeof module._initial2d_frame_count === "function" ? module._initial2d_frame_count() : 0;
		},
		/** 모듈 밖으로 나온 것(C++ 예외, abort, JS 오류)을 읽을 수 있는 문자열로. undefined 를 돌려주지 않는다 */
		errorText(e) {
			return describe(e);
		},
	};
}

// WebAssembly.Exception 은 한 번만 풀어 준다 (decrementExceptionRefcount). 같은 예외를 다시 물으면 적어 둔 글을 준다
const exceptionTexts = new WeakMap();

/**
 * 모듈 밖으로 나온 값을 문자열로. C++ 예외(WebAssembly.Exception)는 빌드가 내보낸
 * getExceptionMessage 로 "타입: 메시지" 를, 그 밖에는 e.message 나 String(e) 를 쓴다.
 */
export function errorText(module, e) {
	if (e === undefined || e === null) {
		return "unknown error";
	}
	try {
		const isWasmException = typeof WebAssembly === "object" && typeof WebAssembly.Exception === "function"
			&& e instanceof WebAssembly.Exception;
		if (isWasmException && module && typeof module.getExceptionMessage === "function") {
			if (exceptionTexts.has(e)) {
				return exceptionTexts.get(e);
			}
			const [type, message] = module.getExceptionMessage(e);
			const text = message ? `${type}: ${message}` : String(type || "C++ exception");
			exceptionTexts.set(e, text);
			if (typeof module.decrementExceptionRefcount === "function") {
				module.decrementExceptionRefcount(e);
			}
			return text;
		}
	} catch (_) {
		// C++ 태그가 아닌 예외 등. 아래의 일반 경로로 간다
	}
	try {
		if (typeof e === "string") {
			return e;
		}
		if (typeof e.message === "string" && e.message.length > 0) {
			return e.message;
		}
		return String(e);
	} catch (_) {
		return "unknown error";
	}
}

/** env 값을 문자열로. null, undefined, false 는 "설정 안 함" 이다 (환경 변수에 없는 것과 같다) */
export function normalizeEnv(env) {
	const result = {};
	for (const [key, value] of Object.entries(env || {})) {
		if (value === null || value === undefined || value === false) {
			continue;
		}
		result[key] = value === true ? "1" : String(value);
	}
	return result;
}

/** files(경로 -> 내용)를 MEMFS 의 root 아래에 쓴다. 중간 디렉터리는 만든다 */
export function stageFiles(FS, root, files) {
	for (const [rawPath, data] of Object.entries(files || {})) {
		const rel = cleanRelativePath(rawPath);
		const full = root.replace(/\/+$/, "") + "/" + rel;
		const slash = full.lastIndexOf("/");
		if (slash > 0) {
			mkdirTree(FS, full.slice(0, slash));
		}
		FS.writeFile(full, toFileData(data));
	}
}

function cleanRelativePath(p) {
	const parts = String(p).replace(/\\/g, "/").split("/").filter((s) => s.length > 0 && s !== ".");
	if (parts.length === 0 || parts.some((s) => s === "..")) {
		throw new Error(`stageFiles: 잘못된 경로 ${p}`);
	}
	return parts.join("/");
}

function toFileData(data) {
	if (typeof data === "string") {
		return data;
	}
	if (data instanceof Uint8Array) {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	throw new Error("stageFiles: 내용은 string, Uint8Array, ArrayBuffer 여야 합니다");
}

function mkdirTree(FS, dir) {
	if (typeof FS.mkdirTree === "function") {
		FS.mkdirTree(dir);
		return;
	}
	let current = "";
	for (const part of dir.split("/").filter((s) => s.length > 0)) {
		current += "/" + part;
		try {
			FS.mkdir(current);
		} catch (e) {
			// 이미 있으면 그냥 지나간다 (EEXIST)
			if (!e || e.errno !== 20) {
				throw e;
			}
		}
	}
}
