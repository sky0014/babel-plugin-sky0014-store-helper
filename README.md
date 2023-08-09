# babel-plugin-sky0014-store-helper

A helper for [@sky0014/store](https://github.com/sky0014/store)

## Install

```bash
npm install babel-plugin-sky0014-store-helper
```

## Usage

Install

```bash
npm i babel-plugin-sky0014-store-helper --save-dev
```

Add to `babel.config.js`

```js
plugins: ["babel-plugin-sky0014-store-helper", ...],  // first place
```

If you use custom import alias:

```js
import something from "@src/something";
```

This plugin will auto read `tsconfig.json -> paths` attribute to handle that.

Otherwise, you should pass alias to plugin like this (just like `webpack config alias`):

```js
plugins: [["babel-plugin-sky0014-store-helper", { alias: { "@src": "xxxxx" } }], ...],  // first place
```

## Publish

If your first time publish a package, login first:

```bash
npm login --registry=http://registry.npmjs.org
```

Then you can publish:

```bash
npm run pub
```
