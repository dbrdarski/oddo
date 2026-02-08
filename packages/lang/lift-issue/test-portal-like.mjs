import { lift as _lift, f as _f, x as _x } from "@oddo/ui";
import { mount } from "@oddo/ui";
const TestPortalLike = function ({
  props: {
    to
  },
  children
}) {
  const container = document.createElement("div");
  container.style.cssText = "position: fixed;";
  _lift((_to, _children) => this.onMount(() => {
    _lift(_to => (_to() ?? document.body).appendChild(container), [to]);
    _lift(_children => mount(container, _f(_x(_children => _children(), [children]))), [children]);
  }), [to, children]);
  this.onCleanup(() => {
    container.remove();
  });
  return null;
};
export default TestPortalLike;