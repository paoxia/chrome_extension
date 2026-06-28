"""screenshot returns a data URL."""
async def run(bridge):
    await bridge.send('open_session', {'url': 'https://example.com'})
    r = await bridge.send('screenshot')
    assert r['dataUrl'].startswith('data:image/png;base64,'), r['dataUrl'][:60]
    assert len(r['dataUrl']) > 1000, len(r['dataUrl'])
    r2 = await bridge.send('screenshot', {'format': 'jpeg', 'quality': 50})
    assert r2['dataUrl'].startswith('data:image/jpeg;base64,'), r2['dataUrl'][:60]
    await bridge.send('close_session')
