"""Verify ping returns pong."""

async def run(bridge):
    data = await bridge.send('ping')
    assert data == {'pong': True}, f"unexpected: {data}"
