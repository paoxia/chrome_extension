// commands/dom.js — forward DOM commands to content script
export function makeDomCommands(ctx) {
  return {
    click:  (p) => ctx.sendToContent('click', p),
    type:   (p) => ctx.sendToContent('type', p),
    scroll: (p) => ctx.sendToContent('scroll', p),
    read_page: (p) => ctx.sendToContent('read_page', p),
  };
}
