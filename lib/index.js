const fs = require("fs");

const LIB = "@sky0014/store";
const OBSERVE = "__observe";

const log = (...args) => {
  console.log("[babel-plugin-sky0014-store-helper]", ...args);
};

module.exports = function (
  { assertVersion, types: t, template },
  options = {}
) {
  assertVersion(7);

  const alias = Object.assign({}, options.alias);

  // handle tsconfig paths
  try {
    const tsconfigPath = "./tsconfig.json";
    if (fs.existsSync(tsconfigPath)) {
      const tsconfig = JSON.parse(fs.readFileSync("./tsconfig.json", "utf-8"));
      const paths = tsconfig.compilerOptions?.paths;
      if (paths) {
        Object.keys(paths).forEach((key) => {
          const first = key.split("/")[0];
          alias[first] = true;
        });
      }
    }
  } catch (e) {
    log("handle tsconfig error: ", e);
  }

  // const
  const observeImport = template.ast(
    `import { observe as ${OBSERVE} } from "${LIB}";`
  );
  const observeComponent = template(
    `const %%name%% = ${OBSERVE}(%%Component%%, { full: %%full%% });`
  );

  function addObserveImport(path, state) {
    const program = state.file.path;
    const binding = program.scope.getBinding(OBSERVE);
    if (!binding) {
      program.node.body.unshift(observeImport);
    }
  }

  function isRelativePath(path) {
    const char = path[0];

    if (char === "." || char === "/") {
      return true;
    }

    const first = path.split("/")[0];
    return first in alias;
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

          let isRelative = true;

          const importDeclaration = binding.path.getStatementParent();
          if (t.isImportDeclaration(importDeclaration)) {
            isRelative = isRelativePath(importDeclaration.node.source.value);
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

            // third party component use full observe
            const node = observeComponent({
              name: observedName,
              Component: nameStr,
              full: String(!isRelative),
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
    },
  };
};
