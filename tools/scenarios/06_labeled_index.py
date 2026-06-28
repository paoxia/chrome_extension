"""read_page labeled returns indices; click by index works."""
import asyncio

async def run(bridge):
    await bridge.send('open_session', {'url': 'https://example.com'})
    await asyncio.sleep(0.5)
    r = await bridge.send('read_page', {'mode': 'labeled'})
    assert isinstance(r['elements'], list) and len(r['elements']) > 0, r
    link = next((e for e in r['elements'] if 'More information' in (e.get('name') or '')), None)
    if link is None:
        link = next((e for e in r['elements'] if e['tag'] == 'a'), None)
    assert link, r['elements']
    await bridge.send('click', {'index': link['index']})
    await asyncio.sleep(1)
    try:
        await bridge.send('click', {'index': link['index']})
    except RuntimeError:
        pass
    await bridge.send('close_session')
