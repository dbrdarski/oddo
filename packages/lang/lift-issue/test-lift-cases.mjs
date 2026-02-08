import { liftFn as _liftFn } from "@oddo/ui";
const TestCases = function ({
  props: {
    a,
    b,
    c
  }
}) {
  const case1 = _liftFn((a, b) => {
    const x = a + b;
    return x;
  }, [a, b]);
  const case2 = _liftFn((a, b) => {
    const inner = () => {
      return a + b;
    };
    return inner;
  }, [a, b]);
  const case3 = _liftFn((a, b) => {
    const x = a;
    const inner = () => {
      return b;
    };
    return x + inner();
  }, [a, b]);
  const case4 = _liftFn(a => {
    const x = a;
    const inner = () => {
      return a + 1;
    };
    return x + inner();
  }, [a]);
  const case5 = _liftFn((a, b, c) => {
    const x = a;
    const level1 = () => {
      const y = b;
      const level2 = () => {
        return c;
      };
      return y + level2();
    };
    return x + level1();
  }, [a, b, c]);
  const case6 = _liftFn((a, b) => {
    someExternalFn(() => {
      return a + b;
    });
  }, [a, b]);
  const case7 = _liftFn((a, b, c) => {
    const x = a;
    someExternalFn(() => {
      return b + c;
    });
    return x;
  }, [a, b, c]);
  const case8 = _liftFn((a, b, c) => {
    someExternalFn(() => {
      return a ? b : c;
    });
  }, [a, b, c]);
  const case9 = () => {
    const inner = () => {
      return 42;
    };
    return inner();
  };
  const case10 = _liftFn(a => {
    const level1 = () => {
      const level2 = () => {
        return a;
      };
      return level2();
    };
    return level1();
  }, [a]);
  return null;
};
const someExternalFn = _liftFn(fn => fn(), []);
export default TestCases;