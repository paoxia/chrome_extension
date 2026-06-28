"""navigate / go_back / reload work."""
async def run(bridge):
    await bridge.send('open_session')
    r = await bridge.send('navigate', {'url': 'https://example.com'})
    assert 'example.com' in r['url'], r
    r = await bridge.send('navigate', {'url': 'https://example.org'})
    assert 'example.org' in r['url'], r
    r = await bridge.send('go_back')
    assert 'example.com' in r['url'], r
    r = await bridge.send('reload')
    assert 'example.com' in r['url'], r
    await bridge.send('close_session')
