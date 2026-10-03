// Lua 분석기 워커 (luaparse). 브라우저판과 브리지, 그리고 데스크톱에 LuaLS 가 없을 때 쓴다.

import { RpcConnection } from "../rpc";
import { luaAnalyzer } from "./luaAnalyzer";
import { selfTransport } from "./selfTransport";
import { AnalyzerServer } from "./server";

const transport = selfTransport();
const server = new AnalyzerServer(new RpcConnection(transport), async () => luaAnalyzer, { name: "luaparse", version: "0.3.1" });
server.onExit(() => transport.close());
server.install();
