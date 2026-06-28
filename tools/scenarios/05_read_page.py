"""read_page text mode returns visible text."""
async def run(bridge):
    await bridge.send('open_session', {'url': 'https://example.com'})
    r = await bridge.send('read_page', {'mode': 'text'})
    assert 'Example Domain' in r['title'], r
    assert 'Example Domain' in r['text'], r['text'][:200]
    # maxLen
    r2 = await bridge.send('read_page', {'mode': 'text', 'maxLen': 30})
    assert len(r2['text']) <= 30, r2
    await bridge.send('close_session')
