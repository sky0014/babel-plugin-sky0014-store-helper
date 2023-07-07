const LIB = "@sky0014/store";
const OBSERVE = "__observe";

const _hooksWatched = [
  "useEffect",
  "useLayoutEffect",
  "useCallback",
  "useMemo",
  "useImperativeHandle",
];

module.exports = function (
  { assertVersion, types: t, template },
  options = {}
) {
  assertVersion(7);

  // options
  const hooksWatched = new Set(
    options.hooksWatched
      ? [..._hooksWatched, ...options.hooksWatched]
      : _hooksWatched
  );

  // const
  const observeImport = template.ast(
    `import { observe as ${OBSERVE} } from "${LIB}";`
  );
  const observeComponent = template(
    `const %%name%% = ${OBSERVE}(%%Component%%);`
  );

  // xxx -> observe(xxx)
  function transformToObserve(path) {
    const node = t.callExpression(t.identifier(OBSERVE), [path.node]);
    path.replaceWith(node);
  }

  function addObserveImport(path, state) {
    const program = state.file.path;
    const binding = program.scope.getBinding(OBSERVE);
    if (!binding) {
      program.node.body.unshift(observeImport);
    }
  }

  return {
    name: "sky0014-store-helper",

    visitor: {
      Program: {
        enter(path, state) {
          state.metadata = {
            shouldImportObserve: false,
            observeMap: new Map(),
            lastImportDeclarationPath: null,
          };

          path.traverse({
            ImportDeclaration(importPath) {
              state.metadata.lastImportDeclarationPath = importPath;
            },
          });
        },

        exit(path, state) {
          if (state.metadata.shouldImportObserve) {
            addObserveImport(path, state);
          }
        },
      },

      // observe all jsx element (except `div` `canvas` etc...)
      // new type: <List.Item/>
      // new type: const { Item } = List;  <Item/>
      JSXElement(path, state) {
        const program = state.file.path;
        const nameStr = path.get("openingElement").get("name").toString();
        const rootName = nameStr.split(".")[0];
        const binding = path.scope.getBinding(rootName);
        if (binding) {
          // 排除svg及其子类型
          if (
            path.find(
              (p) =>
                p.isJSXElement() && p.node.openingElement.name.name === "svg"
            )
          ) {
            return;
          }
          const observedName = `__Observed_${nameStr.replace(/\./g, "_")}`;
          const mapKey = binding.scope.uid;
          const hasObserved =
            state.metadata.observeMap[mapKey]?.has(observedName);
          if (!hasObserved) {
            // do observe
            state.metadata.shouldImportObserve = true;
            if (!state.metadata.observeMap[mapKey]) {
              state.metadata.observeMap[mapKey] = new Set();
            }
            state.metadata.observeMap[mapKey].add(observedName);

            const node = observeComponent({
              name: observedName,
              Component: nameStr,
            });

            if (binding.kind === "module") {
              // import xxx from 'xxx'
              if (state.metadata.lastImportDeclarationPath) {
                state.metadata.lastImportDeclarationPath.insertAfter(node);
              } else {
                program.node.body.unshift(node);
              }
            } else {
              // const { xxx } = yyy
              binding.path.getStatementParent().insertAfter(node);
            }
          }
          // replace with observed component
          const node = t.jsxIdentifier(observedName);
          path.get("openingElement").get("name").replaceWith(node);
          if (path.node.closingElement) {
            path.get("closingElement").get("name").replaceWith(node);
          }
        }
      },

      // watched hooks add observe
      CallExpression(path, state) {
        const callee = path.get("callee");
        if (t.isIdentifier(callee)) {
          const callName = callee.node.name;
          if (hooksWatched.has(callName)) {
            // should observe
            state.metadata.shouldImportObserve = true;

            const arguments = path.get("arguments");
            const last = arguments[arguments.length - 1];
            if (t.isArrayExpression(last)) {
              const elements = last.get("elements");
              elements.forEach(transformToObserve);
            }
          }
        }
      },
    },
  };
};
