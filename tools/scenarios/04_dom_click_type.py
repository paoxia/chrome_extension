"""click + type against duckduckgo search."""
import asyncio

async def run(bridge):
    await bridge.send('open_session', {'url': 'https://duckduckgo.com/'})
    await asyncio.sleep(1)  # let JS settle
    await bridge.send('type', {'selector': 'input[name="q"]', 'text': 'hello world'})
    await bridge.send('click', {'selector': 'button[type="submit"]'})
    await asyncio.sleep(2)  # results page
    await bridge.send('close_session')
