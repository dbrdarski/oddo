import { lift as _lift, f as _f, x as _x, liftFn as _liftFn } from "@oddo/ui";
import { mount } from "@oddo/ui";
const TestDirect = function ({
  props: {
    to
  },
  children
}) {
  const container = document.createElement("div");
  _lift((_to, _children) => this.onMount(() => {
    _lift(_to => (_to() ?? document.body).appendChild(container), [to]);
    _lift(_children => mount(container, _f(_x(_children => _children(), [children]))), [children]);
  }), [to, children]);
  return null;
};
const TestWrapped = function ({
  props: {
    to
  },
  children
}) {
  const container = document.createElement("div");
  const setup = _liftFn((to, children) => {
    this.onMount(() => {
      (to ?? document.body).appendChild(container);
      mount(container, _f(_x(() => children, [])));
    });
  }, [to, children]);
  setup();
  return null;
};
export { TestDirect, TestWrapped };