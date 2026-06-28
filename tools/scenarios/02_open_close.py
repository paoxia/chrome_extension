"""open_session creates a tab; close_session removes it; session_busy enforced."""
import asyncio

async def run(bridge):
    r = await bridge.send('open_session', {'url': 'about:blank'})
    assert 'tabId' in r and 'sessionId' in r, r

    # second open should fail with session_busy
    try:
        await bridge.send('open_session')
        raise AssertionError('expected session_busy')
    except RuntimeError as e:
        assert 'session_busy' in str(e), str(e)

    await bridge.send('close_session')
    # event should arrive
    ev = await bridge.wait_event('session_closed', timeout=5)
    assert ev['data']['reason'] == 'agent_request', ev
