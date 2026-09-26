// Initial2D 웹 로더 (R3, docs/plans/r3-emscripten.md).
//
// 번들러 없는 ES 모듈이다. 에디터(InitialEditor E4)와 데모 페이지(index.html)가 같은 함수로
// 엔진을 띄운다. 흐름은 넷이다.
//   1. createInitial2D 로 wasm 모듈을 만든다 (canvas, print 훅, 설정 객체).
//   2. 프로젝트 파일을 MEMFS 의 /project 아래에 쓰고 cwd 를 거기로 옮긴다.
//      (엔진은 ./game.json, ./scripts/lua/main.lua, ./resources/ 를 상대 경로로 연다)
//   3. callMain 으로 엔진을 시작한다. main 은 루프를 requestAnimationFrame 에 걸고 바로 돌아온다.
//   4. { module, reload, quit } 핸들을 돌려준다.
//
// 설정(env)은 네이티브의 INITIAL2D_* 환경 변수와 같은 이름이다. 두 곳에 넣는다.
//   - Module.initial2dEnv: C++ 의 Platform::GetEnv 가 먼저 보는 곳 (reload 때 바꿀 수 있다)
//   - Module.ENV:          libc getenv. Lua 의 os.getenv 가 여기를 본다 (런타임이 뜨기 전에 넣어야 한다)

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas   SDL 이 그릴 canvas. 키보드는 이 canvas 가 포커스를 가질 때만 받는다
 * @param {Record<string, Uint8Array|ArrayBuffer|string>} [options.files]  경로("scripts/lua/main.lua") -> 내용
 * @param {Record<string, string|number|boolean>} [options.env]  INITIAL2D_* 설정
 * @param {(line: string) => void} [options.print]     stdout (Lua print)
 * @param {(line: string) => void} [options.printErr]  stderr (SDL_Log, Lua error ...)
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

	const module = await createInitial2D({
		canvas,
		print: out,
		printErr: err,
		locateFile: (path, prefix) => (wasmUrl && path.endsWith(".wasm") ? wasmUrl : prefix + path),
		// libc 의 environ 은 런타임이 뜰 때 ENV 에서 만들어진다. os.getenv 가 보게 하려면 그 전에 넣는다.
		preRun: [(m) => { Object.assign(m.ENV, envStrings); }],
		initial2dEnv: { ...envStrings },
		...moduleOverrides,
	});

	const FS = module.FS;
	stageFiles(FS, cwd, files);
	FS.chdir(cwd);

	const exitCode = module.callMain([]);
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
		/** 바뀐 파일을 올리고 스크립트 VM 을 재시작한다 (핫 리로드 서버의 번들 수신과 같다. 진행 상태는 초기화) */
		reload(more, envPatch) {
			if (more) {
				stageFiles(FS, cwd, more);
			}
			if (envPatch) {
				Object.assign(module.initial2dEnv, normalizeEnv(envPatch));
			}
			module._initial2d_reload();
		},
		/** 게임을 끝낸다. 다음 프레임에 루프가 내려가고 SDL 이 정리된다. 다시 띄우려면 새로 boot 한다 */
		quit() {
			module._initial2d_quit();
		},
		/** 이 빌드의 언어 목록 ("lua wasm") */
		features() {
			return module.ccall("initial2d_features", "string", [], []);
		},
	};
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
