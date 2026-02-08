import { liftFn as _liftFn } from "@oddo/ui";
const TestLifecycle = function ({
  props: {
    a,
    b
  }
}) {
  const caseA = _liftFn((a, b) => {
    this.onMount(() => {
      console.log(a + b);
    });
  }, [a, b]);
  const caseB = _liftFn((a, b) => {
    this.onCleanup(() => {
      console.log(a + b);
    });
  }, [a, b]);
  const caseC = _liftFn((a, b) => {
    setTimeout(() => {
      console.log(a + b);
    }, 100);
  }, [a, b]);
  const caseD = _liftFn((a, b) => {
    const x = a;
    this.onMount(() => {
      console.log(b);
    });
    return x;
  }, [a, b]);
  const caseE = () => {
    this.onMount(() => {
      console.log("hello");
    });
  };
  const caseF = _liftFn(a => {
    this.onMount(() => {
      const inner = () => {
        return a;
      };
      console.log(inner());
    });
  }, [a]);
  return null;
};
export default TestLifecycle;