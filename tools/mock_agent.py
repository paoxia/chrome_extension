"""Mock PC agent: WS server that runs scenario scripts against the extension.

Usage:
  python tools/mock_agent.py                       # interactive REPL
  python tools/mock_agent.py scenarios/01_ping.py  # run a scenario then exit
"""
import asyncio
import json
import sys
import uuid
import importlib.util
from pathlib import Path

import websockets

HOST = "127.0.0.1"
PORT = 8765


class Bridge:
    def __init__(self, ws):
        self.ws = ws
        self.pending = {}  # id -> Future
        self.events = asyncio.Queue()

    async def send(self, type_, params=None, timeout=30):
        req_id = f"req-{uuid.uuid4().hex[:8]}"
        msg = {"id": req_id, "type": type_}
        if params is not None:
            msg["params"] = params
        fut = asyncio.get_event_loop().create_future()
        self.pending[req_id] = fut
        await self.ws.send(json.dumps(msg))
        print(f"-> {msg}")
        return await asyncio.wait_for(fut, timeout=timeout)

    async def wait_event(self, name, timeout=30):
        end = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = end - asyncio.get_event_loop().time()
            if remaining <= 0:
                raise TimeoutError(f"event {name} not received")
            ev = await asyncio.wait_for(self.events.get(), timeout=remaining)
            if ev.get("name") == name:
                return ev

    async def _reader(self):
        async for raw in self.ws:
            msg = json.loads(raw)
            print(f"<- {msg}")
            if msg.get("type") == "result":
                fut = self.pending.pop(msg["id"], None)
                if fut and not fut.done():
                    if msg.get("ok"):
                        fut.set_result(msg.get("data", {}))
                    else:
                        fut.set_exception(RuntimeError(json.dumps(msg.get("error"))))
            elif msg.get("type") == "event":
                await self.events.put(msg)


async def run_scenario(bridge: Bridge, path: str):
    spec = importlib.util.spec_from_file_location("scenario", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    await mod.run(bridge)


async def main():
    scenario_path = sys.argv[1] if len(sys.argv) > 1 else None
    print(f"mock_agent listening on ws://{HOST}:{PORT}")
    print("Load the extension; it will auto-connect.")

    connected = asyncio.Event()
    result_holder = {"err": None}

    async def handler(ws):
        if connected.is_set():
            await ws.close()
            return
        connected.set()
        bridge = Bridge(ws)
        reader_task = asyncio.create_task(bridge._reader())
        try:
            if scenario_path:
                await run_scenario(bridge, scenario_path)
                print("scenario OK")
            else:
                # interactive REPL
                while True:
                    line = await asyncio.get_event_loop().run_in_executor(
                        None, sys.stdin.readline)
                    if not line:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        data = await bridge.send(msg["type"], msg.get("params"))
                        print(f"OK: {data}")
                    except Exception as e:
                        print(f"ERR: {e}")
        except Exception as e:
            result_holder["err"] = e
            print(f"scenario FAILED: {e}")
        finally:
            reader_task.cancel()
            if scenario_path:
                asyncio.get_event_loop().call_later(0.1, lambda: sys.exit(
                    1 if result_holder["err"] else 0))

    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
