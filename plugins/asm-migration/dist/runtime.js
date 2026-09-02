// @bun
// codespell:ignore ambiguos notin
// biome-ignore-all lint: generated bundle
// biome-ignore-all format: generated bundle
// biome-ignore-all assist/source/organizeImports: generated bundle
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.regexpCode = exports.getEsmExportName = exports.getProperty = exports.safeStringify = exports.stringify = exports.strConcat = exports.addCodeArg = exports.str = exports._ = exports.nil = exports._Code = exports.Name = exports.IDENTIFIER = exports._CodeOrName = undefined;

  class _CodeOrName {
  }
  exports._CodeOrName = _CodeOrName;
  exports.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;

  class Name extends _CodeOrName {
    constructor(s) {
      super();
      if (!exports.IDENTIFIER.test(s))
        throw new Error("CodeGen: name must be a valid identifier");
      this.str = s;
    }
    toString() {
      return this.str;
    }
    emptyStr() {
      return false;
    }
    get names() {
      return { [this.str]: 1 };
    }
  }
  exports.Name = Name;

  class _Code extends _CodeOrName {
    constructor(code) {
      super();
      this._items = typeof code === "string" ? [code] : code;
    }
    toString() {
      return this.str;
    }
    emptyStr() {
      if (this._items.length > 1)
        return false;
      const item = this._items[0];
      return item === "" || item === '""';
    }
    get str() {
      var _a;
      return (_a = this._str) !== null && _a !== undefined ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
    }
    get names() {
      var _a;
      return (_a = this._names) !== null && _a !== undefined ? _a : this._names = this._items.reduce((names, c) => {
        if (c instanceof Name)
          names[c.str] = (names[c.str] || 0) + 1;
        return names;
      }, {});
    }
  }
  exports._Code = _Code;
  exports.nil = new _Code("");
  function _(strs, ...args) {
    const code = [strs[0]];
    let i = 0;
    while (i < args.length) {
      addCodeArg(code, args[i]);
      code.push(strs[++i]);
    }
    return new _Code(code);
  }
  exports._ = _;
  var plus = new _Code("+");
  function str(strs, ...args) {
    const expr = [safeStringify(strs[0])];
    let i = 0;
    while (i < args.length) {
      expr.push(plus);
      addCodeArg(expr, args[i]);
      expr.push(plus, safeStringify(strs[++i]));
    }
    optimize(expr);
    return new _Code(expr);
  }
  exports.str = str;
  function addCodeArg(code, arg) {
    if (arg instanceof _Code)
      code.push(...arg._items);
    else if (arg instanceof Name)
      code.push(arg);
    else
      code.push(interpolate(arg));
  }
  exports.addCodeArg = addCodeArg;
  function optimize(expr) {
    let i = 1;
    while (i < expr.length - 1) {
      if (expr[i] === plus) {
        const res = mergeExprItems(expr[i - 1], expr[i + 1]);
        if (res !== undefined) {
          expr.splice(i - 1, 3, res);
          continue;
        }
        expr[i++] = "+";
      }
      i++;
    }
  }
  function mergeExprItems(a, b) {
    if (b === '""')
      return a;
    if (a === '""')
      return b;
    if (typeof a == "string") {
      if (b instanceof Name || a[a.length - 1] !== '"')
        return;
      if (typeof b != "string")
        return `${a.slice(0, -1)}${b}"`;
      if (b[0] === '"')
        return a.slice(0, -1) + b.slice(1);
      return;
    }
    if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
      return `"${a}${b.slice(1)}`;
    return;
  }
  function strConcat(c1, c2) {
    return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str`${c1}${c2}`;
  }
  exports.strConcat = strConcat;
  function interpolate(x) {
    return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
  }
  function stringify(x) {
    return new _Code(safeStringify(x));
  }
  exports.stringify = stringify;
  function safeStringify(x) {
    return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  }
  exports.safeStringify = safeStringify;
  function getProperty(key) {
    return typeof key == "string" && exports.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
  }
  exports.getProperty = getProperty;
  function getEsmExportName(key) {
    if (typeof key == "string" && exports.IDENTIFIER.test(key)) {
      return new _Code(`${key}`);
    }
    throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
  }
  exports.getEsmExportName = getEsmExportName;
  function regexpCode(rx) {
    return new _Code(rx.toString());
  }
  exports.regexpCode = regexpCode;
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.ValueScope = exports.ValueScopeName = exports.Scope = exports.varKinds = exports.UsedValueState = undefined;
  var code_1 = require_code();

  class ValueError extends Error {
    constructor(name) {
      super(`CodeGen: "code" for ${name} not defined`);
      this.value = name.value;
    }
  }
  var UsedValueState;
  (function(UsedValueState2) {
    UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
    UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
  })(UsedValueState || (exports.UsedValueState = UsedValueState = {}));
  exports.varKinds = {
    const: new code_1.Name("const"),
    let: new code_1.Name("let"),
    var: new code_1.Name("var")
  };

  class Scope {
    constructor({ prefixes, parent } = {}) {
      this._names = {};
      this._prefixes = prefixes;
      this._parent = parent;
    }
    toName(nameOrPrefix) {
      return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
    }
    name(prefix) {
      return new code_1.Name(this._newName(prefix));
    }
    _newName(prefix) {
      const ng = this._names[prefix] || this._nameGroup(prefix);
      return `${prefix}${ng.index++}`;
    }
    _nameGroup(prefix) {
      var _a, _b;
      if (((_b = (_a = this._parent) === null || _a === undefined ? undefined : _a._prefixes) === null || _b === undefined ? undefined : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
        throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
      }
      return this._names[prefix] = { prefix, index: 0 };
    }
  }
  exports.Scope = Scope;

  class ValueScopeName extends code_1.Name {
    constructor(prefix, nameStr) {
      super(nameStr);
      this.prefix = prefix;
    }
    setValue(value, { property, itemIndex }) {
      this.value = value;
      this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
    }
  }
  exports.ValueScopeName = ValueScopeName;
  var line = (0, code_1._)`\n`;

  class ValueScope extends Scope {
    constructor(opts) {
      super(opts);
      this._values = {};
      this._scope = opts.scope;
      this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
    }
    get() {
      return this._scope;
    }
    name(prefix) {
      return new ValueScopeName(prefix, this._newName(prefix));
    }
    value(nameOrPrefix, value) {
      var _a;
      if (value.ref === undefined)
        throw new Error("CodeGen: ref must be passed in value");
      const name = this.toName(nameOrPrefix);
      const { prefix } = name;
      const valueKey = (_a = value.key) !== null && _a !== undefined ? _a : value.ref;
      let vs = this._values[prefix];
      if (vs) {
        const _name = vs.get(valueKey);
        if (_name)
          return _name;
      } else {
        vs = this._values[prefix] = new Map;
      }
      vs.set(valueKey, name);
      const s = this._scope[prefix] || (this._scope[prefix] = []);
      const itemIndex = s.length;
      s[itemIndex] = value.ref;
      name.setValue(value, { property: prefix, itemIndex });
      return name;
    }
    getValue(prefix, keyOrRef) {
      const vs = this._values[prefix];
      if (!vs)
        return;
      return vs.get(keyOrRef);
    }
    scopeRefs(scopeName, values = this._values) {
      return this._reduceValues(values, (name) => {
        if (name.scopePath === undefined)
          throw new Error(`CodeGen: name "${name}" has no value`);
        return (0, code_1._)`${scopeName}${name.scopePath}`;
      });
    }
    scopeCode(values = this._values, usedValues, getCode) {
      return this._reduceValues(values, (name) => {
        if (name.value === undefined)
          throw new Error(`CodeGen: name "${name}" has no value`);
        return name.value.code;
      }, usedValues, getCode);
    }
    _reduceValues(values, valueCode, usedValues = {}, getCode) {
      let code = code_1.nil;
      for (const prefix in values) {
        const vs = values[prefix];
        if (!vs)
          continue;
        const nameSet = usedValues[prefix] = usedValues[prefix] || new Map;
        vs.forEach((name) => {
          if (nameSet.has(name))
            return;
          nameSet.set(name, UsedValueState.Started);
          let c = valueCode(name);
          if (c) {
            const def = this.opts.es5 ? exports.varKinds.var : exports.varKinds.const;
            code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
          } else if (c = getCode === null || getCode === undefined ? undefined : getCode(name)) {
            code = (0, code_1._)`${code}${c}${this.opts._n}`;
          } else {
            throw new ValueError(name);
          }
          nameSet.set(name, UsedValueState.Completed);
        });
      }
      return code;
    }
  }
  exports.ValueScope = ValueScope;
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.or = exports.and = exports.not = exports.CodeGen = exports.operators = exports.varKinds = exports.ValueScopeName = exports.ValueScope = exports.Scope = exports.Name = exports.regexpCode = exports.stringify = exports.getProperty = exports.nil = exports.strConcat = exports.str = exports._ = undefined;
  var code_1 = require_code();
  var scope_1 = require_scope();
  var code_2 = require_code();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return code_2._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return code_2.str;
  } });
  Object.defineProperty(exports, "strConcat", { enumerable: true, get: function() {
    return code_2.strConcat;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return code_2.nil;
  } });
  Object.defineProperty(exports, "getProperty", { enumerable: true, get: function() {
    return code_2.getProperty;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return code_2.stringify;
  } });
  Object.defineProperty(exports, "regexpCode", { enumerable: true, get: function() {
    return code_2.regexpCode;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return code_2.Name;
  } });
  var scope_2 = require_scope();
  Object.defineProperty(exports, "Scope", { enumerable: true, get: function() {
    return scope_2.Scope;
  } });
  Object.defineProperty(exports, "ValueScope", { enumerable: true, get: function() {
    return scope_2.ValueScope;
  } });
  Object.defineProperty(exports, "ValueScopeName", { enumerable: true, get: function() {
    return scope_2.ValueScopeName;
  } });
  Object.defineProperty(exports, "varKinds", { enumerable: true, get: function() {
    return scope_2.varKinds;
  } });
  exports.operators = {
    GT: new code_1._Code(">"),
    GTE: new code_1._Code(">="),
    LT: new code_1._Code("<"),
    LTE: new code_1._Code("<="),
    EQ: new code_1._Code("==="),
    NEQ: new code_1._Code("!=="),
    NOT: new code_1._Code("!"),
    OR: new code_1._Code("||"),
    AND: new code_1._Code("&&"),
    ADD: new code_1._Code("+")
  };

  class Node {
    optimizeNodes() {
      return this;
    }
    optimizeNames(_names, _constants) {
      return this;
    }
  }

  class Def extends Node {
    constructor(varKind, name, rhs) {
      super();
      this.varKind = varKind;
      this.name = name;
      this.rhs = rhs;
    }
    render({ es5, _n }) {
      const varKind = es5 ? scope_1.varKinds.var : this.varKind;
      const rhs = this.rhs === undefined ? "" : ` = ${this.rhs}`;
      return `${varKind} ${this.name}${rhs};` + _n;
    }
    optimizeNames(names, constants) {
      if (!names[this.name.str])
        return;
      if (this.rhs)
        this.rhs = optimizeExpr(this.rhs, names, constants);
      return this;
    }
    get names() {
      return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
    }
  }

  class Assign extends Node {
    constructor(lhs, rhs, sideEffects) {
      super();
      this.lhs = lhs;
      this.rhs = rhs;
      this.sideEffects = sideEffects;
    }
    render({ _n }) {
      return `${this.lhs} = ${this.rhs};` + _n;
    }
    optimizeNames(names, constants) {
      if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
        return;
      this.rhs = optimizeExpr(this.rhs, names, constants);
      return this;
    }
    get names() {
      const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
      return addExprNames(names, this.rhs);
    }
  }

  class AssignOp extends Assign {
    constructor(lhs, op, rhs, sideEffects) {
      super(lhs, rhs, sideEffects);
      this.op = op;
    }
    render({ _n }) {
      return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
    }
  }

  class Label extends Node {
    constructor(label) {
      super();
      this.label = label;
      this.names = {};
    }
    render({ _n }) {
      return `${this.label}:` + _n;
    }
  }

  class Break extends Node {
    constructor(label) {
      super();
      this.label = label;
      this.names = {};
    }
    render({ _n }) {
      const label = this.label ? ` ${this.label}` : "";
      return `break${label};` + _n;
    }
  }

  class Throw extends Node {
    constructor(error) {
      super();
      this.error = error;
    }
    render({ _n }) {
      return `throw ${this.error};` + _n;
    }
    get names() {
      return this.error.names;
    }
  }

  class AnyCode extends Node {
    constructor(code) {
      super();
      this.code = code;
    }
    render({ _n }) {
      return `${this.code};` + _n;
    }
    optimizeNodes() {
      return `${this.code}` ? this : undefined;
    }
    optimizeNames(names, constants) {
      this.code = optimizeExpr(this.code, names, constants);
      return this;
    }
    get names() {
      return this.code instanceof code_1._CodeOrName ? this.code.names : {};
    }
  }

  class ParentNode extends Node {
    constructor(nodes = []) {
      super();
      this.nodes = nodes;
    }
    render(opts) {
      return this.nodes.reduce((code, n) => code + n.render(opts), "");
    }
    optimizeNodes() {
      const { nodes } = this;
      let i = nodes.length;
      while (i--) {
        const n = nodes[i].optimizeNodes();
        if (Array.isArray(n))
          nodes.splice(i, 1, ...n);
        else if (n)
          nodes[i] = n;
        else
          nodes.splice(i, 1);
      }
      return nodes.length > 0 ? this : undefined;
    }
    optimizeNames(names, constants) {
      const { nodes } = this;
      let i = nodes.length;
      while (i--) {
        const n = nodes[i];
        if (n.optimizeNames(names, constants))
          continue;
        subtractNames(names, n.names);
        nodes.splice(i, 1);
      }
      return nodes.length > 0 ? this : undefined;
    }
    get names() {
      return this.nodes.reduce((names, n) => addNames(names, n.names), {});
    }
  }

  class BlockNode extends ParentNode {
    render(opts) {
      return "{" + opts._n + super.render(opts) + "}" + opts._n;
    }
  }

  class Root extends ParentNode {
  }

  class Else extends BlockNode {
  }
  Else.kind = "else";

  class If extends BlockNode {
    constructor(condition, nodes) {
      super(nodes);
      this.condition = condition;
    }
    render(opts) {
      let code = `if(${this.condition})` + super.render(opts);
      if (this.else)
        code += "else " + this.else.render(opts);
      return code;
    }
    optimizeNodes() {
      super.optimizeNodes();
      const cond = this.condition;
      if (cond === true)
        return this.nodes;
      let e = this.else;
      if (e) {
        const ns = e.optimizeNodes();
        e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
      }
      if (e) {
        if (cond === false)
          return e instanceof If ? e : e.nodes;
        if (this.nodes.length)
          return this;
        return new If(not(cond), e instanceof If ? [e] : e.nodes);
      }
      if (cond === false || !this.nodes.length)
        return;
      return this;
    }
    optimizeNames(names, constants) {
      var _a;
      this.else = (_a = this.else) === null || _a === undefined ? undefined : _a.optimizeNames(names, constants);
      if (!(super.optimizeNames(names, constants) || this.else))
        return;
      this.condition = optimizeExpr(this.condition, names, constants);
      return this;
    }
    get names() {
      const names = super.names;
      addExprNames(names, this.condition);
      if (this.else)
        addNames(names, this.else.names);
      return names;
    }
  }
  If.kind = "if";

  class For extends BlockNode {
  }
  For.kind = "for";

  class ForLoop extends For {
    constructor(iteration) {
      super();
      this.iteration = iteration;
    }
    render(opts) {
      return `for(${this.iteration})` + super.render(opts);
    }
    optimizeNames(names, constants) {
      if (!super.optimizeNames(names, constants))
        return;
      this.iteration = optimizeExpr(this.iteration, names, constants);
      return this;
    }
    get names() {
      return addNames(super.names, this.iteration.names);
    }
  }

  class ForRange extends For {
    constructor(varKind, name, from, to) {
      super();
      this.varKind = varKind;
      this.name = name;
      this.from = from;
      this.to = to;
    }
    render(opts) {
      const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
      const { name, from, to } = this;
      return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
    }
    get names() {
      const names = addExprNames(super.names, this.from);
      return addExprNames(names, this.to);
    }
  }

  class ForIter extends For {
    constructor(loop, varKind, name, iterable) {
      super();
      this.loop = loop;
      this.varKind = varKind;
      this.name = name;
      this.iterable = iterable;
    }
    render(opts) {
      return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
    }
    optimizeNames(names, constants) {
      if (!super.optimizeNames(names, constants))
        return;
      this.iterable = optimizeExpr(this.iterable, names, constants);
      return this;
    }
    get names() {
      return addNames(super.names, this.iterable.names);
    }
  }

  class Func extends BlockNode {
    constructor(name, args, async) {
      super();
      this.name = name;
      this.args = args;
      this.async = async;
    }
    render(opts) {
      const _async = this.async ? "async " : "";
      return `${_async}function ${this.name}(${this.args})` + super.render(opts);
    }
  }
  Func.kind = "func";

  class Return extends ParentNode {
    render(opts) {
      return "return " + super.render(opts);
    }
  }
  Return.kind = "return";

  class Try extends BlockNode {
    render(opts) {
      let code = "try" + super.render(opts);
      if (this.catch)
        code += this.catch.render(opts);
      if (this.finally)
        code += this.finally.render(opts);
      return code;
    }
    optimizeNodes() {
      var _a, _b;
      super.optimizeNodes();
      (_a = this.catch) === null || _a === undefined || _a.optimizeNodes();
      (_b = this.finally) === null || _b === undefined || _b.optimizeNodes();
      return this;
    }
    optimizeNames(names, constants) {
      var _a, _b;
      super.optimizeNames(names, constants);
      (_a = this.catch) === null || _a === undefined || _a.optimizeNames(names, constants);
      (_b = this.finally) === null || _b === undefined || _b.optimizeNames(names, constants);
      return this;
    }
    get names() {
      const names = super.names;
      if (this.catch)
        addNames(names, this.catch.names);
      if (this.finally)
        addNames(names, this.finally.names);
      return names;
    }
  }

  class Catch extends BlockNode {
    constructor(error) {
      super();
      this.error = error;
    }
    render(opts) {
      return `catch(${this.error})` + super.render(opts);
    }
  }
  Catch.kind = "catch";

  class Finally extends BlockNode {
    render(opts) {
      return "finally" + super.render(opts);
    }
  }
  Finally.kind = "finally";

  class CodeGen {
    constructor(extScope, opts = {}) {
      this._values = {};
      this._blockStarts = [];
      this._constants = {};
      this.opts = { ...opts, _n: opts.lines ? `
` : "" };
      this._extScope = extScope;
      this._scope = new scope_1.Scope({ parent: extScope });
      this._nodes = [new Root];
    }
    toString() {
      return this._root.render(this.opts);
    }
    name(prefix) {
      return this._scope.name(prefix);
    }
    scopeName(prefix) {
      return this._extScope.name(prefix);
    }
    scopeValue(prefixOrName, value) {
      const name = this._extScope.value(prefixOrName, value);
      const vs = this._values[name.prefix] || (this._values[name.prefix] = new Set);
      vs.add(name);
      return name;
    }
    getScopeValue(prefix, keyOrRef) {
      return this._extScope.getValue(prefix, keyOrRef);
    }
    scopeRefs(scopeName) {
      return this._extScope.scopeRefs(scopeName, this._values);
    }
    scopeCode() {
      return this._extScope.scopeCode(this._values);
    }
    _def(varKind, nameOrPrefix, rhs, constant) {
      const name = this._scope.toName(nameOrPrefix);
      if (rhs !== undefined && constant)
        this._constants[name.str] = rhs;
      this._leafNode(new Def(varKind, name, rhs));
      return name;
    }
    const(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
    }
    let(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
    }
    var(nameOrPrefix, rhs, _constant) {
      return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
    }
    assign(lhs, rhs, sideEffects) {
      return this._leafNode(new Assign(lhs, rhs, sideEffects));
    }
    add(lhs, rhs) {
      return this._leafNode(new AssignOp(lhs, exports.operators.ADD, rhs));
    }
    code(c) {
      if (typeof c == "function")
        c();
      else if (c !== code_1.nil)
        this._leafNode(new AnyCode(c));
      return this;
    }
    object(...keyValues) {
      const code = ["{"];
      for (const [key, value] of keyValues) {
        if (code.length > 1)
          code.push(",");
        code.push(key);
        if (key !== value || this.opts.es5) {
          code.push(":");
          (0, code_1.addCodeArg)(code, value);
        }
      }
      code.push("}");
      return new code_1._Code(code);
    }
    if(condition, thenBody, elseBody) {
      this._blockNode(new If(condition));
      if (thenBody && elseBody) {
        this.code(thenBody).else().code(elseBody).endIf();
      } else if (thenBody) {
        this.code(thenBody).endIf();
      } else if (elseBody) {
        throw new Error('CodeGen: "else" body without "then" body');
      }
      return this;
    }
    elseIf(condition) {
      return this._elseNode(new If(condition));
    }
    else() {
      return this._elseNode(new Else);
    }
    endIf() {
      return this._endBlockNode(If, Else);
    }
    _for(node, forBody) {
      this._blockNode(node);
      if (forBody)
        this.code(forBody).endFor();
      return this;
    }
    for(iteration, forBody) {
      return this._for(new ForLoop(iteration), forBody);
    }
    forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
      const name = this._scope.toName(nameOrPrefix);
      return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
    }
    forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
      const name = this._scope.toName(nameOrPrefix);
      if (this.opts.es5) {
        const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
        return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
          this.var(name, (0, code_1._)`${arr}[${i}]`);
          forBody(name);
        });
      }
      return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
    }
    forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
      if (this.opts.ownProperties) {
        return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
      }
      const name = this._scope.toName(nameOrPrefix);
      return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
    }
    endFor() {
      return this._endBlockNode(For);
    }
    label(label) {
      return this._leafNode(new Label(label));
    }
    break(label) {
      return this._leafNode(new Break(label));
    }
    return(value) {
      const node = new Return;
      this._blockNode(node);
      this.code(value);
      if (node.nodes.length !== 1)
        throw new Error('CodeGen: "return" should have one node');
      return this._endBlockNode(Return);
    }
    try(tryBody, catchCode, finallyCode) {
      if (!catchCode && !finallyCode)
        throw new Error('CodeGen: "try" without "catch" and "finally"');
      const node = new Try;
      this._blockNode(node);
      this.code(tryBody);
      if (catchCode) {
        const error = this.name("e");
        this._currNode = node.catch = new Catch(error);
        catchCode(error);
      }
      if (finallyCode) {
        this._currNode = node.finally = new Finally;
        this.code(finallyCode);
      }
      return this._endBlockNode(Catch, Finally);
    }
    throw(error) {
      return this._leafNode(new Throw(error));
    }
    block(body, nodeCount) {
      this._blockStarts.push(this._nodes.length);
      if (body)
        this.code(body).endBlock(nodeCount);
      return this;
    }
    endBlock(nodeCount) {
      const len = this._blockStarts.pop();
      if (len === undefined)
        throw new Error("CodeGen: not in self-balancing block");
      const toClose = this._nodes.length - len;
      if (toClose < 0 || nodeCount !== undefined && toClose !== nodeCount) {
        throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
      }
      this._nodes.length = len;
      return this;
    }
    func(name, args = code_1.nil, async, funcBody) {
      this._blockNode(new Func(name, args, async));
      if (funcBody)
        this.code(funcBody).endFunc();
      return this;
    }
    endFunc() {
      return this._endBlockNode(Func);
    }
    optimize(n = 1) {
      while (n-- > 0) {
        this._root.optimizeNodes();
        this._root.optimizeNames(this._root.names, this._constants);
      }
    }
    _leafNode(node) {
      this._currNode.nodes.push(node);
      return this;
    }
    _blockNode(node) {
      this._currNode.nodes.push(node);
      this._nodes.push(node);
    }
    _endBlockNode(N1, N2) {
      const n = this._currNode;
      if (n instanceof N1 || N2 && n instanceof N2) {
        this._nodes.pop();
        return this;
      }
      throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
    }
    _elseNode(node) {
      const n = this._currNode;
      if (!(n instanceof If)) {
        throw new Error('CodeGen: "else" without "if"');
      }
      this._currNode = n.else = node;
      return this;
    }
    get _root() {
      return this._nodes[0];
    }
    get _currNode() {
      const ns = this._nodes;
      return ns[ns.length - 1];
    }
    set _currNode(node) {
      const ns = this._nodes;
      ns[ns.length - 1] = node;
    }
  }
  exports.CodeGen = CodeGen;
  function addNames(names, from) {
    for (const n in from)
      names[n] = (names[n] || 0) + (from[n] || 0);
    return names;
  }
  function addExprNames(names, from) {
    return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
  }
  function optimizeExpr(expr, names, constants) {
    if (expr instanceof code_1.Name)
      return replaceName(expr);
    if (!canOptimize(expr))
      return expr;
    return new code_1._Code(expr._items.reduce((items, c) => {
      if (c instanceof code_1.Name)
        c = replaceName(c);
      if (c instanceof code_1._Code)
        items.push(...c._items);
      else
        items.push(c);
      return items;
    }, []));
    function replaceName(n) {
      const c = constants[n.str];
      if (c === undefined || names[n.str] !== 1)
        return n;
      delete names[n.str];
      return c;
    }
    function canOptimize(e) {
      return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== undefined);
    }
  }
  function subtractNames(names, from) {
    for (const n in from)
      names[n] = (names[n] || 0) - (from[n] || 0);
  }
  function not(x) {
    return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
  }
  exports.not = not;
  var andCode = mappend(exports.operators.AND);
  function and(...args) {
    return args.reduce(andCode);
  }
  exports.and = and;
  var orCode = mappend(exports.operators.OR);
  function or(...args) {
    return args.reduce(orCode);
  }
  exports.or = or;
  function mappend(op) {
    return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
  }
  function par(x) {
    return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.checkStrictMode = exports.getErrorPath = exports.Type = exports.useFunc = exports.setEvaluated = exports.evaluatedPropsToName = exports.mergeEvaluated = exports.eachItem = exports.unescapeJsonPointer = exports.escapeJsonPointer = exports.escapeFragment = exports.unescapeFragment = exports.schemaRefOrVal = exports.schemaHasRulesButRef = exports.schemaHasRules = exports.checkUnknownRules = exports.alwaysValidSchema = exports.toHash = undefined;
  var codegen_1 = require_codegen();
  var code_1 = require_code();
  function toHash(arr) {
    const hash = {};
    for (const item of arr)
      hash[item] = true;
    return hash;
  }
  exports.toHash = toHash;
  function alwaysValidSchema(it, schema) {
    if (typeof schema == "boolean")
      return schema;
    if (Object.keys(schema).length === 0)
      return true;
    checkUnknownRules(it, schema);
    return !schemaHasRules(schema, it.self.RULES.all);
  }
  exports.alwaysValidSchema = alwaysValidSchema;
  function checkUnknownRules(it, schema = it.schema) {
    const { opts, self } = it;
    if (!opts.strictSchema)
      return;
    if (typeof schema === "boolean")
      return;
    const rules = self.RULES.keywords;
    for (const key in schema) {
      if (!rules[key])
        checkStrictMode(it, `unknown keyword: "${key}"`);
    }
  }
  exports.checkUnknownRules = checkUnknownRules;
  function schemaHasRules(schema, rules) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (rules[key])
        return true;
    return false;
  }
  exports.schemaHasRules = schemaHasRules;
  function schemaHasRulesButRef(schema, RULES) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (key !== "$ref" && RULES.all[key])
        return true;
    return false;
  }
  exports.schemaHasRulesButRef = schemaHasRulesButRef;
  function schemaRefOrVal({ topSchemaRef, schemaPath }, schema, keyword, $data) {
    if (!$data) {
      if (typeof schema == "number" || typeof schema == "boolean")
        return schema;
      if (typeof schema == "string")
        return (0, codegen_1._)`${schema}`;
    }
    return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
  }
  exports.schemaRefOrVal = schemaRefOrVal;
  function unescapeFragment(str) {
    return unescapeJsonPointer(decodeURIComponent(str));
  }
  exports.unescapeFragment = unescapeFragment;
  function escapeFragment(str) {
    return encodeURIComponent(escapeJsonPointer(str));
  }
  exports.escapeFragment = escapeFragment;
  function escapeJsonPointer(str) {
    if (typeof str == "number")
      return `${str}`;
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
  exports.escapeJsonPointer = escapeJsonPointer;
  function unescapeJsonPointer(str) {
    return str.replace(/~1/g, "/").replace(/~0/g, "~");
  }
  exports.unescapeJsonPointer = unescapeJsonPointer;
  function eachItem(xs, f) {
    if (Array.isArray(xs)) {
      for (const x of xs)
        f(x);
    } else {
      f(xs);
    }
  }
  exports.eachItem = eachItem;
  function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
    return (gen, from, to, toName) => {
      const res = to === undefined ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
      return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
    };
  }
  exports.mergeEvaluated = {
    props: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
        gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
      }),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
        if (from === true) {
          gen.assign(to, true);
        } else {
          gen.assign(to, (0, codegen_1._)`${to} || {}`);
          setEvaluated(gen, to, from);
        }
      }),
      mergeValues: (from, to) => from === true ? true : { ...from, ...to },
      resultToName: evaluatedPropsToName
    }),
    items: makeMergeEvaluated({
      mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
      mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
      mergeValues: (from, to) => from === true ? true : Math.max(from, to),
      resultToName: (gen, items) => gen.var("items", items)
    })
  };
  function evaluatedPropsToName(gen, ps) {
    if (ps === true)
      return gen.var("props", true);
    const props = gen.var("props", (0, codegen_1._)`{}`);
    if (ps !== undefined)
      setEvaluated(gen, props, ps);
    return props;
  }
  exports.evaluatedPropsToName = evaluatedPropsToName;
  function setEvaluated(gen, props, ps) {
    Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
  }
  exports.setEvaluated = setEvaluated;
  var snippets = {};
  function useFunc(gen, f) {
    return gen.scopeValue("func", {
      ref: f,
      code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
    });
  }
  exports.useFunc = useFunc;
  var Type;
  (function(Type2) {
    Type2[Type2["Num"] = 0] = "Num";
    Type2[Type2["Str"] = 1] = "Str";
  })(Type || (exports.Type = Type = {}));
  function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
    if (dataProp instanceof codegen_1.Name) {
      const isNumber = dataPropType === Type.Num;
      return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
    }
    return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
  }
  exports.getErrorPath = getErrorPath;
  function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
    if (!mode)
      return;
    msg = `strict mode: ${msg}`;
    if (mode === true)
      throw new Error(msg);
    it.self.logger.warn(msg);
  }
  exports.checkStrictMode = checkStrictMode;
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var names = {
    data: new codegen_1.Name("data"),
    valCxt: new codegen_1.Name("valCxt"),
    instancePath: new codegen_1.Name("instancePath"),
    parentData: new codegen_1.Name("parentData"),
    parentDataProperty: new codegen_1.Name("parentDataProperty"),
    rootData: new codegen_1.Name("rootData"),
    dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
    vErrors: new codegen_1.Name("vErrors"),
    errors: new codegen_1.Name("errors"),
    this: new codegen_1.Name("this"),
    self: new codegen_1.Name("self"),
    scope: new codegen_1.Name("scope"),
    json: new codegen_1.Name("json"),
    jsonPos: new codegen_1.Name("jsonPos"),
    jsonLen: new codegen_1.Name("jsonLen"),
    jsonPart: new codegen_1.Name("jsonPart")
  };
  exports.default = names;
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.extendErrors = exports.resetErrorsCount = exports.reportExtraError = exports.reportError = exports.keyword$DataError = exports.keywordError = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var names_1 = require_names();
  exports.keywordError = {
    message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
  };
  exports.keyword$DataError = {
    message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
  };
  function reportError(cxt, error = exports.keywordError, errorPaths, overrideAllErrors) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error, errorPaths);
    if (overrideAllErrors !== null && overrideAllErrors !== undefined ? overrideAllErrors : compositeRule || allErrors) {
      addError(gen, errObj);
    } else {
      returnErrors(it, (0, codegen_1._)`[${errObj}]`);
    }
  }
  exports.reportError = reportError;
  function reportExtraError(cxt, error = exports.keywordError, errorPaths) {
    const { it } = cxt;
    const { gen, compositeRule, allErrors } = it;
    const errObj = errorObjectCode(cxt, error, errorPaths);
    addError(gen, errObj);
    if (!(compositeRule || allErrors)) {
      returnErrors(it, names_1.default.vErrors);
    }
  }
  exports.reportExtraError = reportExtraError;
  function resetErrorsCount(gen, errsCount) {
    gen.assign(names_1.default.errors, errsCount);
    gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
  }
  exports.resetErrorsCount = resetErrorsCount;
  function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
    if (errsCount === undefined)
      throw new Error("ajv implementation error");
    const err = gen.name("err");
    gen.forRange("i", errsCount, names_1.default.errors, (i) => {
      gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
      gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
      gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
      if (it.opts.verbose) {
        gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
        gen.assign((0, codegen_1._)`${err}.data`, data);
      }
    });
  }
  exports.extendErrors = extendErrors;
  function addError(gen, errObj) {
    const err = gen.const("err", errObj);
    gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
    gen.code((0, codegen_1._)`${names_1.default.errors}++`);
  }
  function returnErrors(it, errs) {
    const { gen, validateName, schemaEnv } = it;
    if (schemaEnv.$async) {
      gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
      gen.return(false);
    }
  }
  var E = {
    keyword: new codegen_1.Name("keyword"),
    schemaPath: new codegen_1.Name("schemaPath"),
    params: new codegen_1.Name("params"),
    propertyName: new codegen_1.Name("propertyName"),
    message: new codegen_1.Name("message"),
    schema: new codegen_1.Name("schema"),
    parentSchema: new codegen_1.Name("parentSchema")
  };
  function errorObjectCode(cxt, error, errorPaths) {
    const { createErrors } = cxt.it;
    if (createErrors === false)
      return (0, codegen_1._)`{}`;
    return errorObject(cxt, error, errorPaths);
  }
  function errorObject(cxt, error, errorPaths = {}) {
    const { gen, it } = cxt;
    const keyValues = [
      errorInstancePath(it, errorPaths),
      errorSchemaPath(cxt, errorPaths)
    ];
    extraErrorProps(cxt, error, keyValues);
    return gen.object(...keyValues);
  }
  function errorInstancePath({ errorPath }, { instancePath }) {
    const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
    return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
  }
  function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
    let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
    if (schemaPath) {
      schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
    }
    return [E.schemaPath, schPath];
  }
  function extraErrorProps(cxt, { params, message }, keyValues) {
    const { keyword, data, schemaValue, it } = cxt;
    const { opts, propertyName, topSchemaRef, schemaPath } = it;
    keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
    if (opts.messages) {
      keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
    }
    if (opts.verbose) {
      keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
    }
    if (propertyName)
      keyValues.push([E.propertyName, propertyName]);
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.boolOrEmptySchema = exports.topBoolOrEmptySchema = undefined;
  var errors_1 = require_errors();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var boolError = {
    message: "boolean schema is false"
  };
  function topBoolOrEmptySchema(it) {
    const { gen, schema, validateName } = it;
    if (schema === false) {
      falseSchemaError(it, false);
    } else if (typeof schema == "object" && schema.$async === true) {
      gen.return(names_1.default.data);
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, null);
      gen.return(true);
    }
  }
  exports.topBoolOrEmptySchema = topBoolOrEmptySchema;
  function boolOrEmptySchema(it, valid) {
    const { gen, schema } = it;
    if (schema === false) {
      gen.var(valid, false);
      falseSchemaError(it);
    } else {
      gen.var(valid, true);
    }
  }
  exports.boolOrEmptySchema = boolOrEmptySchema;
  function falseSchemaError(it, overrideAllErrors) {
    const { gen, data } = it;
    const cxt = {
      gen,
      keyword: "false schema",
      data,
      schema: false,
      schemaCode: false,
      schemaValue: false,
      params: {},
      it
    };
    (0, errors_1.reportError)(cxt, boolError, undefined, overrideAllErrors);
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getRules = exports.isJSONType = undefined;
  var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
  var jsonTypes = new Set(_jsonTypes);
  function isJSONType(x) {
    return typeof x == "string" && jsonTypes.has(x);
  }
  exports.isJSONType = isJSONType;
  function getRules() {
    const groups = {
      number: { type: "number", rules: [] },
      string: { type: "string", rules: [] },
      array: { type: "array", rules: [] },
      object: { type: "object", rules: [] }
    };
    return {
      types: { ...groups, integer: true, boolean: true, null: true },
      rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
      post: { rules: [] },
      all: {},
      keywords: {}
    };
  }
  exports.getRules = getRules;
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.shouldUseRule = exports.shouldUseGroup = exports.schemaHasRulesForType = undefined;
  function schemaHasRulesForType({ schema, self }, type) {
    const group = self.RULES.types[type];
    return group && group !== true && shouldUseGroup(schema, group);
  }
  exports.schemaHasRulesForType = schemaHasRulesForType;
  function shouldUseGroup(schema, group) {
    return group.rules.some((rule) => shouldUseRule(schema, rule));
  }
  exports.shouldUseGroup = shouldUseGroup;
  function shouldUseRule(schema, rule) {
    var _a;
    return schema[rule.keyword] !== undefined || ((_a = rule.definition.implements) === null || _a === undefined ? undefined : _a.some((kwd) => schema[kwd] !== undefined));
  }
  exports.shouldUseRule = shouldUseRule;
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.reportTypeError = exports.checkDataTypes = exports.checkDataType = exports.coerceAndCheckDataType = exports.getJSONTypes = exports.getSchemaTypes = exports.DataType = undefined;
  var rules_1 = require_rules();
  var applicability_1 = require_applicability();
  var errors_1 = require_errors();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var DataType;
  (function(DataType2) {
    DataType2[DataType2["Correct"] = 0] = "Correct";
    DataType2[DataType2["Wrong"] = 1] = "Wrong";
  })(DataType || (exports.DataType = DataType = {}));
  function getSchemaTypes(schema) {
    const types = getJSONTypes(schema.type);
    const hasNull = types.includes("null");
    if (hasNull) {
      if (schema.nullable === false)
        throw new Error("type: null contradicts nullable: false");
    } else {
      if (!types.length && schema.nullable !== undefined) {
        throw new Error('"nullable" cannot be used without "type"');
      }
      if (schema.nullable === true)
        types.push("null");
    }
    return types;
  }
  exports.getSchemaTypes = getSchemaTypes;
  function getJSONTypes(ts) {
    const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
    if (types.every(rules_1.isJSONType))
      return types;
    throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
  }
  exports.getJSONTypes = getJSONTypes;
  function coerceAndCheckDataType(it, types) {
    const { gen, data, opts } = it;
    const coerceTo = coerceToTypes(types, opts.coerceTypes);
    const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
    if (checkTypes) {
      const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
      gen.if(wrongType, () => {
        if (coerceTo.length)
          coerceData(it, types, coerceTo);
        else
          reportTypeError(it);
      });
    }
    return checkTypes;
  }
  exports.coerceAndCheckDataType = coerceAndCheckDataType;
  var COERCIBLE = new Set(["string", "number", "integer", "boolean", "null"]);
  function coerceToTypes(types, coerceTypes) {
    return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
  }
  function coerceData(it, types, coerceTo) {
    const { gen, data, opts } = it;
    const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
    const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
    if (opts.coerceTypes === "array") {
      gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
    }
    gen.if((0, codegen_1._)`${coerced} !== undefined`);
    for (const t of coerceTo) {
      if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
        coerceSpecificType(t);
      }
    }
    gen.else();
    reportTypeError(it);
    gen.endIf();
    gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
      gen.assign(data, coerced);
      assignParentData(it, coerced);
    });
    function coerceSpecificType(t) {
      switch (t) {
        case "string":
          gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
          return;
        case "number":
          gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "integer":
          gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
          return;
        case "boolean":
          gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
          return;
        case "null":
          gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
          gen.assign(coerced, null);
          return;
        case "array":
          gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
      }
    }
  }
  function assignParentData({ gen, parentData, parentDataProperty }, expr) {
    gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
  }
  function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
    const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
    let cond;
    switch (dataType) {
      case "null":
        return (0, codegen_1._)`${data} ${EQ} null`;
      case "array":
        cond = (0, codegen_1._)`Array.isArray(${data})`;
        break;
      case "object":
        cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
        break;
      case "integer":
        cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
        break;
      case "number":
        cond = numCond();
        break;
      default:
        return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
    }
    return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
    function numCond(_cond = codegen_1.nil) {
      return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
    }
  }
  exports.checkDataType = checkDataType;
  function checkDataTypes(dataTypes, data, strictNums, correct) {
    if (dataTypes.length === 1) {
      return checkDataType(dataTypes[0], data, strictNums, correct);
    }
    let cond;
    const types = (0, util_1.toHash)(dataTypes);
    if (types.array && types.object) {
      const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
      cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
      delete types.null;
      delete types.array;
      delete types.object;
    } else {
      cond = codegen_1.nil;
    }
    if (types.number)
      delete types.integer;
    for (const t in types)
      cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
    return cond;
  }
  exports.checkDataTypes = checkDataTypes;
  var typeError = {
    message: ({ schema }) => `must be ${schema}`,
    params: ({ schema, schemaValue }) => typeof schema == "string" ? (0, codegen_1._)`{type: ${schema}}` : (0, codegen_1._)`{type: ${schemaValue}}`
  };
  function reportTypeError(it) {
    const cxt = getTypeErrorContext(it);
    (0, errors_1.reportError)(cxt, typeError);
  }
  exports.reportTypeError = reportTypeError;
  function getTypeErrorContext(it) {
    const { gen, data, schema } = it;
    const schemaCode = (0, util_1.schemaRefOrVal)(it, schema, "type");
    return {
      gen,
      keyword: "type",
      data,
      schema: schema.type,
      schemaCode,
      schemaValue: schemaCode,
      parentSchema: schema,
      params: {},
      it
    };
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.assignDefaults = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  function assignDefaults(it, ty) {
    const { properties, items } = it.schema;
    if (ty === "object" && properties) {
      for (const key in properties) {
        assignDefault(it, key, properties[key].default);
      }
    } else if (ty === "array" && Array.isArray(items)) {
      items.forEach((sch, i) => assignDefault(it, i, sch.default));
    }
  }
  exports.assignDefaults = assignDefaults;
  function assignDefault(it, prop, defaultValue) {
    const { gen, compositeRule, data, opts } = it;
    if (defaultValue === undefined)
      return;
    const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
    if (compositeRule) {
      (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
      return;
    }
    let condition = (0, codegen_1._)`${childData} === undefined`;
    if (opts.useDefaults === "empty") {
      condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
    }
    gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateUnion = exports.validateArray = exports.usePattern = exports.callValidateCode = exports.schemaProperties = exports.allSchemaProperties = exports.noPropertyInData = exports.propertyInData = exports.isOwnProperty = exports.hasPropFunc = exports.reportMissingProp = exports.checkMissingProp = exports.checkReportMissingProp = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var names_1 = require_names();
  var util_2 = require_util();
  function checkReportMissingProp(cxt, prop) {
    const { gen, data, it } = cxt;
    gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
      cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
      cxt.error();
    });
  }
  exports.checkReportMissingProp = checkReportMissingProp;
  function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
    return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
  }
  exports.checkMissingProp = checkMissingProp;
  function reportMissingProp(cxt, missing) {
    cxt.setParams({ missingProperty: missing }, true);
    cxt.error();
  }
  exports.reportMissingProp = reportMissingProp;
  function hasPropFunc(gen) {
    return gen.scopeValue("func", {
      ref: Object.prototype.hasOwnProperty,
      code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
    });
  }
  exports.hasPropFunc = hasPropFunc;
  function isOwnProperty(gen, data, property) {
    return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
  }
  exports.isOwnProperty = isOwnProperty;
  function propertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
    return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
  }
  exports.propertyInData = propertyInData;
  function noPropertyInData(gen, data, property, ownProperties) {
    const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
    return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
  }
  exports.noPropertyInData = noPropertyInData;
  function allSchemaProperties(schemaMap) {
    return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
  }
  exports.allSchemaProperties = allSchemaProperties;
  function schemaProperties(it, schemaMap) {
    return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
  }
  exports.schemaProperties = schemaProperties;
  function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
    const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
    const valCxt = [
      [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
      [names_1.default.parentData, it.parentData],
      [names_1.default.parentDataProperty, it.parentDataProperty],
      [names_1.default.rootData, names_1.default.rootData]
    ];
    if (it.opts.dynamicRef)
      valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
    const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
    return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
  }
  exports.callValidateCode = callValidateCode;
  var newRegExp = (0, codegen_1._)`new RegExp`;
  function usePattern({ gen, it: { opts } }, pattern) {
    const u = opts.unicodeRegExp ? "u" : "";
    const { regExp } = opts.code;
    const rx = regExp(pattern, u);
    return gen.scopeValue("pattern", {
      key: rx.toString(),
      ref: rx,
      code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
    });
  }
  exports.usePattern = usePattern;
  function validateArray(cxt) {
    const { gen, data, keyword, it } = cxt;
    const valid = gen.name("valid");
    if (it.allErrors) {
      const validArr = gen.let("valid", true);
      validateItems(() => gen.assign(validArr, false));
      return validArr;
    }
    gen.var(valid, true);
    validateItems(() => gen.break());
    return valid;
    function validateItems(notValid) {
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      gen.forRange("i", 0, len, (i) => {
        cxt.subschema({
          keyword,
          dataProp: i,
          dataPropType: util_1.Type.Num
        }, valid);
        gen.if((0, codegen_1.not)(valid), notValid);
      });
    }
  }
  exports.validateArray = validateArray;
  function validateUnion(cxt) {
    const { gen, schema, keyword, it } = cxt;
    if (!Array.isArray(schema))
      throw new Error("ajv implementation error");
    const alwaysValid = schema.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
    if (alwaysValid && !it.opts.unevaluated)
      return;
    const valid = gen.let("valid", false);
    const schValid = gen.name("_valid");
    gen.block(() => schema.forEach((_sch, i) => {
      const schCxt = cxt.subschema({
        keyword,
        schemaProp: i,
        compositeRule: true
      }, schValid);
      gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
      const merged = cxt.mergeValidEvaluated(schCxt, schValid);
      if (!merged)
        gen.if((0, codegen_1.not)(valid));
    }));
    cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
  }
  exports.validateUnion = validateUnion;
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateKeywordUsage = exports.validSchemaType = exports.funcKeywordCode = exports.macroKeywordCode = undefined;
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var code_1 = require_code2();
  var errors_1 = require_errors();
  function macroKeywordCode(cxt, def) {
    const { gen, keyword, schema, parentSchema, it } = cxt;
    const macroSchema = def.macro.call(it.self, schema, parentSchema, it);
    const schemaRef = useKeyword(gen, keyword, macroSchema);
    if (it.opts.validateSchema !== false)
      it.self.validateSchema(macroSchema, true);
    const valid = gen.name("valid");
    cxt.subschema({
      schema: macroSchema,
      schemaPath: codegen_1.nil,
      errSchemaPath: `${it.errSchemaPath}/${keyword}`,
      topSchemaRef: schemaRef,
      compositeRule: true
    }, valid);
    cxt.pass(valid, () => cxt.error(true));
  }
  exports.macroKeywordCode = macroKeywordCode;
  function funcKeywordCode(cxt, def) {
    var _a;
    const { gen, keyword, schema, parentSchema, $data, it } = cxt;
    checkAsyncKeyword(it, def);
    const validate = !$data && def.compile ? def.compile.call(it.self, schema, parentSchema, it) : def.validate;
    const validateRef = useKeyword(gen, keyword, validate);
    const valid = gen.let("valid");
    cxt.block$data(valid, validateKeyword);
    cxt.ok((_a = def.valid) !== null && _a !== undefined ? _a : valid);
    function validateKeyword() {
      if (def.errors === false) {
        assignValid();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => cxt.error());
      } else {
        const ruleErrs = def.async ? validateAsync() : validateSync();
        if (def.modifying)
          modifyData(cxt);
        reportErrs(() => addErrs(cxt, ruleErrs));
      }
    }
    function validateAsync() {
      const ruleErrs = gen.let("ruleErrs", null);
      gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
      return ruleErrs;
    }
    function validateSync() {
      const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
      gen.assign(validateErrs, null);
      assignValid(codegen_1.nil);
      return validateErrs;
    }
    function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
      const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
      const passSchema = !(("compile" in def) && !$data || def.schema === false);
      gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
    }
    function reportErrs(errors) {
      var _a2;
      gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== undefined ? _a2 : valid), errors);
    }
  }
  exports.funcKeywordCode = funcKeywordCode;
  function modifyData(cxt) {
    const { gen, data, it } = cxt;
    gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
  }
  function addErrs(cxt, errs) {
    const { gen } = cxt;
    gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      (0, errors_1.extendErrors)(cxt);
    }, () => cxt.error());
  }
  function checkAsyncKeyword({ schemaEnv }, def) {
    if (def.async && !schemaEnv.$async)
      throw new Error("async keyword in sync schema");
  }
  function useKeyword(gen, keyword, result) {
    if (result === undefined)
      throw new Error(`keyword "${keyword}" failed to compile`);
    return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
  }
  function validSchemaType(schema, schemaType, allowUndefined = false) {
    return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema) : st === "object" ? schema && typeof schema == "object" && !Array.isArray(schema) : typeof schema == st || allowUndefined && typeof schema == "undefined");
  }
  exports.validSchemaType = validSchemaType;
  function validateKeywordUsage({ schema, opts, self, errSchemaPath }, def, keyword) {
    if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
      throw new Error("ajv implementation error");
    }
    const deps = def.dependencies;
    if (deps === null || deps === undefined ? undefined : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema, kwd))) {
      throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
    }
    if (def.validateSchema) {
      const valid = def.validateSchema(schema[keyword]);
      if (!valid) {
        const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
        if (opts.validateSchema === "log")
          self.logger.error(msg);
        else
          throw new Error(msg);
      }
    }
  }
  exports.validateKeywordUsage = validateKeywordUsage;
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.extendSubschemaMode = exports.extendSubschemaData = exports.getSubschema = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  function getSubschema(it, { keyword, schemaProp, schema, schemaPath, errSchemaPath, topSchemaRef }) {
    if (keyword !== undefined && schema !== undefined) {
      throw new Error('both "keyword" and "schema" passed, only one allowed');
    }
    if (keyword !== undefined) {
      const sch = it.schema[keyword];
      return schemaProp === undefined ? {
        schema: sch,
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`
      } : {
        schema: sch[schemaProp],
        schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
        errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
      };
    }
    if (schema !== undefined) {
      if (schemaPath === undefined || errSchemaPath === undefined || topSchemaRef === undefined) {
        throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
      }
      return {
        schema,
        schemaPath,
        topSchemaRef,
        errSchemaPath
      };
    }
    throw new Error('either "keyword" or "schema" must be passed');
  }
  exports.getSubschema = getSubschema;
  function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
    if (data !== undefined && dataProp !== undefined) {
      throw new Error('both "data" and "dataProp" passed, only one allowed');
    }
    const { gen } = it;
    if (dataProp !== undefined) {
      const { errorPath, dataPathArr, opts } = it;
      const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
      dataContextProps(nextData);
      subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
      subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
      subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
    }
    if (data !== undefined) {
      const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
      dataContextProps(nextData);
      if (propertyName !== undefined)
        subschema.propertyName = propertyName;
    }
    if (dataTypes)
      subschema.dataTypes = dataTypes;
    function dataContextProps(_nextData) {
      subschema.data = _nextData;
      subschema.dataLevel = it.dataLevel + 1;
      subschema.dataTypes = [];
      it.definedProperties = new Set;
      subschema.parentData = it.data;
      subschema.dataNames = [...it.dataNames, _nextData];
    }
  }
  exports.extendSubschemaData = extendSubschemaData;
  function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
    if (compositeRule !== undefined)
      subschema.compositeRule = compositeRule;
    if (createErrors !== undefined)
      subschema.createErrors = createErrors;
    if (allErrors !== undefined)
      subschema.allErrors = allErrors;
    subschema.jtdDiscriminator = jtdDiscriminator;
    subschema.jtdMetadata = jtdMetadata;
  }
  exports.extendSubschemaMode = extendSubschemaMode;
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS((exports, module) => {
  module.exports = function equal(a, b) {
    if (a === b)
      return true;
    if (a && b && typeof a == "object" && typeof b == "object") {
      if (a.constructor !== b.constructor)
        return false;
      var length, i, keys;
      if (Array.isArray(a)) {
        length = a.length;
        if (length != b.length)
          return false;
        for (i = length;i-- !== 0; )
          if (!equal(a[i], b[i]))
            return false;
        return true;
      }
      if (a.constructor === RegExp)
        return a.source === b.source && a.flags === b.flags;
      if (a.valueOf !== Object.prototype.valueOf)
        return a.valueOf() === b.valueOf();
      if (a.toString !== Object.prototype.toString)
        return a.toString() === b.toString();
      keys = Object.keys(a);
      length = keys.length;
      if (length !== Object.keys(b).length)
        return false;
      for (i = length;i-- !== 0; )
        if (!Object.prototype.hasOwnProperty.call(b, keys[i]))
          return false;
      for (i = length;i-- !== 0; ) {
        var key = keys[i];
        if (!equal(a[key], b[key]))
          return false;
      }
      return true;
    }
    return a !== a && b !== b;
  };
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS((exports, module) => {
  var traverse = module.exports = function(schema, opts, cb) {
    if (typeof opts == "function") {
      cb = opts;
      opts = {};
    }
    cb = opts.cb || cb;
    var pre = typeof cb == "function" ? cb : cb.pre || function() {};
    var post = cb.post || function() {};
    _traverse(opts, pre, post, schema, "", schema);
  };
  traverse.keywords = {
    additionalItems: true,
    items: true,
    contains: true,
    additionalProperties: true,
    propertyNames: true,
    not: true,
    if: true,
    then: true,
    else: true
  };
  traverse.arrayKeywords = {
    items: true,
    allOf: true,
    anyOf: true,
    oneOf: true
  };
  traverse.propsKeywords = {
    $defs: true,
    definitions: true,
    properties: true,
    patternProperties: true,
    dependencies: true
  };
  traverse.skipKeywords = {
    default: true,
    enum: true,
    const: true,
    required: true,
    maximum: true,
    minimum: true,
    exclusiveMaximum: true,
    exclusiveMinimum: true,
    multipleOf: true,
    maxLength: true,
    minLength: true,
    pattern: true,
    format: true,
    maxItems: true,
    minItems: true,
    uniqueItems: true,
    maxProperties: true,
    minProperties: true
  };
  function _traverse(opts, pre, post, schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
    if (schema && typeof schema == "object" && !Array.isArray(schema)) {
      pre(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      for (var key in schema) {
        var sch = schema[key];
        if (Array.isArray(sch)) {
          if (key in traverse.arrayKeywords) {
            for (var i = 0;i < sch.length; i++)
              _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema, i);
          }
        } else if (key in traverse.propsKeywords) {
          if (sch && typeof sch == "object") {
            for (var prop in sch)
              _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema, prop);
          }
        } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
          _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema);
        }
      }
      post(schema, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
    }
  }
  function escapeJsonPtr(str) {
    return str.replace(/~/g, "~0").replace(/\//g, "~1");
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getSchemaRefs = exports.resolveUrl = exports.normalizeId = exports._getFullPath = exports.getFullPath = exports.inlineRef = undefined;
  var util_1 = require_util();
  var equal = require_fast_deep_equal();
  var traverse = require_json_schema_traverse();
  var SIMPLE_INLINED = new Set([
    "type",
    "format",
    "pattern",
    "maxLength",
    "minLength",
    "maxProperties",
    "minProperties",
    "maxItems",
    "minItems",
    "maximum",
    "minimum",
    "uniqueItems",
    "multipleOf",
    "required",
    "enum",
    "const"
  ]);
  function inlineRef(schema, limit = true) {
    if (typeof schema == "boolean")
      return true;
    if (limit === true)
      return !hasRef(schema);
    if (!limit)
      return false;
    return countKeys(schema) <= limit;
  }
  exports.inlineRef = inlineRef;
  var REF_KEYWORDS = new Set([
    "$ref",
    "$recursiveRef",
    "$recursiveAnchor",
    "$dynamicRef",
    "$dynamicAnchor"
  ]);
  function hasRef(schema) {
    for (const key in schema) {
      if (REF_KEYWORDS.has(key))
        return true;
      const sch = schema[key];
      if (Array.isArray(sch) && sch.some(hasRef))
        return true;
      if (typeof sch == "object" && hasRef(sch))
        return true;
    }
    return false;
  }
  function countKeys(schema) {
    let count = 0;
    for (const key in schema) {
      if (key === "$ref")
        return Infinity;
      count++;
      if (SIMPLE_INLINED.has(key))
        continue;
      if (typeof schema[key] == "object") {
        (0, util_1.eachItem)(schema[key], (sch) => count += countKeys(sch));
      }
      if (count === Infinity)
        return Infinity;
    }
    return count;
  }
  function getFullPath(resolver, id = "", normalize) {
    if (normalize !== false)
      id = normalizeId(id);
    const p = resolver.parse(id);
    return _getFullPath(resolver, p);
  }
  exports.getFullPath = getFullPath;
  function _getFullPath(resolver, p) {
    const serialized = resolver.serialize(p);
    return serialized.split("#")[0] + "#";
  }
  exports._getFullPath = _getFullPath;
  var TRAILING_SLASH_HASH = /#\/?$/;
  function normalizeId(id) {
    return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
  }
  exports.normalizeId = normalizeId;
  function resolveUrl(resolver, baseId, id) {
    id = normalizeId(id);
    return resolver.resolve(baseId, id);
  }
  exports.resolveUrl = resolveUrl;
  var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
  function getSchemaRefs(schema, baseId) {
    if (typeof schema == "boolean")
      return {};
    const { schemaId, uriResolver } = this.opts;
    const schId = normalizeId(schema[schemaId] || baseId);
    const baseIds = { "": schId };
    const pathPrefix = getFullPath(uriResolver, schId, false);
    const localRefs = {};
    const schemaRefs = new Set;
    traverse(schema, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
      if (parentJsonPtr === undefined)
        return;
      const fullPath = pathPrefix + jsonPtr;
      let innerBaseId = baseIds[parentJsonPtr];
      if (typeof sch[schemaId] == "string")
        innerBaseId = addRef.call(this, sch[schemaId]);
      addAnchor.call(this, sch.$anchor);
      addAnchor.call(this, sch.$dynamicAnchor);
      baseIds[jsonPtr] = innerBaseId;
      function addRef(ref) {
        const _resolve = this.opts.uriResolver.resolve;
        ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
        if (schemaRefs.has(ref))
          throw ambiguos(ref);
        schemaRefs.add(ref);
        let schOrRef = this.refs[ref];
        if (typeof schOrRef == "string")
          schOrRef = this.refs[schOrRef];
        if (typeof schOrRef == "object") {
          checkAmbiguosRef(sch, schOrRef.schema, ref);
        } else if (ref !== normalizeId(fullPath)) {
          if (ref[0] === "#") {
            checkAmbiguosRef(sch, localRefs[ref], ref);
            localRefs[ref] = sch;
          } else {
            this.refs[ref] = fullPath;
          }
        }
        return ref;
      }
      function addAnchor(anchor) {
        if (typeof anchor == "string") {
          if (!ANCHOR.test(anchor))
            throw new Error(`invalid anchor "${anchor}"`);
          addRef.call(this, `#${anchor}`);
        }
      }
    });
    return localRefs;
    function checkAmbiguosRef(sch1, sch2, ref) {
      if (sch2 !== undefined && !equal(sch1, sch2))
        throw ambiguos(ref);
    }
    function ambiguos(ref) {
      return new Error(`reference "${ref}" resolves to more than one schema`);
    }
  }
  exports.getSchemaRefs = getSchemaRefs;
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getData = exports.KeywordCxt = exports.validateFunctionCode = undefined;
  var boolSchema_1 = require_boolSchema();
  var dataType_1 = require_dataType();
  var applicability_1 = require_applicability();
  var dataType_2 = require_dataType();
  var defaults_1 = require_defaults();
  var keyword_1 = require_keyword();
  var subschema_1 = require_subschema();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var resolve_1 = require_resolve();
  var util_1 = require_util();
  var errors_1 = require_errors();
  function validateFunctionCode(it) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        topSchemaObjCode(it);
        return;
      }
    }
    validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
  }
  exports.validateFunctionCode = validateFunctionCode;
  function validateFunction({ gen, validateName, schema, schemaEnv, opts }, body) {
    if (opts.code.es5) {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
        gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema, opts)}`);
        destructureValCxtES5(gen, opts);
        gen.code(body);
      });
    } else {
      gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema, opts)).code(body));
    }
  }
  function destructureValCxt(opts) {
    return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
  }
  function destructureValCxtES5(gen, opts) {
    gen.if(names_1.default.valCxt, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
      gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
    }, () => {
      gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
      gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
      gen.var(names_1.default.rootData, names_1.default.data);
      if (opts.dynamicRef)
        gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
    });
  }
  function topSchemaObjCode(it) {
    const { schema, opts, gen } = it;
    validateFunction(it, () => {
      if (opts.$comment && schema.$comment)
        commentKeyword(it);
      checkNoDefault(it);
      gen.let(names_1.default.vErrors, null);
      gen.let(names_1.default.errors, 0);
      if (opts.unevaluated)
        resetEvaluated(it);
      typeAndKeywords(it);
      returnResults(it);
    });
    return;
  }
  function resetEvaluated(it) {
    const { gen, validateName } = it;
    it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
    gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
  }
  function funcSourceUrl(schema, opts) {
    const schId = typeof schema == "object" && schema[opts.schemaId];
    return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
  }
  function subschemaCode(it, valid) {
    if (isSchemaObj(it)) {
      checkKeywords(it);
      if (schemaCxtHasRules(it)) {
        subSchemaObjCode(it, valid);
        return;
      }
    }
    (0, boolSchema_1.boolOrEmptySchema)(it, valid);
  }
  function schemaCxtHasRules({ schema, self }) {
    if (typeof schema == "boolean")
      return !schema;
    for (const key in schema)
      if (self.RULES.all[key])
        return true;
    return false;
  }
  function isSchemaObj(it) {
    return typeof it.schema != "boolean";
  }
  function subSchemaObjCode(it, valid) {
    const { schema, gen, opts } = it;
    if (opts.$comment && schema.$comment)
      commentKeyword(it);
    updateContext(it);
    checkAsyncSchema(it);
    const errsCount = gen.const("_errs", names_1.default.errors);
    typeAndKeywords(it, errsCount);
    gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
  }
  function checkKeywords(it) {
    (0, util_1.checkUnknownRules)(it);
    checkRefsAndKeywords(it);
  }
  function typeAndKeywords(it, errsCount) {
    if (it.opts.jtd)
      return schemaKeywords(it, [], false, errsCount);
    const types = (0, dataType_1.getSchemaTypes)(it.schema);
    const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
    schemaKeywords(it, types, !checkedTypes, errsCount);
  }
  function checkRefsAndKeywords(it) {
    const { schema, errSchemaPath, opts, self } = it;
    if (schema.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema, self.RULES)) {
      self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
    }
  }
  function checkNoDefault(it) {
    const { schema, opts } = it;
    if (schema.default !== undefined && opts.useDefaults && opts.strictSchema) {
      (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
    }
  }
  function updateContext(it) {
    const schId = it.schema[it.opts.schemaId];
    if (schId)
      it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
  }
  function checkAsyncSchema(it) {
    if (it.schema.$async && !it.schemaEnv.$async)
      throw new Error("async schema in sync schema");
  }
  function commentKeyword({ gen, schemaEnv, schema, errSchemaPath, opts }) {
    const msg = schema.$comment;
    if (opts.$comment === true) {
      gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
    } else if (typeof opts.$comment == "function") {
      const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
      const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
      gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
    }
  }
  function returnResults(it) {
    const { gen, schemaEnv, validateName, ValidationError, opts } = it;
    if (schemaEnv.$async) {
      gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
    } else {
      gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
      if (opts.unevaluated)
        assignEvaluated(it);
      gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
    }
  }
  function assignEvaluated({ gen, evaluated, props, items }) {
    if (props instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.props`, props);
    if (items instanceof codegen_1.Name)
      gen.assign((0, codegen_1._)`${evaluated}.items`, items);
  }
  function schemaKeywords(it, types, typeErrors, errsCount) {
    const { gen, schema, data, allErrors, opts, self } = it;
    const { RULES } = self;
    if (schema.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema, RULES))) {
      gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
      return;
    }
    if (!opts.jtd)
      checkStrictTypes(it, types);
    gen.block(() => {
      for (const group of RULES.rules)
        groupKeywords(group);
      groupKeywords(RULES.post);
    });
    function groupKeywords(group) {
      if (!(0, applicability_1.shouldUseGroup)(schema, group))
        return;
      if (group.type) {
        gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
        iterateKeywords(it, group);
        if (types.length === 1 && types[0] === group.type && typeErrors) {
          gen.else();
          (0, dataType_2.reportTypeError)(it);
        }
        gen.endIf();
      } else {
        iterateKeywords(it, group);
      }
      if (!allErrors)
        gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
    }
  }
  function iterateKeywords(it, group) {
    const { gen, schema, opts: { useDefaults } } = it;
    if (useDefaults)
      (0, defaults_1.assignDefaults)(it, group.type);
    gen.block(() => {
      for (const rule of group.rules) {
        if ((0, applicability_1.shouldUseRule)(schema, rule)) {
          keywordCode(it, rule.keyword, rule.definition, group.type);
        }
      }
    });
  }
  function checkStrictTypes(it, types) {
    if (it.schemaEnv.meta || !it.opts.strictTypes)
      return;
    checkContextTypes(it, types);
    if (!it.opts.allowUnionTypes)
      checkMultipleTypes(it, types);
    checkKeywordTypes(it, it.dataTypes);
  }
  function checkContextTypes(it, types) {
    if (!types.length)
      return;
    if (!it.dataTypes.length) {
      it.dataTypes = types;
      return;
    }
    types.forEach((t) => {
      if (!includesType(it.dataTypes, t)) {
        strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
      }
    });
    narrowSchemaTypes(it, types);
  }
  function checkMultipleTypes(it, ts) {
    if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
      strictTypesError(it, "use allowUnionTypes to allow union type keyword");
    }
  }
  function checkKeywordTypes(it, ts) {
    const rules = it.self.RULES.all;
    for (const keyword in rules) {
      const rule = rules[keyword];
      if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
        const { type } = rule.definition;
        if (type.length && !type.some((t) => hasApplicableType(ts, t))) {
          strictTypesError(it, `missing type "${type.join(",")}" for keyword "${keyword}"`);
        }
      }
    }
  }
  function hasApplicableType(schTs, kwdT) {
    return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
  }
  function includesType(ts, t) {
    return ts.includes(t) || t === "integer" && ts.includes("number");
  }
  function narrowSchemaTypes(it, withTypes) {
    const ts = [];
    for (const t of it.dataTypes) {
      if (includesType(withTypes, t))
        ts.push(t);
      else if (withTypes.includes("integer") && t === "number")
        ts.push("integer");
    }
    it.dataTypes = ts;
  }
  function strictTypesError(it, msg) {
    const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
    msg += ` at "${schemaPath}" (strictTypes)`;
    (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
  }

  class KeywordCxt {
    constructor(it, def, keyword) {
      (0, keyword_1.validateKeywordUsage)(it, def, keyword);
      this.gen = it.gen;
      this.allErrors = it.allErrors;
      this.keyword = keyword;
      this.data = it.data;
      this.schema = it.schema[keyword];
      this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
      this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
      this.schemaType = def.schemaType;
      this.parentSchema = it.schema;
      this.params = {};
      this.it = it;
      this.def = def;
      if (this.$data) {
        this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
      } else {
        this.schemaCode = this.schemaValue;
        if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
          throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
        }
      }
      if ("code" in def ? def.trackErrors : def.errors !== false) {
        this.errsCount = it.gen.const("_errs", names_1.default.errors);
      }
    }
    result(condition, successAction, failAction) {
      this.failResult((0, codegen_1.not)(condition), successAction, failAction);
    }
    failResult(condition, successAction, failAction) {
      this.gen.if(condition);
      if (failAction)
        failAction();
      else
        this.error();
      if (successAction) {
        this.gen.else();
        successAction();
        if (this.allErrors)
          this.gen.endIf();
      } else {
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
    }
    pass(condition, failAction) {
      this.failResult((0, codegen_1.not)(condition), undefined, failAction);
    }
    fail(condition) {
      if (condition === undefined) {
        this.error();
        if (!this.allErrors)
          this.gen.if(false);
        return;
      }
      this.gen.if(condition);
      this.error();
      if (this.allErrors)
        this.gen.endIf();
      else
        this.gen.else();
    }
    fail$data(condition) {
      if (!this.$data)
        return this.fail(condition);
      const { schemaCode } = this;
      this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
    }
    error(append, errorParams, errorPaths) {
      if (errorParams) {
        this.setParams(errorParams);
        this._error(append, errorPaths);
        this.setParams({});
        return;
      }
      this._error(append, errorPaths);
    }
    _error(append, errorPaths) {
      (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
    }
    $dataError() {
      (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
    }
    reset() {
      if (this.errsCount === undefined)
        throw new Error('add "trackErrors" to keyword definition');
      (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
    }
    ok(cond) {
      if (!this.allErrors)
        this.gen.if(cond);
    }
    setParams(obj, assign) {
      if (assign)
        Object.assign(this.params, obj);
      else
        this.params = obj;
    }
    block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
      this.gen.block(() => {
        this.check$data(valid, $dataValid);
        codeBlock();
      });
    }
    check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
      if (!this.$data)
        return;
      const { gen, schemaCode, schemaType, def } = this;
      gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
      if (valid !== codegen_1.nil)
        gen.assign(valid, true);
      if (schemaType.length || def.validateSchema) {
        gen.elseIf(this.invalid$data());
        this.$dataError();
        if (valid !== codegen_1.nil)
          gen.assign(valid, false);
      }
      gen.else();
    }
    invalid$data() {
      const { gen, schemaCode, schemaType, def, it } = this;
      return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
      function wrong$DataType() {
        if (schemaType.length) {
          if (!(schemaCode instanceof codegen_1.Name))
            throw new Error("ajv implementation error");
          const st = Array.isArray(schemaType) ? schemaType : [schemaType];
          return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
        }
        return codegen_1.nil;
      }
      function invalid$DataSchema() {
        if (def.validateSchema) {
          const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
          return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
        }
        return codegen_1.nil;
      }
    }
    subschema(appl, valid) {
      const subschema = (0, subschema_1.getSubschema)(this.it, appl);
      (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
      (0, subschema_1.extendSubschemaMode)(subschema, appl);
      const nextContext = { ...this.it, ...subschema, items: undefined, props: undefined };
      subschemaCode(nextContext, valid);
      return nextContext;
    }
    mergeEvaluated(schemaCxt, toName) {
      const { it, gen } = this;
      if (!it.opts.unevaluated)
        return;
      if (it.props !== true && schemaCxt.props !== undefined) {
        it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
      }
      if (it.items !== true && schemaCxt.items !== undefined) {
        it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
      }
    }
    mergeValidEvaluated(schemaCxt, valid) {
      const { it, gen } = this;
      if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
        gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
        return true;
      }
    }
  }
  exports.KeywordCxt = KeywordCxt;
  function keywordCode(it, keyword, def, ruleType) {
    const cxt = new KeywordCxt(it, def, keyword);
    if ("code" in def) {
      def.code(cxt, ruleType);
    } else if (cxt.$data && def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    } else if ("macro" in def) {
      (0, keyword_1.macroKeywordCode)(cxt, def);
    } else if (def.compile || def.validate) {
      (0, keyword_1.funcKeywordCode)(cxt, def);
    }
  }
  var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
  var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
  function getData($data, { dataLevel, dataNames, dataPathArr }) {
    let jsonPointer;
    let data;
    if ($data === "")
      return names_1.default.rootData;
    if ($data[0] === "/") {
      if (!JSON_POINTER.test($data))
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      jsonPointer = $data;
      data = names_1.default.rootData;
    } else {
      const matches = RELATIVE_JSON_POINTER.exec($data);
      if (!matches)
        throw new Error(`Invalid JSON-pointer: ${$data}`);
      const up = +matches[1];
      jsonPointer = matches[2];
      if (jsonPointer === "#") {
        if (up >= dataLevel)
          throw new Error(errorMsg("property/index", up));
        return dataPathArr[dataLevel - up];
      }
      if (up > dataLevel)
        throw new Error(errorMsg("data", up));
      data = dataNames[dataLevel - up];
      if (!jsonPointer)
        return data;
    }
    let expr = data;
    const segments = jsonPointer.split("/");
    for (const segment of segments) {
      if (segment) {
        data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
        expr = (0, codegen_1._)`${expr} && ${data}`;
      }
    }
    return expr;
    function errorMsg(pointerType, up) {
      return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
    }
  }
  exports.getData = getData;
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });

  class ValidationError extends Error {
    constructor(errors) {
      super("validation failed");
      this.errors = errors;
      this.ajv = this.validation = true;
    }
  }
  exports.default = ValidationError;
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var resolve_1 = require_resolve();

  class MissingRefError extends Error {
    constructor(resolver, baseId, ref, msg) {
      super(msg || `can't resolve reference ${ref} from id ${baseId}`);
      this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
      this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
    }
  }
  exports.default = MissingRefError;
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.resolveSchema = exports.getCompilingSchema = exports.resolveRef = exports.compileSchema = exports.SchemaEnv = undefined;
  var codegen_1 = require_codegen();
  var validation_error_1 = require_validation_error();
  var names_1 = require_names();
  var resolve_1 = require_resolve();
  var util_1 = require_util();
  var validate_1 = require_validate();

  class SchemaEnv {
    constructor(env) {
      var _a;
      this.refs = {};
      this.dynamicAnchors = {};
      let schema;
      if (typeof env.schema == "object")
        schema = env.schema;
      this.schema = env.schema;
      this.schemaId = env.schemaId;
      this.root = env.root || this;
      this.baseId = (_a = env.baseId) !== null && _a !== undefined ? _a : (0, resolve_1.normalizeId)(schema === null || schema === undefined ? undefined : schema[env.schemaId || "$id"]);
      this.schemaPath = env.schemaPath;
      this.localRefs = env.localRefs;
      this.meta = env.meta;
      this.$async = schema === null || schema === undefined ? undefined : schema.$async;
      this.refs = {};
    }
  }
  exports.SchemaEnv = SchemaEnv;
  function compileSchema(sch) {
    const _sch = getCompilingSchema.call(this, sch);
    if (_sch)
      return _sch;
    const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
    const { es5, lines } = this.opts.code;
    const { ownProperties } = this.opts;
    const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
    let _ValidationError;
    if (sch.$async) {
      _ValidationError = gen.scopeValue("Error", {
        ref: validation_error_1.default,
        code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
      });
    }
    const validateName = gen.scopeName("validate");
    sch.validateName = validateName;
    const schemaCxt = {
      gen,
      allErrors: this.opts.allErrors,
      data: names_1.default.data,
      parentData: names_1.default.parentData,
      parentDataProperty: names_1.default.parentDataProperty,
      dataNames: [names_1.default.data],
      dataPathArr: [codegen_1.nil],
      dataLevel: 0,
      dataTypes: [],
      definedProperties: new Set,
      topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
      validateName,
      ValidationError: _ValidationError,
      schema: sch.schema,
      schemaEnv: sch,
      rootId,
      baseId: sch.baseId || rootId,
      schemaPath: codegen_1.nil,
      errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
      errorPath: (0, codegen_1._)`""`,
      opts: this.opts,
      self: this
    };
    let sourceCode;
    try {
      this._compilations.add(sch);
      (0, validate_1.validateFunctionCode)(schemaCxt);
      gen.optimize(this.opts.code.optimize);
      const validateCode = gen.toString();
      sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
      if (this.opts.code.process)
        sourceCode = this.opts.code.process(sourceCode, sch);
      const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
      const validate = makeValidate(this, this.scope.get());
      this.scope.value(validateName, { ref: validate });
      validate.errors = null;
      validate.schema = sch.schema;
      validate.schemaEnv = sch;
      if (sch.$async)
        validate.$async = true;
      if (this.opts.code.source === true) {
        validate.source = { validateName, validateCode, scopeValues: gen._values };
      }
      if (this.opts.unevaluated) {
        const { props, items } = schemaCxt;
        validate.evaluated = {
          props: props instanceof codegen_1.Name ? undefined : props,
          items: items instanceof codegen_1.Name ? undefined : items,
          dynamicProps: props instanceof codegen_1.Name,
          dynamicItems: items instanceof codegen_1.Name
        };
        if (validate.source)
          validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
      }
      sch.validate = validate;
      return sch;
    } catch (e) {
      delete sch.validate;
      delete sch.validateName;
      if (sourceCode)
        this.logger.error("Error compiling schema, function code:", sourceCode);
      throw e;
    } finally {
      this._compilations.delete(sch);
    }
  }
  exports.compileSchema = compileSchema;
  function resolveRef(root, baseId, ref) {
    var _a;
    ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
    const schOrFunc = root.refs[ref];
    if (schOrFunc)
      return schOrFunc;
    let _sch = resolve.call(this, root, ref);
    if (_sch === undefined) {
      const schema = (_a = root.localRefs) === null || _a === undefined ? undefined : _a[ref];
      const { schemaId } = this.opts;
      if (schema)
        _sch = new SchemaEnv({ schema, schemaId, root, baseId });
    }
    if (_sch === undefined)
      return;
    return root.refs[ref] = inlineOrCompile.call(this, _sch);
  }
  exports.resolveRef = resolveRef;
  function inlineOrCompile(sch) {
    if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
      return sch.schema;
    return sch.validate ? sch : compileSchema.call(this, sch);
  }
  function getCompilingSchema(schEnv) {
    for (const sch of this._compilations) {
      if (sameSchemaEnv(sch, schEnv))
        return sch;
    }
  }
  exports.getCompilingSchema = getCompilingSchema;
  function sameSchemaEnv(s1, s2) {
    return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
  }
  function resolve(root, ref) {
    let sch;
    while (typeof (sch = this.refs[ref]) == "string")
      ref = sch;
    return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
  }
  function resolveSchema(root, ref) {
    const p = this.opts.uriResolver.parse(ref);
    const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
    let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, undefined);
    if (Object.keys(root.schema).length > 0 && refPath === baseId) {
      return getJsonPointer.call(this, p, root);
    }
    const id = (0, resolve_1.normalizeId)(refPath);
    const schOrRef = this.refs[id] || this.schemas[id];
    if (typeof schOrRef == "string") {
      const sch = resolveSchema.call(this, root, schOrRef);
      if (typeof (sch === null || sch === undefined ? undefined : sch.schema) !== "object")
        return;
      return getJsonPointer.call(this, p, sch);
    }
    if (typeof (schOrRef === null || schOrRef === undefined ? undefined : schOrRef.schema) !== "object")
      return;
    if (!schOrRef.validate)
      compileSchema.call(this, schOrRef);
    if (id === (0, resolve_1.normalizeId)(ref)) {
      const { schema } = schOrRef;
      const { schemaId } = this.opts;
      const schId = schema[schemaId];
      if (schId)
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      return new SchemaEnv({ schema, schemaId, root, baseId });
    }
    return getJsonPointer.call(this, p, schOrRef);
  }
  exports.resolveSchema = resolveSchema;
  var PREVENT_SCOPE_CHANGE = new Set([
    "properties",
    "patternProperties",
    "enum",
    "dependencies",
    "definitions"
  ]);
  function getJsonPointer(parsedRef, { baseId, schema, root }) {
    var _a;
    if (((_a = parsedRef.fragment) === null || _a === undefined ? undefined : _a[0]) !== "/")
      return;
    for (const part of parsedRef.fragment.slice(1).split("/")) {
      if (typeof schema === "boolean")
        return;
      const partSchema = schema[(0, util_1.unescapeFragment)(part)];
      if (partSchema === undefined)
        return;
      schema = partSchema;
      const schId = typeof schema === "object" && schema[this.opts.schemaId];
      if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
        baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
      }
    }
    let env;
    if (typeof schema != "boolean" && schema.$ref && !(0, util_1.schemaHasRulesButRef)(schema, this.RULES)) {
      const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema.$ref);
      env = resolveSchema.call(this, root, $ref);
    }
    const { schemaId } = this.opts;
    env = env || new SchemaEnv({ schema, schemaId, root, baseId });
    if (env.schema !== env.root.schema)
      return env;
    return;
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS((exports, module) => {
  module.exports = {
    $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
    description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
    type: "object",
    required: ["$data"],
    properties: {
      $data: {
        type: "string",
        anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
      }
    },
    additionalProperties: false
  };
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS((exports, module) => {
  var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
  var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
  var isHexPair = RegExp.prototype.test.bind(/^[\da-f]{2}$/iu);
  var isUnreserved = RegExp.prototype.test.bind(/^[\da-z\-._~]$/iu);
  var isPathCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/]$/u);
  var isQueryFragmentCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:@/?]$/u);
  var isUserinfoCharacter = RegExp.prototype.test.bind(/^[A-Za-z0-9\-._~!$&'()*+,;=:]$/u);
  var BYTE_HEX = new Array(256);
  {
    const HEX_DIGITS = "0123456789ABCDEF";
    for (let i = 0;i < 256; i++) {
      BYTE_HEX[i] = "%" + HEX_DIGITS[i >> 4] + HEX_DIGITS[i & 15];
    }
  }
  function percentEncodeNonAscii(cp) {
    if (cp < 2048) {
      return BYTE_HEX[192 | cp >> 6] + BYTE_HEX[128 | cp & 63];
    }
    if (cp < 65536) {
      return BYTE_HEX[224 | cp >> 12] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
    }
    return BYTE_HEX[240 | cp >> 18] + BYTE_HEX[128 | cp >> 12 & 63] + BYTE_HEX[128 | cp >> 6 & 63] + BYTE_HEX[128 | cp & 63];
  }
  function stringArrayToHexStripped(input) {
    let acc = "";
    let code = 0;
    let i = 0;
    for (i = 0;i < input.length; i++) {
      code = input[i].charCodeAt(0);
      if (code === 48) {
        continue;
      }
      if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
        return "";
      }
      acc += input[i];
      break;
    }
    for (i += 1;i < input.length; i++) {
      code = input[i].charCodeAt(0);
      if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
        return "";
      }
      acc += input[i];
    }
    return acc;
  }
  var isHextet = RegExp.prototype.test.bind(/^[\dA-Fa-f]{1,4}$/);
  var isIPvFuture = RegExp.prototype.test.bind(/^[vV][\dA-Fa-f]+\.[A-Za-z\d\-._~!$&'()*+,;=:]+$/);
  var isZoneCharacter = RegExp.prototype.test.bind(/^[A-Za-z\d\-._~]$/);
  var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
  function isZoneIdentifier(zone) {
    if (zone.length === 0)
      return false;
    for (let i = 0;i < zone.length; i++) {
      if (isZoneCharacter(zone[i]))
        continue;
      if (zone[i] === "%" && i + 2 < zone.length && isHexPair(zone.slice(i + 1, i + 3))) {
        i += 2;
        continue;
      }
      return false;
    }
    return true;
  }
  function compressIPv6ZeroRun(hextets) {
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;
    let runLength = 0;
    for (let i = 0;i < hextets.length; i++) {
      if (hextets[i] === "0") {
        if (runStart === -1)
          runStart = i;
        runLength++;
        if (runLength > bestLength) {
          bestLength = runLength;
          bestStart = runStart;
        }
      } else {
        runStart = -1;
        runLength = 0;
      }
    }
    if (bestLength < 2)
      return hextets.join(":");
    const head = hextets.slice(0, bestStart).join(":");
    const tail = hextets.slice(bestStart + bestLength).join(":");
    return head + "::" + tail;
  }
  function normalizeIPv6Address(input) {
    const compression = input.indexOf("::");
    if (compression !== -1 && input.indexOf("::", compression + 1) !== -1)
      return;
    const left = compression === -1 ? input.split(":") : input.slice(0, compression).split(":");
    const right = compression === -1 ? [] : input.slice(compression + 2).split(":");
    if (compression !== -1) {
      if (left.length === 1 && left[0] === "")
        left.length = 0;
      if (right.length === 1 && right[0] === "")
        right.length = 0;
    }
    const parts = left.concat(right);
    let hextetCount = 0;
    for (let i = 0;i < parts.length; i++) {
      const part = parts[i];
      if (part === "")
        return;
      if (part.indexOf(".") !== -1) {
        if (i !== parts.length - 1 || compression !== -1 && right.length === 0 || !isIPv4(part))
          return;
        hextetCount += 2;
        continue;
      }
      if (!isHextet(part))
        return;
      parts[i] = parseInt(part, 16).toString(16);
      hextetCount++;
    }
    if (compression === -1) {
      if (hextetCount !== 8)
        return;
      return compressIPv6ZeroRun(parts);
    }
    if (hextetCount >= 8)
      return;
    const expanded = parts.slice(0, left.length);
    for (let i = hextetCount;i < 8; i++)
      expanded.push("0");
    for (let i = left.length;i < parts.length; i++)
      expanded.push(parts[i]);
    return compressIPv6ZeroRun(expanded);
  }
  function normalizeIPv6(host) {
    const bracketed = host[0] === "[" && host[host.length - 1] === "]";
    const hasBracket = host[0] === "[" || host[host.length - 1] === "]";
    if (hasBracket && !bracketed)
      return { host, isIPV6: false, error: true };
    let input = bracketed ? host.slice(1, -1) : host;
    if (bracketed && isIPvFuture(input)) {
      input = input.toLowerCase();
      return { host: `[${input}]`, escapedHost: input, isIPV6: false, isIPVFuture: true };
    }
    if (findToken(input, ":") < 2) {
      return { host, isIPV6: false, error: bracketed };
    }
    let zoneIdentifier = "";
    const zoneSeparator = input.indexOf("%");
    if (zoneSeparator !== -1) {
      const separatorLength = input.slice(zoneSeparator, zoneSeparator + 3).toLowerCase() === "%25" ? 3 : 1;
      zoneIdentifier = input.slice(zoneSeparator + separatorLength);
      if (!isZoneIdentifier(zoneIdentifier))
        return { host, isIPV6: false, error: true };
      input = input.slice(0, zoneSeparator);
    }
    const address = normalizeIPv6Address(input);
    if (address === undefined)
      return { host, isIPV6: false, error: true };
    return {
      host: address + (zoneIdentifier ? "%" + zoneIdentifier : ""),
      escapedHost: address + (zoneIdentifier ? "%25" + zoneIdentifier : ""),
      isIPV6: true
    };
  }
  function findToken(str, token) {
    let ind = 0;
    for (let i = 0;i < str.length; i++) {
      if (str[i] === token)
        ind++;
    }
    return ind;
  }
  function removeDotSegments(path) {
    let input = path;
    const output = [];
    let nextSlash = -1;
    let len = 0;
    while (len = input.length) {
      if (len === 1) {
        if (input === ".") {
          break;
        } else if (input === "/") {
          output.push("/");
          break;
        } else {
          output.push(input);
          break;
        }
      } else if (len === 2) {
        if (input[0] === ".") {
          if (input[1] === ".") {
            break;
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === "." || input[1] === "/") {
            output.push("/");
            break;
          }
        }
      } else if (len === 3) {
        if (input === "/..") {
          if (output.length !== 0) {
            output.pop();
          }
          output.push("/");
          break;
        }
      }
      if (input[0] === ".") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(3);
            continue;
          }
        } else if (input[1] === "/") {
          input = input.slice(2);
          continue;
        }
      } else if (input[0] === "/") {
        if (input[1] === ".") {
          if (input[2] === "/") {
            input = input.slice(2);
            continue;
          } else if (input[2] === ".") {
            if (input[3] === "/") {
              input = input.slice(3);
              if (output.length !== 0) {
                output.pop();
              }
              continue;
            }
          }
        }
      }
      if ((nextSlash = input.indexOf("/", 1)) === -1) {
        output.push(input);
        break;
      } else {
        output.push(input.slice(0, nextSlash));
        input = input.slice(nextSlash);
      }
    }
    return output.join("");
  }
  var HOST_DELIMS = { "@": "%40", "/": "%2F", "?": "%3F", "#": "%23", ":": "%3A" };
  var HOST_DELIM_RE = /[@/?#:]/g;
  var HOST_DELIM_NO_COLON_RE = /[@/?#]/g;
  function reescapeHostDelimiters(host, isIP) {
    const re = isIP ? HOST_DELIM_NO_COLON_RE : HOST_DELIM_RE;
    re.lastIndex = 0;
    return host.replace(re, (ch) => HOST_DELIMS[ch]);
  }
  function normalizePercentEncoding(input, decodeUnreserved = false) {
    if (input.indexOf("%") === -1) {
      return input;
    }
    let output = "";
    for (let i = 0;i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decodeUnreserved && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      output += input[i];
    }
    return output;
  }
  function normalizePathEncoding(input) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (decoded !== "." && isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isPathCharacter(ch)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function serializePathEncoding(input, pathNoScheme = false) {
    let output = "";
    let firstSegment = pathNoScheme && input[0] !== "/";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      if (ch === "/") {
        firstSegment = false;
      }
      if (isPathCharacter(ch) && (ch !== ":" || !firstSegment)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function encodeComponent(input, isAllowed) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      if (isAllowed(ch)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function encodeUserinfo(input) {
    return encodeComponent(input, isUserinfoCharacter);
  }
  function encodeQuery(input) {
    return encodeComponent(input, isQueryFragmentCharacter);
  }
  function encodeFragment(input) {
    return encodeComponent(input, isQueryFragmentCharacter);
  }
  function isEscapeSafe(cp) {
    return cp >= 48 && cp <= 57 || cp >= 65 && cp <= 90 || cp >= 97 && cp <= 122 || cp === 42 || cp === 43 || cp === 45 || cp === 46 || cp === 47 || cp === 64 || cp === 95;
  }
  function normalizeQueryFragmentEncoding(input) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      const ch = input[i];
      if (ch === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          const normalizedHex = hex.toUpperCase();
          const decoded = String.fromCharCode(parseInt(normalizedHex, 16));
          if (isUnreserved(decoded)) {
            output += decoded;
          } else {
            output += "%" + normalizedHex;
          }
          i += 2;
          continue;
        }
      }
      if (isQueryFragmentCharacter(ch)) {
        output += ch;
      } else {
        const code = input.charCodeAt(i);
        if (code < 128) {
          output += isEscapeSafe(code) ? ch : BYTE_HEX[code];
        } else if (code < 55296 || code > 57343) {
          output += percentEncodeNonAscii(code);
        } else if (code <= 56319 && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 56320 && low <= 57343) {
            output += percentEncodeNonAscii(65536 + (code - 55296 << 10) + (low - 56320));
            i++;
          } else {
            output += percentEncodeNonAscii(65533);
          }
        } else {
          output += percentEncodeNonAscii(65533);
        }
      }
    }
    return output;
  }
  function escapePreservingEscapes(input) {
    let output = "";
    for (let i = 0;i < input.length; i++) {
      if (input[i] === "%" && i + 2 < input.length) {
        const hex = input.slice(i + 1, i + 3);
        if (isHexPair(hex)) {
          output += "%" + hex.toUpperCase();
          i += 2;
          continue;
        }
      }
      output += escape(input[i]);
    }
    return output;
  }
  function recomposeAuthority(component) {
    const uriTokens = [];
    if (component.userinfo !== undefined) {
      uriTokens.push(encodeUserinfo(component.userinfo));
      uriTokens.push("@");
    }
    if (component.host !== undefined) {
      let host = component.host;
      if (!isIPv4(host)) {
        let ipV6res = normalizeIPv6(host);
        if (ipV6res.isIPV6 !== true && ipV6res.isIPVFuture !== true) {
          host = normalizePercentEncoding(host, true);
          ipV6res = normalizeIPv6(host);
        }
        if (ipV6res.isIPV6 === true || ipV6res.isIPVFuture === true) {
          host = `[${ipV6res.escapedHost}]`;
        } else {
          host = reescapeHostDelimiters(host, false);
        }
      }
      uriTokens.push(host);
    }
    if (typeof component.port === "number" || typeof component.port === "string") {
      uriTokens.push(":");
      uriTokens.push(String(component.port));
    }
    return uriTokens.length ? uriTokens.join("") : undefined;
  }
  module.exports = {
    nonSimpleDomain,
    recomposeAuthority,
    reescapeHostDelimiters,
    normalizePercentEncoding,
    normalizePathEncoding,
    serializePathEncoding,
    normalizeQueryFragmentEncoding,
    encodeUserinfo,
    encodeQuery,
    encodeFragment,
    escapePreservingEscapes,
    removeDotSegments,
    isIPv4,
    isUUID,
    normalizeIPv6,
    stringArrayToHexStripped
  };
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS((exports, module) => {
  var { isUUID } = require_utils();
  var URN_REG = /^([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-./:;=@]|%[\da-f]{2})+)$/iu;
  var supportedSchemeNames = [
    "http",
    "https",
    "ws",
    "wss",
    "urn",
    "urn:uuid"
  ];
  function isValidSchemeName(name) {
    return supportedSchemeNames.indexOf(name) !== -1;
  }
  function wsIsSecure(wsComponent) {
    if (wsComponent.secure === true) {
      return true;
    } else if (wsComponent.secure === false) {
      return false;
    } else if (wsComponent.scheme) {
      return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
    } else {
      return false;
    }
  }
  function httpParse(component) {
    if (!component.host) {
      component.error = component.error || "HTTP URIs must have a host.";
    }
    return component;
  }
  function httpSerialize(component) {
    const secure = String(component.scheme).toLowerCase() === "https";
    if (component.port === (secure ? 443 : 80) || component.port === "") {
      component.port = undefined;
    }
    if (!component.path) {
      component.path = "/";
    }
    return component;
  }
  function wsParse(wsComponent) {
    wsComponent.secure = wsIsSecure(wsComponent);
    wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
    wsComponent.path = undefined;
    wsComponent.query = undefined;
    return wsComponent;
  }
  function wsSerialize(wsComponent) {
    if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
      wsComponent.port = undefined;
    }
    if (typeof wsComponent.secure === "boolean") {
      wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
      wsComponent.secure = undefined;
    }
    if (wsComponent.resourceName) {
      const queryIndex = wsComponent.resourceName.indexOf("?");
      const path = queryIndex === -1 ? wsComponent.resourceName : wsComponent.resourceName.slice(0, queryIndex);
      wsComponent.path = path && path !== "/" ? path : undefined;
      wsComponent.query = queryIndex === -1 ? undefined : wsComponent.resourceName.slice(queryIndex + 1);
      wsComponent.resourceName = undefined;
    }
    wsComponent.fragment = undefined;
    return wsComponent;
  }
  function urnParse(urnComponent, options) {
    if (!urnComponent.path) {
      urnComponent.error = "URN can not be parsed";
      return urnComponent;
    }
    const matches = urnComponent.path.match(URN_REG);
    if (matches && matches[0] === urnComponent.path) {
      const scheme = options.scheme || urnComponent.scheme || "urn";
      urnComponent.nid = matches[1].toLowerCase();
      urnComponent.nss = matches[2];
      const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      urnComponent.path = undefined;
      if (schemeHandler) {
        urnComponent = schemeHandler.parse(urnComponent, options);
      }
    } else {
      urnComponent.error = urnComponent.error || "URN can not be parsed.";
    }
    return urnComponent;
  }
  function urnSerialize(urnComponent, options) {
    if (urnComponent.nid === undefined) {
      throw new Error("URN without nid cannot be serialized");
    }
    const scheme = options.scheme || urnComponent.scheme || "urn";
    const nid = urnComponent.nid.toLowerCase();
    const urnScheme = `${scheme}:${options.nid || nid}`;
    const schemeHandler = getSchemeHandler(urnScheme);
    if (schemeHandler) {
      urnComponent = schemeHandler.serialize(urnComponent, options);
    }
    const uriComponent = urnComponent;
    const nss = urnComponent.nss;
    uriComponent.path = `${nid || options.nid}:${nss}`;
    options.skipEscape = true;
    return uriComponent;
  }
  function urnuuidParse(urnComponent, options) {
    const uuidComponent = urnComponent;
    uuidComponent.uuid = uuidComponent.nss;
    uuidComponent.nss = undefined;
    if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
      uuidComponent.error = uuidComponent.error || "UUID is not valid.";
    }
    return uuidComponent;
  }
  function urnuuidSerialize(uuidComponent) {
    const urnComponent = uuidComponent;
    urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
    return urnComponent;
  }
  var http = {
    scheme: "http",
    domainHost: true,
    parse: httpParse,
    serialize: httpSerialize
  };
  var https = {
    scheme: "https",
    domainHost: http.domainHost,
    parse: httpParse,
    serialize: httpSerialize
  };
  var ws = {
    scheme: "ws",
    domainHost: true,
    parse: wsParse,
    serialize: wsSerialize
  };
  var wss = {
    scheme: "wss",
    domainHost: ws.domainHost,
    parse: ws.parse,
    serialize: ws.serialize
  };
  var urn = {
    scheme: "urn",
    parse: urnParse,
    serialize: urnSerialize,
    skipNormalize: true
  };
  var urnuuid = {
    scheme: "urn:uuid",
    parse: urnuuidParse,
    serialize: urnuuidSerialize,
    skipNormalize: true
  };
  var SCHEMES = {
    http,
    https,
    ws,
    wss,
    urn,
    "urn:uuid": urnuuid
  };
  Object.setPrototypeOf(SCHEMES, null);
  function getSchemeHandler(scheme) {
    return scheme && (SCHEMES[scheme] || SCHEMES[scheme.toLowerCase()]) || undefined;
  }
  module.exports = {
    wsIsSecure,
    SCHEMES,
    isValidSchemeName,
    getSchemeHandler
  };
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS((exports, module) => {
  var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizePercentEncoding, normalizePathEncoding, serializePathEncoding, normalizeQueryFragmentEncoding, encodeQuery, encodeFragment, reescapeHostDelimiters, isIPv4, nonSimpleDomain } = require_utils();
  var { SCHEMES, getSchemeHandler } = require_schemes();
  var VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/u;
  var MALFORMED_SCHEME_ERROR = "URI scheme is malformed.";
  function decodeValidScheme(scheme) {
    const decodedScheme = unescape(String(scheme));
    if (!VALID_SCHEME.test(decodedScheme)) {
      throw new TypeError(MALFORMED_SCHEME_ERROR);
    }
    return decodedScheme;
  }
  function normalize(uri, options) {
    if (typeof uri === "string") {
      uri = normalizeString(uri, options);
    } else if (typeof uri === "object") {
      uri = parse(serialize(uri, options), options);
    }
    return uri;
  }
  function resolve(baseURI, relativeURI, options) {
    const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
    const {
      parsed: baseParsed,
      malformedAuthorityOrPort: baseMalformed,
      malformedPercentEncoding: baseMalformedPercentEncoding,
      malformedSchemeSpecific: baseMalformedSchemeSpecific,
      malformedHost: baseMalformedHost,
      malformedScheme: baseMalformedScheme
    } = parseWithStatus(baseURI, schemelessOptions);
    const {
      parsed: relativeParsed,
      malformedAuthorityOrPort: relativeMalformed,
      malformedPercentEncoding: relativeMalformedPercentEncoding,
      malformedSchemeSpecific: relativeMalformedSchemeSpecific,
      malformedHost: relativeMalformedHost,
      malformedScheme: relativeMalformedScheme
    } = parseWithStatus(relativeURI, schemelessOptions);
    if (baseMalformed || relativeMalformed || baseMalformedPercentEncoding || relativeMalformedPercentEncoding || baseMalformedSchemeSpecific || relativeMalformedSchemeSpecific || baseMalformedHost || relativeMalformedHost || baseMalformedScheme || relativeMalformedScheme) {
      throw new Error(baseParsed.error || relativeParsed.error || "URI is malformed.");
    }
    const resolved = resolveComponent(baseParsed, relativeParsed, schemelessOptions, true);
    const resolvedSchemeHandler = getSchemeHandler(options && options.scheme || resolved.scheme);
    const resolvedHost = resolved.host;
    const resolvedHostIsIP = resolvedHost !== undefined && resolvedHost !== "" && (isIPv4(resolvedHost) || normalizeIPv6(resolvedHost).isIPV6);
    canonicalizeHost(resolved, options || {}, resolvedSchemeHandler, resolvedHostIsIP);
    const encodedASCIIHost = resolvedHost && resolvedHost.indexOf("%") !== -1 && !/\P{ASCII}/u.test(resolvedHost);
    if (resolved.error && !encodedASCIIHost) {
      throw new Error(resolved.error);
    }
    schemelessOptions.skipEscape = true;
    return serialize(resolved, schemelessOptions);
  }
  function resolveComponent(base, relative, options, skipNormalization) {
    const target = {};
    if (!skipNormalization) {
      base = parse(serialize(base, options), options);
      relative = parse(serialize(relative, options), options);
    }
    options = options || {};
    if (!options.tolerant && relative.scheme) {
      target.scheme = relative.scheme;
      target.userinfo = relative.userinfo;
      target.host = relative.host;
      target.port = relative.port;
      target.path = removeDotSegments(relative.path || "");
      target.query = relative.query;
    } else {
      if (relative.userinfo !== undefined || relative.host !== undefined || relative.port !== undefined) {
        target.userinfo = relative.userinfo;
        target.host = relative.host;
        target.port = relative.port;
        target.path = removeDotSegments(relative.path || "");
        target.query = relative.query;
      } else {
        if (!relative.path) {
          target.path = base.path;
          if (relative.query !== undefined) {
            target.query = relative.query;
          } else {
            target.query = base.query;
          }
        } else {
          if (relative.path[0] === "/") {
            target.path = removeDotSegments(relative.path);
          } else {
            if ((base.userinfo !== undefined || base.host !== undefined || base.port !== undefined) && !base.path) {
              target.path = "/" + relative.path;
            } else if (!base.path) {
              target.path = relative.path;
            } else {
              target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative.path;
            }
            target.path = removeDotSegments(target.path);
          }
          target.query = relative.query;
        }
        target.userinfo = base.userinfo;
        target.host = base.host;
        target.port = base.port;
      }
      target.scheme = base.scheme;
    }
    target.fragment = relative.fragment;
    return target;
  }
  function equal(uriA, uriB, options) {
    const normalizedA = normalizeComparableURI(uriA, options);
    const normalizedB = normalizeComparableURI(uriB, options);
    return normalizedA !== undefined && normalizedB !== undefined && normalizedA === normalizedB;
  }
  function serialize(cmpts, opts) {
    const component = {
      host: cmpts.host,
      scheme: cmpts.scheme,
      userinfo: cmpts.userinfo,
      port: cmpts.port,
      path: cmpts.path,
      query: cmpts.query,
      nid: cmpts.nid,
      nss: cmpts.nss,
      uuid: cmpts.uuid,
      fragment: cmpts.fragment,
      reference: cmpts.reference,
      resourceName: cmpts.resourceName,
      secure: cmpts.secure,
      error: ""
    };
    const options = Object.assign({}, opts);
    const uriTokens = [];
    if (component.scheme) {
      component.scheme = decodeValidScheme(component.scheme);
    }
    const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
    if (schemeHandler && schemeHandler.serialize)
      schemeHandler.serialize(component, options);
    const hasAuthority = component.userinfo !== undefined || component.host !== undefined || component.port !== undefined;
    const pathNoScheme = !options.skipEscape && component.scheme === undefined && !hasAuthority;
    if (component.path !== undefined) {
      if (!options.skipEscape) {
        component.path = serializePathEncoding(component.path, pathNoScheme);
      } else {
        component.path = normalizePercentEncoding(component.path);
      }
    }
    if (options.reference !== "suffix" && component.scheme) {
      component.scheme = decodeValidScheme(component.scheme);
      uriTokens.push(component.scheme, ":");
    }
    const authority = recomposeAuthority(component);
    if (authority !== undefined) {
      if (options.reference !== "suffix") {
        uriTokens.push("//");
      }
      uriTokens.push(authority);
      if (component.path && component.path[0] !== "/") {
        uriTokens.push("/");
      }
    }
    if (component.path !== undefined) {
      let s = component.path;
      if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
        s = removeDotSegments(s);
      }
      if (pathNoScheme) {
        s = serializePathEncoding(s, true);
      }
      if (authority === undefined && s[0] === "/" && s[1] === "/") {
        s = "/%2F" + s.slice(2);
      }
      uriTokens.push(s);
    }
    if (component.query !== undefined) {
      uriTokens.push("?", encodeQuery(component.query));
    }
    if (component.fragment !== undefined) {
      uriTokens.push("#", encodeFragment(component.fragment));
    }
    return uriTokens.join("");
  }
  var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
  var AUTHORITY_PREFIX = /^(?:[^#/:?]+:)?\/\/([^/?#]*)/;
  var AUTHORITY_INTRODUCER_REGION = /^(?:[^#/:?]+:)?([/\\\t\n\r]*)/;
  function getParseError(parsed, matches) {
    if (matches[2] !== undefined && parsed.path && parsed.path[0] !== "/") {
      return 'URI path must start with "/" when authority is present.';
    }
    if (typeof parsed.port === "number" && (parsed.port < 0 || parsed.port > 65535)) {
      return "URI port is malformed.";
    }
    return;
  }
  function hasMalformedPercentEncoding(component) {
    if (component === undefined)
      return false;
    let percent = component.indexOf("%");
    while (percent !== -1) {
      if (percent + 2 >= component.length || !/^[\da-f]{2}$/iu.test(component.slice(percent + 1, percent + 3))) {
        return true;
      }
      percent = component.indexOf("%", percent + 3);
    }
    return false;
  }
  function hasMalformedComponentPercentEncoding(matches) {
    const host = matches[4];
    return hasMalformedPercentEncoding(matches[3]) || host !== undefined && !(host[0] === "[" && host[host.length - 1] === "]") && hasMalformedPercentEncoding(host) || hasMalformedPercentEncoding(matches[6]) || hasMalformedPercentEncoding(matches[7]) || hasMalformedPercentEncoding(matches[8]);
  }
  function canonicalizeHost(parsed, options, schemeHandler, isIP) {
    if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport) && parsed.host && parsed.host[0] !== "[" && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
      try {
        parsed.host = new URL("http://" + parsed.host).hostname;
      } catch (e) {
        parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
        return true;
      }
    }
    return false;
  }
  function parseWithStatus(uri, opts) {
    const options = Object.assign({}, opts);
    const parsed = {
      scheme: undefined,
      userinfo: undefined,
      host: "",
      port: undefined,
      path: "",
      query: undefined,
      fragment: undefined
    };
    let malformedAuthorityOrPort = false;
    let malformedPercentEncoding = false;
    let malformedSchemeSpecific = false;
    let malformedHost = false;
    let malformedIPLiteral = false;
    let malformedScheme = false;
    let isIP = false;
    if (options.reference === "suffix") {
      if (options.scheme) {
        uri = options.scheme + ":" + uri;
      } else {
        uri = "//" + uri;
      }
    }
    const authorityMatch = uri.match(AUTHORITY_PREFIX);
    if (authorityMatch !== null && authorityMatch[1].indexOf("\\") !== -1) {
      parsed.error = "URI authority must not contain a literal backslash.";
      malformedAuthorityOrPort = true;
    }
    const introducerMatch = uri.match(AUTHORITY_INTRODUCER_REGION);
    if (introducerMatch !== null) {
      const region = introducerMatch[1];
      const normalizedRegion = region.replace(/[\t\n\r]/g, "");
      if (normalizedRegion.length >= 2) {
        if (normalizedRegion.slice(0, 2) !== "//") {
          parsed.error = parsed.error || "URI authority must not contain a literal backslash.";
          malformedAuthorityOrPort = true;
        } else if (region.length !== normalizedRegion.length) {
          parsed.error = parsed.error || "URI authority introducer must not contain whitespace.";
          malformedAuthorityOrPort = true;
        }
      }
    }
    const matches = uri.match(URI_PARSE);
    if (matches) {
      parsed.scheme = matches[1];
      parsed.userinfo = matches[3];
      parsed.host = matches[4];
      parsed.port = parseInt(matches[5], 10);
      parsed.path = matches[6] || "";
      parsed.query = matches[7];
      parsed.fragment = matches[8];
      if (parsed.scheme !== undefined) {
        const decodedScheme = unescape(parsed.scheme);
        if (VALID_SCHEME.test(decodedScheme)) {
          parsed.scheme = decodedScheme.toLowerCase();
        } else {
          parsed.error = parsed.error || MALFORMED_SCHEME_ERROR;
          malformedScheme = true;
        }
      }
      malformedPercentEncoding = hasMalformedComponentPercentEncoding(matches);
      if (malformedPercentEncoding) {
        parsed.error = parsed.error || "URI contains malformed percent-encoding.";
      }
      if (isNaN(parsed.port)) {
        parsed.port = matches[5];
      }
      const parseError = getParseError(parsed, matches);
      if (parseError !== undefined) {
        parsed.error = parsed.error || parseError;
        malformedAuthorityOrPort = true;
      }
      if (parsed.host) {
        const ipv4result = isIPv4(parsed.host);
        if (ipv4result === false) {
          const bracketedIPLiteral = parsed.host[0] === "[" && parsed.host[parsed.host.length - 1] === "]";
          const ipv6result = normalizeIPv6(parsed.host);
          isIP = ipv6result.isIPV6 || ipv6result.isIPVFuture === true;
          malformedIPLiteral = bracketedIPLiteral && ipv6result.error === true;
          parsed.host = isIP ? ipv6result.host : ipv6result.host.toLowerCase();
          if (malformedIPLiteral) {
            parsed.error = parsed.error || "URI host is malformed.";
            malformedAuthorityOrPort = true;
          }
        } else {
          isIP = true;
        }
      }
      if (parsed.scheme === undefined && parsed.userinfo === undefined && parsed.host === undefined && parsed.port === undefined && parsed.query === undefined && !parsed.path) {
        parsed.reference = "same-document";
      } else if (parsed.scheme === undefined) {
        parsed.reference = "relative";
      } else if (parsed.fragment === undefined) {
        parsed.reference = "absolute";
      } else {
        parsed.reference = "uri";
      }
      if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
        parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
      }
      const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
      malformedHost = canonicalizeHost(parsed, options, schemeHandler, isIP);
      if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
        if (uri.indexOf("%") !== -1) {
          if (parsed.host !== undefined && !malformedIPLiteral) {
            const host = isIP ? parsed.host : normalizePercentEncoding(parsed.host, true);
            parsed.host = reescapeHostDelimiters(host, isIP);
          }
        }
        if (parsed.path) {
          parsed.path = normalizePathEncoding(parsed.path);
        }
        if (parsed.query) {
          parsed.query = normalizeQueryFragmentEncoding(parsed.query);
        }
        if (parsed.fragment) {
          parsed.fragment = normalizeQueryFragmentEncoding(parsed.fragment);
        }
      }
      if (schemeHandler && schemeHandler.parse) {
        schemeHandler.parse(parsed, options);
        if (schemeHandler === SCHEMES.urn && parsed.nid === undefined) {
          malformedSchemeSpecific = true;
        }
      }
    } else {
      parsed.error = parsed.error || "URI can not be parsed.";
    }
    return { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme };
  }
  function parse(uri, opts) {
    return parseWithStatus(uri, opts).parsed;
  }
  function normalizeString(uri, opts) {
    return normalizeStringWithStatus(uri, opts).normalized;
  }
  function normalizeStringWithStatus(uri, opts) {
    const { parsed, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = parseWithStatus(uri, opts);
    return {
      normalized: malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? uri : serialize(parsed, opts),
      malformedAuthorityOrPort,
      malformedPercentEncoding,
      malformedSchemeSpecific,
      malformedHost,
      malformedScheme
    };
  }
  function normalizeComparableURI(uri, opts) {
    if (typeof uri !== "string" && typeof uri !== "object") {
      return;
    }
    let value;
    try {
      value = typeof uri === "string" ? uri : serialize(uri, opts);
    } catch {
      return;
    }
    const { normalized, malformedAuthorityOrPort, malformedPercentEncoding, malformedSchemeSpecific, malformedHost, malformedScheme } = normalizeStringWithStatus(value, opts);
    return malformedAuthorityOrPort || malformedPercentEncoding || malformedSchemeSpecific || malformedHost || malformedScheme ? undefined : normalized;
  }
  var fastUri = {
    SCHEMES,
    normalize,
    resolve,
    resolveComponent,
    equal,
    serialize,
    parse
  };
  module.exports = fastUri;
  module.exports.default = fastUri;
  module.exports.fastUri = fastUri;
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var uri = require_fast_uri();
  uri.code = 'require("ajv/dist/runtime/uri").default';
  exports.default = uri;
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = undefined;
  var validate_1 = require_validate();
  Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
    return validate_1.KeywordCxt;
  } });
  var codegen_1 = require_codegen();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return codegen_1._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return codegen_1.str;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return codegen_1.stringify;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return codegen_1.nil;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return codegen_1.Name;
  } });
  Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
    return codegen_1.CodeGen;
  } });
  var validation_error_1 = require_validation_error();
  var ref_error_1 = require_ref_error();
  var rules_1 = require_rules();
  var compile_1 = require_compile();
  var codegen_2 = require_codegen();
  var resolve_1 = require_resolve();
  var dataType_1 = require_dataType();
  var util_1 = require_util();
  var $dataRefSchema = require_data();
  var uri_1 = require_uri();
  var defaultRegExp = (str, flags) => new RegExp(str, flags);
  defaultRegExp.code = "new RegExp";
  var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
  var EXT_SCOPE_NAMES = new Set([
    "validate",
    "serialize",
    "parse",
    "wrapper",
    "root",
    "schema",
    "keyword",
    "pattern",
    "formats",
    "validate$data",
    "func",
    "obj",
    "Error"
  ]);
  var removedOptions = {
    errorDataPath: "",
    format: "`validateFormats: false` can be used instead.",
    nullable: '"nullable" keyword is supported by default.',
    jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
    extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
    missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
    processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
    sourceCode: "Use option `code: {source: true}`",
    strictDefaults: "It is default now, see option `strict`.",
    strictKeywords: "It is default now, see option `strict`.",
    uniqueItems: '"uniqueItems" keyword is always validated.',
    unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
    cache: "Map is used as cache, schema object as key.",
    serialize: "Map is used as cache, schema object as key.",
    ajvErrors: "It is default now."
  };
  var deprecatedOptions = {
    ignoreKeywordsWithRef: "",
    jsPropertySyntax: "",
    unicode: '"minLength"/"maxLength" account for unicode characters by default.'
  };
  var MAX_EXPRESSION = 200;
  function requiredOptions(o) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
    const s = o.strict;
    const _optz = (_a = o.code) === null || _a === undefined ? undefined : _a.optimize;
    const optimize = _optz === true || _optz === undefined ? 1 : _optz || 0;
    const regExp = (_c = (_b = o.code) === null || _b === undefined ? undefined : _b.regExp) !== null && _c !== undefined ? _c : defaultRegExp;
    const uriResolver = (_d = o.uriResolver) !== null && _d !== undefined ? _d : uri_1.default;
    return {
      strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== undefined ? _e : s) !== null && _f !== undefined ? _f : true,
      strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== undefined ? _g : s) !== null && _h !== undefined ? _h : true,
      strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== undefined ? _j : s) !== null && _k !== undefined ? _k : "log",
      strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== undefined ? _l : s) !== null && _m !== undefined ? _m : "log",
      strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== undefined ? _o : s) !== null && _p !== undefined ? _p : false,
      code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
      loopRequired: (_q = o.loopRequired) !== null && _q !== undefined ? _q : MAX_EXPRESSION,
      loopEnum: (_r = o.loopEnum) !== null && _r !== undefined ? _r : MAX_EXPRESSION,
      meta: (_s = o.meta) !== null && _s !== undefined ? _s : true,
      messages: (_t = o.messages) !== null && _t !== undefined ? _t : true,
      inlineRefs: (_u = o.inlineRefs) !== null && _u !== undefined ? _u : true,
      schemaId: (_v = o.schemaId) !== null && _v !== undefined ? _v : "$id",
      addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== undefined ? _w : true,
      validateSchema: (_x = o.validateSchema) !== null && _x !== undefined ? _x : true,
      validateFormats: (_y = o.validateFormats) !== null && _y !== undefined ? _y : true,
      unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== undefined ? _z : true,
      int32range: (_0 = o.int32range) !== null && _0 !== undefined ? _0 : true,
      uriResolver
    };
  }

  class Ajv {
    constructor(opts = {}) {
      this.schemas = {};
      this.refs = {};
      this.formats = Object.create(null);
      this._compilations = new Set;
      this._loading = {};
      this._cache = new Map;
      opts = this.opts = { ...opts, ...requiredOptions(opts) };
      const { es5, lines } = this.opts.code;
      this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
      this.logger = getLogger(opts.logger);
      const formatOpt = opts.validateFormats;
      opts.validateFormats = false;
      this.RULES = (0, rules_1.getRules)();
      checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
      checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
      this._metaOpts = getMetaSchemaOptions.call(this);
      if (opts.formats)
        addInitialFormats.call(this);
      this._addVocabularies();
      this._addDefaultMetaSchema();
      if (opts.keywords)
        addInitialKeywords.call(this, opts.keywords);
      if (typeof opts.meta == "object")
        this.addMetaSchema(opts.meta);
      addInitialSchemas.call(this);
      opts.validateFormats = formatOpt;
    }
    _addVocabularies() {
      this.addKeyword("$async");
    }
    _addDefaultMetaSchema() {
      const { $data, meta, schemaId } = this.opts;
      let _dataRefSchema = $dataRefSchema;
      if (schemaId === "id") {
        _dataRefSchema = { ...$dataRefSchema };
        _dataRefSchema.id = _dataRefSchema.$id;
        delete _dataRefSchema.$id;
      }
      if (meta && $data)
        this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
    }
    defaultMeta() {
      const { meta, schemaId } = this.opts;
      return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : undefined;
    }
    validate(schemaKeyRef, data) {
      let v;
      if (typeof schemaKeyRef == "string") {
        v = this.getSchema(schemaKeyRef);
        if (!v)
          throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
      } else {
        v = this.compile(schemaKeyRef);
      }
      const valid = v(data);
      if (!("$async" in v))
        this.errors = v.errors;
      return valid;
    }
    compile(schema, _meta) {
      const sch = this._addSchema(schema, _meta);
      return sch.validate || this._compileSchemaEnv(sch);
    }
    compileAsync(schema, meta) {
      if (typeof this.opts.loadSchema != "function") {
        throw new Error("options.loadSchema should be a function");
      }
      const { loadSchema } = this.opts;
      return runCompileAsync.call(this, schema, meta);
      async function runCompileAsync(_schema, _meta) {
        await loadMetaSchema.call(this, _schema.$schema);
        const sch = this._addSchema(_schema, _meta);
        return sch.validate || _compileAsync.call(this, sch);
      }
      async function loadMetaSchema($ref) {
        if ($ref && !this.getSchema($ref)) {
          await runCompileAsync.call(this, { $ref }, true);
        }
      }
      async function _compileAsync(sch) {
        try {
          return this._compileSchemaEnv(sch);
        } catch (e) {
          if (!(e instanceof ref_error_1.default))
            throw e;
          checkLoaded.call(this, e);
          await loadMissingSchema.call(this, e.missingSchema);
          return _compileAsync.call(this, sch);
        }
      }
      function checkLoaded({ missingSchema: ref, missingRef }) {
        if (this.refs[ref]) {
          throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
        }
      }
      async function loadMissingSchema(ref) {
        const _schema = await _loadSchema.call(this, ref);
        if (!this.refs[ref])
          await loadMetaSchema.call(this, _schema.$schema);
        if (!this.refs[ref])
          this.addSchema(_schema, ref, meta);
      }
      async function _loadSchema(ref) {
        const p = this._loading[ref];
        if (p)
          return p;
        try {
          return await (this._loading[ref] = loadSchema(ref));
        } finally {
          delete this._loading[ref];
        }
      }
    }
    addSchema(schema, key, _meta, _validateSchema = this.opts.validateSchema) {
      if (Array.isArray(schema)) {
        for (const sch of schema)
          this.addSchema(sch, undefined, _meta, _validateSchema);
        return this;
      }
      let id;
      if (typeof schema === "object") {
        const { schemaId } = this.opts;
        id = schema[schemaId];
        if (id !== undefined && typeof id != "string") {
          throw new Error(`schema ${schemaId} must be string`);
        }
      }
      key = (0, resolve_1.normalizeId)(key || id);
      this._checkUnique(key);
      this.schemas[key] = this._addSchema(schema, _meta, key, _validateSchema, true);
      return this;
    }
    addMetaSchema(schema, key, _validateSchema = this.opts.validateSchema) {
      this.addSchema(schema, key, true, _validateSchema);
      return this;
    }
    validateSchema(schema, throwOrLogError) {
      if (typeof schema == "boolean")
        return true;
      let $schema;
      $schema = schema.$schema;
      if ($schema !== undefined && typeof $schema != "string") {
        throw new Error("$schema must be a string");
      }
      $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
      if (!$schema) {
        this.logger.warn("meta-schema not available");
        this.errors = null;
        return true;
      }
      const valid = this.validate($schema, schema);
      if (!valid && throwOrLogError) {
        const message = "schema is invalid: " + this.errorsText();
        if (this.opts.validateSchema === "log")
          this.logger.error(message);
        else
          throw new Error(message);
      }
      return valid;
    }
    getSchema(keyRef) {
      let sch;
      while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
        keyRef = sch;
      if (sch === undefined) {
        const { schemaId } = this.opts;
        const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
        sch = compile_1.resolveSchema.call(this, root, keyRef);
        if (!sch)
          return;
        this.refs[keyRef] = sch;
      }
      return sch.validate || this._compileSchemaEnv(sch);
    }
    removeSchema(schemaKeyRef) {
      if (schemaKeyRef instanceof RegExp) {
        this._removeAllSchemas(this.schemas, schemaKeyRef);
        this._removeAllSchemas(this.refs, schemaKeyRef);
        return this;
      }
      switch (typeof schemaKeyRef) {
        case "undefined":
          this._removeAllSchemas(this.schemas);
          this._removeAllSchemas(this.refs);
          this._cache.clear();
          return this;
        case "string": {
          const sch = getSchEnv.call(this, schemaKeyRef);
          if (typeof sch == "object")
            this._cache.delete(sch.schema);
          delete this.schemas[schemaKeyRef];
          delete this.refs[schemaKeyRef];
          return this;
        }
        case "object": {
          const cacheKey = schemaKeyRef;
          this._cache.delete(cacheKey);
          let id = schemaKeyRef[this.opts.schemaId];
          if (id) {
            id = (0, resolve_1.normalizeId)(id);
            delete this.schemas[id];
            delete this.refs[id];
          }
          return this;
        }
        default:
          throw new Error("ajv.removeSchema: invalid parameter");
      }
    }
    addVocabulary(definitions) {
      for (const def of definitions)
        this.addKeyword(def);
      return this;
    }
    addKeyword(kwdOrDef, def) {
      let keyword;
      if (typeof kwdOrDef == "string") {
        keyword = kwdOrDef;
        if (typeof def == "object") {
          this.logger.warn("these parameters are deprecated, see docs for addKeyword");
          def.keyword = keyword;
        }
      } else if (typeof kwdOrDef == "object" && def === undefined) {
        def = kwdOrDef;
        keyword = def.keyword;
        if (Array.isArray(keyword) && !keyword.length) {
          throw new Error("addKeywords: keyword must be string or non-empty array");
        }
      } else {
        throw new Error("invalid addKeywords parameters");
      }
      checkKeyword.call(this, keyword, def);
      if (!def) {
        (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
        return this;
      }
      keywordMetaschema.call(this, def);
      const definition = {
        ...def,
        type: (0, dataType_1.getJSONTypes)(def.type),
        schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
      };
      (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
      return this;
    }
    getKeyword(keyword) {
      const rule = this.RULES.all[keyword];
      return typeof rule == "object" ? rule.definition : !!rule;
    }
    removeKeyword(keyword) {
      const { RULES } = this;
      delete RULES.keywords[keyword];
      delete RULES.all[keyword];
      for (const group of RULES.rules) {
        const i = group.rules.findIndex((rule) => rule.keyword === keyword);
        if (i >= 0)
          group.rules.splice(i, 1);
      }
      return this;
    }
    addFormat(name, format) {
      if (typeof format == "string")
        format = new RegExp(format);
      this.formats[name] = format;
      return this;
    }
    errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
      if (!errors || errors.length === 0)
        return "No errors";
      return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
    }
    $dataMetaSchema(metaSchema, keywordsJsonPointers) {
      const rules = this.RULES.all;
      metaSchema = JSON.parse(JSON.stringify(metaSchema));
      for (const jsonPointer of keywordsJsonPointers) {
        const segments = jsonPointer.split("/").slice(1);
        let keywords = metaSchema;
        for (const seg of segments)
          keywords = keywords[seg];
        for (const key in rules) {
          const rule = rules[key];
          if (typeof rule != "object")
            continue;
          const { $data } = rule.definition;
          const schema = keywords[key];
          if ($data && schema)
            keywords[key] = schemaOrData(schema);
        }
      }
      return metaSchema;
    }
    _removeAllSchemas(schemas, regex) {
      for (const keyRef in schemas) {
        const sch = schemas[keyRef];
        if (!regex || regex.test(keyRef)) {
          if (typeof sch == "string") {
            delete schemas[keyRef];
          } else if (sch && !sch.meta) {
            this._cache.delete(sch.schema);
            delete schemas[keyRef];
          }
        }
      }
    }
    _addSchema(schema, meta, baseId, validateSchema = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
      let id;
      const { schemaId } = this.opts;
      if (typeof schema == "object") {
        id = schema[schemaId];
      } else {
        if (this.opts.jtd)
          throw new Error("schema must be object");
        else if (typeof schema != "boolean")
          throw new Error("schema must be object or boolean");
      }
      let sch = this._cache.get(schema);
      if (sch !== undefined)
        return sch;
      baseId = (0, resolve_1.normalizeId)(id || baseId);
      const localRefs = resolve_1.getSchemaRefs.call(this, schema, baseId);
      sch = new compile_1.SchemaEnv({ schema, schemaId, meta, baseId, localRefs });
      this._cache.set(sch.schema, sch);
      if (addSchema && !baseId.startsWith("#")) {
        if (baseId)
          this._checkUnique(baseId);
        this.refs[baseId] = sch;
      }
      if (validateSchema)
        this.validateSchema(schema, true);
      return sch;
    }
    _checkUnique(id) {
      if (this.schemas[id] || this.refs[id]) {
        throw new Error(`schema with key or id "${id}" already exists`);
      }
    }
    _compileSchemaEnv(sch) {
      if (sch.meta)
        this._compileMetaSchema(sch);
      else
        compile_1.compileSchema.call(this, sch);
      if (!sch.validate)
        throw new Error("ajv implementation error");
      return sch.validate;
    }
    _compileMetaSchema(sch) {
      const currentOpts = this.opts;
      this.opts = this._metaOpts;
      try {
        compile_1.compileSchema.call(this, sch);
      } finally {
        this.opts = currentOpts;
      }
    }
  }
  Ajv.ValidationError = validation_error_1.default;
  Ajv.MissingRefError = ref_error_1.default;
  exports.default = Ajv;
  function checkOptions(checkOpts, options, msg, log = "error") {
    for (const key in checkOpts) {
      const opt = key;
      if (opt in options)
        this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
    }
  }
  function getSchEnv(keyRef) {
    keyRef = (0, resolve_1.normalizeId)(keyRef);
    return this.schemas[keyRef] || this.refs[keyRef];
  }
  function addInitialSchemas() {
    const optsSchemas = this.opts.schemas;
    if (!optsSchemas)
      return;
    if (Array.isArray(optsSchemas))
      this.addSchema(optsSchemas);
    else
      for (const key in optsSchemas)
        this.addSchema(optsSchemas[key], key);
  }
  function addInitialFormats() {
    for (const name in this.opts.formats) {
      const format = this.opts.formats[name];
      if (format)
        this.addFormat(name, format);
    }
  }
  function addInitialKeywords(defs) {
    if (Array.isArray(defs)) {
      this.addVocabulary(defs);
      return;
    }
    this.logger.warn("keywords option as map is deprecated, pass array");
    for (const keyword in defs) {
      const def = defs[keyword];
      if (!def.keyword)
        def.keyword = keyword;
      this.addKeyword(def);
    }
  }
  function getMetaSchemaOptions() {
    const metaOpts = { ...this.opts };
    for (const opt of META_IGNORE_OPTIONS)
      delete metaOpts[opt];
    return metaOpts;
  }
  var noLogs = { log() {}, warn() {}, error() {} };
  function getLogger(logger) {
    if (logger === false)
      return noLogs;
    if (logger === undefined)
      return console;
    if (logger.log && logger.warn && logger.error)
      return logger;
    throw new Error("logger must implement log, warn and error methods");
  }
  var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
  function checkKeyword(keyword, def) {
    const { RULES } = this;
    (0, util_1.eachItem)(keyword, (kwd) => {
      if (RULES.keywords[kwd])
        throw new Error(`Keyword ${kwd} is already defined`);
      if (!KEYWORD_NAME.test(kwd))
        throw new Error(`Keyword ${kwd} has invalid name`);
    });
    if (!def)
      return;
    if (def.$data && !(("code" in def) || ("validate" in def))) {
      throw new Error('$data keyword must have "code" or "validate" function');
    }
  }
  function addRule(keyword, definition, dataType) {
    var _a;
    const post = definition === null || definition === undefined ? undefined : definition.post;
    if (dataType && post)
      throw new Error('keyword with "post" flag cannot have "type"');
    const { RULES } = this;
    let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
    if (!ruleGroup) {
      ruleGroup = { type: dataType, rules: [] };
      RULES.rules.push(ruleGroup);
    }
    RULES.keywords[keyword] = true;
    if (!definition)
      return;
    const rule = {
      keyword,
      definition: {
        ...definition,
        type: (0, dataType_1.getJSONTypes)(definition.type),
        schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
      }
    };
    if (definition.before)
      addBeforeRule.call(this, ruleGroup, rule, definition.before);
    else
      ruleGroup.rules.push(rule);
    RULES.all[keyword] = rule;
    (_a = definition.implements) === null || _a === undefined || _a.forEach((kwd) => this.addKeyword(kwd));
  }
  function addBeforeRule(ruleGroup, rule, before) {
    const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
    if (i >= 0) {
      ruleGroup.rules.splice(i, 0, rule);
    } else {
      ruleGroup.rules.push(rule);
      this.logger.warn(`rule ${before} is not defined`);
    }
  }
  function keywordMetaschema(def) {
    let { metaSchema } = def;
    if (metaSchema === undefined)
      return;
    if (def.$data && this.opts.$data)
      metaSchema = schemaOrData(metaSchema);
    def.validateSchema = this.compile(metaSchema, true);
  }
  var $dataRef = {
    $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
  };
  function schemaOrData(schema) {
    return { anyOf: [schema, $dataRef] };
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var def = {
    keyword: "id",
    code() {
      throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.callRef = exports.getValidate = undefined;
  var ref_error_1 = require_ref_error();
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var compile_1 = require_compile();
  var util_1 = require_util();
  var def = {
    keyword: "$ref",
    schemaType: "string",
    code(cxt) {
      const { gen, schema: $ref, it } = cxt;
      const { baseId, schemaEnv: env, validateName, opts, self } = it;
      const { root } = env;
      if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
        return callRootRef();
      const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
      if (schOrEnv === undefined)
        throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
      if (schOrEnv instanceof compile_1.SchemaEnv)
        return callValidate(schOrEnv);
      return inlineRefSchema(schOrEnv);
      function callRootRef() {
        if (env === root)
          return callRef(cxt, validateName, env, env.$async);
        const rootName = gen.scopeValue("root", { ref: root });
        return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
      }
      function callValidate(sch) {
        const v = getValidate(cxt, sch);
        callRef(cxt, v, sch, sch.$async);
      }
      function inlineRefSchema(sch) {
        const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
        const valid = gen.name("valid");
        const schCxt = cxt.subschema({
          schema: sch,
          dataTypes: [],
          schemaPath: codegen_1.nil,
          topSchemaRef: schName,
          errSchemaPath: $ref
        }, valid);
        cxt.mergeEvaluated(schCxt);
        cxt.ok(valid);
      }
    }
  };
  function getValidate(cxt, sch) {
    const { gen } = cxt;
    return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
  }
  exports.getValidate = getValidate;
  function callRef(cxt, v, sch, $async) {
    const { gen, it } = cxt;
    const { allErrors, schemaEnv: env, opts } = it;
    const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
    if ($async)
      callAsyncRef();
    else
      callSyncRef();
    function callAsyncRef() {
      if (!env.$async)
        throw new Error("async schema referenced by sync schema");
      const valid = gen.let("valid");
      gen.try(() => {
        gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
        addEvaluatedFrom(v);
        if (!allErrors)
          gen.assign(valid, true);
      }, (e) => {
        gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
        addErrorsFrom(e);
        if (!allErrors)
          gen.assign(valid, false);
      });
      cxt.ok(valid);
    }
    function callSyncRef() {
      cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
    }
    function addErrorsFrom(source) {
      const errs = (0, codegen_1._)`${source}.errors`;
      gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
      gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
    }
    function addEvaluatedFrom(source) {
      var _a;
      if (!it.opts.unevaluated)
        return;
      const schEvaluated = (_a = sch === null || sch === undefined ? undefined : sch.validate) === null || _a === undefined ? undefined : _a.evaluated;
      if (it.props !== true) {
        if (schEvaluated && !schEvaluated.dynamicProps) {
          if (schEvaluated.props !== undefined) {
            it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
          }
        } else {
          const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
          it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
        }
      }
      if (it.items !== true) {
        if (schEvaluated && !schEvaluated.dynamicItems) {
          if (schEvaluated.items !== undefined) {
            it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
          }
        } else {
          const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
          it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
        }
      }
    }
  }
  exports.callRef = callRef;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var id_1 = require_id();
  var ref_1 = require_ref();
  var core = [
    "$schema",
    "$id",
    "$defs",
    "$vocabulary",
    { keyword: "$comment" },
    "definitions",
    id_1.default,
    ref_1.default
  ];
  exports.default = core;
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var ops = codegen_1.operators;
  var KWDs = {
    maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
  };
  var error = {
    message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
    params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
  };
  var def = {
    keyword: Object.keys(KWDs),
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode } = cxt;
      cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
    params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
  };
  var def = {
    keyword: "multipleOf",
    type: "number",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, schemaCode, it } = cxt;
      const prec = it.opts.multipleOfPrecision;
      const res = gen.let("res");
      const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
      cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  function ucs2length(str) {
    const len = str.length;
    let length = 0;
    let pos = 0;
    let value;
    while (pos < len) {
      length++;
      value = str.charCodeAt(pos++);
      if (value >= 55296 && value <= 56319 && pos < len) {
        value = str.charCodeAt(pos);
        if ((value & 64512) === 56320)
          pos++;
      }
    }
    return length;
  }
  exports.default = ucs2length;
  ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var ucs2length_1 = require_ucs2length();
  var error = {
    message({ keyword, schemaCode }) {
      const comp = keyword === "maxLength" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  var def = {
    keyword: ["maxLength", "minLength"],
    type: "string",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode, it } = cxt;
      const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
      const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
      cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var util_1 = require_util();
  var codegen_1 = require_codegen();
  var error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
  };
  var def = {
    keyword: "pattern",
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const u = it.opts.unicodeRegExp ? "u" : "";
      if ($data) {
        const { regExp } = it.opts.code;
        const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
        const valid = gen.let("valid");
        gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
        cxt.fail$data((0, codegen_1._)`!${valid}`);
      } else {
        const regExp = (0, code_1.usePattern)(cxt, schema);
        cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message({ keyword, schemaCode }) {
      const comp = keyword === "maxProperties" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  var def = {
    keyword: ["maxProperties", "minProperties"],
    type: "object",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode } = cxt;
      const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
    params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
  };
  var def = {
    keyword: "required",
    type: "object",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, schema, schemaCode, data, $data, it } = cxt;
      const { opts } = it;
      if (!$data && schema.length === 0)
        return;
      const useLoop = schema.length >= opts.loopRequired;
      if (it.allErrors)
        allErrorsMode();
      else
        exitOnErrorMode();
      if (opts.strictRequired) {
        const props = cxt.parentSchema.properties;
        const { definedProperties } = cxt.it;
        for (const requiredKey of schema) {
          if ((props === null || props === undefined ? undefined : props[requiredKey]) === undefined && !definedProperties.has(requiredKey)) {
            const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
            const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
            (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
          }
        }
      }
      function allErrorsMode() {
        if (useLoop || $data) {
          cxt.block$data(codegen_1.nil, loopAllRequired);
        } else {
          for (const prop of schema) {
            (0, code_1.checkReportMissingProp)(cxt, prop);
          }
        }
      }
      function exitOnErrorMode() {
        const missing = gen.let("missing");
        if (useLoop || $data) {
          const valid = gen.let("valid", true);
          cxt.block$data(valid, () => loopUntilMissing(missing, valid));
          cxt.ok(valid);
        } else {
          gen.if((0, code_1.checkMissingProp)(cxt, schema, missing));
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
      function loopAllRequired() {
        gen.forOf("prop", schemaCode, (prop) => {
          cxt.setParams({ missingProperty: prop });
          gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
        });
      }
      function loopUntilMissing(missing, valid) {
        cxt.setParams({ missingProperty: missing });
        gen.forOf(missing, schemaCode, () => {
          gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error();
            gen.break();
          });
        }, codegen_1.nil);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message({ keyword, schemaCode }) {
      const comp = keyword === "maxItems" ? "more" : "fewer";
      return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
    },
    params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
  };
  var def = {
    keyword: ["maxItems", "minItems"],
    type: "array",
    schemaType: "number",
    $data: true,
    error,
    code(cxt) {
      const { keyword, data, schemaCode } = cxt;
      const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
      cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var equal = require_fast_deep_equal();
  equal.code = 'require("ajv/dist/runtime/equal").default';
  exports.default = equal;
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dataType_1 = require_dataType();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var equal_1 = require_equal();
  var error = {
    message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
    params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
  };
  var def = {
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, parentSchema, schemaCode, it } = cxt;
      if (!$data && !schema)
        return;
      const valid = gen.let("valid");
      const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
      cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
      cxt.ok(valid);
      function validateUniqueItems() {
        const i = gen.let("i", (0, codegen_1._)`${data}.length`);
        const j = gen.let("j");
        cxt.setParams({ i, j });
        gen.assign(valid, true);
        gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
      }
      function canOptimize() {
        return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
      }
      function loopN(i, j) {
        const item = gen.name("item");
        const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
        const indices = gen.const("indices", (0, codegen_1._)`{}`);
        gen.for((0, codegen_1._)`;${i}--;`, () => {
          gen.let(item, (0, codegen_1._)`${data}[${i}]`);
          gen.if(wrongType, (0, codegen_1._)`continue`);
          if (itemTypes.length > 1)
            gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
          gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
            gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
            cxt.error();
            gen.assign(valid, false).break();
          }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
        });
      }
      function loopN2(i, j) {
        const eql = (0, util_1.useFunc)(gen, equal_1.default);
        const outer = gen.name("outer");
        gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
          cxt.error();
          gen.assign(valid, false).break(outer);
        })));
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var equal_1 = require_equal();
  var error = {
    message: "must be equal to constant",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
  };
  var def = {
    keyword: "const",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schemaCode, schema } = cxt;
      if ($data || schema && typeof schema == "object") {
        cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
      } else {
        cxt.fail((0, codegen_1._)`${schema} !== ${data}`);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var equal_1 = require_equal();
  var error = {
    message: "must be equal to one of the allowed values",
    params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
  };
  var def = {
    keyword: "enum",
    schemaType: "array",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      if (!$data && schema.length === 0)
        throw new Error("enum must have non-empty array");
      const useLoop = schema.length >= it.opts.loopEnum;
      let eql;
      const getEql = () => eql !== null && eql !== undefined ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
      let valid;
      if (useLoop || $data) {
        valid = gen.let("valid");
        cxt.block$data(valid, loopEnum);
      } else {
        if (!Array.isArray(schema))
          throw new Error("ajv implementation error");
        const vSchema = gen.const("vSchema", schemaCode);
        valid = (0, codegen_1.or)(...schema.map((_x, i) => equalCode(vSchema, i)));
      }
      cxt.pass(valid);
      function loopEnum() {
        gen.assign(valid, false);
        gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
      }
      function equalCode(vSchema, i) {
        const sch = schema[i];
        return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var limitNumber_1 = require_limitNumber();
  var multipleOf_1 = require_multipleOf();
  var limitLength_1 = require_limitLength();
  var pattern_1 = require_pattern();
  var limitProperties_1 = require_limitProperties();
  var required_1 = require_required();
  var limitItems_1 = require_limitItems();
  var uniqueItems_1 = require_uniqueItems();
  var const_1 = require_const();
  var enum_1 = require_enum();
  var validation = [
    limitNumber_1.default,
    multipleOf_1.default,
    limitLength_1.default,
    pattern_1.default,
    limitProperties_1.default,
    required_1.default,
    limitItems_1.default,
    uniqueItems_1.default,
    { keyword: "type", schemaType: ["string", "array"] },
    { keyword: "nullable", schemaType: "boolean" },
    const_1.default,
    enum_1.default
  ];
  exports.default = validation;
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateAdditionalItems = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  var def = {
    keyword: "additionalItems",
    type: "array",
    schemaType: ["boolean", "object"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { parentSchema, it } = cxt;
      const { items } = parentSchema;
      if (!Array.isArray(items)) {
        (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
        return;
      }
      validateAdditionalItems(cxt, items);
    }
  };
  function validateAdditionalItems(cxt, items) {
    const { gen, schema, data, keyword, it } = cxt;
    it.items = true;
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    if (schema === false) {
      cxt.setParams({ len: items.length });
      cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
    } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
      const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
      gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
      cxt.ok(valid);
    }
    function validateItems(valid) {
      gen.forRange("i", items.length, len, (i) => {
        cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
        if (!it.allErrors)
          gen.if((0, codegen_1.not)(valid), () => gen.break());
      });
    }
  }
  exports.validateAdditionalItems = validateAdditionalItems;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateTuple = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var code_1 = require_code2();
  var def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "array", "boolean"],
    before: "uniqueItems",
    code(cxt) {
      const { schema, it } = cxt;
      if (Array.isArray(schema))
        return validateTuple(cxt, "additionalItems", schema);
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  function validateTuple(cxt, extraItems, schArr = cxt.schema) {
    const { gen, parentSchema, data, keyword, it } = cxt;
    checkStrictTuple(parentSchema);
    if (it.opts.unevaluated && schArr.length && it.items !== true) {
      it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
    }
    const valid = gen.name("valid");
    const len = gen.const("len", (0, codegen_1._)`${data}.length`);
    schArr.forEach((sch, i) => {
      if ((0, util_1.alwaysValidSchema)(it, sch))
        return;
      gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
        keyword,
        schemaProp: i,
        dataProp: i
      }, valid));
      cxt.ok(valid);
    });
    function checkStrictTuple(sch) {
      const { opts, errSchemaPath } = it;
      const l = schArr.length;
      const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
      if (opts.strictTuples && !fullTuple) {
        const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
        (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
      }
    }
  }
  exports.validateTuple = validateTuple;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var items_1 = require_items();
  var def = {
    keyword: "prefixItems",
    type: "array",
    schemaType: ["array"],
    before: "uniqueItems",
    code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var code_1 = require_code2();
  var additionalItems_1 = require_additionalItems();
  var error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  var def = {
    keyword: "items",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    error,
    code(cxt) {
      const { schema, parentSchema, it } = cxt;
      const { prefixItems } = parentSchema;
      it.items = true;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      if (prefixItems)
        (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
      else
        cxt.ok((0, code_1.validateArray)(cxt));
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { min, max } }) => max === undefined ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
    params: ({ params: { min, max } }) => max === undefined ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
  };
  var def = {
    keyword: "contains",
    type: "array",
    schemaType: ["object", "boolean"],
    before: "uniqueItems",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      let min;
      let max;
      const { minContains, maxContains } = parentSchema;
      if (it.opts.next) {
        min = minContains === undefined ? 1 : minContains;
        max = maxContains;
      } else {
        min = 1;
      }
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      cxt.setParams({ min, max });
      if (max === undefined && min === 0) {
        (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
        return;
      }
      if (max !== undefined && min > max) {
        (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
        cxt.fail();
        return;
      }
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        let cond = (0, codegen_1._)`${len} >= ${min}`;
        if (max !== undefined)
          cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
        cxt.pass(cond);
        return;
      }
      it.items = true;
      const valid = gen.name("valid");
      if (max === undefined && min === 1) {
        validateItems(valid, () => gen.if(valid, () => gen.break()));
      } else if (min === 0) {
        gen.let(valid, true);
        if (max !== undefined)
          gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
      } else {
        gen.let(valid, false);
        validateItemsWithCount();
      }
      cxt.result(valid, () => cxt.reset());
      function validateItemsWithCount() {
        const schValid = gen.name("_valid");
        const count = gen.let("count", 0);
        validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
      }
      function validateItems(_valid, block) {
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword: "contains",
            dataProp: i,
            dataPropType: util_1.Type.Num,
            compositeRule: true
          }, _valid);
          block();
        });
      }
      function checkLimits(count) {
        gen.code((0, codegen_1._)`${count}++`);
        if (max === undefined) {
          gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
        } else {
          gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
          if (min === 1)
            gen.assign(valid, true);
          else
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
        }
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.validateSchemaDeps = exports.validatePropertyDeps = exports.error = undefined;
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var code_1 = require_code2();
  exports.error = {
    message: ({ params: { property, depsCount, deps } }) => {
      const property_ies = depsCount === 1 ? "property" : "properties";
      return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
    },
    params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
  };
  var def = {
    keyword: "dependencies",
    type: "object",
    schemaType: "object",
    error: exports.error,
    code(cxt) {
      const [propDeps, schDeps] = splitDependencies(cxt);
      validatePropertyDeps(cxt, propDeps);
      validateSchemaDeps(cxt, schDeps);
    }
  };
  function splitDependencies({ schema }) {
    const propertyDeps = {};
    const schemaDeps = {};
    for (const key in schema) {
      if (key === "__proto__")
        continue;
      const deps = Array.isArray(schema[key]) ? propertyDeps : schemaDeps;
      deps[key] = schema[key];
    }
    return [propertyDeps, schemaDeps];
  }
  function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
    const { gen, data, it } = cxt;
    if (Object.keys(propertyDeps).length === 0)
      return;
    const missing = gen.let("missing");
    for (const prop in propertyDeps) {
      const deps = propertyDeps[prop];
      if (deps.length === 0)
        continue;
      const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
      cxt.setParams({
        property: prop,
        depsCount: deps.length,
        deps: deps.join(", ")
      });
      if (it.allErrors) {
        gen.if(hasProperty, () => {
          for (const depProp of deps) {
            (0, code_1.checkReportMissingProp)(cxt, depProp);
          }
        });
      } else {
        gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
        (0, code_1.reportMissingProp)(cxt, missing);
        gen.else();
      }
    }
  }
  exports.validatePropertyDeps = validatePropertyDeps;
  function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
    const { gen, data, keyword, it } = cxt;
    const valid = gen.name("valid");
    for (const prop in schemaDeps) {
      if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
        continue;
      gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties), () => {
        const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
        cxt.mergeValidEvaluated(schCxt, valid);
      }, () => gen.var(valid, true));
      cxt.ok(valid);
    }
  }
  exports.validateSchemaDeps = validateSchemaDeps;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: "property name must be valid",
    params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
  };
  var def = {
    keyword: "propertyNames",
    type: "object",
    schemaType: ["object", "boolean"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema))
        return;
      const valid = gen.name("valid");
      gen.forIn("key", data, (key) => {
        cxt.setParams({ propertyName: key });
        cxt.subschema({
          keyword: "propertyNames",
          data: key,
          dataTypes: ["string"],
          propertyName: key,
          compositeRule: true
        }, valid);
        gen.if((0, codegen_1.not)(valid), () => {
          cxt.error(true);
          if (!it.allErrors)
            gen.break();
        });
      });
      cxt.ok(valid);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var util_1 = require_util();
  var error = {
    message: "must NOT have additional properties",
    params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
  };
  var def = {
    keyword: "additionalProperties",
    type: ["object"],
    schemaType: ["boolean", "object"],
    allowUndefined: true,
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, opts } = it;
      it.props = true;
      if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema))
        return;
      const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
      const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
      checkAdditionalProperties();
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function checkAdditionalProperties() {
        gen.forIn("key", data, (key) => {
          if (!props.length && !patProps.length)
            additionalPropertyCode(key);
          else
            gen.if(isAdditional(key), () => additionalPropertyCode(key));
        });
      }
      function isAdditional(key) {
        let definedProp;
        if (props.length > 8) {
          const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
          definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
        } else if (props.length) {
          definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
        } else {
          definedProp = codegen_1.nil;
        }
        if (patProps.length) {
          definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
        }
        return (0, codegen_1.not)(definedProp);
      }
      function deleteAdditional(key) {
        gen.code((0, codegen_1._)`delete ${data}[${key}]`);
      }
      function additionalPropertyCode(key) {
        if (opts.removeAdditional === "all" || opts.removeAdditional && schema === false) {
          deleteAdditional(key);
          return;
        }
        if (schema === false) {
          cxt.setParams({ additionalProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.name("valid");
          if (opts.removeAdditional === "failing") {
            applyAdditionalSchema(key, valid, false);
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.reset();
              deleteAdditional(key);
            });
          } else {
            applyAdditionalSchema(key, valid);
            if (!allErrors)
              gen.if((0, codegen_1.not)(valid), () => gen.break());
          }
        }
      }
      function applyAdditionalSchema(key, valid, errors) {
        const subschema = {
          keyword: "additionalProperties",
          dataProp: key,
          dataPropType: util_1.Type.Str
        };
        if (errors === false) {
          Object.assign(subschema, {
            compositeRule: true,
            createErrors: false,
            allErrors: false
          });
        }
        cxt.subschema(subschema, valid);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var validate_1 = require_validate();
  var code_1 = require_code2();
  var util_1 = require_util();
  var additionalProperties_1 = require_additionalProperties();
  var def = {
    keyword: "properties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, parentSchema, data, it } = cxt;
      if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === undefined) {
        additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
      }
      const allProps = (0, code_1.allSchemaProperties)(schema);
      for (const prop of allProps) {
        it.definedProperties.add(prop);
      }
      if (it.opts.unevaluated && allProps.length && it.props !== true) {
        it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
      }
      const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema[p]));
      if (properties.length === 0)
        return;
      const valid = gen.name("valid");
      for (const prop of properties) {
        if (hasDefault(prop)) {
          applyPropertySchema(prop);
        } else {
          gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
          applyPropertySchema(prop);
          if (!it.allErrors)
            gen.else().var(valid, true);
          gen.endIf();
        }
        cxt.it.definedProperties.add(prop);
        cxt.ok(valid);
      }
      function hasDefault(prop) {
        return it.opts.useDefaults && !it.compositeRule && schema[prop].default !== undefined;
      }
      function applyPropertySchema(prop) {
        cxt.subschema({
          keyword: "properties",
          schemaProp: prop,
          dataProp: prop
        }, valid);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var util_2 = require_util();
  var def = {
    keyword: "patternProperties",
    type: "object",
    schemaType: "object",
    code(cxt) {
      const { gen, schema, data, parentSchema, it } = cxt;
      const { opts } = it;
      const patterns = (0, code_1.allSchemaProperties)(schema);
      const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema[p]));
      if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
        return;
      }
      const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
      const valid = gen.name("valid");
      if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
        it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
      }
      const { props } = it;
      validatePatternProperties();
      function validatePatternProperties() {
        for (const pat of patterns) {
          if (checkProperties)
            checkMatchingProperties(pat);
          if (it.allErrors) {
            validateProperties(pat);
          } else {
            gen.var(valid, true);
            validateProperties(pat);
            gen.if(valid);
          }
        }
      }
      function checkMatchingProperties(pat) {
        for (const prop in checkProperties) {
          if (new RegExp(pat).test(prop)) {
            (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
          }
        }
      }
      function validateProperties(pat) {
        gen.forIn("key", data, (key) => {
          gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
            const alwaysValid = alwaysValidPatterns.includes(pat);
            if (!alwaysValid) {
              cxt.subschema({
                keyword: "patternProperties",
                schemaProp: pat,
                dataProp: key,
                dataPropType: util_2.Type.Str
              }, valid);
            }
            if (it.opts.unevaluated && props !== true) {
              gen.assign((0, codegen_1._)`${props}[${key}]`, true);
            } else if (!alwaysValid && !it.allErrors) {
              gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          });
        });
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: "not",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    code(cxt) {
      const { gen, schema, it } = cxt;
      if ((0, util_1.alwaysValidSchema)(it, schema)) {
        cxt.fail();
        return;
      }
      const valid = gen.name("valid");
      cxt.subschema({
        keyword: "not",
        compositeRule: true,
        createErrors: false,
        allErrors: false
      }, valid);
      cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
    },
    error: { message: "must NOT be valid" }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var code_1 = require_code2();
  var def = {
    keyword: "anyOf",
    schemaType: "array",
    trackErrors: true,
    code: code_1.validateUnion,
    error: { message: "must match a schema in anyOf" }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: "must match exactly one schema in oneOf",
    params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
  };
  var def = {
    keyword: "oneOf",
    schemaType: "array",
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, parentSchema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      if (it.opts.discriminator && parentSchema.discriminator)
        return;
      const schArr = schema;
      const valid = gen.let("valid", false);
      const passing = gen.let("passing", null);
      const schValid = gen.name("_valid");
      cxt.setParams({ passing });
      gen.block(validateOneOf);
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
      function validateOneOf() {
        schArr.forEach((sch, i) => {
          let schCxt;
          if ((0, util_1.alwaysValidSchema)(it, sch)) {
            gen.var(schValid, true);
          } else {
            schCxt = cxt.subschema({
              keyword: "oneOf",
              schemaProp: i,
              compositeRule: true
            }, schValid);
          }
          if (i > 0) {
            gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
          }
          gen.if(schValid, () => {
            gen.assign(valid, true);
            gen.assign(passing, i);
            if (schCxt)
              cxt.mergeEvaluated(schCxt, codegen_1.Name);
          });
        });
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: "allOf",
    schemaType: "array",
    code(cxt) {
      const { gen, schema, it } = cxt;
      if (!Array.isArray(schema))
        throw new Error("ajv implementation error");
      const valid = gen.name("valid");
      schema.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
        cxt.ok(valid);
        cxt.mergeEvaluated(schCxt);
      });
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
    params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
  };
  var def = {
    keyword: "if",
    schemaType: ["object", "boolean"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, parentSchema, it } = cxt;
      if (parentSchema.then === undefined && parentSchema.else === undefined) {
        (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
      }
      const hasThen = hasSchema(it, "then");
      const hasElse = hasSchema(it, "else");
      if (!hasThen && !hasElse)
        return;
      const valid = gen.let("valid", true);
      const schValid = gen.name("_valid");
      validateIf();
      cxt.reset();
      if (hasThen && hasElse) {
        const ifClause = gen.let("ifClause");
        cxt.setParams({ ifClause });
        gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
      } else if (hasThen) {
        gen.if(schValid, validateClause("then"));
      } else {
        gen.if((0, codegen_1.not)(schValid), validateClause("else"));
      }
      cxt.pass(valid, () => cxt.error(true));
      function validateIf() {
        const schCxt = cxt.subschema({
          keyword: "if",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, schValid);
        cxt.mergeEvaluated(schCxt);
      }
      function validateClause(keyword, ifClause) {
        return () => {
          const schCxt = cxt.subschema({ keyword }, schValid);
          gen.assign(valid, schValid);
          cxt.mergeValidEvaluated(schCxt, valid);
          if (ifClause)
            gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
          else
            cxt.setParams({ ifClause: keyword });
        };
      }
    }
  };
  function hasSchema(it, keyword) {
    const schema = it.schema[keyword];
    return schema !== undefined && !(0, util_1.alwaysValidSchema)(it, schema);
  }
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: ["then", "else"],
    schemaType: ["object", "boolean"],
    code({ keyword, parentSchema, it }) {
      if (parentSchema.if === undefined)
        (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var additionalItems_1 = require_additionalItems();
  var prefixItems_1 = require_prefixItems();
  var items_1 = require_items();
  var items2020_1 = require_items2020();
  var contains_1 = require_contains();
  var dependencies_1 = require_dependencies();
  var propertyNames_1 = require_propertyNames();
  var additionalProperties_1 = require_additionalProperties();
  var properties_1 = require_properties();
  var patternProperties_1 = require_patternProperties();
  var not_1 = require_not();
  var anyOf_1 = require_anyOf();
  var oneOf_1 = require_oneOf();
  var allOf_1 = require_allOf();
  var if_1 = require_if();
  var thenElse_1 = require_thenElse();
  function getApplicator(draft2020 = false) {
    const applicator = [
      not_1.default,
      anyOf_1.default,
      oneOf_1.default,
      allOf_1.default,
      if_1.default,
      thenElse_1.default,
      propertyNames_1.default,
      additionalProperties_1.default,
      dependencies_1.default,
      properties_1.default,
      patternProperties_1.default
    ];
    if (draft2020)
      applicator.push(prefixItems_1.default, items2020_1.default);
    else
      applicator.push(additionalItems_1.default, items_1.default);
    applicator.push(contains_1.default);
    return applicator;
  }
  exports.default = getApplicator;
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicAnchor.js
var require_dynamicAnchor = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.dynamicAnchor = undefined;
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var compile_1 = require_compile();
  var ref_1 = require_ref();
  var def = {
    keyword: "$dynamicAnchor",
    schemaType: "string",
    code: (cxt) => dynamicAnchor(cxt, cxt.schema)
  };
  function dynamicAnchor(cxt, anchor) {
    const { gen, it } = cxt;
    it.schemaEnv.root.dynamicAnchors[anchor] = true;
    const v = (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`;
    const validate = it.errSchemaPath === "#" ? it.validateName : _getValidate(cxt);
    gen.if((0, codegen_1._)`!${v}`, () => gen.assign(v, validate));
  }
  exports.dynamicAnchor = dynamicAnchor;
  function _getValidate(cxt) {
    const { schemaEnv, schema, self } = cxt.it;
    const { root, baseId, localRefs, meta } = schemaEnv.root;
    const { schemaId } = self.opts;
    const sch = new compile_1.SchemaEnv({ schema, schemaId, root, baseId, localRefs, meta });
    compile_1.compileSchema.call(self, sch);
    return (0, ref_1.getValidate)(cxt, sch);
  }
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/dynamicRef.js
var require_dynamicRef = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.dynamicRef = undefined;
  var codegen_1 = require_codegen();
  var names_1 = require_names();
  var ref_1 = require_ref();
  var def = {
    keyword: "$dynamicRef",
    schemaType: "string",
    code: (cxt) => dynamicRef(cxt, cxt.schema)
  };
  function dynamicRef(cxt, ref) {
    const { gen, keyword, it } = cxt;
    if (ref[0] !== "#")
      throw new Error(`"${keyword}" only supports hash fragment reference`);
    const anchor = ref.slice(1);
    if (it.allErrors) {
      _dynamicRef();
    } else {
      const valid = gen.let("valid", false);
      _dynamicRef(valid);
      cxt.ok(valid);
    }
    function _dynamicRef(valid) {
      if (it.schemaEnv.root.dynamicAnchors[anchor]) {
        const v = gen.let("_v", (0, codegen_1._)`${names_1.default.dynamicAnchors}${(0, codegen_1.getProperty)(anchor)}`);
        gen.if(v, _callRef(v, valid), _callRef(it.validateName, valid));
      } else {
        _callRef(it.validateName, valid)();
      }
    }
    function _callRef(validate, valid) {
      return valid ? () => gen.block(() => {
        (0, ref_1.callRef)(cxt, validate);
        gen.let(valid, true);
      }) : () => (0, ref_1.callRef)(cxt, validate);
    }
  }
  exports.dynamicRef = dynamicRef;
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveAnchor.js
var require_recursiveAnchor = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dynamicAnchor_1 = require_dynamicAnchor();
  var util_1 = require_util();
  var def = {
    keyword: "$recursiveAnchor",
    schemaType: "boolean",
    code(cxt) {
      if (cxt.schema)
        (0, dynamicAnchor_1.dynamicAnchor)(cxt, "");
      else
        (0, util_1.checkStrictMode)(cxt.it, "$recursiveAnchor: false is ignored");
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/recursiveRef.js
var require_recursiveRef = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dynamicRef_1 = require_dynamicRef();
  var def = {
    keyword: "$recursiveRef",
    schemaType: "string",
    code: (cxt) => (0, dynamicRef_1.dynamicRef)(cxt, cxt.schema)
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/dynamic/index.js
var require_dynamic = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dynamicAnchor_1 = require_dynamicAnchor();
  var dynamicRef_1 = require_dynamicRef();
  var recursiveAnchor_1 = require_recursiveAnchor();
  var recursiveRef_1 = require_recursiveRef();
  var dynamic = [dynamicAnchor_1.default, dynamicRef_1.default, recursiveAnchor_1.default, recursiveRef_1.default];
  exports.default = dynamic;
});

// node_modules/ajv/dist/vocabularies/validation/dependentRequired.js
var require_dependentRequired = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dependencies_1 = require_dependencies();
  var def = {
    keyword: "dependentRequired",
    type: "object",
    schemaType: "object",
    error: dependencies_1.error,
    code: (cxt) => (0, dependencies_1.validatePropertyDeps)(cxt)
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/applicator/dependentSchemas.js
var require_dependentSchemas = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dependencies_1 = require_dependencies();
  var def = {
    keyword: "dependentSchemas",
    type: "object",
    schemaType: "object",
    code: (cxt) => (0, dependencies_1.validateSchemaDeps)(cxt)
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/validation/limitContains.js
var require_limitContains = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var util_1 = require_util();
  var def = {
    keyword: ["maxContains", "minContains"],
    type: "array",
    schemaType: "number",
    code({ keyword, parentSchema, it }) {
      if (parentSchema.contains === undefined) {
        (0, util_1.checkStrictMode)(it, `"${keyword}" without "contains" is ignored`);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/next.js
var require_next = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var dependentRequired_1 = require_dependentRequired();
  var dependentSchemas_1 = require_dependentSchemas();
  var limitContains_1 = require_limitContains();
  var next = [dependentRequired_1.default, dependentSchemas_1.default, limitContains_1.default];
  exports.default = next;
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedProperties.js
var require_unevaluatedProperties = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var names_1 = require_names();
  var error = {
    message: "must NOT have unevaluated properties",
    params: ({ params }) => (0, codegen_1._)`{unevaluatedProperty: ${params.unevaluatedProperty}}`
  };
  var def = {
    keyword: "unevaluatedProperties",
    type: "object",
    schemaType: ["boolean", "object"],
    trackErrors: true,
    error,
    code(cxt) {
      const { gen, schema, data, errsCount, it } = cxt;
      if (!errsCount)
        throw new Error("ajv implementation error");
      const { allErrors, props } = it;
      if (props instanceof codegen_1.Name) {
        gen.if((0, codegen_1._)`${props} !== true`, () => gen.forIn("key", data, (key) => gen.if(unevaluatedDynamic(props, key), () => unevaluatedPropCode(key))));
      } else if (props !== true) {
        gen.forIn("key", data, (key) => props === undefined ? unevaluatedPropCode(key) : gen.if(unevaluatedStatic(props, key), () => unevaluatedPropCode(key)));
      }
      it.props = true;
      cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
      function unevaluatedPropCode(key) {
        if (schema === false) {
          cxt.setParams({ unevaluatedProperty: key });
          cxt.error();
          if (!allErrors)
            gen.break();
          return;
        }
        if (!(0, util_1.alwaysValidSchema)(it, schema)) {
          const valid = gen.name("valid");
          cxt.subschema({
            keyword: "unevaluatedProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          }, valid);
          if (!allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        }
      }
      function unevaluatedDynamic(evaluatedProps, key) {
        return (0, codegen_1._)`!${evaluatedProps} || !${evaluatedProps}[${key}]`;
      }
      function unevaluatedStatic(evaluatedProps, key) {
        const ps = [];
        for (const p in evaluatedProps) {
          if (evaluatedProps[p] === true)
            ps.push((0, codegen_1._)`${key} !== ${p}`);
        }
        return (0, codegen_1.and)(...ps);
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/unevaluated/unevaluatedItems.js
var require_unevaluatedItems = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var util_1 = require_util();
  var error = {
    message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
    params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
  };
  var def = {
    keyword: "unevaluatedItems",
    type: "array",
    schemaType: ["boolean", "object"],
    error,
    code(cxt) {
      const { gen, schema, data, it } = cxt;
      const items = it.items || 0;
      if (items === true)
        return;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema === false) {
        cxt.setParams({ len: items });
        cxt.fail((0, codegen_1._)`${len} > ${items}`);
      } else if (typeof schema == "object" && !(0, util_1.alwaysValidSchema)(it, schema)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid, items));
        cxt.ok(valid);
      }
      it.items = true;
      function validateItems(valid, from) {
        gen.forRange("i", from, len, (i) => {
          cxt.subschema({ keyword: "unevaluatedItems", dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/unevaluated/index.js
var require_unevaluated = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var unevaluatedProperties_1 = require_unevaluatedProperties();
  var unevaluatedItems_1 = require_unevaluatedItems();
  var unevaluated = [unevaluatedProperties_1.default, unevaluatedItems_1.default];
  exports.default = unevaluated;
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var error = {
    message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
    params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
  };
  var def = {
    keyword: "format",
    type: ["number", "string"],
    schemaType: "string",
    $data: true,
    error,
    code(cxt, ruleType) {
      const { gen, data, $data, schema, schemaCode, it } = cxt;
      const { opts, errSchemaPath, schemaEnv, self } = it;
      if (!opts.validateFormats)
        return;
      if ($data)
        validate$DataFormat();
      else
        validateFormat();
      function validate$DataFormat() {
        const fmts = gen.scopeValue("formats", {
          ref: self.formats,
          code: opts.code.formats
        });
        const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
        const fType = gen.let("fType");
        const format = gen.let("format");
        gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
        cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
        function unknownFmt() {
          if (opts.strictSchema === false)
            return codegen_1.nil;
          return (0, codegen_1._)`${schemaCode} && !${format}`;
        }
        function invalidFmt() {
          const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
          const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
          return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
        }
      }
      function validateFormat() {
        const formatDef = self.formats[schema];
        if (!formatDef) {
          unknownFormat();
          return;
        }
        if (formatDef === true)
          return;
        const [fmtType, format, fmtRef] = getFormat(formatDef);
        if (fmtType === ruleType)
          cxt.pass(validCondition());
        function unknownFormat() {
          if (opts.strictSchema === false) {
            self.logger.warn(unknownMsg());
            return;
          }
          throw new Error(unknownMsg());
          function unknownMsg() {
            return `unknown format "${schema}" ignored in schema at path "${errSchemaPath}"`;
          }
        }
        function getFormat(fmtDef) {
          const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema)}` : undefined;
          const fmt = gen.scopeValue("formats", { key: schema, ref: fmtDef, code });
          if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
            return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
          }
          return ["string", fmtDef, fmt];
        }
        function validCondition() {
          if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
            if (!schemaEnv.$async)
              throw new Error("async format in sync schema");
            return (0, codegen_1._)`await ${fmtRef}(${data})`;
          }
          return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
        }
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var format_1 = require_format();
  var format = [format_1.default];
  exports.default = format;
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.contentVocabulary = exports.metadataVocabulary = undefined;
  exports.metadataVocabulary = [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples"
  ];
  exports.contentVocabulary = [
    "contentMediaType",
    "contentEncoding",
    "contentSchema"
  ];
});

// node_modules/ajv/dist/vocabularies/draft2020.js
var require_draft2020 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var core_1 = require_core2();
  var validation_1 = require_validation();
  var applicator_1 = require_applicator();
  var dynamic_1 = require_dynamic();
  var next_1 = require_next();
  var unevaluated_1 = require_unevaluated();
  var format_1 = require_format2();
  var metadata_1 = require_metadata();
  var draft2020Vocabularies = [
    dynamic_1.default,
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(true),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary,
    next_1.default,
    unevaluated_1.default
  ];
  exports.default = draft2020Vocabularies;
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.DiscrError = undefined;
  var DiscrError;
  (function(DiscrError2) {
    DiscrError2["Tag"] = "tag";
    DiscrError2["Mapping"] = "mapping";
  })(DiscrError || (exports.DiscrError = DiscrError = {}));
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var codegen_1 = require_codegen();
  var types_1 = require_types();
  var compile_1 = require_compile();
  var ref_error_1 = require_ref_error();
  var util_1 = require_util();
  var error = {
    message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
    params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
  };
  var def = {
    keyword: "discriminator",
    type: "object",
    schemaType: "object",
    error,
    code(cxt) {
      const { gen, data, schema, parentSchema, it } = cxt;
      const { oneOf } = parentSchema;
      if (!it.opts.discriminator) {
        throw new Error("discriminator: requires discriminator option");
      }
      const tagName = schema.propertyName;
      if (typeof tagName != "string")
        throw new Error("discriminator: requires propertyName");
      if (schema.mapping)
        throw new Error("discriminator: mapping is not supported");
      if (!oneOf)
        throw new Error("discriminator: requires oneOf keyword");
      const valid = gen.let("valid", false);
      const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
      gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
      cxt.ok(valid);
      function validateMapping() {
        const mapping = getMapping();
        gen.if(false);
        for (const tagValue in mapping) {
          gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
          gen.assign(valid, applyTagSchema(mapping[tagValue]));
        }
        gen.else();
        cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
        gen.endIf();
      }
      function applyTagSchema(schemaProp) {
        const _valid = gen.name("valid");
        const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
        cxt.mergeEvaluated(schCxt, codegen_1.Name);
        return _valid;
      }
      function getMapping() {
        var _a;
        const oneOfMapping = {};
        const topRequired = hasRequired(parentSchema);
        let tagRequired = true;
        for (let i = 0;i < oneOf.length; i++) {
          let sch = oneOf[i];
          if ((sch === null || sch === undefined ? undefined : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
            const ref = sch.$ref;
            sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
            if (sch instanceof compile_1.SchemaEnv)
              sch = sch.schema;
            if (sch === undefined)
              throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
          }
          const propSch = (_a = sch === null || sch === undefined ? undefined : sch.properties) === null || _a === undefined ? undefined : _a[tagName];
          if (typeof propSch != "object") {
            throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
          }
          tagRequired = tagRequired && (topRequired || hasRequired(sch));
          addMappings(propSch, i);
        }
        if (!tagRequired)
          throw new Error(`discriminator: "${tagName}" must be required`);
        return oneOfMapping;
        function hasRequired({ required }) {
          return Array.isArray(required) && required.includes(tagName);
        }
        function addMappings(sch, i) {
          if (sch.const) {
            addMapping(sch.const, i);
          } else if (sch.enum) {
            for (const tagValue of sch.enum) {
              addMapping(tagValue, i);
            }
          } else {
            throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
          }
        }
        function addMapping(tagValue, i) {
          if (typeof tagValue != "string" || tagValue in oneOfMapping) {
            throw new Error(`discriminator: "${tagName}" values must be unique strings`);
          }
          oneOfMapping[tagValue] = i;
        }
      }
    }
  };
  exports.default = def;
});

// node_modules/ajv/dist/refs/json-schema-2020-12/schema.json
var require_schema = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/schema",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/core": true,
      "https://json-schema.org/draft/2020-12/vocab/applicator": true,
      "https://json-schema.org/draft/2020-12/vocab/unevaluated": true,
      "https://json-schema.org/draft/2020-12/vocab/validation": true,
      "https://json-schema.org/draft/2020-12/vocab/meta-data": true,
      "https://json-schema.org/draft/2020-12/vocab/format-annotation": true,
      "https://json-schema.org/draft/2020-12/vocab/content": true
    },
    $dynamicAnchor: "meta",
    title: "Core and Validation specifications meta-schema",
    allOf: [
      { $ref: "meta/core" },
      { $ref: "meta/applicator" },
      { $ref: "meta/unevaluated" },
      { $ref: "meta/validation" },
      { $ref: "meta/meta-data" },
      { $ref: "meta/format-annotation" },
      { $ref: "meta/content" }
    ],
    type: ["object", "boolean"],
    $comment: "This meta-schema also defines keywords that have appeared in previous drafts in order to prevent incompatible extensions as they remain in common use.",
    properties: {
      definitions: {
        $comment: '"definitions" has been replaced by "$defs".',
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        deprecated: true,
        default: {}
      },
      dependencies: {
        $comment: '"dependencies" has been split and replaced by "dependentSchemas" and "dependentRequired" in order to serve their differing semantics.',
        type: "object",
        additionalProperties: {
          anyOf: [{ $dynamicRef: "#meta" }, { $ref: "meta/validation#/$defs/stringArray" }]
        },
        deprecated: true,
        default: {}
      },
      $recursiveAnchor: {
        $comment: '"$recursiveAnchor" has been replaced by "$dynamicAnchor".',
        $ref: "meta/core#/$defs/anchorString",
        deprecated: true
      },
      $recursiveRef: {
        $comment: '"$recursiveRef" has been replaced by "$dynamicRef".',
        $ref: "meta/core#/$defs/uriReferenceString",
        deprecated: true
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/applicator.json
var require_applicator2 = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/applicator",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/applicator": true
    },
    $dynamicAnchor: "meta",
    title: "Applicator vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      prefixItems: { $ref: "#/$defs/schemaArray" },
      items: { $dynamicRef: "#meta" },
      contains: { $dynamicRef: "#meta" },
      additionalProperties: { $dynamicRef: "#meta" },
      properties: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        default: {}
      },
      patternProperties: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        propertyNames: { format: "regex" },
        default: {}
      },
      dependentSchemas: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" },
        default: {}
      },
      propertyNames: { $dynamicRef: "#meta" },
      if: { $dynamicRef: "#meta" },
      then: { $dynamicRef: "#meta" },
      else: { $dynamicRef: "#meta" },
      allOf: { $ref: "#/$defs/schemaArray" },
      anyOf: { $ref: "#/$defs/schemaArray" },
      oneOf: { $ref: "#/$defs/schemaArray" },
      not: { $dynamicRef: "#meta" }
    },
    $defs: {
      schemaArray: {
        type: "array",
        minItems: 1,
        items: { $dynamicRef: "#meta" }
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json
var require_unevaluated2 = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/unevaluated",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/unevaluated": true
    },
    $dynamicAnchor: "meta",
    title: "Unevaluated applicator vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      unevaluatedItems: { $dynamicRef: "#meta" },
      unevaluatedProperties: { $dynamicRef: "#meta" }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/content.json
var require_content = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/content",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/content": true
    },
    $dynamicAnchor: "meta",
    title: "Content vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      contentEncoding: { type: "string" },
      contentMediaType: { type: "string" },
      contentSchema: { $dynamicRef: "#meta" }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/core.json
var require_core3 = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/core",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/core": true
    },
    $dynamicAnchor: "meta",
    title: "Core vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      $id: {
        $ref: "#/$defs/uriReferenceString",
        $comment: "Non-empty fragments not allowed.",
        pattern: "^[^#]*#?$"
      },
      $schema: { $ref: "#/$defs/uriString" },
      $ref: { $ref: "#/$defs/uriReferenceString" },
      $anchor: { $ref: "#/$defs/anchorString" },
      $dynamicRef: { $ref: "#/$defs/uriReferenceString" },
      $dynamicAnchor: { $ref: "#/$defs/anchorString" },
      $vocabulary: {
        type: "object",
        propertyNames: { $ref: "#/$defs/uriString" },
        additionalProperties: {
          type: "boolean"
        }
      },
      $comment: {
        type: "string"
      },
      $defs: {
        type: "object",
        additionalProperties: { $dynamicRef: "#meta" }
      }
    },
    $defs: {
      anchorString: {
        type: "string",
        pattern: "^[A-Za-z_][-A-Za-z0-9._]*$"
      },
      uriString: {
        type: "string",
        format: "uri"
      },
      uriReferenceString: {
        type: "string",
        format: "uri-reference"
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json
var require_format_annotation = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/format-annotation",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/format-annotation": true
    },
    $dynamicAnchor: "meta",
    title: "Format vocabulary meta-schema for annotation results",
    type: ["object", "boolean"],
    properties: {
      format: { type: "string" }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json
var require_meta_data = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/meta-data",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/meta-data": true
    },
    $dynamicAnchor: "meta",
    title: "Meta-data vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      title: {
        type: "string"
      },
      description: {
        type: "string"
      },
      default: true,
      deprecated: {
        type: "boolean",
        default: false
      },
      readOnly: {
        type: "boolean",
        default: false
      },
      writeOnly: {
        type: "boolean",
        default: false
      },
      examples: {
        type: "array",
        items: true
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/meta/validation.json
var require_validation2 = __commonJS((exports, module) => {
  module.exports = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://json-schema.org/draft/2020-12/meta/validation",
    $vocabulary: {
      "https://json-schema.org/draft/2020-12/vocab/validation": true
    },
    $dynamicAnchor: "meta",
    title: "Validation vocabulary meta-schema",
    type: ["object", "boolean"],
    properties: {
      type: {
        anyOf: [
          { $ref: "#/$defs/simpleTypes" },
          {
            type: "array",
            items: { $ref: "#/$defs/simpleTypes" },
            minItems: 1,
            uniqueItems: true
          }
        ]
      },
      const: true,
      enum: {
        type: "array",
        items: true
      },
      multipleOf: {
        type: "number",
        exclusiveMinimum: 0
      },
      maximum: {
        type: "number"
      },
      exclusiveMaximum: {
        type: "number"
      },
      minimum: {
        type: "number"
      },
      exclusiveMinimum: {
        type: "number"
      },
      maxLength: { $ref: "#/$defs/nonNegativeInteger" },
      minLength: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
      pattern: {
        type: "string",
        format: "regex"
      },
      maxItems: { $ref: "#/$defs/nonNegativeInteger" },
      minItems: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
      uniqueItems: {
        type: "boolean",
        default: false
      },
      maxContains: { $ref: "#/$defs/nonNegativeInteger" },
      minContains: {
        $ref: "#/$defs/nonNegativeInteger",
        default: 1
      },
      maxProperties: { $ref: "#/$defs/nonNegativeInteger" },
      minProperties: { $ref: "#/$defs/nonNegativeIntegerDefault0" },
      required: { $ref: "#/$defs/stringArray" },
      dependentRequired: {
        type: "object",
        additionalProperties: {
          $ref: "#/$defs/stringArray"
        }
      }
    },
    $defs: {
      nonNegativeInteger: {
        type: "integer",
        minimum: 0
      },
      nonNegativeIntegerDefault0: {
        $ref: "#/$defs/nonNegativeInteger",
        default: 0
      },
      simpleTypes: {
        enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
      },
      stringArray: {
        type: "array",
        items: { type: "string" },
        uniqueItems: true,
        default: []
      }
    }
  };
});

// node_modules/ajv/dist/refs/json-schema-2020-12/index.js
var require_json_schema_2020_12 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var metaSchema = require_schema();
  var applicator = require_applicator2();
  var unevaluated = require_unevaluated2();
  var content = require_content();
  var core = require_core3();
  var format = require_format_annotation();
  var metadata = require_meta_data();
  var validation = require_validation2();
  var META_SUPPORT_DATA = ["/properties"];
  function addMetaSchema2020($data) {
    [
      metaSchema,
      applicator,
      unevaluated,
      content,
      core,
      with$data(this, format),
      metadata,
      with$data(this, validation)
    ].forEach((sch) => this.addMetaSchema(sch, undefined, false));
    return this;
    function with$data(ajv, sch) {
      return $data ? ajv.$dataMetaSchema(sch, META_SUPPORT_DATA) : sch;
    }
  }
  exports.default = addMetaSchema2020;
});

// node_modules/ajv/dist/2020.js
var require_2020 = __commonJS((exports, module) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv2020 = undefined;
  var core_1 = require_core();
  var draft2020_1 = require_draft2020();
  var discriminator_1 = require_discriminator();
  var json_schema_2020_12_1 = require_json_schema_2020_12();
  var META_SCHEMA_ID = "https://json-schema.org/draft/2020-12/schema";

  class Ajv2020 extends core_1.default {
    constructor(opts = {}) {
      super({
        ...opts,
        dynamicRef: true,
        next: true,
        unevaluated: true
      });
    }
    _addVocabularies() {
      super._addVocabularies();
      draft2020_1.default.forEach((v) => this.addVocabulary(v));
      if (this.opts.discriminator)
        this.addKeyword(discriminator_1.default);
    }
    _addDefaultMetaSchema() {
      super._addDefaultMetaSchema();
      const { $data, meta } = this.opts;
      if (!meta)
        return;
      json_schema_2020_12_1.default.call(this, $data);
      this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
    }
    defaultMeta() {
      return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : undefined);
    }
  }
  exports.Ajv2020 = Ajv2020;
  module.exports = exports = Ajv2020;
  module.exports.Ajv2020 = Ajv2020;
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = Ajv2020;
  var validate_1 = require_validate();
  Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
    return validate_1.KeywordCxt;
  } });
  var codegen_1 = require_codegen();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return codegen_1._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return codegen_1.str;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return codegen_1.stringify;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return codegen_1.nil;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return codegen_1.Name;
  } });
  Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
    return codegen_1.CodeGen;
  } });
  var validation_error_1 = require_validation_error();
  Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
    return validation_error_1.default;
  } });
  var ref_error_1 = require_ref_error();
  Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
    return ref_error_1.default;
  } });
});

// node_modules/ajv-formats/dist/formats.js
var require_formats = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.formatNames = exports.fastFormats = exports.fullFormats = undefined;
  function fmtDef(validate, compare) {
    return { validate, compare };
  }
  exports.fullFormats = {
    date: fmtDef(date, compareDate),
    time: fmtDef(getTime(true), compareTime),
    "date-time": fmtDef(getDateTime(true), compareDateTime),
    "iso-time": fmtDef(getTime(), compareIsoTime),
    "iso-date-time": fmtDef(getDateTime(), compareIsoDateTime),
    duration: /^P(?!$)((\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?|(\d+W)?)$/,
    uri,
    "uri-reference": /^(?:[a-z][a-z0-9+\-.]*:)?(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'"()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'"()*+,;=:@]|%[0-9a-f]{2})*)*)?(?:\?(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'"()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i,
    "uri-template": /^(?:(?:[^\x00-\x20"'<>%\\^`{|}]|%[0-9a-f]{2})|\{[+#./;?&=,!@|]?(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[a-z0-9_]|%[0-9a-f]{2})+(?::[1-9][0-9]{0,3}|\*)?)*\})*$/i,
    url: /^(?:https?|ftp):\/\/(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)(?:\.(?:[a-z0-9\u{00a1}-\u{ffff}]+-)*[a-z0-9\u{00a1}-\u{ffff}]+)*(?:\.(?:[a-z\u{00a1}-\u{ffff}]{2,})))(?::\d{2,5})?(?:\/[^\s]*)?$/iu,
    email: /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
    hostname: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i,
    ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
    ipv6: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i,
    regex,
    uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
    "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
    "json-pointer-uri-fragment": /^#(?:\/(?:[a-z0-9_\-.!$&'()*+,;:=@]|%[0-9a-f]{2}|~0|~1)*)*$/i,
    "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
    byte,
    int32: { type: "number", validate: validateInt32 },
    int64: { type: "number", validate: validateInt64 },
    float: { type: "number", validate: validateNumber },
    double: { type: "number", validate: validateNumber },
    password: true,
    binary: true
  };
  exports.fastFormats = {
    ...exports.fullFormats,
    date: fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d$/, compareDate),
    time: fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareTime),
    "date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\dt(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)$/i, compareDateTime),
    "iso-time": fmtDef(/^(?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoTime),
    "iso-date-time": fmtDef(/^\d\d\d\d-[0-1]\d-[0-3]\d[t\s](?:[0-2]\d:[0-5]\d:[0-5]\d|23:59:60)(?:\.\d+)?(?:z|[+-]\d\d(?::?\d\d)?)?$/i, compareIsoDateTime),
    uri: /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/)?[^\s]*$/i,
    "uri-reference": /^(?:(?:[a-z][a-z0-9+\-.]*:)?\/?\/)?(?:[^\\\s#][^\s#]*)?(?:#[^\\\s]*)?$/i,
    email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i
  };
  exports.formatNames = Object.keys(exports.fullFormats);
  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }
  var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)$/;
  var DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function date(str) {
    const matches = DATE.exec(str);
    if (!matches)
      return false;
    const year = +matches[1];
    const month = +matches[2];
    const day = +matches[3];
    return month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 && isLeapYear(year) ? 29 : DAYS[month]);
  }
  function compareDate(d1, d2) {
    if (!(d1 && d2))
      return;
    if (d1 > d2)
      return 1;
    if (d1 < d2)
      return -1;
    return 0;
  }
  var TIME = /^(\d\d):(\d\d):(\d\d(?:\.\d+)?)(z|([+-])(\d\d)(?::?(\d\d))?)?$/i;
  function getTime(strictTimeZone) {
    return function time(str) {
      const matches = TIME.exec(str);
      if (!matches)
        return false;
      const hr = +matches[1];
      const min = +matches[2];
      const sec = +matches[3];
      const tz = matches[4];
      const tzSign = matches[5] === "-" ? -1 : 1;
      const tzH = +(matches[6] || 0);
      const tzM = +(matches[7] || 0);
      if (tzH > 23 || tzM > 59 || strictTimeZone && !tz)
        return false;
      if (hr <= 23 && min <= 59 && sec < 60)
        return true;
      const utcMin = min - tzM * tzSign;
      const utcHr = hr - tzH * tzSign - (utcMin < 0 ? 1 : 0);
      return (utcHr === 23 || utcHr === -1) && (utcMin === 59 || utcMin === -1) && sec < 61;
    };
  }
  function compareTime(s1, s2) {
    if (!(s1 && s2))
      return;
    const t1 = new Date("2020-01-01T" + s1).valueOf();
    const t2 = new Date("2020-01-01T" + s2).valueOf();
    if (!(t1 && t2))
      return;
    return t1 - t2;
  }
  function compareIsoTime(t1, t2) {
    if (!(t1 && t2))
      return;
    const a1 = TIME.exec(t1);
    const a2 = TIME.exec(t2);
    if (!(a1 && a2))
      return;
    t1 = a1[1] + a1[2] + a1[3];
    t2 = a2[1] + a2[2] + a2[3];
    if (t1 > t2)
      return 1;
    if (t1 < t2)
      return -1;
    return 0;
  }
  var DATE_TIME_SEPARATOR = /t|\s/i;
  function getDateTime(strictTimeZone) {
    const time = getTime(strictTimeZone);
    return function date_time(str) {
      const dateTime = str.split(DATE_TIME_SEPARATOR);
      return dateTime.length === 2 && date(dateTime[0]) && time(dateTime[1]);
    };
  }
  function compareDateTime(dt1, dt2) {
    if (!(dt1 && dt2))
      return;
    const d1 = new Date(dt1).valueOf();
    const d2 = new Date(dt2).valueOf();
    if (!(d1 && d2))
      return;
    return d1 - d2;
  }
  function compareIsoDateTime(dt1, dt2) {
    if (!(dt1 && dt2))
      return;
    const [d1, t1] = dt1.split(DATE_TIME_SEPARATOR);
    const [d2, t2] = dt2.split(DATE_TIME_SEPARATOR);
    const res = compareDate(d1, d2);
    if (res === undefined)
      return;
    return res || compareTime(t1, t2);
  }
  var NOT_URI_FRAGMENT = /\/|:/;
  var URI = /^(?:[a-z][a-z0-9+\-.]*:)(?:\/?\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:]|%[0-9a-f]{2})*@)?(?:\[(?:(?:(?:(?:[0-9a-f]{1,4}:){6}|::(?:[0-9a-f]{1,4}:){5}|(?:[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){4}|(?:(?:[0-9a-f]{1,4}:){0,1}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){3}|(?:(?:[0-9a-f]{1,4}:){0,2}[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}:){2}|(?:(?:[0-9a-f]{1,4}:){0,3}[0-9a-f]{1,4})?::[0-9a-f]{1,4}:|(?:(?:[0-9a-f]{1,4}:){0,4}[0-9a-f]{1,4})?::)(?:[0-9a-f]{1,4}:[0-9a-f]{1,4}|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?))|(?:(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4})?::[0-9a-f]{1,4}|(?:(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})?::)|[Vv][0-9a-f]+\.[a-z0-9\-._~!$&'()*+,;=:]+)\]|(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)|(?:[a-z0-9\-._~!$&'()*+,;=]|%[0-9a-f]{2})*)(?::\d*)?(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*|\/(?:(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)?|(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})+(?:\/(?:[a-z0-9\-._~!$&'()*+,;=:@]|%[0-9a-f]{2})*)*)(?:\?(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?(?:#(?:[a-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9a-f]{2})*)?$/i;
  function uri(str) {
    return NOT_URI_FRAGMENT.test(str) && URI.test(str);
  }
  var BYTE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/gm;
  function byte(str) {
    BYTE.lastIndex = 0;
    return BYTE.test(str);
  }
  var MIN_INT32 = -(2 ** 31);
  var MAX_INT32 = 2 ** 31 - 1;
  function validateInt32(value) {
    return Number.isInteger(value) && value <= MAX_INT32 && value >= MIN_INT32;
  }
  function validateInt64(value) {
    return Number.isInteger(value);
  }
  function validateNumber() {
    return true;
  }
  var Z_ANCHOR = /[^\\]\\Z/;
  function regex(str) {
    if (Z_ANCHOR.test(str))
      return false;
    try {
      new RegExp(str);
      return true;
    } catch (e) {
      return false;
    }
  }
});

// node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var core_1 = require_core2();
  var validation_1 = require_validation();
  var applicator_1 = require_applicator();
  var format_1 = require_format2();
  var metadata_1 = require_metadata();
  var draft7Vocabularies = [
    core_1.default,
    validation_1.default,
    (0, applicator_1.default)(),
    format_1.default,
    metadata_1.metadataVocabulary,
    metadata_1.contentVocabulary
  ];
  exports.default = draft7Vocabularies;
});

// node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS((exports, module) => {
  module.exports = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "http://json-schema.org/draft-07/schema#",
    title: "Core schema meta-schema",
    definitions: {
      schemaArray: {
        type: "array",
        minItems: 1,
        items: { $ref: "#" }
      },
      nonNegativeInteger: {
        type: "integer",
        minimum: 0
      },
      nonNegativeIntegerDefault0: {
        allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
      },
      simpleTypes: {
        enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
      },
      stringArray: {
        type: "array",
        items: { type: "string" },
        uniqueItems: true,
        default: []
      }
    },
    type: ["object", "boolean"],
    properties: {
      $id: {
        type: "string",
        format: "uri-reference"
      },
      $schema: {
        type: "string",
        format: "uri"
      },
      $ref: {
        type: "string",
        format: "uri-reference"
      },
      $comment: {
        type: "string"
      },
      title: {
        type: "string"
      },
      description: {
        type: "string"
      },
      default: true,
      readOnly: {
        type: "boolean",
        default: false
      },
      examples: {
        type: "array",
        items: true
      },
      multipleOf: {
        type: "number",
        exclusiveMinimum: 0
      },
      maximum: {
        type: "number"
      },
      exclusiveMaximum: {
        type: "number"
      },
      minimum: {
        type: "number"
      },
      exclusiveMinimum: {
        type: "number"
      },
      maxLength: { $ref: "#/definitions/nonNegativeInteger" },
      minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
      pattern: {
        type: "string",
        format: "regex"
      },
      additionalItems: { $ref: "#" },
      items: {
        anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
        default: true
      },
      maxItems: { $ref: "#/definitions/nonNegativeInteger" },
      minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
      uniqueItems: {
        type: "boolean",
        default: false
      },
      contains: { $ref: "#" },
      maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
      minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
      required: { $ref: "#/definitions/stringArray" },
      additionalProperties: { $ref: "#" },
      definitions: {
        type: "object",
        additionalProperties: { $ref: "#" },
        default: {}
      },
      properties: {
        type: "object",
        additionalProperties: { $ref: "#" },
        default: {}
      },
      patternProperties: {
        type: "object",
        additionalProperties: { $ref: "#" },
        propertyNames: { format: "regex" },
        default: {}
      },
      dependencies: {
        type: "object",
        additionalProperties: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
        }
      },
      propertyNames: { $ref: "#" },
      const: true,
      enum: {
        type: "array",
        items: true,
        minItems: 1,
        uniqueItems: true
      },
      type: {
        anyOf: [
          { $ref: "#/definitions/simpleTypes" },
          {
            type: "array",
            items: { $ref: "#/definitions/simpleTypes" },
            minItems: 1,
            uniqueItems: true
          }
        ]
      },
      format: { type: "string" },
      contentMediaType: { type: "string" },
      contentEncoding: { type: "string" },
      if: { $ref: "#" },
      then: { $ref: "#" },
      else: { $ref: "#" },
      allOf: { $ref: "#/definitions/schemaArray" },
      anyOf: { $ref: "#/definitions/schemaArray" },
      oneOf: { $ref: "#/definitions/schemaArray" },
      not: { $ref: "#" }
    },
    default: true
  };
});

// node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS((exports, module) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.MissingRefError = exports.ValidationError = exports.CodeGen = exports.Name = exports.nil = exports.stringify = exports.str = exports._ = exports.KeywordCxt = exports.Ajv = undefined;
  var core_1 = require_core();
  var draft7_1 = require_draft7();
  var discriminator_1 = require_discriminator();
  var draft7MetaSchema = require_json_schema_draft_07();
  var META_SUPPORT_DATA = ["/properties"];
  var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";

  class Ajv extends core_1.default {
    _addVocabularies() {
      super._addVocabularies();
      draft7_1.default.forEach((v) => this.addVocabulary(v));
      if (this.opts.discriminator)
        this.addKeyword(discriminator_1.default);
    }
    _addDefaultMetaSchema() {
      super._addDefaultMetaSchema();
      if (!this.opts.meta)
        return;
      const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
      this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
      this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
    }
    defaultMeta() {
      return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : undefined);
    }
  }
  exports.Ajv = Ajv;
  module.exports = exports = Ajv;
  module.exports.Ajv = Ajv;
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = Ajv;
  var validate_1 = require_validate();
  Object.defineProperty(exports, "KeywordCxt", { enumerable: true, get: function() {
    return validate_1.KeywordCxt;
  } });
  var codegen_1 = require_codegen();
  Object.defineProperty(exports, "_", { enumerable: true, get: function() {
    return codegen_1._;
  } });
  Object.defineProperty(exports, "str", { enumerable: true, get: function() {
    return codegen_1.str;
  } });
  Object.defineProperty(exports, "stringify", { enumerable: true, get: function() {
    return codegen_1.stringify;
  } });
  Object.defineProperty(exports, "nil", { enumerable: true, get: function() {
    return codegen_1.nil;
  } });
  Object.defineProperty(exports, "Name", { enumerable: true, get: function() {
    return codegen_1.Name;
  } });
  Object.defineProperty(exports, "CodeGen", { enumerable: true, get: function() {
    return codegen_1.CodeGen;
  } });
  var validation_error_1 = require_validation_error();
  Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function() {
    return validation_error_1.default;
  } });
  var ref_error_1 = require_ref_error();
  Object.defineProperty(exports, "MissingRefError", { enumerable: true, get: function() {
    return ref_error_1.default;
  } });
});

// node_modules/ajv-formats/dist/limit.js
var require_limit = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.formatLimitDefinition = undefined;
  var ajv_1 = require_ajv();
  var codegen_1 = require_codegen();
  var ops = codegen_1.operators;
  var KWDs = {
    formatMaximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
    formatMinimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
    formatExclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
    formatExclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
  };
  var error = {
    message: ({ keyword, schemaCode }) => (0, codegen_1.str)`should be ${KWDs[keyword].okStr} ${schemaCode}`,
    params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
  };
  exports.formatLimitDefinition = {
    keyword: Object.keys(KWDs),
    type: "string",
    schemaType: "string",
    $data: true,
    error,
    code(cxt) {
      const { gen, data, schemaCode, keyword, it } = cxt;
      const { opts, self } = it;
      if (!opts.validateFormats)
        return;
      const fCxt = new ajv_1.KeywordCxt(it, self.RULES.all.format.definition, "format");
      if (fCxt.$data)
        validate$DataFormat();
      else
        validateFormat();
      function validate$DataFormat() {
        const fmts = gen.scopeValue("formats", {
          ref: self.formats,
          code: opts.code.formats
        });
        const fmt = gen.const("fmt", (0, codegen_1._)`${fmts}[${fCxt.schemaCode}]`);
        cxt.fail$data((0, codegen_1.or)((0, codegen_1._)`typeof ${fmt} != "object"`, (0, codegen_1._)`${fmt} instanceof RegExp`, (0, codegen_1._)`typeof ${fmt}.compare != "function"`, compareCode(fmt)));
      }
      function validateFormat() {
        const format = fCxt.schema;
        const fmtDef = self.formats[format];
        if (!fmtDef || fmtDef === true)
          return;
        if (typeof fmtDef != "object" || fmtDef instanceof RegExp || typeof fmtDef.compare != "function") {
          throw new Error(`"${keyword}": format "${format}" does not define "compare" function`);
        }
        const fmt = gen.scopeValue("formats", {
          key: format,
          ref: fmtDef,
          code: opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(format)}` : undefined
        });
        cxt.fail$data(compareCode(fmt));
      }
      function compareCode(fmt) {
        return (0, codegen_1._)`${fmt}.compare(${data}, ${schemaCode}) ${KWDs[keyword].fail} 0`;
      }
    },
    dependencies: ["format"]
  };
  var formatLimitPlugin = (ajv) => {
    ajv.addKeyword(exports.formatLimitDefinition);
    return ajv;
  };
  exports.default = formatLimitPlugin;
});

// node_modules/ajv-formats/dist/index.js
var require_dist = __commonJS((exports, module) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  var formats_1 = require_formats();
  var limit_1 = require_limit();
  var codegen_1 = require_codegen();
  var fullName = new codegen_1.Name("fullFormats");
  var fastName = new codegen_1.Name("fastFormats");
  var formatsPlugin = (ajv, opts = { keywords: true }) => {
    if (Array.isArray(opts)) {
      addFormats(ajv, opts, formats_1.fullFormats, fullName);
      return ajv;
    }
    const [formats, exportName] = opts.mode === "fast" ? [formats_1.fastFormats, fastName] : [formats_1.fullFormats, fullName];
    const list = opts.formats || formats_1.formatNames;
    addFormats(ajv, list, formats, exportName);
    if (opts.keywords)
      (0, limit_1.default)(ajv);
    return ajv;
  };
  formatsPlugin.get = (name, mode = "full") => {
    const formats = mode === "fast" ? formats_1.fastFormats : formats_1.fullFormats;
    const f = formats[name];
    if (!f)
      throw new Error(`Unknown format "${name}"`);
    return f;
  };
  function addFormats(ajv, list, fs, exportName) {
    var _a;
    var _b;
    (_a = (_b = ajv.opts.code).formats) !== null && _a !== undefined || (_b.formats = (0, codegen_1._)`require("ajv-formats/dist/formats").${exportName}`);
    for (const f of list)
      ajv.addFormat(f, fs[f]);
  }
  module.exports = exports = formatsPlugin;
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.default = formatsPlugin;
});

// node_modules/ipaddr.js/lib/ipaddr.js
var require_ipaddr = __commonJS((exports, module) => {
  (function(root) {
    const ipv4Part = "(0?\\d+|0x[a-f0-9]+)";
    const ipv4Regexes = {
      fourOctet: new RegExp(`^${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}$`, "i"),
      threeOctet: new RegExp(`^${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}$`, "i"),
      twoOctet: new RegExp(`^${ipv4Part}\\.${ipv4Part}$`, "i"),
      longValue: new RegExp(`^${ipv4Part}$`, "i")
    };
    const octalRegex = new RegExp(`^0[0-7]+$`, "i");
    const hexRegex2 = new RegExp(`^0x[a-f0-9]+$`, "i");
    const zoneIndex = "%[0-9a-z]{1,}";
    const ipv6Part = "(?:[0-9a-f]+::?)+";
    const ipv6Regexes = {
      zoneIndex: new RegExp(zoneIndex, "i"),
      native: new RegExp(`^(::)?(${ipv6Part})?([0-9a-f]+)?(::)?(${zoneIndex})?$`, "i"),
      deprecatedTransitional: new RegExp(`^(?:::)(${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}(${zoneIndex})?)$`, "i"),
      transitional: new RegExp(`^((?:${ipv6Part})|(?:::)(?:${ipv6Part})?)${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}\\.${ipv4Part}(${zoneIndex})?$`, "i")
    };
    function expandIPv6(string, parts) {
      if (string.indexOf("::") !== string.lastIndexOf("::")) {
        return null;
      }
      let colonCount = 0;
      let lastColon = -1;
      let zoneId = (string.match(ipv6Regexes.zoneIndex) || [])[0];
      let replacement, replacementCount;
      if (zoneId) {
        zoneId = zoneId.substring(1);
        string = string.replace(/%.+$/, "");
      }
      while ((lastColon = string.indexOf(":", lastColon + 1)) >= 0) {
        colonCount++;
      }
      if (string.substr(0, 2) === "::") {
        colonCount--;
      }
      if (string.substr(-2, 2) === "::") {
        colonCount--;
      }
      if (colonCount > parts) {
        return null;
      }
      replacementCount = parts - colonCount;
      replacement = ":";
      while (replacementCount--) {
        replacement += "0:";
      }
      string = string.replace("::", replacement);
      if (string[0] === ":") {
        string = string.slice(1);
      }
      if (string[string.length - 1] === ":") {
        string = string.slice(0, -1);
      }
      parts = function() {
        const ref = string.split(":");
        const results = [];
        for (let i = 0;i < ref.length; i++) {
          results.push(parseInt(ref[i], 16));
        }
        return results;
      }();
      return {
        parts,
        zoneId
      };
    }
    function matchCIDR(first, second, partSize, cidrBits) {
      if (first.length !== second.length) {
        throw new Error("ipaddr: cannot match CIDR for objects with different lengths");
      }
      let part = 0;
      let shift;
      while (cidrBits > 0) {
        shift = partSize - cidrBits;
        if (shift < 0) {
          shift = 0;
        }
        if (first[part] >> shift !== second[part] >> shift) {
          return false;
        }
        cidrBits -= partSize;
        part += 1;
      }
      return true;
    }
    function parseIntAuto(string) {
      if (hexRegex2.test(string)) {
        return parseInt(string, 16);
      }
      if (string[0] === "0" && !isNaN(parseInt(string[1], 10))) {
        if (octalRegex.test(string)) {
          return parseInt(string, 8);
        }
        throw new Error(`ipaddr: cannot parse ${string} as octal`);
      }
      return parseInt(string, 10);
    }
    function padPart(part, length) {
      while (part.length < length) {
        part = `0${part}`;
      }
      return part;
    }
    const ipaddr = {};
    ipaddr.IPv4 = function() {
      function IPv4(octets) {
        if (octets.length !== 4) {
          throw new Error("ipaddr: ipv4 octet count should be 4");
        }
        let i, octet;
        for (i = 0;i < octets.length; i++) {
          octet = octets[i];
          if (!(0 <= octet && octet <= 255)) {
            throw new Error("ipaddr: ipv4 octet should fit in 8 bits");
          }
        }
        this.octets = octets;
      }
      IPv4.prototype.SpecialRanges = {
        unspecified: [[new IPv4([0, 0, 0, 0]), 8]],
        broadcast: [[new IPv4([255, 255, 255, 255]), 32]],
        multicast: [[new IPv4([224, 0, 0, 0]), 4]],
        linkLocal: [[new IPv4([169, 254, 0, 0]), 16]],
        loopback: [[new IPv4([127, 0, 0, 0]), 8]],
        carrierGradeNat: [[new IPv4([100, 64, 0, 0]), 10]],
        private: [
          [new IPv4([10, 0, 0, 0]), 8],
          [new IPv4([172, 16, 0, 0]), 12],
          [new IPv4([192, 168, 0, 0]), 16]
        ],
        reserved: [
          [new IPv4([192, 0, 0, 0]), 24],
          [new IPv4([192, 0, 2, 0]), 24],
          [new IPv4([192, 88, 99, 0]), 24],
          [new IPv4([198, 18, 0, 0]), 15],
          [new IPv4([198, 51, 100, 0]), 24],
          [new IPv4([203, 0, 113, 0]), 24],
          [new IPv4([240, 0, 0, 0]), 4]
        ],
        as112: [
          [new IPv4([192, 175, 48, 0]), 24],
          [new IPv4([192, 31, 196, 0]), 24]
        ],
        amt: [
          [new IPv4([192, 52, 193, 0]), 24]
        ]
      };
      IPv4.prototype.kind = function() {
        return "ipv4";
      };
      IPv4.prototype.match = function(other, cidrRange) {
        let ref;
        if (cidrRange === undefined) {
          ref = other;
          other = ref[0];
          cidrRange = ref[1];
        }
        if (other.kind() !== "ipv4") {
          throw new Error("ipaddr: cannot match ipv4 address with non-ipv4 one");
        }
        return matchCIDR(this.octets, other.octets, 8, cidrRange);
      };
      IPv4.prototype.prefixLengthFromSubnetMask = function() {
        let cidr = 0;
        let stop = false;
        const zerotable = {
          0: 8,
          128: 7,
          192: 6,
          224: 5,
          240: 4,
          248: 3,
          252: 2,
          254: 1,
          255: 0
        };
        let i, octet, zeros;
        for (i = 3;i >= 0; i -= 1) {
          octet = this.octets[i];
          if (octet in zerotable) {
            zeros = zerotable[octet];
            if (stop && zeros !== 0) {
              return null;
            }
            if (zeros !== 8) {
              stop = true;
            }
            cidr += zeros;
          } else {
            return null;
          }
        }
        return 32 - cidr;
      };
      IPv4.prototype.range = function() {
        return ipaddr.subnetMatch(this, this.SpecialRanges);
      };
      IPv4.prototype.toByteArray = function() {
        return this.octets.slice(0);
      };
      IPv4.prototype.toIPv4MappedAddress = function() {
        return ipaddr.IPv6.parse(`::ffff:${this.toString()}`);
      };
      IPv4.prototype.toNormalizedString = function() {
        return this.toString();
      };
      IPv4.prototype.toString = function() {
        return this.octets.join(".");
      };
      return IPv4;
    }();
    ipaddr.IPv4.broadcastAddressFromCIDR = function(string) {
      try {
        const cidr = this.parseCIDR(string);
        const ipInterfaceOctets = cidr[0].toByteArray();
        const subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
        const octets = [];
        let i = 0;
        while (i < 4) {
          octets.push(parseInt(ipInterfaceOctets[i], 10) | parseInt(subnetMaskOctets[i], 10) ^ 255);
          i++;
        }
        return new this(octets);
      } catch (e) {
        throw new Error("ipaddr: the address does not have IPv4 CIDR format");
      }
    };
    ipaddr.IPv4.isIPv4 = function(string) {
      return this.parser(string) !== null;
    };
    ipaddr.IPv4.isValid = function(string) {
      try {
        new this(this.parser(string));
        return true;
      } catch (e) {
        return false;
      }
    };
    ipaddr.IPv4.isValidCIDR = function(string) {
      try {
        this.parseCIDR(string);
        return true;
      } catch (e) {
        return false;
      }
    };
    ipaddr.IPv4.isValidFourPartDecimal = function(string) {
      if (ipaddr.IPv4.isValid(string) && string.match(/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){3}$/)) {
        return true;
      } else {
        return false;
      }
    };
    ipaddr.IPv4.networkAddressFromCIDR = function(string) {
      let cidr, i, ipInterfaceOctets, octets, subnetMaskOctets;
      try {
        cidr = this.parseCIDR(string);
        ipInterfaceOctets = cidr[0].toByteArray();
        subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
        octets = [];
        i = 0;
        while (i < 4) {
          octets.push(parseInt(ipInterfaceOctets[i], 10) & parseInt(subnetMaskOctets[i], 10));
          i++;
        }
        return new this(octets);
      } catch (e) {
        throw new Error("ipaddr: the address does not have IPv4 CIDR format");
      }
    };
    ipaddr.IPv4.parse = function(string) {
      const parts = this.parser(string);
      if (parts === null) {
        throw new Error("ipaddr: string is not formatted like an IPv4 Address");
      }
      return new this(parts);
    };
    ipaddr.IPv4.parseCIDR = function(string) {
      let match;
      if (match = string.match(/^(.+)\/(\d+)$/)) {
        const maskLength = parseInt(match[2]);
        if (maskLength >= 0 && maskLength <= 32) {
          const parsed = [this.parse(match[1]), maskLength];
          Object.defineProperty(parsed, "toString", {
            value: function() {
              return this.join("/");
            }
          });
          return parsed;
        }
      }
      throw new Error("ipaddr: string is not formatted like an IPv4 CIDR range");
    };
    ipaddr.IPv4.parser = function(string) {
      let match, part, value;
      if (match = string.match(ipv4Regexes.fourOctet)) {
        return function() {
          const ref = match.slice(1, 6);
          const results = [];
          for (let i = 0;i < ref.length; i++) {
            part = ref[i];
            results.push(parseIntAuto(part));
          }
          return results;
        }();
      } else if (match = string.match(ipv4Regexes.longValue)) {
        value = parseIntAuto(match[1]);
        if (value > 4294967295 || value < 0) {
          throw new Error("ipaddr: address outside defined range");
        }
        return function() {
          const results = [];
          let shift;
          for (shift = 0;shift <= 24; shift += 8) {
            results.push(value >> shift & 255);
          }
          return results;
        }().reverse();
      } else if (match = string.match(ipv4Regexes.twoOctet)) {
        return function() {
          const ref = match.slice(1, 4);
          const results = [];
          value = parseIntAuto(ref[1]);
          if (value > 16777215 || value < 0) {
            throw new Error("ipaddr: address outside defined range");
          }
          results.push(parseIntAuto(ref[0]));
          results.push(value >> 16 & 255);
          results.push(value >> 8 & 255);
          results.push(value & 255);
          return results;
        }();
      } else if (match = string.match(ipv4Regexes.threeOctet)) {
        return function() {
          const ref = match.slice(1, 5);
          const results = [];
          value = parseIntAuto(ref[2]);
          if (value > 65535 || value < 0) {
            throw new Error("ipaddr: address outside defined range");
          }
          results.push(parseIntAuto(ref[0]));
          results.push(parseIntAuto(ref[1]));
          results.push(value >> 8 & 255);
          results.push(value & 255);
          return results;
        }();
      } else {
        return null;
      }
    };
    ipaddr.IPv4.subnetMaskFromPrefixLength = function(prefix) {
      prefix = parseInt(prefix);
      if (prefix < 0 || prefix > 32) {
        throw new Error("ipaddr: invalid IPv4 prefix length");
      }
      const octets = [0, 0, 0, 0];
      let j = 0;
      const filledOctetCount = Math.floor(prefix / 8);
      while (j < filledOctetCount) {
        octets[j] = 255;
        j++;
      }
      if (filledOctetCount < 4) {
        octets[filledOctetCount] = Math.pow(2, prefix % 8) - 1 << 8 - prefix % 8;
      }
      return new this(octets);
    };
    ipaddr.IPv6 = function() {
      function IPv6(parts, zoneId) {
        let i, part;
        if (parts.length === 16) {
          this.parts = [];
          for (i = 0;i <= 14; i += 2) {
            this.parts.push(parts[i] << 8 | parts[i + 1]);
          }
        } else if (parts.length === 8) {
          this.parts = parts;
        } else {
          throw new Error("ipaddr: ipv6 part count should be 8 or 16");
        }
        for (i = 0;i < this.parts.length; i++) {
          part = this.parts[i];
          if (!(0 <= part && part <= 65535)) {
            throw new Error("ipaddr: ipv6 part should fit in 16 bits");
          }
        }
        if (zoneId) {
          this.zoneId = zoneId;
        }
      }
      IPv6.prototype.SpecialRanges = {
        unspecified: [new IPv6([0, 0, 0, 0, 0, 0, 0, 0]), 128],
        linkLocal: [new IPv6([65152, 0, 0, 0, 0, 0, 0, 0]), 10],
        multicast: [new IPv6([65280, 0, 0, 0, 0, 0, 0, 0]), 8],
        loopback: [new IPv6([0, 0, 0, 0, 0, 0, 0, 1]), 128],
        uniqueLocal: [new IPv6([64512, 0, 0, 0, 0, 0, 0, 0]), 7],
        ipv4Mapped: [new IPv6([0, 0, 0, 0, 0, 65535, 0, 0]), 96],
        discard: [new IPv6([256, 0, 0, 0, 0, 0, 0, 0]), 64],
        rfc6145: [new IPv6([0, 0, 0, 0, 65535, 0, 0, 0]), 96],
        rfc6052: [new IPv6([100, 65435, 0, 0, 0, 0, 0, 0]), 96],
        "6to4": [new IPv6([8194, 0, 0, 0, 0, 0, 0, 0]), 16],
        teredo: [new IPv6([8193, 0, 0, 0, 0, 0, 0, 0]), 32],
        benchmarking: [new IPv6([8193, 2, 0, 0, 0, 0, 0, 0]), 48],
        amt: [new IPv6([8193, 3, 0, 0, 0, 0, 0, 0]), 32],
        as112v6: [
          [new IPv6([8193, 4, 274, 0, 0, 0, 0, 0]), 48],
          [new IPv6([9760, 79, 32768, 0, 0, 0, 0, 0]), 48]
        ],
        deprecated: [new IPv6([8193, 16, 0, 0, 0, 0, 0, 0]), 28],
        orchid2: [new IPv6([8193, 32, 0, 0, 0, 0, 0, 0]), 28],
        droneRemoteIdProtocolEntityTags: [new IPv6([8193, 48, 0, 0, 0, 0, 0, 0]), 28],
        reserved: [
          [new IPv6([8193, 0, 0, 0, 0, 0, 0, 0]), 23],
          [new IPv6([8193, 3512, 0, 0, 0, 0, 0, 0]), 32]
        ]
      };
      IPv6.prototype.isIPv4MappedAddress = function() {
        return this.range() === "ipv4Mapped";
      };
      IPv6.prototype.kind = function() {
        return "ipv6";
      };
      IPv6.prototype.match = function(other, cidrRange) {
        let ref;
        if (cidrRange === undefined) {
          ref = other;
          other = ref[0];
          cidrRange = ref[1];
        }
        if (other.kind() !== "ipv6") {
          throw new Error("ipaddr: cannot match ipv6 address with non-ipv6 one");
        }
        return matchCIDR(this.parts, other.parts, 16, cidrRange);
      };
      IPv6.prototype.prefixLengthFromSubnetMask = function() {
        let cidr = 0;
        let stop = false;
        const zerotable = {
          0: 16,
          32768: 15,
          49152: 14,
          57344: 13,
          61440: 12,
          63488: 11,
          64512: 10,
          65024: 9,
          65280: 8,
          65408: 7,
          65472: 6,
          65504: 5,
          65520: 4,
          65528: 3,
          65532: 2,
          65534: 1,
          65535: 0
        };
        let part, zeros;
        for (let i = 7;i >= 0; i -= 1) {
          part = this.parts[i];
          if (part in zerotable) {
            zeros = zerotable[part];
            if (stop && zeros !== 0) {
              return null;
            }
            if (zeros !== 16) {
              stop = true;
            }
            cidr += zeros;
          } else {
            return null;
          }
        }
        return 128 - cidr;
      };
      IPv6.prototype.range = function() {
        return ipaddr.subnetMatch(this, this.SpecialRanges);
      };
      IPv6.prototype.toByteArray = function() {
        let part;
        const bytes = [];
        const ref = this.parts;
        for (let i = 0;i < ref.length; i++) {
          part = ref[i];
          bytes.push(part >> 8);
          bytes.push(part & 255);
        }
        return bytes;
      };
      IPv6.prototype.toFixedLengthString = function() {
        const addr = function() {
          const results = [];
          for (let i = 0;i < this.parts.length; i++) {
            results.push(padPart(this.parts[i].toString(16), 4));
          }
          return results;
        }.call(this).join(":");
        let suffix = "";
        if (this.zoneId) {
          suffix = `%${this.zoneId}`;
        }
        return addr + suffix;
      };
      IPv6.prototype.toIPv4Address = function() {
        if (!this.isIPv4MappedAddress()) {
          throw new Error("ipaddr: trying to convert a generic ipv6 address to ipv4");
        }
        const ref = this.parts.slice(-2);
        const high = ref[0];
        const low = ref[1];
        return new ipaddr.IPv4([high >> 8, high & 255, low >> 8, low & 255]);
      };
      IPv6.prototype.toNormalizedString = function() {
        const addr = function() {
          const results = [];
          for (let i = 0;i < this.parts.length; i++) {
            results.push(this.parts[i].toString(16));
          }
          return results;
        }.call(this).join(":");
        let suffix = "";
        if (this.zoneId) {
          suffix = `%${this.zoneId}`;
        }
        return addr + suffix;
      };
      IPv6.prototype.toRFC5952String = function() {
        const regex = /((^|:)(0(:|$)){2,})/g;
        const string = this.toNormalizedString();
        let bestMatchIndex = 0;
        let bestMatchLength = -1;
        let match;
        while (match = regex.exec(string)) {
          if (match[0].length > bestMatchLength) {
            bestMatchIndex = match.index;
            bestMatchLength = match[0].length;
          }
        }
        if (bestMatchLength < 0) {
          return string;
        }
        return `${string.substring(0, bestMatchIndex)}::${string.substring(bestMatchIndex + bestMatchLength)}`;
      };
      IPv6.prototype.toString = function() {
        return this.toRFC5952String();
      };
      return IPv6;
    }();
    ipaddr.IPv6.broadcastAddressFromCIDR = function(string) {
      try {
        const cidr = this.parseCIDR(string);
        const ipInterfaceOctets = cidr[0].toByteArray();
        const subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
        const octets = [];
        let i = 0;
        while (i < 16) {
          octets.push(parseInt(ipInterfaceOctets[i], 10) | parseInt(subnetMaskOctets[i], 10) ^ 255);
          i++;
        }
        return new this(octets);
      } catch (e) {
        throw new Error(`ipaddr: the address does not have IPv6 CIDR format (${e})`);
      }
    };
    ipaddr.IPv6.isIPv6 = function(string) {
      return this.parser(string) !== null;
    };
    ipaddr.IPv6.isValid = function(string) {
      if (typeof string === "string" && string.indexOf(":") === -1) {
        return false;
      }
      try {
        const addr = this.parser(string);
        new this(addr.parts, addr.zoneId);
        return true;
      } catch (e) {
        return false;
      }
    };
    ipaddr.IPv6.isValidCIDR = function(string) {
      if (typeof string === "string" && string.indexOf(":") === -1) {
        return false;
      }
      try {
        this.parseCIDR(string);
        return true;
      } catch (e) {
        return false;
      }
    };
    ipaddr.IPv6.networkAddressFromCIDR = function(string) {
      let cidr, i, ipInterfaceOctets, octets, subnetMaskOctets;
      try {
        cidr = this.parseCIDR(string);
        ipInterfaceOctets = cidr[0].toByteArray();
        subnetMaskOctets = this.subnetMaskFromPrefixLength(cidr[1]).toByteArray();
        octets = [];
        i = 0;
        while (i < 16) {
          octets.push(parseInt(ipInterfaceOctets[i], 10) & parseInt(subnetMaskOctets[i], 10));
          i++;
        }
        return new this(octets);
      } catch (e) {
        throw new Error(`ipaddr: the address does not have IPv6 CIDR format (${e})`);
      }
    };
    ipaddr.IPv6.parse = function(string) {
      const addr = this.parser(string);
      if (addr.parts === null) {
        throw new Error("ipaddr: string is not formatted like an IPv6 Address");
      }
      return new this(addr.parts, addr.zoneId);
    };
    ipaddr.IPv6.parseCIDR = function(string) {
      let maskLength, match, parsed;
      if (match = string.match(/^(.+)\/(\d+)$/)) {
        maskLength = parseInt(match[2]);
        if (maskLength >= 0 && maskLength <= 128) {
          parsed = [this.parse(match[1]), maskLength];
          Object.defineProperty(parsed, "toString", {
            value: function() {
              return this.join("/");
            }
          });
          return parsed;
        }
      }
      throw new Error("ipaddr: string is not formatted like an IPv6 CIDR range");
    };
    ipaddr.IPv6.parser = function(string) {
      let addr, i, match, octet, octets, zoneId;
      if (match = string.match(ipv6Regexes.deprecatedTransitional)) {
        return this.parser(`::ffff:${match[1]}`);
      }
      if (ipv6Regexes.native.test(string)) {
        return expandIPv6(string, 8);
      }
      if (match = string.match(ipv6Regexes.transitional)) {
        zoneId = match[6] || "";
        addr = match[1];
        if (!match[1].endsWith("::")) {
          addr = addr.slice(0, -1);
        }
        addr = expandIPv6(addr + zoneId, 6);
        if (addr.parts) {
          octets = [
            parseInt(match[2]),
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5])
          ];
          for (i = 0;i < octets.length; i++) {
            octet = octets[i];
            if (!(0 <= octet && octet <= 255)) {
              return null;
            }
          }
          addr.parts.push(octets[0] << 8 | octets[1]);
          addr.parts.push(octets[2] << 8 | octets[3]);
          return {
            parts: addr.parts,
            zoneId: addr.zoneId
          };
        }
      }
      return null;
    };
    ipaddr.IPv6.subnetMaskFromPrefixLength = function(prefix) {
      prefix = parseInt(prefix);
      if (prefix < 0 || prefix > 128) {
        throw new Error("ipaddr: invalid IPv6 prefix length");
      }
      const octets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      let j = 0;
      const filledOctetCount = Math.floor(prefix / 8);
      while (j < filledOctetCount) {
        octets[j] = 255;
        j++;
      }
      if (filledOctetCount < 16) {
        octets[filledOctetCount] = Math.pow(2, prefix % 8) - 1 << 8 - prefix % 8;
      }
      return new this(octets);
    };
    ipaddr.fromByteArray = function(bytes) {
      const length = bytes.length;
      if (length === 4) {
        return new ipaddr.IPv4(bytes);
      } else if (length === 16) {
        return new ipaddr.IPv6(bytes);
      } else {
        throw new Error("ipaddr: the binary input is neither an IPv6 nor IPv4 address");
      }
    };
    ipaddr.isValid = function(string) {
      return ipaddr.IPv6.isValid(string) || ipaddr.IPv4.isValid(string);
    };
    ipaddr.isValidCIDR = function(string) {
      return ipaddr.IPv6.isValidCIDR(string) || ipaddr.IPv4.isValidCIDR(string);
    };
    ipaddr.parse = function(string) {
      if (ipaddr.IPv6.isValid(string)) {
        return ipaddr.IPv6.parse(string);
      } else if (ipaddr.IPv4.isValid(string)) {
        return ipaddr.IPv4.parse(string);
      } else {
        throw new Error("ipaddr: the address has neither IPv6 nor IPv4 format");
      }
    };
    ipaddr.parseCIDR = function(string) {
      try {
        return ipaddr.IPv6.parseCIDR(string);
      } catch (e) {
        try {
          return ipaddr.IPv4.parseCIDR(string);
        } catch (e2) {
          throw new Error("ipaddr: the address has neither IPv6 nor IPv4 CIDR format");
        }
      }
    };
    ipaddr.process = function(string) {
      const addr = this.parse(string);
      if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
        return addr.toIPv4Address();
      } else {
        return addr;
      }
    };
    ipaddr.subnetMatch = function(address, rangeList, defaultName) {
      let i, rangeName, rangeSubnets, subnet;
      if (defaultName === undefined || defaultName === null) {
        defaultName = "unicast";
      }
      for (rangeName in rangeList) {
        if (Object.prototype.hasOwnProperty.call(rangeList, rangeName)) {
          rangeSubnets = rangeList[rangeName];
          if (rangeSubnets[0] && !(rangeSubnets[0] instanceof Array)) {
            rangeSubnets = [rangeSubnets];
          }
          for (i = 0;i < rangeSubnets.length; i++) {
            subnet = rangeSubnets[i];
            if (address.kind() === subnet[0].kind() && address.match.apply(address, subnet)) {
              return rangeName;
            }
          }
        }
      }
      return defaultName;
    };
    if (typeof module !== "undefined" && module.exports) {
      module.exports = ipaddr;
    } else {
      root.ipaddr = ipaddr;
    }
  })(exports);
});

// src/runtime.ts
import { createHash as createHash3, randomBytes as randomBytes2 } from "crypto";
import {
  closeSync as closeSync2,
  existsSync as existsSync2,
  fsyncSync as fsyncSync2,
  lstatSync as lstatSync2,
  mkdirSync,
  openSync as openSync2,
  renameSync as renameSync2,
  rmSync as rmSync2,
  writeFileSync as writeFileSync2
} from "fs";
import { isAbsolute, parse as parse2, resolve as resolve2 } from "path";

// src/contract.ts
var import__2020 = __toESM(require_2020(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
// contracts/f5xc-create-v1.json
var f5xc_create_v1_default = {
  components: {
    schemas: {
      app_firewallAIEnhancementsConfig: {
        description: "Actions complimented by the additional intelligence of the F5 AI Powered Risk-based analysis.",
        properties: {
          mitigate_high_medium_risk_action: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          mitigate_high_risk_action: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "AI Enhancements Config",
        type: "object",
        "x-displayname": "AI Enhancements Config.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Actions complimented by the additional intelligence of the F5 AI Powered Risk-based analysis.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAIEnhancementsConfig",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallAIEnhancementsConfig
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-risk_score_action_choice": '["mitigate_high_medium_risk_action","mitigate_high_risk_action"]',
        "x-ves-proto-message": "ves.io.schema.app_firewall.AIEnhancementsConfig"
      },
      app_firewallAllowedResponseCodes: {
        description: "List of HTTP response status codes that are allowed.",
        properties: {
          response_code: {
            description: "List of HTTP response status codes that are allowed.",
            items: {
              format: "int64",
              type: "integer"
            },
            maxItems: 48,
            minItems: 1,
            title: "response_code",
            type: "array",
            "x-displayname": "Response Code.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 48,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minItems: 1,
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of HTTP response status codes that are allowed.",
            "x-f5xc-example": "[200, 201, 204, 300, 302, 400, 403, 404, 500, 501, 503]",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.uint32.gte": "100",
              "ves.io.schema.rules.repeated.items.uint32.lte": "999",
              "ves.io.schema.rules.repeated.max_items": "48",
              "ves.io.schema.rules.repeated.min_items": "1",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "[200, 201, 204, 300, 302, 400, 403, 404, 500, 501, 503]",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.uint32.gte": "100",
              "ves.io.schema.rules.repeated.items.uint32.lte": "999",
              "ves.io.schema.rules.repeated.max_items": "48",
              "ves.io.schema.rules.repeated.min_items": "1",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "Allowed Response Codes",
        type: "object",
        "x-displayname": "Allowed Response Codes.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "List of HTTP response status codes that are allowed.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAllowedResponseCodes",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "response_code": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallAllowedResponseCodes
metadata:
  name: example
  namespace: default
spec:
  response_code: value`,
          mutually_exclusive_groups: [],
          required_fields: ["response_code"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.AllowedResponseCodes"
      },
      app_firewallAnonymizationConfiguration: {
        description: "Configure anonymization for HTTP headers, parameters or cookies which may contain sensitive data.",
        properties: {
          cookie: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAnonymizeHttpCookie"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          http_header: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAnonymizeHttpHeader"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for http header.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          query_parameter: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAnonymizeHttpQueryParameter"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for query parameter.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "AnonymizationConfiguration",
        type: "object",
        "x-displayname": "Anonymization Configuration.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Configure anonymization for HTTP headers, parameters or cookies which may contain sensitive data.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAnonymizationConfiguration",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallAnonymizationConfiguration
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-anonymization_choice": '["cookie","http_header","query_parameter"]',
        "x-ves-proto-message": "ves.io.schema.app_firewall.AnonymizationConfiguration"
      },
      app_firewallAnonymizationSetting: {
        description: "Anonymization settings which is a list of HTTP headers, parameters and cookies.",
        properties: {
          anonymization_config: {
            description: "List of HTTP headers, cookies and query parameters whose values will be masked.",
            items: {
              $ref: "#/components/schemas/app_firewallAnonymizationConfiguration"
            },
            maxItems: 64,
            title: "AnonymizationConfiguration",
            type: "array",
            "x-displayname": "Configuration.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of HTTP headers, cookies and query parameters whose values will be masked.",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "AnonymizationSetting",
        type: "object",
        "x-displayname": "Anonymization Configuration.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Anonymization settings which is a list of HTTP headers, parameters and cookies.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAnonymizationSetting",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "anonymization_config": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallAnonymizationSetting
metadata:
  name: example
  namespace: default
spec:
  anonymization_config: value`,
          mutually_exclusive_groups: [],
          required_fields: ["anonymization_config"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.AnonymizationSetting"
      },
      app_firewallAnonymizeHttpCookie: {
        description: "Configure anonymization for HTTP Cookies.",
        properties: {
          cookie_name: {
            description: `Masks the cookie value. The setting does not mask the cookie name.
Wildcard matching can be used by prefixing or suffixing the cookie name
with a wildcard asterisk (*), or by using only an asterisk to match any cookie name.`,
            maxLength: 256,
            title: "cookie_name",
            type: "string",
            "x-displayname": "Cookie Name.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Masks the cookie value. The setting does not mask the cookie name. Wildcard matching can be used by prefixing or suffixing the cookie name with a wildcard asterisk (*), or by using only an asterisk to match any cookie name.",
            "x-f5xc-description-short": "Masks the cookie value. The setting does not mask the cookie name.",
            "x-f5xc-example": "value",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_len": "256"
            },
            "x-ves-example": "Value",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_len": "256"
            }
          }
        },
        title: "AnonymizeHttpCookie",
        type: "object",
        "x-displayname": "Anonymize HTTP Cookie.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Configure anonymization for HTTP Cookies.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAnonymizeHttpCookie",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "cookie_name": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallAnonymizeHttpCookie
metadata:
  name: example
  namespace: default
spec:
  cookie_name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["cookie_name"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.AnonymizeHttpCookie"
      },
      app_firewallAnonymizeHttpHeader: {
        description: "Configure anonymization for HTTP Headers.",
        properties: {
          header_name: {
            description: `Masks the HTTP header value. The setting does not mask the HTTP header name.
Wildcard matching can be used by prefixing or suffixing the HTTP header name
with a wildcard asterisk (*), or by using only an asterisk to match any HTTP header name.`,
            title: "header_name",
            type: "string",
            "x-displayname": "Header Name.",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Masks the HTTP header value. The setting does not mask the HTTP header name. Wildcard matching can be used by prefixing or suffixing the HTTP header name with a wildcard asterisk (*), or by using only an asterisk to match any HTTP header name.",
            "x-f5xc-description-short": "Masks the HTTP header value. The setting does not mask the HTTP header name.",
            "x-f5xc-example": "value",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.http_header_field": "true"
            },
            "x-ves-example": "Value",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.http_header_field": "true"
            }
          }
        },
        title: "AnonymizeHttpHeader",
        type: "object",
        "x-displayname": "Anonymize HTTP Header.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Configure anonymization for HTTP Headers.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAnonymizeHttpHeader",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "header_name": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallAnonymizeHttpHeader
metadata:
  name: example
  namespace: default
spec:
  header_name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["header_name"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.AnonymizeHttpHeader"
      },
      app_firewallAnonymizeHttpQueryParameter: {
        description: "Configure anonymization for HTTP Parameters.",
        properties: {
          query_param_name: {
            description: `Masks the query parameter value. The setting does not mask the query parameter name.
Wildcard matching can be used by prefixing or suffixing the query parameter name
with a wildcard asterisk (*), or by using only an asterisk to match any query parameter name.`,
            maxLength: 256,
            title: "query_param_name",
            type: "string",
            "x-displayname": "Query Parameter Name.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Masks the query parameter value. The setting does not mask the query parameter name. Wildcard matching can be used by prefixing or suffixing the query parameter name with a wildcard asterisk (*), or by using only an asterisk to match any query parameter name.",
            "x-f5xc-description-short": "Masks the query parameter value. The setting does not mask the query parameter name.",
            "x-f5xc-example": "value",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_len": "256"
            },
            "x-ves-example": "Value",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_len": "256"
            }
          }
        },
        title: "AnonymizeHttpQueryParameter",
        type: "object",
        "x-displayname": "Anonymize HTTP Query Parameter.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Configure anonymization for HTTP Parameters.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAnonymizeHttpQueryParameter",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "query_param_name": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallAnonymizeHttpQueryParameter
metadata:
  name: example
  namespace: default
spec:
  query_param_name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["query_param_name"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.AnonymizeHttpQueryParameter"
      },
      app_firewallAppFirewallViolationType: {
        default: "VIOL_NONE",
        description: `List of all supported Violation Types

VIOL_NONE
VIOL_FILETYPE
VIOL_METHOD
VIOL_MANDATORY_HEADER
VIOL_HTTP_RESPONSE_STATUS
VIOL_REQUEST_MAX_LENGTH
VIOL_FILE_UPLOAD
VIOL_FILE_UPLOAD_IN_BODY
VIOL_XML_MALFORMED
VIOL_JSON_MALFORMED
VIOL_ASM_COOKIE_MODIFIED
VIOL_HTTP_PROTOCOL_MULTIPLE_HOST_HEADERS
VIOL_HTTP_PROTOCOL_BAD_HOST_HEADER_VALUE
VIOL_HTTP_PROTOCOL_UNPARSABLE_REQUEST_CONTENT
VIOL_HTTP_PROTOCOL_NULL_IN_REQUEST
VIOL_HTTP_PROTOCOL_BAD_HTTP_VERSION
VIOL_HTTP_PROTOCOL_CRLF_CHARACTERS_BEFORE_REQUEST_START
VIOL_HTTP_PROTOCOL_NO_HOST_HEADER_IN_HTTP_1_1_REQUEST
VIOL_HTTP_PROTOCOL_BAD_MULTIPART_PARAMETERS_PARSING
VIOL_HTTP_PROTOCOL_SEVERAL_CONTENT_LENGTH_HEADERS
VIOL_HTTP_PROTOCOL_CONTENT_LENGTH_SHOULD_BE_A_POSITIVE_NUMBER
VIOL_EVASION_DIRECTORY_TRAVERSALS
VIOL_MALFORMED_REQUEST
VIOL_EVASION_MULTIPLE_DECODING
VIOL_DATA_GUARD
VIOL_EVASION_APACHE_WHITESPACE
VIOL_COOKIE_MODIFIED
VIOL_EVASION_IIS_UNICODE_CODEPOINTS
VIOL_EVASION_IIS_BACKSLASHES
VIOL_EVASION_PERCENT_U_DECODING
VIOL_EVASION_BARE_BYTE_DECODING
VIOL_EVASION_BAD_UNESCAPE
VIOL_HTTP_PROTOCOL_BAD_MULTIPART_FORMDATA_REQUEST_PARSING
VIOL_HTTP_PROTOCOL_BODY_IN_GET_OR_HEAD_REQUEST
VIOL_HTTP_PROTOCOL_HIGH_ASCII_CHARACTERS_IN_HEADERS
VIOL_ENCODING
VIOL_COOKIE_MALFORMED
VIOL_GRAPHQL_FORMAT
VIOL_GRAPHQL_MALFORMED
VIOL_GRAPHQL_INTROSPECTION_QUERY.`,
        enum: [
          "VIOL_NONE",
          "VIOL_FILETYPE",
          "VIOL_METHOD",
          "VIOL_MANDATORY_HEADER",
          "VIOL_HTTP_RESPONSE_STATUS",
          "VIOL_REQUEST_MAX_LENGTH",
          "VIOL_FILE_UPLOAD",
          "VIOL_FILE_UPLOAD_IN_BODY",
          "VIOL_XML_MALFORMED",
          "VIOL_JSON_MALFORMED",
          "VIOL_ASM_COOKIE_MODIFIED",
          "VIOL_HTTP_PROTOCOL_MULTIPLE_HOST_HEADERS",
          "VIOL_HTTP_PROTOCOL_BAD_HOST_HEADER_VALUE",
          "VIOL_HTTP_PROTOCOL_UNPARSABLE_REQUEST_CONTENT",
          "VIOL_HTTP_PROTOCOL_NULL_IN_REQUEST",
          "VIOL_HTTP_PROTOCOL_BAD_HTTP_VERSION",
          "VIOL_HTTP_PROTOCOL_CRLF_CHARACTERS_BEFORE_REQUEST_START",
          "VIOL_HTTP_PROTOCOL_NO_HOST_HEADER_IN_HTTP_1_1_REQUEST",
          "VIOL_HTTP_PROTOCOL_BAD_MULTIPART_PARAMETERS_PARSING",
          "VIOL_HTTP_PROTOCOL_SEVERAL_CONTENT_LENGTH_HEADERS",
          "VIOL_HTTP_PROTOCOL_CONTENT_LENGTH_SHOULD_BE_A_POSITIVE_NUMBER",
          "VIOL_EVASION_DIRECTORY_TRAVERSALS",
          "VIOL_MALFORMED_REQUEST",
          "VIOL_EVASION_MULTIPLE_DECODING",
          "VIOL_DATA_GUARD",
          "VIOL_EVASION_APACHE_WHITESPACE",
          "VIOL_COOKIE_MODIFIED",
          "VIOL_EVASION_IIS_UNICODE_CODEPOINTS",
          "VIOL_EVASION_IIS_BACKSLASHES",
          "VIOL_EVASION_PERCENT_U_DECODING",
          "VIOL_EVASION_BARE_BYTE_DECODING",
          "VIOL_EVASION_BAD_UNESCAPE",
          "VIOL_HTTP_PROTOCOL_BAD_MULTIPART_FORMDATA_REQUEST_PARSING",
          "VIOL_HTTP_PROTOCOL_BODY_IN_GET_OR_HEAD_REQUEST",
          "VIOL_HTTP_PROTOCOL_HIGH_ASCII_CHARACTERS_IN_HEADERS",
          "VIOL_ENCODING",
          "VIOL_COOKIE_MALFORMED",
          "VIOL_GRAPHQL_FORMAT",
          "VIOL_GRAPHQL_MALFORMED",
          "VIOL_GRAPHQL_INTROSPECTION_QUERY"
        ],
        title: "App Firewall Violation Type",
        type: "string",
        "x-displayname": "App Firewall Violation Type.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-medium": "List of all supported Violation Types VIOL_NONE VIOL_FILETYPE VIOL_METHOD VIOL_MANDATORY_HEADER VIOL_HTTP_RESPONSE_STATUS VIOL_REQUEST_MAX_LENGTH VIOL_FILE_UPLOAD VIOL_FILE_UPLOAD_IN_BODY VIOL_XML_MALFORMED VIOL_JSON_MALFORMED VIOL_ASM_COOKIE_MODIFIED VIOL_HTTP_PROTOCOL_MULTIPLE_HOST_HEADERS...",
        "x-f5xc-description-short": "List of all supported Violation Types VIOL_NONE VIOL_FILETYPE VIOL_METHOD VIOL_MANDATORY_HEADER VIOL_HTTP_RESPONSE_STATUS VIOL_REQUEST_MAX_LENGTH...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAppFirewallViolationType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallAppFirewallViolationType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.app_firewall.AppFirewallViolationType"
      },
      app_firewallAttackType: {
        default: "ATTACK_TYPE_NONE",
        description: `List of all Attack Types

ATTACK_TYPE_NONE
ATTACK_TYPE_NON_BROWSER_CLIENT
ATTACK_TYPE_OTHER_APPLICATION_ATTACKS
ATTACK_TYPE_TROJAN_BACKDOOR_SPYWARE
ATTACK_TYPE_DETECTION_EVASION
ATTACK_TYPE_VULNERABILITY_SCAN
ATTACK_TYPE_ABUSE_OF_FUNCTIONALITY
ATTACK_TYPE_AUTHENTICATION_AUTHORIZATION_ATTACKS
ATTACK_TYPE_BUFFER_OVERFLOW
ATTACK_TYPE_PREDICTABLE_RESOURCE_LOCATION
ATTACK_TYPE_INFORMATION_LEAKAGE
ATTACK_TYPE_DIRECTORY_INDEXING
ATTACK_TYPE_PATH_TRAVERSAL
ATTACK_TYPE_XPATH_INJECTION
ATTACK_TYPE_LDAP_INJECTION
ATTACK_TYPE_SERVER_SIDE_CODE_INJECTION
ATTACK_TYPE_COMMAND_EXECUTION
ATTACK_TYPE_SQL_INJECTION
ATTACK_TYPE_CROSS_SITE_SCRIPTING
ATTACK_TYPE_DENIAL_OF_SERVICE
ATTACK_TYPE_HTTP_PARSER_ATTACK
ATTACK_TYPE_SESSION_HIJACKING
ATTACK_TYPE_HTTP_RESPONSE_SPLITTING
ATTACK_TYPE_FORCEFUL_BROWSING
ATTACK_TYPE_REMOTE_FILE_INCLUDE
ATTACK_TYPE_MALICIOUS_FILE_UPLOAD
ATTACK_TYPE_GRAPHQL_PARSER_ATTACK.`,
        enum: [
          "ATTACK_TYPE_NONE",
          "ATTACK_TYPE_NON_BROWSER_CLIENT",
          "ATTACK_TYPE_OTHER_APPLICATION_ATTACKS",
          "ATTACK_TYPE_TROJAN_BACKDOOR_SPYWARE",
          "ATTACK_TYPE_DETECTION_EVASION",
          "ATTACK_TYPE_VULNERABILITY_SCAN",
          "ATTACK_TYPE_ABUSE_OF_FUNCTIONALITY",
          "ATTACK_TYPE_AUTHENTICATION_AUTHORIZATION_ATTACKS",
          "ATTACK_TYPE_BUFFER_OVERFLOW",
          "ATTACK_TYPE_PREDICTABLE_RESOURCE_LOCATION",
          "ATTACK_TYPE_INFORMATION_LEAKAGE",
          "ATTACK_TYPE_DIRECTORY_INDEXING",
          "ATTACK_TYPE_PATH_TRAVERSAL",
          "ATTACK_TYPE_XPATH_INJECTION",
          "ATTACK_TYPE_LDAP_INJECTION",
          "ATTACK_TYPE_SERVER_SIDE_CODE_INJECTION",
          "ATTACK_TYPE_COMMAND_EXECUTION",
          "ATTACK_TYPE_SQL_INJECTION",
          "ATTACK_TYPE_CROSS_SITE_SCRIPTING",
          "ATTACK_TYPE_DENIAL_OF_SERVICE",
          "ATTACK_TYPE_HTTP_PARSER_ATTACK",
          "ATTACK_TYPE_SESSION_HIJACKING",
          "ATTACK_TYPE_HTTP_RESPONSE_SPLITTING",
          "ATTACK_TYPE_FORCEFUL_BROWSING",
          "ATTACK_TYPE_REMOTE_FILE_INCLUDE",
          "ATTACK_TYPE_MALICIOUS_FILE_UPLOAD",
          "ATTACK_TYPE_GRAPHQL_PARSER_ATTACK"
        ],
        title: "AttackType",
        type: "string",
        "x-displayname": "Attack Types.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-medium": "List of all Attack Types ATTACK_TYPE_NONE ATTACK_TYPE_NON_BROWSER_CLIENT ATTACK_TYPE_OTHER_APPLICATION_ATTACKS ATTACK_TYPE_TROJAN_BACKDOOR_SPYWARE ATTACK_TYPE_DETECTION_EVASION ATTACK_TYPE_VULNERABILITY_SCAN ATTACK_TYPE_ABUSE_OF_FUNCTIONALITY ATTACK_TYPE_AUTHENTICATION_AUTHORIZATION_ATTACKS...",
        "x-f5xc-description-short": "List of all Attack Types ATTACK_TYPE_NONE ATTACK_TYPE_NON_BROWSER_CLIENT ATTACK_TYPE_OTHER_APPLICATION_ATTACKS ATTACK_TYPE_TROJAN_BACKDOOR_SPYWARE...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAttackType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallAttackType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.app_firewall.AttackType"
      },
      app_firewallAttackTypeSettings: {
        description: "Specifies attack-type settings to be used by WAF.",
        properties: {
          disabled_attack_types: {
            description: "List of Attack Types that will be ignored and not trigger a detection.",
            items: {
              $ref: "#/components/schemas/app_firewallAttackType"
            },
            maxItems: 22,
            title: "Disabled Attack Types",
            type: "array",
            "x-displayname": "Disabled Attack Types.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 22,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of Attack Types that will be ignored and not trigger a detection.",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "22",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "22",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "Attack Type Settings",
        type: "object",
        "x-displayname": "Attack Type Settings.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Specifies attack-type settings to be used by WAF.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallAttackTypeSettings",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "disabled_attack_types": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallAttackTypeSettings
metadata:
  name: example
  namespace: default
spec:
  disabled_attack_types: value`,
          mutually_exclusive_groups: [],
          required_fields: ["disabled_attack_types"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.AttackTypeSettings"
      },
      app_firewallBotAction: {
        default: "BLOCK",
        description: `Action to be performed on the request

Log and block
Log only
Disable detection.`,
        enum: ["BLOCK", "REPORT", "IGNORE"],
        title: "Bot Action",
        type: "string",
        "x-displayname": "Bot Action.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Action to be performed on the request Log and block Log only Disable detection.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallBotAction",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallBotAction
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.app_firewall.BotAction"
      },
      app_firewallBotProtectionSetting: {
        description: "Configuration of WAF Bot Protection.",
        properties: {
          good_bot_action: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallBotAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          malicious_bot_action: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallBotAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          suspicious_bot_action: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallBotAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "BotProtectionSetting",
        type: "object",
        "x-displayname": "Bot Protection.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallBotProtectionSetting",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallBotProtectionSetting
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.BotProtectionSetting"
      },
      app_firewallCreateRequest: {
        description: "This is the input message of the 'Create' RPC.",
        properties: {
          metadata: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaObjectCreateMetaType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            }
          },
          spec: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallCreateSpecType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "CreateRequest is used to create an instance of app_firewall",
        type: "object",
        "x-displayname": "Create Request.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-minimum-configuration": {
          description: "Web Application Firewall (WAF) policy for protecting HTTP applications",
          example_json: `{
  "metadata": {
    "name": "default-waf",
    "namespace": "default"
  },
  "spec": {
    "blocking": {}
  }
}
`,
          example_yaml: `apiVersion: v1
kind: app_firewall
metadata:
  name: default-waf
  namespace: default
spec:
  blocking: {}
`,
          mutually_exclusive_groups: [
            {
              fields: ["spec.monitoring", "spec.blocking"],
              name: "enforcement_mode_choice",
              reason: "Server default is monitoring (no blocking). Use blocking: {} for production WAF protection."
            },
            {
              fields: ["spec.default_detection_settings", "spec.detection_settings"],
              name: "detection_setting_choice",
              reason: "Server applies default_detection_settings: {} when omitted"
            },
            {
              fields: ["spec.allow_all_response_codes", "spec.allowed_response_codes"],
              name: "allowed_response_codes_choice",
              reason: "Server applies allow_all_response_codes: {} when omitted"
            },
            {
              fields: ["spec.default_bot_setting", "spec.bot_protection_setting"],
              name: "bot_protection_choice",
              reason: "Server applies default_bot_setting: {} when omitted"
            },
            {
              fields: ["spec.default_anonymization", "spec.custom_anonymization", "spec.disable_anonymization"],
              name: "anonymization_setting",
              reason: "Server applies default_anonymization: {} when omitted"
            },
            {
              fields: ["spec.use_default_blocking_page", "spec.blocking_page"],
              name: "blocking_page_choice",
              reason: "Server applies use_default_blocking_page: {} when omitted"
            },
            {
              fields: ["spec.disable_ai_enhancements", "spec.enable_ai_enhancements"],
              name: "enhance_with_ai_choice",
              reason: "Server applies disable_ai_enhancements: {} when omitted"
            }
          ],
          required_fields: ["metadata.name", "metadata.namespace"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.CreateRequest"
      },
      app_firewallCreateSpecType: {
        description: "Create Application Firewall.",
        properties: {
          allow_all_response_codes: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for allow all response codes.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          allowed_response_codes: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAllowedResponseCodes"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for allowed response codes.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          blocking: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          blocking_page: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallCustomBlockingPage"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          bot_protection_setting: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallBotProtectionSetting"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for bot protection setting.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          custom_anonymization: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAnonymizationSetting"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for custom anonymization.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_anonymization: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for default anonymization.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_bot_setting: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for default bot setting.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_detection_settings: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for default detection settings.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          detection_settings: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallDetectionSetting"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for detection settings.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          disable_ai_enhancements: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for disable ai enhancements.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          disable_anonymization: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for disable anonymization.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          enable_ai_enhancements: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAIEnhancementsConfig"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for enable ai enhancements.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          monitoring: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          use_default_blocking_page: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Create Application Firewall",
        type: "object",
        "x-displayname": "Create Application Firewall.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-minimum-configuration": {
          description: "Web Application Firewall (WAF) policy for protecting HTTP applications",
          example_json: `{
  "metadata": {
    "name": "default-waf",
    "namespace": "default"
  },
  "spec": {
    "blocking": {}
  }
}
`,
          example_yaml: `apiVersion: v1
kind: app_firewall
metadata:
  name: default-waf
  namespace: default
spec:
  blocking: {}
`,
          mutually_exclusive_groups: [
            {
              fields: ["spec.monitoring", "spec.blocking"],
              name: "enforcement_mode_choice",
              reason: "Server default is monitoring (no blocking). Use blocking: {} for production WAF protection."
            },
            {
              fields: ["spec.default_detection_settings", "spec.detection_settings"],
              name: "detection_setting_choice",
              reason: "Server applies default_detection_settings: {} when omitted"
            },
            {
              fields: ["spec.allow_all_response_codes", "spec.allowed_response_codes"],
              name: "allowed_response_codes_choice",
              reason: "Server applies allow_all_response_codes: {} when omitted"
            },
            {
              fields: ["spec.default_bot_setting", "spec.bot_protection_setting"],
              name: "bot_protection_choice",
              reason: "Server applies default_bot_setting: {} when omitted"
            },
            {
              fields: ["spec.default_anonymization", "spec.custom_anonymization", "spec.disable_anonymization"],
              name: "anonymization_setting",
              reason: "Server applies default_anonymization: {} when omitted"
            },
            {
              fields: ["spec.use_default_blocking_page", "spec.blocking_page"],
              name: "blocking_page_choice",
              reason: "Server applies use_default_blocking_page: {} when omitted"
            },
            {
              fields: ["spec.disable_ai_enhancements", "spec.enable_ai_enhancements"],
              name: "enhance_with_ai_choice",
              reason: "Server applies disable_ai_enhancements: {} when omitted"
            }
          ],
          required_fields: ["metadata.name", "metadata.namespace"]
        },
        "x-ves-oneof-field-allowed_response_codes_choice": '["allow_all_response_codes","allowed_response_codes"]',
        "x-ves-oneof-field-anonymization_setting": '["custom_anonymization","default_anonymization","disable_anonymization"]',
        "x-ves-oneof-field-blocking_page_choice": '["blocking_page","use_default_blocking_page"]',
        "x-ves-oneof-field-bot_protection_choice": '["bot_protection_setting","default_bot_setting"]',
        "x-ves-oneof-field-detection_setting_choice": '["default_detection_settings","detection_settings"]',
        "x-ves-oneof-field-enforcement_mode_choice": '["blocking","monitoring"]',
        "x-ves-oneof-field-enhance_with_ai_choice": '["disable_ai_enhancements","enable_ai_enhancements"]',
        "x-ves-proto-message": "ves.io.schema.app_firewall.CreateSpecType"
      },
      app_firewallCustomBlockingPage: {
        description: "Custom blocking response page body.",
        properties: {
          blocking_page: {
            description: `Define the content of the response page (e.g., an HTML document or a JSON object), use the
{{request_id}} placeholder to provide users with a unique
identifier to be able to trace the blocked request in the logs.
The maximum allowed size of response body is 4096 bytes after base64 encoding,
which would be about 3070 bytes in plain text.`,
            maxLength: 4096,
            title: "blocking_page",
            type: "string",
            "x-displayname": "Blocking Response Page Body.",
            "x-f5xc-constraints": {
              category: "content",
              constraintType: "string",
              deterministic: true,
              format: "uri",
              maxLength: 4096,
              metadata: {
                category: "content",
                confidence: 0.99,
                note: "Must be a valid URI (uri_ref). API rejects inline HTML despite the description example.",
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Define the content of the response page (e.g., an HTML document or a JSON object), use the {{request_id}} placeholder to provide users with a unique identifier to be able to trace the blocked request in the logs. The maximum allowed size of response body is 4096 bytes after base64 encoding...",
            "x-f5xc-description-short": "Define the content of the response page (e.g., an HTML document or a JSON object), use the {{request_id}} placeholder to provide users with a...",
            "x-f5xc-example": '"<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Please consult with your administrator.<br/><br/>Your support ID is{{request_id}}<br/><br/><a href=\\"javascript:history.back()\\">[Go Back]</a></body></html>"',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_len": "4096",
              "ves.io.schema.rules.string.uri_ref": "true"
            },
            "x-ves-example": "<HTML><HEAD><title>Request Rejected</title></HEAD><body>The requested URL was rejected. Please consult with your administrator.<br/><br/>Your support ID is: {{request_id}}<br/><br/><a href=\\\"javascript:history.back()\\\">[Go Back]</a></body></HTML>",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_len": "4096",
              "ves.io.schema.rules.string.uri_ref": "true"
            }
          },
          response_code: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaHttpStatusCode"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for response code.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Custom Blocking Page",
        type: "object",
        "x-displayname": "Custom Blocking Response Page.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallCustomBlockingPage",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallCustomBlockingPage
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-displayorder": "2,1",
        "x-ves-proto-message": "ves.io.schema.app_firewall.CustomBlockingPage"
      },
      app_firewallDetectionSetting: {
        description: "Specifies detection settings to be used by WAF.",
        properties: {
          bot_protection_setting: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallBotProtectionSetting"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for bot protection setting.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_bot_setting: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for default bot setting.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_violation_settings: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for default violation settings.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          disable_staging: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          disable_suppression: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for disable suppression.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          disable_threat_campaigns: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          enable_suppression: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for enable suppression.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          enable_threat_campaigns: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          signature_selection_setting: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallSignatureSelectionSetting"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for signature selection setting.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          stage_new_and_updated_signatures: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallSignaturesStagingSettings"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          stage_new_signatures: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallSignaturesStagingSettings"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          violation_settings: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallViolationSettings"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for violation settings.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          violations_view: {
            description: "List of violation checks that are performed on HTTP request to ensure the requests are properly formatted, detection of evasion techniques and other violations.",
            items: {
              $ref: "#/components/schemas/app_firewallViolationConfigView"
            },
            title: "Violations configuration settings for view only",
            type: "array",
            "x-displayname": "Violations.",
            "x-f5xc-description-medium": "List of violation checks that are performed on HTTP request to ensure the requests are properly formatted, detection of evasion techniques and other violations.",
            "x-f5xc-description-short": "List of violation checks that are performed on HTTP request to ensure the requests are properly formatted, detection of evasion techniques and...",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            }
          }
        },
        title: "Detection Settings",
        type: "object",
        "x-displayname": "Detection Settings.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Specifies detection settings to be used by WAF.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallDetectionSetting",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "violations_view": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallDetectionSetting
metadata:
  name: example
  namespace: default
spec:
  violations_view: value`,
          mutually_exclusive_groups: [],
          required_fields: ["violations_view"]
        },
        "x-ves-displayorder": "1,2,12,5,8,16",
        "x-ves-oneof-field-bot_protection_choice": '["bot_protection_setting","default_bot_setting"]',
        "x-ves-oneof-field-false_positive_suppression": '["disable_suppression","enable_suppression"]',
        "x-ves-oneof-field-signatures_staging_settings": '["disable_staging","stage_new_and_updated_signatures","stage_new_signatures"]',
        "x-ves-oneof-field-threat_campaign_choice": '["disable_threat_campaigns","enable_threat_campaigns"]',
        "x-ves-oneof-field-violation_detection_setting": '["default_violation_settings","violation_settings"]',
        "x-ves-proto-message": "ves.io.schema.app_firewall.DetectionSetting"
      },
      app_firewallSignatureSelectionSetting: {
        description: "Attack Signatures are patterns that identify attacks on a web application and its components.",
        properties: {
          attack_type_settings: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAttackTypeSettings"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for attack type settings.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_attack_type_settings: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for default attack type settings.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          high_medium_accuracy_signatures: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for high medium accuracy signatures.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          high_medium_low_accuracy_signatures: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for high medium low accuracy signatures.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          only_high_accuracy_signatures: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for only high accuracy signatures.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Attack Signatures",
        type: "object",
        "x-displayname": "Attack Signatures.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Attack Signatures are patterns that identify attacks on a web application and its components.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallSignatureSelectionSetting",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallSignatureSelectionSetting
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-displayorder": "5,1",
        "x-ves-oneof-field-attack_type_setting": '["attack_type_settings","default_attack_type_settings"]',
        "x-ves-oneof-field-signature_selection_by_accuracy": '["high_medium_accuracy_signatures","high_medium_low_accuracy_signatures","only_high_accuracy_signatures"]',
        "x-ves-proto-message": "ves.io.schema.app_firewall.SignatureSelectionSetting"
      },
      app_firewallSignaturesStagingSettings: {
        description: "Attack Signatures staging configuration.",
        properties: {
          staging_period: {
            description: `Define staging period in days. The default staging period is 7 days and the max supported staging period is
20 days.`,
            format: "int64",
            title: "Staging Period",
            type: "integer",
            "x-displayname": "Staging Period.",
            "x-f5xc-constraints": {
              category: "timing",
              constraintType: "number",
              deterministic: true,
              maximum: 20,
              metadata: {
                category: "timing",
                confidence: 0.99,
                note: "Staging period in days. Default 7, max 20. Applies to both stage_new_and_updated_signatures and stage_new_signatures.",
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-medium": "Define staging period in days. The default staging period is 7 days and the max supported staging period is 20 days.",
            "x-f5xc-description-short": "Define staging period in days. The default staging period is 7 days and the max supported staging period is 20 days.",
            "x-f5xc-example": "7",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "20"
            },
            "x-ves-example": "7",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "20"
            }
          }
        },
        title: "Attack Signatures Staging Settings",
        type: "object",
        "x-displayname": "Attack Signatures Staging Settings.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Attack Signatures staging configuration.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallSignaturesStagingSettings",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "staging_period": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallSignaturesStagingSettings
metadata:
  name: example
  namespace: default
spec:
  staging_period: value`,
          mutually_exclusive_groups: [],
          required_fields: ["staging_period"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.SignaturesStagingSettings"
      },
      app_firewallViolationConfigView: {
        description: "Custom configuration for a violation.",
        properties: {
          description: {
            description: "Human-readable description text",
            title: "description",
            type: "string",
            "x-displayname": "Description.",
            "x-f5xc-constraints": {
              category: "content",
              characterSet: {
                description: "Free text with UTF-8 support"
              },
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.8,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 0
            },
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          enabled: {
            description: "Enable or disable the feature",
            format: "boolean",
            title: "user customised state",
            type: "boolean",
            "x-displayname": "State",
            "x-f5xc-example": "True",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          enabled_by_default: {
            description: "Violations that are enabled by default by F5 are advisable to leave enabled.",
            title: "enabled_by_default",
            type: "string",
            "x-displayname": "Enabled by Default.",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-short": "Violations that are enabled by default by F5 are advisable to leave enabled.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          name: {
            description: "Human-readable name for the resource",
            title: "code",
            type: "string",
            "x-displayname": "Name",
            "x-f5xc-constraints": {
              category: "naming",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          title: {
            description: "Human-readable title for the resource",
            title: "name",
            type: "string",
            "x-displayname": "Title",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          }
        },
        title: "Violation Config will be used by UI for view only",
        type: "object",
        "x-displayname": "Violation Configuration.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallViolationConfigView",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for app_firewallViolationConfigView
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.ViolationConfigView"
      },
      app_firewallViolationSettings: {
        description: "Specifies violation settings to be used by WAF.",
        properties: {
          disabled_violation_types: {
            description: "List of violations to be excluded.",
            items: {
              $ref: "#/components/schemas/app_firewallAppFirewallViolationType"
            },
            maxItems: 40,
            title: "Disabled Violations",
            type: "array",
            "x-displayname": "Disabled Violations.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 40,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "40",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "40",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "Violation Settings",
        type: "object",
        "x-displayname": "Violation Settings.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-short": "Specifies violation settings to be used by WAF.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for app_firewallViolationSettings",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "disabled_violation_types": "value"
  }
}`,
          example_yaml: `# Minimal example for app_firewallViolationSettings
metadata:
  name: example
  namespace: default
spec:
  disabled_violation_types: value`,
          mutually_exclusive_groups: [],
          required_fields: ["disabled_violation_types"]
        },
        "x-ves-proto-message": "ves.io.schema.app_firewall.ViolationSettings"
      },
      ioschemaEmpty: {
        description: "This can be used for messages where no values are needed.",
        title: "Empty",
        type: "object",
        "x-displayname": "Empty",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for ioschemaEmpty",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for ioschemaEmpty
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.Empty"
      },
      ioschemaObjectRefType: {
        description: `This type establishes a 'direct reference' from one object(the referrer) to another(the referred).
Such a reference is in form of tenant/namespace/name for public API and Uid for private API
This type of reference is called direct because the relation is explicit and concrete (as opposed
to selector reference which builds a group based on labels of selectee objects)`,
        properties: {
          kind: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then kind will hold the referred object's kind (e.g. "route")`,
            readOnly: true,
            title: "kind",
            type: "string",
            "x-displayname": "Kind",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": `When a configuration object(e.g. Virtual_host) refers to another(e.g route) then kind will hold the referred object's kind (e.g. "route").`,
            "x-f5xc-description-short": `When a configuration object(e.g. Virtual_host) refers to another(e.g route) then kind will hold the referred object's kind (e.g. "route")`,
            "x-f5xc-example": "virtual_site",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-ves-example": "Virtual_site."
          },
          name: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then name will hold the referred object's(e.g. Route's) name.`,
            title: "name",
            type: "string",
            "x-displayname": "Name",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then name will hold the referred object's(e.g. Route's) name.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then name will hold the referred object's(e.g.",
            "x-f5xc-example": "contactus-route",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-ves-example": "Contactus-route."
          },
          namespace: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then namespace will hold the referred object's(e.g. Route's) namespace.`,
            title: "namespace",
            type: "string",
            "x-displayname": "Namespace",
            "x-f5xc-constraints": {
              category: "naming",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then namespace will hold the referred object's(e.g. Route's) namespace.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then namespace will hold the referred object's(e.g.",
            "x-f5xc-example": "ns1",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-ves-example": "Ns1"
          },
          tenant: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then tenant will hold the referred object's(e.g. Route's) tenant.`,
            readOnly: true,
            title: "tenant",
            type: "string",
            "x-displayname": "Tenant",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then tenant will hold the referred object's(e.g. Route's) tenant.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then tenant will hold the referred object's(e.g.",
            "x-f5xc-example": "example-corp",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-field-mutability": "read-only",
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-ves-example": "Example-corp."
          },
          uid: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then uid will hold the referred object's(e.g. Route's) uid.`,
            format: "uuid",
            readOnly: true,
            title: "uid",
            type: "string",
            "x-displayname": "UID",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then uid will hold the referred object's(e.g. Route's) uid.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then uid will hold the referred object's(e.g.",
            "x-f5xc-example": "00000000-0000-4000-8000-0df41b679859",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-field-mutability": "read-only",
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-ves-example": "00000000-0000-4000-8000-0df41b679859."
          }
        },
        title: "ObjectRefType",
        type: "object",
        "x-displayname": "Object reference.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Type establishes a 'direct reference' from one object(the referrer) to another(the referred). Such a reference is in form of tenant/namespace/name for public API and Uid for private API This type of reference is called direct because the relation is explicit and concrete (as opposed to selector...",
        "x-f5xc-description-short": "Type establishes a 'direct reference' from one object(the referrer) to another(the referred).",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for ioschemaObjectRefType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for ioschemaObjectRefType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.ObjectRefType"
      },
      ip_prefix_setCreateRequest: {
        description: "This is the input message of the 'Create' RPC.",
        properties: {
          metadata: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaObjectCreateMetaType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          spec: {
            allOf: [
              {
                $ref: "#/components/schemas/ip_prefix_setCreateSpecType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "CreateRequest is used to create an instance of ip_prefix_set",
        type: "object",
        "x-displayname": "Create Request.",
        "x-f5xc-cli-domain": "network",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for ip_prefix_setCreateRequest",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for ip_prefix_setCreateRequest
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.ip_prefix_set.CreateRequest"
      },
      ip_prefix_setCreateSpecType: {
        description: "Create ip_prefix_set creates a new object in the storage backend for metadata.namespace.",
        properties: {
          ipv4_prefixes: {
            description: "List of IPv4 prefixes with description.",
            items: {
              $ref: "#/components/schemas/ip_prefix_setIpv4Prefix"
            },
            maxItems: 1024,
            type: "array",
            "x-displayname": "IPv4 Prefixes.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 1024,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "1024",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "1024",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "Create ip prefix set",
        type: "object",
        "x-displayname": "Create IP Prefix Set.",
        "x-f5xc-cli-domain": "network",
        "x-f5xc-description-short": "Create ip_prefix_set creates a new object in the storage backend for metadata.namespace.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for ip_prefix_setCreateSpecType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for ip_prefix_setCreateSpecType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.ip_prefix_set.CreateSpecType"
      },
      ip_prefix_setIpv4Prefix: {
        description: "IPv4 Prefix with Description.",
        properties: {
          description: {
            description: "Human-readable description text",
            maxLength: 64,
            title: "description",
            type: "string",
            "x-displayname": "Description.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 64
              },
              category: "discovery",
              characterSet: {
                description: "Free text with UTF-8 support"
              },
              constraintType: "string",
              deterministic: true,
              maxLength: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 0
            },
            "x-f5xc-example": "blocked ip",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "64"
            },
            "x-ves-example": "Blocked IP.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "64"
            }
          },
          ipv4_prefix: {
            description: "IP address configuration",
            title: "ipv4 prefix",
            type: "string",
            "x-displayname": "IPv4 Prefix.",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-example": "192.0.2.146/22",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.ipv4_prefix": "true",
              "ves.io.schema.rules.string.not_empty": "true"
            },
            "x-ves-example": "192.0.2.146/22.",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.ipv4_prefix": "true",
              "ves.io.schema.rules.string.not_empty": "true"
            }
          }
        },
        title: "IPv4Prefix",
        type: "object",
        "x-displayname": "IPv4 Prefix with Description.",
        "x-f5xc-cli-domain": "network",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for ip_prefix_setIpv4Prefix",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "ipv4_prefix": "value"
  }
}`,
          example_yaml: `# Minimal example for ip_prefix_setIpv4Prefix
metadata:
  name: example
  namespace: default
spec:
  ipv4_prefix: value`,
          mutually_exclusive_groups: [],
          required_fields: ["ipv4_prefix"]
        },
        "x-ves-proto-message": "ves.io.schema.ip_prefix_set.Ipv4Prefix"
      },
      policyAppFirewallAttackTypeContext: {
        description: "App Firewall Attack Type context changes to be applied for this request.",
        properties: {
          context: {
            allOf: [
              {
                $ref: "#/components/schemas/policyDetectionContext"
              }
            ],
            description: "Exclusion scope. Use CONTEXT_PARAMETER with context_name for one parameter, CONTEXT_COOKIE for one cookie, or CONTEXT_ANY only for an intentionally global scope.",
            "x-f5xc-description-medium": "Exclusion scope. Use CONTEXT_PARAMETER with context_name for one parameter, CONTEXT_COOKIE for one cookie, or CONTEXT_ANY only for an intentionally global scope.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          context_name: {
            description: "Parameter, cookie, or header name selected by context. For a parameter-scoped WAF exception, set context to CONTEXT_PARAMETER and name only the intended parameter.",
            maxLength: 128,
            title: "Context Name",
            type: "string",
            "x-displayname": "Context Name.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 128,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Parameter, cookie, or header name selected by context. For a parameter-scoped WAF exception, set context to CONTEXT_PARAMETER and name only the intended parameter.",
            "x-f5xc-description-short": "Parameter, cookie, or header name selected by context.",
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-ves-example": "Example: user-agent for Header.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_len": "128"
            }
          },
          exclude_attack_type: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAttackType"
              }
            ],
            description: "Attack-type enum excluded in this context, for example ATTACK_TYPE_CROSS_SITE_SCRIPTING. Other attack types remain enforced.",
            "x-f5xc-description-medium": "Attack-type enum excluded in this context, for example ATTACK_TYPE_CROSS_SITE_SCRIPTING. Other attack types remain enforced.",
            "x-f5xc-description-short": "Attack-type enum excluded in this context, for example ATTACK_TYPE_CROSS_SITE_SCRIPTING.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "App Firewall Attack Type Context",
        type: "object",
        "x-displayname": "App Firewall Attack Type Context.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "App Firewall Attack Type context changes to be applied for this request.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyAppFirewallAttackTypeContext",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyAppFirewallAttackTypeContext
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.AppFirewallAttackTypeContext"
      },
      policyAppFirewallDetectionControl: {
        description: "Define the list of Signature IDs, Violations, Attack Types and Bot Names that should be excluded from triggering on the defined match criteria.",
        properties: {
          exclude_attack_type_contexts: {
            description: "Exclude an entire attack type only in the named context. For migrated per-parameter exceptions, prefer this over signature-ID exclusions because one payload can trigger several signatures; unrelated parameters and attack types remain protected.",
            items: {
              $ref: "#/components/schemas/policyAppFirewallAttackTypeContext"
            },
            maxItems: 64,
            title: "Exclude Attack Types Contexts",
            type: "array",
            "x-displayname": "Attack Types.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-medium": "Exclude an entire attack type only in the named context. For migrated per-parameter exceptions, prefer this over signature-ID exclusions because one payload can trigger several signatures; unrelated parameters and attack types remain protected.",
            "x-f5xc-description-short": "Exclude an entire attack type only in the named context.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          exclude_bot_name_contexts: {
            description: "Bot Names to be excluded for the defined match criteria.",
            items: {
              $ref: "#/components/schemas/policyBotNameContext"
            },
            maxItems: 64,
            title: "Exclude Bot Names Contexts",
            type: "array",
            "x-displayname": "Bot Names",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "Bot Names to be excluded for the defined match criteria.",
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          exclude_signature_contexts: {
            description: "Signature IDs to be excluded for the defined match criteria.",
            items: {
              $ref: "#/components/schemas/policyAppFirewallSignatureContext"
            },
            maxItems: 1024,
            title: "Exclude Signature Contexts",
            type: "array",
            "x-displayname": "Signature IDs.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 1024,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "Signature IDs to be excluded for the defined match criteria.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "1024",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "1024",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          exclude_violation_contexts: {
            description: "Violations to be excluded for the defined match criteria.",
            items: {
              $ref: "#/components/schemas/policyAppFirewallViolationContext"
            },
            maxItems: 64,
            title: "Exclude Violation Contexts",
            type: "array",
            "x-displayname": "Violations.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "Violations to be excluded for the defined match criteria.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "App Firewall Detection Control",
        type: "object",
        "x-displayname": "App Firewall Detection Control.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Define the list of Signature IDs, Violations, Attack Types and Bot Names that should be excluded from triggering on the defined match criteria.",
        "x-f5xc-description-short": "Define the list of Signature IDs, Violations, Attack Types and Bot Names that should be excluded from triggering on the defined match criteria.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyAppFirewallDetectionControl",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyAppFirewallDetectionControl
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.AppFirewallDetectionControl"
      },
      policyAppFirewallSignatureContext: {
        description: "App Firewall signature context changes to be applied for this request.",
        properties: {
          context: {
            allOf: [
              {
                $ref: "#/components/schemas/policyDetectionContext"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          context_name: {
            description: `Relevant only for contexts: Header, Cookie and Parameter.
Name of the Context that the WAF Exclusion Rules will check.
Wildcard matching can be used by prefixing or suffixing the context name
with an wildcard asterisk (*).`,
            maxLength: 128,
            title: "Context Name",
            type: "string",
            "x-displayname": "Context Name.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 128,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Relevant only for contexts: Header, Cookie and Parameter. Name of the Context that the WAF Exclusion Rules will check. Wildcard matching can be used by prefixing or suffixing the context name with an wildcard asterisk (*).",
            "x-f5xc-description-short": "Relevant only for contexts: Header, Cookie and Parameter. Name of the Context that the WAF Exclusion Rules will check.",
            "x-f5xc-example": "exampleuser-agent for Header",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_len": "128"
            },
            "x-ves-example": "Example: user-agent for Header.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_len": "128"
            }
          },
          signature_id: {
            description: `The allowed values for signature ID are 0 and in the range of 200000001-299999999.
0 implies that all signatures will be excluded for the specified context.`,
            format: "int64",
            title: "SignatureID",
            type: "integer",
            "x-displayname": "SignatureID.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 299999999,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 0
            },
            "x-f5xc-description-medium": "The allowed values for signature ID are 0 and in the range of 200000001-299999999. 0 implies that all signatures will be excluded for the specified context.",
            "x-f5xc-description-short": "The allowed values for signature ID are 0 and in the range of 200000001-299999999. 0 implies that all signatures will be excluded for the...",
            "x-f5xc-example": "10000001",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-field-mutability": "read-only",
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.uint32.gte": "0",
              "ves.io.schema.rules.uint32.lte": "299999999"
            },
            "x-ves-example": "10000001",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.uint32.gte": "0",
              "ves.io.schema.rules.uint32.lte": "299999999"
            }
          }
        },
        title: "App Firewall Signature Context",
        type: "object",
        "x-displayname": "App Firewall Signature Context.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "App Firewall signature context changes to be applied for this request.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyAppFirewallSignatureContext",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "signature_id": "value"
  }
}`,
          example_yaml: `# Minimal example for policyAppFirewallSignatureContext
metadata:
  name: example
  namespace: default
spec:
  signature_id: value`,
          mutually_exclusive_groups: [],
          required_fields: ["signature_id"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.AppFirewallSignatureContext"
      },
      policyAppFirewallViolationContext: {
        description: "App Firewall violation context changes to be applied for this request.",
        properties: {
          context: {
            allOf: [
              {
                $ref: "#/components/schemas/policyDetectionContext"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          context_name: {
            description: `Relevant only for contexts: Header, Cookie and Parameter.
Name of the Context that the WAF Exclusion Rules will check.
Wildcard matching can be used by prefixing or suffixing the context name
with an wildcard asterisk (*).`,
            maxLength: 128,
            title: "Context Name",
            type: "string",
            "x-displayname": "Context Name.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 128,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Relevant only for contexts: Header, Cookie and Parameter. Name of the Context that the WAF Exclusion Rules will check. Wildcard matching can be used by prefixing or suffixing the context name with an wildcard asterisk (*).",
            "x-f5xc-description-short": "Relevant only for contexts: Header, Cookie and Parameter. Name of the Context that the WAF Exclusion Rules will check.",
            "x-f5xc-example": "exampleuser-agent for Header",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_len": "128"
            },
            "x-ves-example": "Example: user-agent for Header.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_len": "128"
            }
          },
          exclude_violation: {
            allOf: [
              {
                $ref: "#/components/schemas/app_firewallAppFirewallViolationType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for exclude violation.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "App Firewall Violation Context",
        type: "object",
        "x-displayname": "App Firewall Violation Context.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "App Firewall violation context changes to be applied for this request.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyAppFirewallViolationContext",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyAppFirewallViolationContext
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.AppFirewallViolationContext"
      },
      policyArgMatcherType: {
        description: `A argument matcher specifies the name of a single argument in the body and the criteria to match it.
A argument matcher can check for one of the following:
* Presence or absence of the argument
* At least one of the values for the argument in the request satisfies the MatcherType item.`,
        properties: {
          check_not_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check not present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          check_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          invert_matcher: {
            description: "Invert Match of the expression defined.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          item: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          name: {
            description: "A case-sensitive JSON path in the HTTP request body.",
            maxLength: 256,
            title: "name",
            type: "string",
            "x-displayname": "Argument Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-description-short": "Case-sensitive JSON path in the HTTP request body.",
            "x-f5xc-example": "name",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.json_path": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "Name",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.json_path": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          }
        },
        title: "ArgMatcherType",
        type: "object",
        "x-displayname": "Argument Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Argument matcher specifies the name of a single argument in the body and the criteria to match it. A argument matcher can check for one of the following: * Presence or absence of the argument * At least one of the values for the argument in the request satisfies the MatcherType item.",
        "x-f5xc-description-short": "Argument matcher specifies the name of a single argument in the body and the criteria to match it.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyArgMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for policyArgMatcherType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-displayorder": "1,6,4",
        "x-ves-oneof-field-match": '["check_not_present","check_present","item"]',
        "x-ves-proto-message": "ves.io.schema.policy.ArgMatcherType"
      },
      policyAsnMatchList: {
        description: "An unordered set of RFC 6793 defined 4-byte AS numbers that can be used to create allow or deny lists for use in network policy or service policy. It can be used to create the allow list only for DNS Load Balancer.",
        properties: {
          as_numbers: {
            description: "An unordered set of RFC 6793 defined 4-byte AS numbers that can be used to create allow or deny lists for use in network policy or service policy. It can be used to create the allow list only for DNS Load Balancer.",
            items: {
              format: "int64",
              type: "integer"
            },
            maxItems: 16,
            minItems: 1,
            title: "as numbers",
            type: "array",
            "x-displayname": "AS Numbers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minItems: 1,
              uniqueItems: true
            },
            "x-f5xc-description-medium": "Unordered set of RFC 6793 defined 4-byte AS numbers that can be used to create allow or deny lists for use in network policy or service policy. It can be used to create the allow list only for DNS Load Balancer.",
            "x-f5xc-description-short": "Unordered set of RFC 6793 defined 4-byte AS numbers that can be used to create allow or deny lists for use in network policy or service policy.",
            "x-f5xc-example": "[713, 7932, 847325, 4683, 15269, 1000001]",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.min_items": "1",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "[713, 7932, 847325, 4683, 15269, 1000001]",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.min_items": "1",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "Asn Match List",
        type: "object",
        "x-displayname": "ASN Match List.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Unordered set of RFC 6793 defined 4-byte AS numbers that can be used to create allow or deny lists for use in network policy or service policy. It can be used to create the allow list only for DNS Load Balancer.",
        "x-f5xc-description-short": "Unordered set of RFC 6793 defined 4-byte AS numbers that can be used to create allow or deny lists for use in network policy or service policy.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyAsnMatchList",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "as_numbers": "value"
  }
}`,
          example_yaml: `# Minimal example for policyAsnMatchList
metadata:
  name: example
  namespace: default
spec:
  as_numbers: value`,
          mutually_exclusive_groups: [],
          required_fields: ["as_numbers"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.AsnMatchList"
      },
      policyAsnMatcherType: {
        description: "Match any AS number contained in the list of bgp_asn_sets.",
        properties: {
          asn_sets: {
            description: "A list of references to bgp_asn_set objects.",
            items: {
              $ref: "#/components/schemas/ioschemaObjectRefType"
            },
            maxItems: 4,
            title: "asn_sets",
            type: "array",
            "x-displayname": "BGP ASN Sets.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 4,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-short": "List of references to bgp_asn_set objects.",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "4"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "4"
            }
          }
        },
        title: "asn matcher type",
        type: "object",
        "x-displayname": "ASN Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "Match any AS number contained in the list of bgp_asn_sets.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyAsnMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "asn_sets": "value"
  }
}`,
          example_yaml: `# Minimal example for policyAsnMatcherType
metadata:
  name: example
  namespace: default
spec:
  asn_sets: value`,
          mutually_exclusive_groups: [],
          required_fields: ["asn_sets"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.AsnMatcherType"
      },
      policyBotNameContext: {
        description: "Specifies bot to be excluded by its name.",
        properties: {
          bot_name: {
            description: "Human-readable name for the resource",
            title: "BotName",
            type: "string",
            "x-displayname": "Bot Name",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-example": "Hydra",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            },
            "x-ves-example": "Hydra",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            }
          }
        },
        title: "Bot Name Context",
        type: "object",
        "x-displayname": "Bot Name",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "Specifies bot to be excluded by its name.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyBotNameContext",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "bot_name": "value"
  }
}`,
          example_yaml: `# Minimal example for policyBotNameContext
metadata:
  name: example
  namespace: default
spec:
  bot_name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["bot_name"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.BotNameContext"
      },
      policyCookieMatcherType__ves_io_schema_views_cdn_loadbalancer: {
        description: `A cookie matcher specifies the name of a single cookie and the criteria to match it. The input has a list of values for each
cookie in the request.
A cookie matcher can check for one of the following:
* Presence or absence of the cookie
* At least one of the values for the cookie in the request satisfies the MatcherType item.`,
        properties: {
          check_not_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check not present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          check_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          invert_matcher: {
            description: "Invert Match of the expression defined.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          item: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          name: {
            description: "A case-sensitive cookie name.",
            maxLength: 256,
            title: "name",
            type: "string",
            "x-displayname": "Cookie Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-example": "Session",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "Session",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          }
        },
        title: "CookieMatcherType",
        type: "object",
        "x-displayname": "Cookie Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Cookie matcher specifies the name of a single cookie and the criteria to match it. The input has a list of values for each cookie in the request. A cookie matcher can check for one of the following: * Presence or absence of the cookie * At least one of the values for the cookie in the request...",
        "x-f5xc-description-short": "Cookie matcher specifies the name of a single cookie and the criteria to match it.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyCookieMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for policyCookieMatcherType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-displayorder": "1,6,4",
        "x-ves-oneof-field-match": '["check_not_present","check_present","item"]',
        "x-ves-proto-message": "ves.io.schema.policy.CookieMatcherType"
      },
      policyCountryCode: {
        default: "COUNTRY_NONE",
        description: "ISO 3166 Aplpha-2 country codes.",
        enum: [
          "COUNTRY_NONE",
          "COUNTRY_AD",
          "COUNTRY_AE",
          "COUNTRY_AF",
          "COUNTRY_AG",
          "COUNTRY_AI",
          "COUNTRY_AL",
          "COUNTRY_AM",
          "COUNTRY_AN",
          "COUNTRY_AO",
          "COUNTRY_AQ",
          "COUNTRY_AR",
          "COUNTRY_AS",
          "COUNTRY_AT",
          "COUNTRY_AU",
          "COUNTRY_AW",
          "COUNTRY_AX",
          "COUNTRY_AZ",
          "COUNTRY_BA",
          "COUNTRY_BB",
          "COUNTRY_BD",
          "COUNTRY_BE",
          "COUNTRY_BF",
          "COUNTRY_BG",
          "COUNTRY_BH",
          "COUNTRY_BI",
          "COUNTRY_BJ",
          "COUNTRY_BL",
          "COUNTRY_BM",
          "COUNTRY_BN",
          "COUNTRY_BO",
          "COUNTRY_BQ",
          "COUNTRY_BR",
          "COUNTRY_BS",
          "COUNTRY_BT",
          "COUNTRY_BV",
          "COUNTRY_BW",
          "COUNTRY_BY",
          "COUNTRY_BZ",
          "COUNTRY_CA",
          "COUNTRY_CC",
          "COUNTRY_CD",
          "COUNTRY_CF",
          "COUNTRY_CG",
          "COUNTRY_CH",
          "COUNTRY_CI",
          "COUNTRY_CK",
          "COUNTRY_CL",
          "COUNTRY_CM",
          "COUNTRY_CN",
          "COUNTRY_CO",
          "COUNTRY_CR",
          "COUNTRY_CS",
          "COUNTRY_CU",
          "COUNTRY_CV",
          "COUNTRY_CW",
          "COUNTRY_CX",
          "COUNTRY_CY",
          "COUNTRY_CZ",
          "COUNTRY_DE",
          "COUNTRY_DJ",
          "COUNTRY_DK",
          "COUNTRY_DM",
          "COUNTRY_DO",
          "COUNTRY_DZ",
          "COUNTRY_EC",
          "COUNTRY_EE",
          "COUNTRY_EG",
          "COUNTRY_EH",
          "COUNTRY_ER",
          "COUNTRY_ES",
          "COUNTRY_ET",
          "COUNTRY_FI",
          "COUNTRY_FJ",
          "COUNTRY_FK",
          "COUNTRY_FM",
          "COUNTRY_FO",
          "COUNTRY_FR",
          "COUNTRY_GA",
          "COUNTRY_GB",
          "COUNTRY_GD",
          "COUNTRY_GE",
          "COUNTRY_GF",
          "COUNTRY_GG",
          "COUNTRY_GH",
          "COUNTRY_GI",
          "COUNTRY_GL",
          "COUNTRY_GM",
          "COUNTRY_GN",
          "COUNTRY_GP",
          "COUNTRY_GQ",
          "COUNTRY_GR",
          "COUNTRY_GS",
          "COUNTRY_GT",
          "COUNTRY_GU",
          "COUNTRY_GW",
          "COUNTRY_GY",
          "COUNTRY_HK",
          "COUNTRY_HM",
          "COUNTRY_HN",
          "COUNTRY_HR",
          "COUNTRY_HT",
          "COUNTRY_HU",
          "COUNTRY_ID",
          "COUNTRY_IE",
          "COUNTRY_IL",
          "COUNTRY_IM",
          "COUNTRY_IN",
          "COUNTRY_IO",
          "COUNTRY_IQ",
          "COUNTRY_IR",
          "COUNTRY_IS",
          "COUNTRY_IT",
          "COUNTRY_JE",
          "COUNTRY_JM",
          "COUNTRY_JO",
          "COUNTRY_JP",
          "COUNTRY_KE",
          "COUNTRY_KG",
          "COUNTRY_KH",
          "COUNTRY_KI",
          "COUNTRY_KM",
          "COUNTRY_KN",
          "COUNTRY_KP",
          "COUNTRY_KR",
          "COUNTRY_KW",
          "COUNTRY_KY",
          "COUNTRY_KZ",
          "COUNTRY_LA",
          "COUNTRY_LB",
          "COUNTRY_LC",
          "COUNTRY_LI",
          "COUNTRY_LK",
          "COUNTRY_LR",
          "COUNTRY_LS",
          "COUNTRY_LT",
          "COUNTRY_LU",
          "COUNTRY_LV",
          "COUNTRY_LY",
          "COUNTRY_MA",
          "COUNTRY_MC",
          "COUNTRY_MD",
          "COUNTRY_ME",
          "COUNTRY_MF",
          "COUNTRY_MG",
          "COUNTRY_MH",
          "COUNTRY_MK",
          "COUNTRY_ML",
          "COUNTRY_MM",
          "COUNTRY_MN",
          "COUNTRY_MO",
          "COUNTRY_MP",
          "COUNTRY_MQ",
          "COUNTRY_MR",
          "COUNTRY_MS",
          "COUNTRY_MT",
          "COUNTRY_MU",
          "COUNTRY_MV",
          "COUNTRY_MW",
          "COUNTRY_MX",
          "COUNTRY_MY",
          "COUNTRY_MZ",
          "COUNTRY_NA",
          "COUNTRY_NC",
          "COUNTRY_NE",
          "COUNTRY_NF",
          "COUNTRY_NG",
          "COUNTRY_NI",
          "COUNTRY_NL",
          "COUNTRY_NO",
          "COUNTRY_NP",
          "COUNTRY_NR",
          "COUNTRY_NU",
          "COUNTRY_NZ",
          "COUNTRY_OM",
          "COUNTRY_PA",
          "COUNTRY_PE",
          "COUNTRY_PF",
          "COUNTRY_PG",
          "COUNTRY_PH",
          "COUNTRY_PK",
          "COUNTRY_PL",
          "COUNTRY_PM",
          "COUNTRY_PN",
          "COUNTRY_PR",
          "COUNTRY_PS",
          "COUNTRY_PT",
          "COUNTRY_PW",
          "COUNTRY_PY",
          "COUNTRY_QA",
          "COUNTRY_RE",
          "COUNTRY_RO",
          "COUNTRY_RS",
          "COUNTRY_RU",
          "COUNTRY_RW",
          "COUNTRY_SA",
          "COUNTRY_SB",
          "COUNTRY_SC",
          "COUNTRY_SD",
          "COUNTRY_SE",
          "COUNTRY_SG",
          "COUNTRY_SH",
          "COUNTRY_SI",
          "COUNTRY_SJ",
          "COUNTRY_SK",
          "COUNTRY_SL",
          "COUNTRY_SM",
          "COUNTRY_SN",
          "COUNTRY_SO",
          "COUNTRY_SR",
          "COUNTRY_SS",
          "COUNTRY_ST",
          "COUNTRY_SV",
          "COUNTRY_SX",
          "COUNTRY_SY",
          "COUNTRY_SZ",
          "COUNTRY_TC",
          "COUNTRY_TD",
          "COUNTRY_TF",
          "COUNTRY_TG",
          "COUNTRY_TH",
          "COUNTRY_TJ",
          "COUNTRY_TK",
          "COUNTRY_TL",
          "COUNTRY_TM",
          "COUNTRY_TN",
          "COUNTRY_TO",
          "COUNTRY_TR",
          "COUNTRY_TT",
          "COUNTRY_TV",
          "COUNTRY_TW",
          "COUNTRY_TZ",
          "COUNTRY_UA",
          "COUNTRY_UG",
          "COUNTRY_UM",
          "COUNTRY_US",
          "COUNTRY_UY",
          "COUNTRY_UZ",
          "COUNTRY_VA",
          "COUNTRY_VC",
          "COUNTRY_VE",
          "COUNTRY_VG",
          "COUNTRY_VI",
          "COUNTRY_VN",
          "COUNTRY_VU",
          "COUNTRY_WF",
          "COUNTRY_WS",
          "COUNTRY_XK",
          "COUNTRY_XT",
          "COUNTRY_YE",
          "COUNTRY_YT",
          "COUNTRY_ZA",
          "COUNTRY_ZM",
          "COUNTRY_ZW"
        ],
        title: "CountryCode",
        type: "string",
        "x-displayname": "Country Code.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyCountryCode",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyCountryCode
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.policy.CountryCode"
      },
      policyDetectionContext: {
        default: "CONTEXT_ANY",
        description: `The available contexts for Exclusion rules.

- CONTEXT_ANY: CONTEXT_ANY

Detection will be excluded for all contexts.
- CONTEXT_BODY: CONTEXT_BODY

Detection will be excluded for the request body.
- CONTEXT_REQUEST: CONTEXT_REQUEST

Detection will be excluded for the request.
- CONTEXT_RESPONSE: CONTEXT_RESPONSE

- CONTEXT_PARAMETER: CONTEXT_PARAMETER

Detection will be excluded for the parameters. The parameter name is required in the Context name field. If the field is left empty, the detection will be excluded for all parameters.
- CONTEXT_HEADER: CONTEXT_HEADER

Detection will be excluded for the headers. The header name is required in the Context name field. If the field is left empty, the detection will be excluded for all headers.
- CONTEXT_COOKIE: CONTEXT_COOKIE

Detection will be excluded for the cookies. The cookie name is required in the Context name field. If the field is left empty, the detection will be excluded for all cookies.
- CONTEXT_URL: CONTEXT_URL

Detection will be excluded for the request URL.
- CONTEXT_URI: CONTEXT_URI.`,
        enum: [
          "CONTEXT_ANY",
          "CONTEXT_BODY",
          "CONTEXT_REQUEST",
          "CONTEXT_RESPONSE",
          "CONTEXT_PARAMETER",
          "CONTEXT_HEADER",
          "CONTEXT_COOKIE",
          "CONTEXT_URL",
          "CONTEXT_URI"
        ],
        title: "Detection Context",
        type: "string",
        "x-displayname": "WAF Exclusion Context OPTIONS.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "The available contexts for Exclusion rules. - CONTEXT_ANY: CONTEXT_ANY Detection will be excluded for all contexts. - CONTEXT_BODY: CONTEXT_BODY Detection will be excluded for the request body. - CONTEXT_REQUEST: CONTEXT_REQUEST Detection will be excluded for the request. - CONTEXT_RESPONSE...",
        "x-f5xc-description-short": "The available contexts for Exclusion rules. - CONTEXT_ANY: CONTEXT_ANY Detection will be excluded for all contexts. - CONTEXT_BODY: CONTEXT_BODY...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyDetectionContext",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyDetectionContext
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.policy.DetectionContext"
      },
      policyHttpMethodMatcherType: {
        description: `A HTTP method matcher specifies a list of methods to match an input HTTP method. The match is considered successful if the input method is a member of the list.
The result of the match based on the method list is inverted if invert_matcher is true.`,
        properties: {
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Method Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          methods: {
            description: "List of methods values to match against.",
            items: {
              $ref: "#/components/schemas/schemaHttpMethod"
            },
            maxItems: 16,
            title: "methods",
            type: "array",
            "x-displayname": "Method List.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of methods values to match against.",
            "x-f5xc-example": "['GET', 'POST', 'DELETE']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.enum.defined_only": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['GET', 'POST', 'DELETE']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.enum.defined_only": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "HttpMethodMatcherType",
        type: "object",
        "x-displayname": "HTTP Method Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "HTTP method matcher specifies a list of methods to match an input HTTP method. The match is considered successful if the input method is a member of the list. The result of the match based on the method list is inverted if invert_matcher is true.",
        "x-f5xc-description-short": "HTTP method matcher specifies a list of methods to match an input HTTP method.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyHttpMethodMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyHttpMethodMatcherType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.HttpMethodMatcherType"
      },
      policyIPThreatCategory: {
        default: "SPAM_SOURCES",
        description: `The IP threat categories to use when a policy based IP threat category is configured.

- SPAM_SOURCES: SPAM_SOURCES

- WINDOWS_EXPLOITS: WINDOWS_EXPLOITS

- WEB_ATTACKS: WEB_ATTACKS

- BOTNETS: BOTNETS

- SCANNERS: SCANNERS

- REPUTATION: REPUTATION

- PHISHING: PHISHING

- PROXY: PROXY

- MOBILE_THREATS: MOBILE_THREATS

- TOR_PROXY: TOR_PROXY

- DENIAL_OF_SERVICE: DENIAL_OF_SERVICE

- NETWORK: NETWORK.`,
        enum: [
          "SPAM_SOURCES",
          "WINDOWS_EXPLOITS",
          "WEB_ATTACKS",
          "BOTNETS",
          "SCANNERS",
          "REPUTATION",
          "PHISHING",
          "PROXY",
          "MOBILE_THREATS",
          "TOR_PROXY",
          "DENIAL_OF_SERVICE",
          "NETWORK"
        ],
        title: "IP Threat Category",
        type: "string",
        "x-displayname": "IP Threat Category.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "The IP threat categories to use when a policy based IP threat category is configured. - SPAM_SOURCES: SPAM_SOURCES - WINDOWS_EXPLOITS: WINDOWS_EXPLOITS - WEB_ATTACKS: WEB_ATTACKS - BOTNETS: BOTNETS - SCANNERS: SCANNERS - REPUTATION: REPUTATION - PHISHING: PHISHING - PROXY: PROXY ...",
        "x-f5xc-description-short": "The IP threat categories to use when a policy based IP threat category is configured. - SPAM_SOURCES: SPAM_SOURCES - WINDOWS_EXPLOITS...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyIPThreatCategory",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyIPThreatCategory
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.policy.IPThreatCategory"
      },
      policyIpMatcherType: {
        description: `Match any IP prefix contained in the list of ip_prefix_sets.
The result of the match is inverted if invert_matcher is true.`,
        properties: {
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert IP Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          prefix_sets: {
            description: "A list of references to ip_prefix_set objects.",
            items: {
              $ref: "#/components/schemas/ioschemaObjectRefType"
            },
            maxItems: 4,
            title: "prefix_sets",
            type: "array",
            "x-displayname": "IP Prefix Sets.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 4,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-short": "List of references to ip_prefix_set objects.",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "4"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "4"
            }
          }
        },
        title: "ip matcher type",
        type: "object",
        "x-displayname": "IP Prefix Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Match any IP prefix contained in the list of ip_prefix_sets. The result of the match is inverted if invert_matcher is true.",
        "x-f5xc-description-short": "Match any IP prefix contained in the list of ip_prefix_sets. The result of the match is inverted if invert_matcher is true.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyIpMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "prefix_sets": "value"
  }
}`,
          example_yaml: `# Minimal example for policyIpMatcherType
metadata:
  name: example
  namespace: default
spec:
  prefix_sets: value`,
          mutually_exclusive_groups: [],
          required_fields: ["prefix_sets"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.IpMatcherType"
      },
      policyJA4TlsFingerprintMatcherType: {
        description: `An extended version of JA3 that includes additional fields for more comprehensive fingerprinting of
SSL/TLS clients and potentially has a different structure and length.`,
        properties: {
          exact_values: {
            description: "A list of exact JA4 TLS fingerprint to match the input JA4 TLS fingerprint against.",
            items: {
              type: "string"
            },
            maxItems: 16,
            title: "exact values",
            type: "array",
            "x-displayname": "Exact Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact JA4 TLS fingerprint to match the input JA4 TLS fingerprint against.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "36",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "36",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "JA4TlsFingerprintMatcherType",
        type: "object",
        "x-displayname": "JA4 TLS Fingerprint Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Extended version of JA3 that includes additional fields for more comprehensive fingerprinting of SSL/TLS clients and potentially has a different structure and length.",
        "x-f5xc-description-short": "Extended version of JA3 that includes additional fields for more comprehensive fingerprinting of SSL/TLS clients and potentially has a different...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyJA4TlsFingerprintMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyJA4TlsFingerprintMatcherType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.JA4TlsFingerprintMatcherType"
      },
      policyJWTClaimMatcherType__ves_io_schema_views_cdn_loadbalancer: {
        description: `A JWT claim matcher specifies the name of a single JWT claim and the criteria for the input request to match it.
The input has a list of actual values for each JWT claim name in the JWT payload.
A JWT claim matcher can check for one of the following:
* Presence or absence of the JWT Claim in the input
* At least one of the values for the JWT Claim in the input satisfies the MatcherType item.`,
        properties: {
          check_not_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check not present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          check_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          item: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          name: {
            description: "JWT claim name.",
            maxLength: 256,
            title: "name",
            type: "string",
            "x-displayname": "JWT Claim Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-example": "user_id",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "User_id",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          }
        },
        title: "JWTClaimMatcherType",
        type: "object",
        "x-displayname": "JWT Claim Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "JWT claim matcher specifies the name of a single JWT claim and the criteria for the input request to match it. The input has a list of actual values for each JWT claim name in the JWT payload. A JWT claim matcher can check for one of the following: * Presence or absence of the JWT Claim in the...",
        "x-f5xc-description-short": "JWT claim matcher specifies the name of a single JWT claim and the criteria for the input request to match it.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyJWTClaimMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for policyJWTClaimMatcherType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-displayorder": "1,2,6",
        "x-ves-oneof-field-match": '["check_not_present","check_present","item"]',
        "x-ves-proto-message": "ves.io.schema.policy.JWTClaimMatcherType"
      },
      policyKnownTlsFingerprintClass: {
        default: "TLS_FINGERPRINT_NONE",
        description: `Specifies known TLS fingerprint classes

- TLS_FINGERPRINT_NONE: TLS_FINGERPRINT_NONE

No TLS fingerprint
- ANY_MALICIOUS_FINGERPRINT: ANY_MALICIOUS_FINGERPRINT

TLS fingerprints known to be associated with malicious clients
- ADWARE: ADWARE

TLS fingerprints known to be associated with adware
- ADWIND: ADWIND

TLS fingerprints known to be associated with adwind
- DRIDEX: DRIDEX

TLS fingerprints known to be associated with dridex
- GOOTKIT: GOOTKIT

TLS fingerprints known to be associated with gootkit
- GOZI: GOZI

TLS fingerprints known to be associated with gozi
- JBIFROST: JBIFROST

TLS fingerprints known to be associated with jbifrost
- QUAKBOT: QUAKBOT

TLS fingerprints known to be associated with quakbot
- RANSOMWARE: RANSOMWARE

TLS fingerprints known to be associated with ransomware
- TROLDESH: TROLDESH

TLS fingerprints known to be associated with troldesh
- TOFSEE: TOFSEE

TLS fingerprints known to be associated with tofsee
- TORRENTLOCKER: TORRENTLOCKER

TLS fingerprints known to be associated with torrentlocker
- TRICKBOT: TRICKBOT

TLS fingerprints known to be associated with trickbot.`,
        enum: [
          "TLS_FINGERPRINT_NONE",
          "ANY_MALICIOUS_FINGERPRINT",
          "ADWARE",
          "ADWIND",
          "DRIDEX",
          "GOOTKIT",
          "GOZI",
          "JBIFROST",
          "QUAKBOT",
          "RANSOMWARE",
          "TROLDESH",
          "TOFSEE",
          "TORRENTLOCKER",
          "TRICKBOT"
        ],
        title: "TLS known fingerprint class",
        type: "string",
        "x-displayname": "TLS known fingerprint class.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Specifies known TLS fingerprint classes - TLS_FINGERPRINT_NONE: TLS_FINGERPRINT_NONE No TLS fingerprint - ANY_MALICIOUS_FINGERPRINT: ANY_MALICIOUS_FINGERPRINT TLS fingerprints known to be associated with malicious clients - ADWARE: ADWARE TLS fingerprints known to be associated with adware ...",
        "x-f5xc-description-short": "Specifies known TLS fingerprint classes - TLS_FINGERPRINT_NONE: TLS_FINGERPRINT_NONE No TLS fingerprint - ANY_MALICIOUS_FINGERPRINT...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyKnownTlsFingerprintClass",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyKnownTlsFingerprintClass
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.policy.KnownTlsFingerprintClass"
      },
      policyMatcherType: {
        description: `A matcher specifies multiple criteria for matching an input string. The match is considered successful if any of the criteria are satisfied. The set
of supported match criteria includes a list of exact values and a list of regular expressions.`,
        properties: {
          exact_values: {
            description: "A list of exact values to match the input against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 64,
            title: "exact values",
            type: "array",
            "x-displayname": "Exact Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact values to match the input against.",
            "x-f5xc-example": "['new york', 'london', 'sydney', 'tokyo', 'cairo']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['new york', 'london', 'sydney', 'tokyo', 'cairo']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          regex_values: {
            description: "A list of regular expressions to match the input against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 16,
            title: "regex values",
            type: "array",
            "x-displayname": "Regex Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of regular expressions to match the input against.",
            "x-f5xc-example": "['^new .*$', 'san f.*', '.* del .*']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.items.string.regex": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['^new .*$', 'san f.*', '.* del .*']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.items.string.regex": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          transformers: {
            description: "An ordered list of transformers (starting from index 0) to be applied to the path before matching.",
            items: {
              $ref: "#/components/schemas/policyTransformer"
            },
            maxItems: 9,
            title: "transformers",
            type: "array",
            "x-displayname": "Transformers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 9,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "Ordered list of transformers (starting from index 0) to be applied to the path before matching.",
            "x-f5xc-example": '"[BASE64_DECODE, LOWER_CASE]',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "9",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "9",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "MatcherType",
        type: "object",
        "x-displayname": "Matcher",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Matcher specifies multiple criteria for matching an input string. The match is considered successful if any of the criteria are satisfied. The set of supported match criteria includes a list of exact values and a list of regular expressions.",
        "x-f5xc-description-short": "Matcher specifies multiple criteria for matching an input string. The match is considered successful if any of the criteria are satisfied.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyMatcherType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.MatcherType"
      },
      policyMatcherTypeBasic: {
        description: `A matcher specifies multiple criteria for matching an input string. The match is considered successful if any of the criteria are satisfied. The set
of supported match criteria includes a list of exact values and a list of regular expressions.`,
        properties: {
          exact_values: {
            description: "A list of exact values to match the input against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 64,
            title: "exact values",
            type: "array",
            "x-displayname": "Exact Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact values to match the input against.",
            "x-f5xc-example": "['new york', 'london', 'sydney', 'tokyo', 'cairo']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['new york', 'london', 'sydney', 'tokyo', 'cairo']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          regex_values: {
            description: "A list of regular expressions to match the input against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 16,
            title: "regex values",
            type: "array",
            "x-displayname": "Regex Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of regular expressions to match the input against.",
            "x-f5xc-example": "['^new .*$', 'san f.*', '.* del .*']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.items.string.regex": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['^new .*$', 'san f.*', '.* del .*']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.items.string.regex": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "MatcherTypeBasic",
        type: "object",
        "x-displayname": "Matcher",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Matcher specifies multiple criteria for matching an input string. The match is considered successful if any of the criteria are satisfied. The set of supported match criteria includes a list of exact values and a list of regular expressions.",
        "x-f5xc-description-short": "Matcher specifies multiple criteria for matching an input string. The match is considered successful if any of the criteria are satisfied.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyMatcherTypeBasic",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyMatcherTypeBasic
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.MatcherTypeBasic"
      },
      policyModifyAction: {
        description: "Modify behavior for a matching request. The modification could be to entirely skip processing.",
        properties: {
          default: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": "True",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          skip_processing: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Select Modification Action",
        type: "object",
        "x-displayname": "Select Modification Action.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "Modify behavior for a matching request. The modification could be to entirely skip processing.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyModifyAction",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyModifyAction
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-action_type": '["default","skip_processing"]',
        "x-ves-proto-message": "ves.io.schema.policy.ModifyAction"
      },
      policyPrefixMatchList: {
        description: "List of IP Prefix strings to match against.",
        properties: {
          invert_match: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Match Result.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_prefixes: {
            description: "List of IPv4 prefix strings.",
            items: {
              type: "string"
            },
            maxItems: 128,
            title: "ip prefixes",
            type: "array",
            "x-displayname": "IPv4 Prefix List.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 128,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-example": "192.0.2.0/24",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.ipv4_prefix": "true",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "128",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "192.0.2.0/24.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.ipv4_prefix": "true",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "128",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "IP Prefix Match List",
        type: "object",
        "x-displayname": "IP Prefix Match List.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "List of IP Prefix strings to match against.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyPrefixMatchList",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyPrefixMatchList
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.PrefixMatchList"
      },
      policyRequestConstraintType: {
        properties: {
          max_cookie_count_exceeds: {
            description: "Exclusive with [max_cookie_count_none]",
            format: "int64",
            title: "max_cookie_count_exceeds",
            type: "integer",
            "x-displayname": "Match on the Count for all Cookies that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 1024,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-example": "40",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            },
            "x-ves-example": "40",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            }
          },
          max_cookie_count_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max cookie count none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_cookie_key_size_exceeds: {
            description: "Exclusive with [max_cookie_key_size_none]",
            format: "int64",
            title: "max_cookie_key_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Name Size per Cookie that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 1024,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_cookie_key_size_none].",
            "x-f5xc-example": "64",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            },
            "x-ves-example": "64",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            }
          },
          max_cookie_key_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max cookie key size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_cookie_value_size_exceeds: {
            description: "Exclusive with [max_cookie_value_size_none]",
            format: "int64",
            title: "max_cookie_value_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Value Size per Cookie that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 32768,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_cookie_value_size_none].",
            "x-f5xc-example": "4096",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "32768"
            },
            "x-ves-example": "4096",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "32768"
            }
          },
          max_cookie_value_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max cookie value size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_header_count_exceeds: {
            description: "Exclusive with [max_header_count_none]",
            format: "int64",
            title: "max_header_count_exceeds",
            type: "integer",
            "x-displayname": "Match on the Count for all Headers that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 40,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-example": "20",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "40"
            },
            "x-ves-example": "20",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "40"
            }
          },
          max_header_count_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max header count none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_header_key_size_exceeds: {
            description: "Exclusive with [max_header_key_size_none]",
            format: "int64",
            title: "max_header_key_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Name Size per Header that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 1024,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_header_key_size_none].",
            "x-f5xc-example": "32",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            },
            "x-ves-example": "32",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            }
          },
          max_header_key_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max header key size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_header_value_size_exceeds: {
            description: "Exclusive with [max_header_value_size_none]",
            format: "int64",
            title: "max_header_value_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Value Size per Header that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 64000,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_header_value_size_none].",
            "x-f5xc-example": "1024",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "64000"
            },
            "x-ves-example": "1024",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "64000"
            }
          },
          max_header_value_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max header value size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_parameter_count_exceeds: {
            description: "Exclusive with [max_parameter_count_none]",
            format: "int64",
            title: "max_parameter_count_exceeds",
            type: "integer",
            "x-displayname": "Match on the Parameter Count that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 1024,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_parameter_count_none].",
            "x-f5xc-example": "4",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            },
            "x-ves-example": "4",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            }
          },
          max_parameter_count_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max parameter count none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_parameter_name_size_exceeds: {
            description: "Exclusive with [max_parameter_name_size_none]",
            format: "int64",
            title: "max_parameter_name_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Parameter Name Size that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 1024,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_parameter_name_size_none].",
            "x-f5xc-example": "64",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            },
            "x-ves-example": "64",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1024"
            }
          },
          max_parameter_name_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_parameter_value_size_exceeds: {
            description: "Exclusive with [max_parameter_value_size_none]",
            format: "int64",
            title: "max_parameter_value_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Parameter Value Size that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 1073741824,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_parameter_value_size_none].",
            "x-f5xc-example": "1000",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1073741824"
            },
            "x-ves-example": "1000",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "1073741824"
            }
          },
          max_parameter_value_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max parameter value size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_query_size_exceeds: {
            description: "Exclusive with [max_query_size_none]",
            format: "int64",
            title: "max_query_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the URL Query Size that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 60000,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-example": "4096",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "60000"
            },
            "x-ves-example": "4096",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "60000"
            }
          },
          max_query_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max query size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_request_line_size_exceeds: {
            description: "Exclusive with [max_request_line_size_none]",
            format: "int64",
            title: "max_query_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Request Line Size that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 65536,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-description-short": "Exclusive with [max_request_line_size_none].",
            "x-f5xc-example": "4096",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "65536"
            },
            "x-ves-example": "4096",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "65536"
            }
          },
          max_request_line_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max request line size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_request_size_exceeds: {
            description: "Exclusive with [max_request_size_none]",
            format: "int64",
            title: "max_request_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the Request Size that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 65536,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-example": "32768",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "65536"
            },
            "x-ves-example": "32768",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "65536"
            }
          },
          max_request_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for max request size none.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          max_url_size_exceeds: {
            description: "Exclusive with [max_url_size_none]",
            format: "int64",
            title: "max_url_size_exceeds",
            type: "integer",
            "x-displayname": "Match on the URL Size that exceed this value.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "number",
              deterministic: true,
              maximum: 128000,
              metadata: {
                confidence: 0.99,
                source: "api-probed",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minimum: 1
            },
            "x-f5xc-example": "4096",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "128000"
            },
            "x-ves-example": "4096",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.uint32.gte": "1",
              "ves.io.schema.rules.uint32.lte": "128000"
            }
          },
          max_url_size_none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "RequestConstraintType",
        type: "object",
        "x-displayname": "Request Constraints.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyRequestConstraintType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyRequestConstraintType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-max_cookie_count_choice": '["max_cookie_count_exceeds","max_cookie_count_none"]',
        "x-ves-oneof-field-max_cookie_key_size_choice": '["max_cookie_key_size_exceeds","max_cookie_key_size_none"]',
        "x-ves-oneof-field-max_cookie_value_size_choice": '["max_cookie_value_size_exceeds","max_cookie_value_size_none"]',
        "x-ves-oneof-field-max_header_count_choice": '["max_header_count_exceeds","max_header_count_none"]',
        "x-ves-oneof-field-max_header_key_size_choice": '["max_header_key_size_exceeds","max_header_key_size_none"]',
        "x-ves-oneof-field-max_header_value_size_choice": '["max_header_value_size_exceeds","max_header_value_size_none"]',
        "x-ves-oneof-field-max_parameter_count_choice": '["max_parameter_count_exceeds","max_parameter_count_none"]',
        "x-ves-oneof-field-max_parameter_name_size_choice": '["max_parameter_name_size_exceeds","max_parameter_name_size_none"]',
        "x-ves-oneof-field-max_parameter_value_size_choice": '["max_parameter_value_size_exceeds","max_parameter_value_size_none"]',
        "x-ves-oneof-field-max_query_size_choice": '["max_query_size_exceeds","max_query_size_none"]',
        "x-ves-oneof-field-max_request_line_size_choice": '["max_request_line_size_exceeds","max_request_line_size_none"]',
        "x-ves-oneof-field-max_request_size_choice": '["max_request_size_exceeds","max_request_size_none"]',
        "x-ves-oneof-field-max_url_size_choice": '["max_url_size_exceeds","max_url_size_none"]',
        "x-ves-proto-message": "ves.io.schema.policy.RequestConstraintType"
      },
      policyRuleAction: {
        default: "DENY",
        description: `The rule action determines the disposition of the input request API. If a policy matches a rule with an ALLOW action, the processing of the request proceeds
forward. If it matches a rule with a DENY action, the processing of the request is terminated and an appropriate message/code returned to the originator. If
it matches a rule with a NEXT_POLICY_SET action, evaluation of the current policy set terminates and evaluation of the next policy set in the chain begins.

- DENY: DENY

Deny the request.
- ALLOW: ALLOW

Allow the request to proceed.
- NEXT_POLICY_SET: NEXT_POLICY_SET

Terminate evaluation of the current policy set and begin evaluating the next policy set in the chain. Note that the evaluation of any remaining policies
in the current policy set is skipped.
- NEXT_POLICY: NEXT_POLICY

Terminate evaluation of the current policy and begin evaluating the next policy in the policy set. Note that the evaluation of any remaining rules in the
current policy is skipped.
- LAST_POLICY: LAST_POLICY

Terminate evaluation of the current policy and begin evaluating the last policy in the policy set. Note that the evaluation of any remaining rules in the
current policy is skipped.
- GOTO_POLICY: GOTO_POLICY

Terminate evaluation of the current policy and begin evaluating a specific policy in the policy set. The policy is specified using the goto_policy field in
the rule and must be after the current policy in the policy set.`,
        enum: ["DENY", "ALLOW", "NEXT_POLICY"],
        title: "Rule Action",
        type: "string",
        "x-displayname": "Rule Action.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "The rule action determines the disposition of the input request API. If a policy matches a rule with an ALLOW action, the processing of the request proceeds forward. If it matches a rule with a DENY action, the processing of the request is terminated and an appropriate message/code returned to...",
        "x-f5xc-description-short": "The rule action determines the disposition of the input request API.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyRuleAction",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyRuleAction
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.policy.RuleAction"
      },
      policySegmentPolicyType: {
        description: "Configure source and destination segment for policy.",
        properties: {
          dst_any: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          dst_segments: {
            allOf: [
              {
                $ref: "#/components/schemas/viewsSegmentRefList"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for dst segments.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          intra_segment: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for intra segment.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          src_any: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          src_segments: {
            allOf: [
              {
                $ref: "#/components/schemas/viewsSegmentRefList"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for src segments.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Segment Choice",
        type: "object",
        "x-displayname": "Configure Segments.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-short": "Configure source and destination segment for policy.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policySegmentPolicyType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policySegmentPolicyType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-dst_segment_choice": '["dst_any","dst_segments","intra_segment"]',
        "x-ves-oneof-field-src_segment_choice": '["src_any","src_segments"]',
        "x-ves-proto-message": "ves.io.schema.policy.SegmentPolicyType"
      },
      policyStringMatcherType: {
        description: `A matcher specifies a list of values for matching an input string. The match is considered successful if the input value is present in the list. The result of
the match is inverted if invert_matcher is true.`,
        properties: {
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert String Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          match: {
            description: "A list of exact values to match the input against.",
            items: {
              maxLength: 63,
              type: "string"
            },
            maxItems: 64,
            title: "match",
            type: "array",
            "x-displayname": "Exact Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact values to match the input against.",
            "x-f5xc-example": "['new york', 'london', 'sydney', 'tokyo', 'cairo']",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.string.max_bytes": "63",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['new york', 'london', 'sydney', 'tokyo', 'cairo']",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.string.max_bytes": "63",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "StringMatcherType",
        type: "object",
        "x-displayname": "String Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Matcher specifies a list of values for matching an input string. The match is considered successful if the input value is present in the list. The result of the match is inverted if invert_matcher is true.",
        "x-f5xc-description-short": "Matcher specifies a list of values for matching an input string. The match is considered successful if the input value is present in the list.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyStringMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "match": "value"
  }
}`,
          example_yaml: `# Minimal example for policyStringMatcherType
metadata:
  name: example
  namespace: default
spec:
  match: value`,
          mutually_exclusive_groups: [],
          required_fields: ["match"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.StringMatcherType"
      },
      policyTlsFingerprintMatcherType: {
        description: `A TLS fingerprint matcher specifies multiple criteria for matching a TLS fingerprint. The set of supported positive match criteria includes a list of known
classes of TLS fingerprints and a list of exact values. The match is considered successful if either of these positive criteria are satisfied and the input
fingerprint is not one of the excluded values.`,
        properties: {
          classes: {
            description: "A list of known classes of TLS fingerprints to match the input TLS JA3 fingerprint against.",
            items: {
              $ref: "#/components/schemas/policyKnownTlsFingerprintClass"
            },
            maxItems: 16,
            title: "classes",
            type: "array",
            "x-displayname": "TLS fingerprint classes.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of known classes of TLS fingerprints to match the input TLS JA3 fingerprint against.",
            "x-f5xc-example": `"['ADWARE', 'TRICKBOT']`,
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          exact_values: {
            description: "A list of exact TLS JA3 fingerprints to match the input TLS JA3 fingerprint against.",
            items: {
              type: "string"
            },
            maxItems: 16,
            title: "exact values",
            type: "array",
            "x-displayname": "Exact Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact TLS JA3 fingerprints to match the input TLS JA3 fingerprint against.",
            "x-f5xc-example": "['ed6dfd54b01ebe31b7a65b88abfa7297', '16efcf0e00504ddfedde13bfea997952', 'de364c46b0dfc283b5e38c79ceae3f8f']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "32",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['ed6dfd54b01ebe31b7a65b88abfa7297', '16efcf0e00504ddfedde13bfea997952', 'de364c46b0dfc283b5e38c79ceae3f8f']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "32",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          excluded_values: {
            description: `A list of TLS JA3 fingerprints to be excluded when matching the input TLS JA3 fingerprint. This can be used to skip known false positives when using one
or more known TLS fingerprint classes in the enclosing matcher.`,
            items: {
              type: "string"
            },
            maxItems: 32,
            title: "excluded values",
            type: "array",
            "x-displayname": "Excluded Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 32,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-medium": "List of TLS JA3 fingerprints to be excluded when matching the input TLS JA3 fingerprint. This can be used to skip known false positives when using one or more known TLS fingerprint classes in the enclosing matcher.",
            "x-f5xc-description-short": "List of TLS JA3 fingerprints to be excluded when matching the input TLS JA3 fingerprint.",
            "x-f5xc-example": "['fb00055a1196aeea8d1bc609885ba953', 'b386946a5a44d1ddcc843bc75336dfce']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "32",
              "ves.io.schema.rules.repeated.max_items": "32",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['fb00055a1196aeea8d1bc609885ba953', 'b386946a5a44d1ddcc843bc75336dfce']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "32",
              "ves.io.schema.rules.repeated.max_items": "32",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "TlsFingerprintMatcherType",
        type: "object",
        "x-displayname": "TLS Fingerprint Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "TLS fingerprint matcher specifies multiple criteria for matching a TLS fingerprint. The set of supported positive match criteria includes a list of known classes of TLS fingerprints and a list of exact values. The match is considered successful if either of these positive criteria are satisfied...",
        "x-f5xc-description-short": "TLS fingerprint matcher specifies multiple criteria for matching a TLS fingerprint.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyTlsFingerprintMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyTlsFingerprintMatcherType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.TlsFingerprintMatcherType"
      },
      policyTransformer: {
        description: `Transformers to be applied on the part of the request before matching.

- TRANSFORMER_NONE: transformer none

No transformers enabled
- LOWER_CASE: lower case

Convert string to lower case
- UPPER_CASE: upper case

Convert string to upper case
- BASE64_DECODE: base64 decode

Decode string assuming base64 encoding
- NORMALIZE_PATH: normalize path

Normalize URL path so that /a/b/../c will be transformed to /a/c
- REMOVE_WHITESPACE: remove whitespace

Remove whitespaces
- URL_DECODE: URL decode

Decode string assuming URL encoding as per rfc1738
- TRIM_LEFT: trim left

Remove whitespace from the left side of the input string
- TRIM_RIGHT: trim right

Remove whitespace from the right side of the input string
- TRIM: trim

Remove whitespace from the both sides of the input string.`,
        enum: [
          "LOWER_CASE",
          "UPPER_CASE",
          "BASE64_DECODE",
          "NORMALIZE_PATH",
          "REMOVE_WHITESPACE",
          "URL_DECODE",
          "TRIM_LEFT",
          "TRIM_RIGHT",
          "TRIM"
        ],
        title: "Transformer",
        type: "string",
        "x-displayname": "Transformer.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Transformers to be applied on the part of the request before matching. - TRANSFORMER_NONE: transformer none No transformers enabled - LOWER_CASE: lower case Convert string to lower case - UPPER_CASE: upper case Convert string to upper case - BASE64_DECODE: base64 decode Decode string assuming...",
        "x-f5xc-description-short": "Transformers to be applied on the part of the request before matching. - TRANSFORMER_NONE: transformer none No transformers enabled - LOWER_CASE...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyTransformer",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyTransformer
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.policy.Transformer"
      },
      policyWafAction: {
        description: `Modify App Firewall behavior for a matching request. The modification could either be to entirely skip firewall processing or to customize the firewall rules
to be applied as defined by App Firewall Rule Control settings.`,
        properties: {
          app_firewall_detection_control: {
            allOf: [
              {
                $ref: "#/components/schemas/policyAppFirewallDetectionControl"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for app firewall detection control.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          waf_skip_processing: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "App Firewall Action",
        type: "object",
        "x-displayname": "App Firewall Action.",
        "x-f5xc-cli-domain": "virtual",
        "x-f5xc-description-medium": "Modify App Firewall behavior for a matching request. The modification could either be to entirely skip firewall processing or to customize the firewall rules to be applied as defined by App Firewall Rule Control settings.",
        "x-f5xc-description-short": "Modify App Firewall behavior for a matching request.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for policyWafAction",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for policyWafAction
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-action_type": '["app_firewall_detection_control","none","waf_skip_processing"]',
        "x-ves-proto-message": "ves.io.schema.policy.WafAction"
      },
      schemaHttpMethod: {
        default: "ANY",
        description: `Specifies the HTTP method used to access a resource.

Any HTTP Method.`,
        enum: ["ANY", "GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH", "COPY"],
        title: "HttpMethod",
        type: "string",
        "x-displayname": "HTTP Method.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "Specifies the HTTP method used to access a resource. Any HTTP Method.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaHttpMethod",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for schemaHttpMethod
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.HttpMethod"
      },
      schemaHttpStatusCode: {
        default: "EmptyStatusCode",
        description: `HTTP response status codes

EmptyStatusCode response codes means it is not specified
Continue status code
OK status code
Created status code
Accepted status code
Non Authoritative Information status code
No Content status code
Reset Content status code
Partial Content status code
Multi Status status code
Already Reported status code
Im Used status code
Multiple Choices status code
Moved Permanently status code
Found status code
See Other status code
Not Modified status code
Use Proxy status code
Temporary Redirect status code
Permanent Redirect status code
Bad Request status code
Unauthorized status code
Payment Required status code
Forbidden status code
Not Found status code
Method Not Allowed status code
Not Acceptable status code
Proxy Authentication Required status code
Request Timeout status code
Conflict status code
Gone status code
Length Required status code
Precondition Failed status code
Payload Too Large status code
URI Too Long status code
Unsupported Media Type status code
Range Not Satisfiable status code
Expectation Failed status code
Misdirected Request status code
Unprocessable Entity status code
Locked status code
Failed Dependency status code
Upgrade Required status code
Precondition Required status code
Too Many Requests status code
Request Header Fields Too Large status code
Internal Server Error status code
Not Implemented status code
Bad Gateway status code
Service Unavailable status code
Gateway Timeout status code
HTTP Version Not Supported status code
Variant Also Negotiates status code
Insufficient Storage status code
Loop Detected status code
Not Extended status code
Network Authentication Required status code.`,
        enum: [
          "EmptyStatusCode",
          "Continue",
          "OK",
          "Created",
          "Accepted",
          "NonAuthoritativeInformation",
          "NoContent",
          "ResetContent",
          "PartialContent",
          "MultiStatus",
          "AlreadyReported",
          "IMUsed",
          "MultipleChoices",
          "MovedPermanently",
          "Found",
          "SeeOther",
          "NotModified",
          "UseProxy",
          "TemporaryRedirect",
          "PermanentRedirect",
          "BadRequest",
          "Unauthorized",
          "PaymentRequired",
          "Forbidden",
          "NotFound",
          "MethodNotAllowed",
          "NotAcceptable",
          "ProxyAuthenticationRequired",
          "RequestTimeout",
          "Conflict",
          "Gone",
          "LengthRequired",
          "PreconditionFailed",
          "PayloadTooLarge",
          "URITooLong",
          "UnsupportedMediaType",
          "RangeNotSatisfiable",
          "ExpectationFailed",
          "MisdirectedRequest",
          "UnprocessableEntity",
          "Locked",
          "FailedDependency",
          "UpgradeRequired",
          "PreconditionRequired",
          "TooManyRequests",
          "RequestHeaderFieldsTooLarge",
          "InternalServerError",
          "NotImplemented",
          "BadGateway",
          "ServiceUnavailable",
          "GatewayTimeout",
          "HTTPVersionNotSupported",
          "VariantAlsoNegotiates",
          "InsufficientStorage",
          "LoopDetected",
          "NotExtended",
          "NetworkAuthenticationRequired"
        ],
        title: "HttpStatusCode",
        type: "string",
        "x-displayname": "HTTP Status Code.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "HTTP response status codes EmptyStatusCode response codes means it is not specified Continue status code OK status code Created status code Accepted status code Non Authoritative Information status code No Content status code Reset Content status code Partial Content status code Multi Status...",
        "x-f5xc-description-short": "HTTP response status codes EmptyStatusCode response codes means it is not specified Continue status code OK status code Created status code...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaHttpStatusCode",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for schemaHttpStatusCode
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-enum": "ves.io.schema.HttpStatusCode"
      },
      schemaLabelMatcherType: {
        description: `A label matcher specifies a list of label keys whose values need to match for
source/client and destination/server. Note that the actual label values are not
specified and do not matter. This allows an ability to scope grouping by the
label key name.`,
        properties: {
          keys: {
            description: "The list of label key names that have to match.",
            items: {
              maxLength: 64,
              minLength: 1,
              type: "string"
            },
            maxItems: 16,
            title: "keys",
            type: "array",
            "x-displayname": "Keys",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "The list of label key names that have to match.",
            "x-f5xc-example": "['environment', 'location', 'deployment']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_len": "64",
              "ves.io.schema.rules.repeated.items.string.min_len": "1",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['environment', 'location', 'deployment']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_len": "64",
              "ves.io.schema.rules.repeated.items.string.min_len": "1",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "LabelMatcherType",
        type: "object",
        "x-displayname": "Label Matcher.",
        "x-f5xc-cli-domain": "label",
        "x-f5xc-description-medium": "Label matcher specifies a list of label keys whose values need to match for source/client and destination/server. Note that the actual label values are not specified and do not matter. This allows an ability to scope grouping by the label key name.",
        "x-f5xc-description-short": "Label matcher specifies a list of label keys whose values need to match for source/client and destination/server.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaLabelMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for schemaLabelMatcherType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.LabelMatcherType"
      },
      schemaLabelSelectorType: {
        description: `This type can be used to establish a 'selector reference' from one object(called selector) to
a set of other objects(called selectees) based on the value of expressions.
A label selector is a label query over a set of resources. An empty label selector matches all objects.
A null label selector matches no objects. Label selector is immutable.
Expressions is a list of strings of label selection expression.
Each string has "," separated values which are "AND" and all strings are logically "OR".
BNF for expression string
<selector-syntax> ::= <requirement> | <requirement> "," <selector-syntax>
<requirement> ::= [!] KEY [ <set-based-restriction> | <exact-match-restriction> ]
<set-based-restriction> ::= "" | <inclusion-exclusion> <value-set>
<inclusion-exclusion> ::= <inclusion> | <exclusion>
<exclusion> ::= "notin"
<inclusion> ::= "in"
<value-set> ::= "(" <values> ")"
<values> ::= VALUE | VALUE "," <values>
<exact-match-restriction> ::= ["="|"=="|"!="] VALUE.`,
        properties: {
          expressions: {
            description: "Expressions contains the Kubernetes style label expression for selections.",
            items: {
              maxLength: 4096,
              minLength: 1,
              type: "string"
            },
            maxItems: 1,
            title: "expressions",
            type: "array",
            "x-displayname": "Selector Expression.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 1,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-short": "Expressions contains the Kubernetes style label expression for selections.",
            "x-f5xc-example": "region in (us-west1, us-west2),tier in (staging)",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.string.k8s_label_selector": "true",
              "ves.io.schema.rules.repeated.items.string.max_len": "4096",
              "ves.io.schema.rules.repeated.items.string.min_len": "1",
              "ves.io.schema.rules.repeated.max_items": "1"
            },
            "x-ves-example": "Region in (us-west1, us-west2),tier in (staging)",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.string.k8s_label_selector": "true",
              "ves.io.schema.rules.repeated.items.string.max_len": "4096",
              "ves.io.schema.rules.repeated.items.string.min_len": "1",
              "ves.io.schema.rules.repeated.max_items": "1"
            }
          }
        },
        title: "LabelSelectorType",
        type: "object",
        "x-displayname": "Label Selector.",
        "x-f5xc-cli-domain": "label",
        "x-f5xc-description-medium": "Type can be used to establish a 'selector reference' from one object(called selector) to a set of other objects(called selectees) based on the value of expressions. A label selector is a label query over a set of resources. An empty label selector matches all objects.",
        "x-f5xc-description-short": "Type can be used to establish a 'selector reference' from one object(called selector) to a set of other objects(called selectees) based on the...",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaLabelSelectorType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "expressions": "value"
  }
}`,
          example_yaml: `# Minimal example for schemaLabelSelectorType
metadata:
  name: example
  namespace: default
spec:
  expressions: value`,
          mutually_exclusive_groups: [],
          required_fields: ["expressions"]
        },
        "x-ves-proto-message": "ves.io.schema.LabelSelectorType"
      },
      schemaMessageMetaType: {
        description: `MessageMetaType is metadata (common attributes) of a message that only certain messages
have. This information is propagated to the metadata of a child object that gets created
from the containing message during view processing.
The information in this type can be specified by user during create and replace APIs.`,
        properties: {
          description: {
            description: "Human readable description.",
            maxLength: 256,
            title: "description",
            type: "string",
            "x-displayname": "Description.",
            "x-f5xc-constraints": {
              category: "discovery",
              characterSet: {
                description: "Free text with UTF-8 support"
              },
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 0
            },
            "x-f5xc-example": "Virtual Host for Example Corp website",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_len": "256"
            },
            "x-ves-example": "Virtual Host for Example Corp website.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_len": "256"
            }
          },
          name: {
            description: `This is the name of the message.
The value of name has to follow DNS-1035 format.`,
            minLength: 1,
            title: "name",
            type: "string",
            "x-displayname": "Name",
            "x-f5xc-constraints": {
              category: "discovery",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-description-short": "Name of the message. The value of name has to follow DNS-1035 format.",
            "x-f5xc-example": "example-corp-web",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.min_len": "1",
              "ves.io.schema.rules.string.ves_object_name": "true"
            },
            "x-ves-example": "Example-corp-web.",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.min_len": "1",
              "ves.io.schema.rules.string.ves_object_name": "true"
            }
          }
        },
        title: "MessageMetaType",
        type: "object",
        "x-displayname": "Message Metadata.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "MessageMetaType is metadata (common attributes) of a message that only certain messages have. This information is propagated to the metadata of a child object that gets created from the containing message during view processing. The information in this type can be specified by user during create...",
        "x-f5xc-description-short": "MessageMetaType is metadata (common attributes) of a message that only certain messages have.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaMessageMetaType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for schemaMessageMetaType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-proto-message": "ves.io.schema.MessageMetaType"
      },
      schemaObjectCreateMetaType: {
        description: "ObjectCreateMetaType is metadata that can be specified in Create request of an object.",
        properties: {
          annotations: {
            description: `Annotations is an unstructured key value map stored with a resource that may be
set by external tools to store and retrieve arbitrary metadata. They are not
queryable and should be preserved when modifying objects.`,
            title: "annotations",
            type: "object",
            "x-displayname": "Annotation.",
            "x-f5xc-description-medium": "Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata. They are not queryable and should be preserved when modifying objects.",
            "x-f5xc-description-short": "Annotations is an unstructured key value map stored with a resource that may be set by external tools to store and retrieve arbitrary metadata.",
            "x-f5xc-example": "value",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.map.keys.string.max_len": "64",
              "ves.io.schema.rules.map.keys.string.min_len": "1",
              "ves.io.schema.rules.map.values.string.max_len": "1024",
              "ves.io.schema.rules.map.values.string.min_len": "1"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.map.keys.string.max_len": "64",
              "ves.io.schema.rules.map.keys.string.min_len": "1",
              "ves.io.schema.rules.map.values.string.max_len": "1024",
              "ves.io.schema.rules.map.values.string.min_len": "1"
            }
          },
          description: {
            description: "Human readable description for the object.",
            maxLength: 1200,
            title: "description",
            type: "string",
            "x-displayname": "Description.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 1200
              },
              category: "discovery",
              characterSet: {
                description: "Free text with UTF-8 support"
              },
              constraintType: "string",
              deterministic: true,
              maxLength: 1200,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 0
            },
            "x-f5xc-description-short": "Human readable description for the object.",
            "x-f5xc-example": "Virtual Host for Example Corp website",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "1200"
            },
            "x-ves-example": "Virtual Host for Example Corp website.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "1200"
            }
          },
          disable: {
            description: "A value of true will administratively disable the object.",
            format: "boolean",
            title: "disable",
            type: "boolean",
            "x-displayname": "Disable",
            "x-f5xc-description-short": "Value of true will administratively disable the object.",
            "x-f5xc-example": "true",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          labels: {
            description: `Map of string keys and values that can be used to organize and categorize
(scope and select) objects as chosen by the user. Values specified here will be used
by selector expression.`,
            title: "labels",
            type: "object",
            "x-displayname": "Labels",
            "x-f5xc-description-medium": "Map of string keys and values that can be used to organize and categorize (scope and select) objects as chosen by the user. Values specified here will be used by selector expression.",
            "x-f5xc-description-short": "Map of string keys and values that can be used to organize and categorize (scope and select) objects as chosen by the user.",
            "x-f5xc-example": "value",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          name: {
            description: `This is the name of configuration object. It has to be unique within the namespace.
It can only be specified during create API and cannot be changed during replace API.
The value of name has to follow DNS-1035 format.`,
            title: "name",
            type: "string",
            "x-displayname": "Name",
            "x-f5xc-constraints": {
              category: "naming",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-description-medium": "Name of configuration object. It has to be unique within the namespace. It can only be specified during create API and cannot be changed during replace API.",
            "x-f5xc-description-short": "Name of configuration object. It has to be unique within the namespace.",
            "x-f5xc-example": "example-corp-web",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            },
            "x-ves-example": "Example-corp-web.",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            }
          },
          namespace: {
            description: `This defines the workspace within which each the configuration object is to be created.
Must be a DNS_LABEL format. For a namespace object itself, namespace value will be ""`,
            title: "namespace",
            type: "string",
            "x-displayname": "Namespace",
            "x-f5xc-constraints": {
              category: "naming",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-description-medium": 'Defines the workspace within which each the configuration object is to be created. Must be a DNS_LABEL format. For a namespace object itself, namespace value will be "".',
            "x-f5xc-description-short": "Defines the workspace within which each the configuration object is to be created.",
            "x-f5xc-example": "staging",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-ves-example": "Staging"
          }
        },
        title: "ObjectCreateMetaType",
        type: "object",
        "x-displayname": "Create Metadata.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "ObjectCreateMetaType is metadata that can be specified in Create request of an object.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaObjectCreateMetaType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for schemaObjectCreateMetaType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-proto-message": "ves.io.schema.ObjectCreateMetaType"
      },
      schemapolicyBotAction: {
        description: "Modify Bot protection behavior for a matching request. The modification could be to entirely skip Bot processing.",
        properties: {
          bot_skip_processing: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          none: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Bot Action",
        type: "object",
        "x-displayname": "Bot Action.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Modify Bot protection behavior for a matching request. The modification could be to entirely skip Bot processing.",
        "x-f5xc-description-short": "Modify Bot protection behavior for a matching request. The modification could be to entirely skip Bot processing.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemapolicyBotAction",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for schemapolicyBotAction
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-oneof-field-action_type": '["bot_skip_processing","none"]',
        "x-ves-proto-message": "ves.io.schema.policy.BotAction"
      },
      schemapolicyHeaderMatcherType__ves_io_schema_views_cdn_loadbalancer: {
        description: `A header matcher specifies the name of a single HTTP header and the criteria for the input request to match it. The input has a list of actual values for each
header name in the original HTTP request.
A header matcher can check for one of the following:
* Presence or absence of the header in the input
* At least one of the values for the header in the input satisfies the MatcherType item.`,
        properties: {
          check_not_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check not present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          check_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Header Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          item: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          name: {
            description: "A case-insensitive HTTP header name.",
            maxLength: 256,
            title: "name",
            type: "string",
            "x-displayname": "Header Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter, may contain lowercase alphanumeric and hyphens, must end with alphanumeric",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-example": "Accept-Encoding",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.http_header_field": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "Accept-Encoding.",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.http_header_field": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          }
        },
        title: "HeaderMatcherType",
        type: "object",
        "x-displayname": "Header Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Header matcher specifies the name of a single HTTP header and the criteria for the input request to match it. The input has a list of actual values for each header name in the original HTTP request. A header matcher can check for one of the following: * Presence or absence of the header in the...",
        "x-f5xc-description-short": "Header matcher specifies the name of a single HTTP header and the criteria for the input request to match it.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemapolicyHeaderMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for schemapolicyHeaderMatcherType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-displayorder": "1,6,4",
        "x-ves-oneof-field-match": '["check_not_present","check_present","item"]',
        "x-ves-proto-message": "ves.io.schema.policy.HeaderMatcherType"
      },
      schemapolicyPathMatcherType: {
        description: `A path matcher specifies multiple criteria for matching an HTTP path string. The match is considered successful if any of the criteria are satisfied. The set
of supported match criteria includes a list of path prefixes, a list of exact path values and a list of regular expressions.`,
        properties: {
          encoded_path_matcher: {
            description: "Match against the encoded, escaped path.",
            format: "boolean",
            title: "Encoded_Path",
            type: "boolean",
            "x-displayname": "Match Encoded Path.",
            "x-f5xc-description-short": "Match against the encoded, escaped path.",
            "x-f5xc-example": '"match \\"/path/%20another%20path\\" instead of default \\"/path/ another path\\""',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-ves-example": "Match \\\"/path/%20another%20path\\\" instead of default \\\"/path/ another path\\\""
          },
          exact_values: {
            description: "A list of exact path values to match the input HTTP path against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 16,
            title: "exact values",
            type: "array",
            "x-displayname": "Exact Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact path values to match the input HTTP path against.",
            "x-f5xc-example": "['/api/web/namespaces/project179/users/user1', '/api/config/configconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfignamespaces/accounting/bgps', '/api/data/datadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatanamespaces/project443/virtual_host_101']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.http_path": "true",
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['/API/web/namespaces/project179/users/user1', '/API/config/configconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfignamespaces/accounting/bgps', '/API/data/datadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatanamespaces/project443/virtual_host_101']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.http_path": "true",
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Path Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          prefix_values: {
            description: "A list of path prefix values to match the input HTTP path against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 16,
            title: "prefix values",
            type: "array",
            "x-displayname": "Prefix Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of path prefix values to match the input HTTP path against.",
            "x-f5xc-example": "['/api/web/namespaces/project179/users/', '/api/config/configconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfignamespaces/', '/api/data/datadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatanamespaces/']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.http_path": "true",
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['/API/web/namespaces/project179/users/', '/API/config/configconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfigconfignamespaces/', '/API/data/datadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatanamespaces/']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.http_path": "true",
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          regex_values: {
            description: "A list of regular expressions to match the input HTTP path against.",
            items: {
              maxLength: 256,
              type: "string"
            },
            maxItems: 16,
            title: "regex values",
            type: "array",
            "x-displayname": "Regex Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of regular expressions to match the input HTTP path against.",
            "x-f5xc-example": "['^/api/web/namespaces/abc/users/([a-z]([-a-z0-9]*[a-z0-9])?)$', '/api/data/datadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatanamespaces/proj404/virtual_hosts/([a-z]([-a-z0-9]*[a-z0-9])?)$']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.items.string.regex": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['^/API/web/namespaces/abc/users/([a-z]([-a-z0-9]*[a-z0-9])?)$', '/API/data/datadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatadatanamespaces/proj404/virtual_hosts/([a-z]([-a-z0-9]*[a-z0-9])?)$']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "256",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.items.string.regex": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          suffix_values: {
            description: "A list of path suffix values to match the input HTTP path against.",
            items: {
              maxLength: 64,
              type: "string"
            },
            maxItems: 64,
            title: "Suffix values",
            type: "array",
            "x-displayname": "Suffix Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of path suffix values to match the input HTTP path against.",
            "x-f5xc-example": "['.exe', '.shtml', '.wmz']",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "64",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "['.exe', '.shtml', '.wmz']",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.max_bytes": "64",
              "ves.io.schema.rules.repeated.items.string.not_empty": "true",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          transformers: {
            description: "An ordered list of transformers (starting from index 0) to be applied to the path before matching.",
            items: {
              $ref: "#/components/schemas/policyTransformer"
            },
            maxItems: 9,
            title: "transformers",
            type: "array",
            "x-displayname": "Transformers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 9,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "Ordered list of transformers (starting from index 0) to be applied to the path before matching.",
            "x-f5xc-example": '"[BASE64_DECODE, LOWER_CASE]',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "9",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "9",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "PathMatcherType",
        type: "object",
        "x-displayname": "Path Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Path matcher specifies multiple criteria for matching an HTTP path string. The match is considered successful if any of the criteria are satisfied. The set of supported match criteria includes a list of path prefixes, a list of exact path values and a list of regular expressions.",
        "x-f5xc-description-short": "Path matcher specifies multiple criteria for matching an HTTP path string. The match is considered successful if any of the criteria are satisfied.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemapolicyPathMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for schemapolicyPathMatcherType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.policy.PathMatcherType"
      },
      schemapolicyPortMatcherType: {
        description: `A port matcher specifies a list of port ranges as match criteria. The match is considered successful if the input port falls within any of the port ranges.
The result of the match is inverted if invert_matcher is true.`,
        properties: {
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Port Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ports: {
            description: `A list of strings, each of which is a single port value or a tuple of start and end port values separated by "-". The start and end values are considered
to be part of the range.`,
            items: {
              type: "string"
            },
            maxItems: 16,
            title: "port ranges",
            type: "array",
            "x-displayname": "Port Ranges.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-medium": 'List of strings, each of which is a single port value or a tuple of start and end port values separated by "-". The start and end values are considered to be part of the range.',
            "x-f5xc-description-short": 'List of strings, each of which is a single port value or a tuple of start and end port values separated by "-".',
            "x-f5xc-example": "8000-8191",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.string.port_range": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "8000-8191",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.items.string.port_range": "true",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "port matcher type",
        type: "object",
        "x-displayname": "Port Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Port matcher specifies a list of port ranges as match criteria. The match is considered successful if the input port falls within any of the port ranges. The result of the match is inverted if invert_matcher is true.",
        "x-f5xc-description-short": "Port matcher specifies a list of port ranges as match criteria.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemapolicyPortMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "ports": "value"
  }
}`,
          example_yaml: `# Minimal example for schemapolicyPortMatcherType
metadata:
  name: example
  namespace: default
spec:
  ports: value`,
          mutually_exclusive_groups: [],
          required_fields: ["ports"]
        },
        "x-ves-proto-message": "ves.io.schema.policy.PortMatcherType"
      },
      schemapolicyQueryParameterMatcherType__ves_io_schema_views_cdn_loadbalancer: {
        description: `A query parameter matcher specifies the name of a single query parameter and the criteria for the input request to match it. The input has a list of actual
values for each query parameter name in the original HTTP request.
A query parameter matcher can check for one of the following:
* Presence or absence of the query parameter in the input
* At least one of the values for the query parameter in the input satisfies the MatcherType item.`,
        properties: {
          check_not_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check not present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          check_present: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for check present.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          invert_matcher: {
            description: "Invert the match result.",
            format: "boolean",
            title: "invert_matcher",
            type: "boolean",
            "x-displayname": "Invert Query Parameter Matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          item: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true
          },
          key: {
            description: "A case-sensitive HTTP query parameter name.",
            maxLength: 256,
            title: "key",
            type: "string",
            "x-displayname": "Query Parameter Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-short": "Case-sensitive HTTP query parameter name.",
            "x-f5xc-example": "sourceid",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "Sourceid",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          }
        },
        title: "QueryParameterMatcherType",
        type: "object",
        "x-displayname": "Query Parameter Matcher.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Query parameter matcher specifies the name of a single query parameter and the criteria for the input request to match it. The input has a list of actual values for each query parameter name in the original HTTP request. A query parameter matcher can check for one of the following: * Presence or...",
        "x-f5xc-description-short": "Query parameter matcher specifies the name of a single query parameter and the criteria for the input request to match it.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemapolicyQueryParameterMatcherType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "key": "value"
  }
}`,
          example_yaml: `# Minimal example for schemapolicyQueryParameterMatcherType
metadata:
  name: example
  namespace: default
spec:
  key: value`,
          mutually_exclusive_groups: [],
          required_fields: ["key"]
        },
        "x-ves-displayorder": "1,6,4",
        "x-ves-oneof-field-match": '["check_not_present","check_present","item"]',
        "x-ves-proto-message": "ves.io.schema.policy.QueryParameterMatcherType"
      },
      schemaservice_policyCreateSpecType: {
        description: "Create service_policy creates a new object in the storage backend for metadata.namespace.",
        properties: {
          allow_all_requests: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for allow all requests.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          allow_list: {
            allOf: [
              {
                $ref: "#/components/schemas/service_policySourceList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          any_server: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          deny_all_requests: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for deny all requests.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          deny_list: {
            allOf: [
              {
                $ref: "#/components/schemas/service_policySourceList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          rule_list: {
            allOf: [
              {
                $ref: "#/components/schemas/service_policyRuleList"
              }
            ],
            description: "Ordered service-policy rules for non-geographic predicates and actions. Do not use country_list for a geo-only rule here: the platform adds match-all any_ip and any_asn selectors on readback, so the rule can match all traffic. Use deny_list or allow_list with country_list for geographic source matching.",
            "x-f5xc-description-medium": "Ordered service-policy rules for non-geographic predicates and actions. Do not use country_list for a geo-only rule here: the platform adds match-all any_ip and any_asn selectors on readback, so the rule can match all traffic. Use deny_list or allow_list with country_list for geographic source...",
            "x-f5xc-description-short": "Ordered service-policy rules for non-geographic predicates and actions.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          server_name: {
            description: `Exclusive with [any_server server_name_matcher server_selector]
The expected name of the server to which the request API is directed. The actual names for the server are extracted from the HTTP Host header and the name
of the virtual_host to which the request is directed. If the request is directed to a virtual K8s service, the actual names also contain the name of that
service.
The predicate evaluates to true if any of the actual names is the same as the expected server name.`,
            maxLength: 256,
            type: "string",
            "x-displayname": "Server Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Exclusive with [any_server server_name_matcher server_selector] The expected name of the server to which the request API is directed. The actual names for the server are extracted from the HTTP Host header and the name of the virtual_host to which the request is directed. If the request is...",
            "x-f5xc-description-short": "Exclusive with [any_server server_name_matcher server_selector] The expected name of the server to which the request API is directed.",
            "x-f5xc-example": "database.production.customer.F5 Distributed cloud.us",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "database.production.customer.F5 Distributed cloud.us.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          },
          server_name_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherTypeBasic"
              }
            ],
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          server_selector: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaLabelSelectorType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for server selector.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "Create service policy",
        type: "object",
        "x-displayname": "Create Service Policy.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-short": "Create service_policy creates a new object in the storage backend for metadata.namespace.",
        "x-f5xc-minimum-configuration": {
          description: "Service policy for network-level access control and traffic rules",
          example_json: `{
  "metadata": {
    "name": "allow-all",
    "namespace": "default"
  },
  "spec": {
    "allow_all_requests": {}
  }
}
`,
          example_yaml: `apiVersion: v1
kind: service_policy
metadata:
  name: allow-all
  namespace: default
spec:
  allow_all_requests: {}
`,
          mutually_exclusive_groups: [
            {
              fields: ["spec.allow_all_requests", "spec.deny_all_requests", "spec.rule_list"],
              name: "rule_choice",
              reason: "Choose exactly one rule selection method (REQUIRED)"
            },
            {
              fields: ["spec.any_server", "spec.server_name", "spec.server_selector", "spec.server_name_matcher"],
              name: "server_choice",
              reason: "Choose server scope (default: any_server)"
            }
          ],
          required_fields: ["metadata.name", "metadata.namespace"]
        },
        "x-ves-oneof-field-rule_choice": '["allow_all_requests","allow_list","deny_all_requests","deny_list","rule_list"]',
        "x-ves-oneof-field-server_choice": '["any_server","server_name","server_name_matcher","server_selector"]',
        "x-ves-proto-message": "ves.io.schema.service_policy.CreateSpecType"
      },
      schemaservice_policy_ruleCreateSpecType: {
        description: "Create service_policy_rule creates a new object in the storage backend for metadata.namespace.",
        properties: {
          action: {
            allOf: [
              {
                $ref: "#/components/schemas/policyRuleAction"
              }
            ],
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-ves-required": "true"
          },
          any_asn: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          any_client: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          any_ip: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          api_group_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyStringMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          arg_matchers: {
            description: `A list of predicates for all POST args that need to be matched. The criteria for matching each arg are described in individual instances
of ArgMatcherType. The actual arg values are extracted from the request API as a list of strings for each arg selector name.
Note that all specified arg matcher predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/policyArgMatcherType"
            },
            maxItems: 16,
            type: "array",
            "x-displayname": "Argument Matchers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for all POST args that need to be matched. The criteria for matching each arg are described in individual instances of ArgMatcherType. The actual arg values are extracted from the request API as a list of strings for each arg selector name.",
            "x-f5xc-description-short": "List of predicates for all POST args that need to be matched.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          asn_list: {
            allOf: [
              {
                $ref: "#/components/schemas/policyAsnMatchList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          asn_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyAsnMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for asn matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          body_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          bot_action: {
            allOf: [
              {
                $ref: "#/components/schemas/schemapolicyBotAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          client_name: {
            description: `Exclusive with [any_client client_name_matcher client_selector ip_threat_category_list]
The expected name of the client invoking the request API.
The predicate evaluates to true if any of the actual names is the same as the expected client name.`,
            maxLength: 256,
            type: "string",
            "x-displayname": "Client Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Exclusive with [any_client client_name_matcher client_selector ip_threat_category_list] The expected name of the client invoking the request API. The predicate evaluates to true if any of the actual names is the same as the expected client name.",
            "x-f5xc-description-short": "Exclusive with [any_client client_name_matcher client_selector ip_threat_category_list] The expected name of the client invoking the request API.",
            "x-f5xc-example": "backend.production.customer.F5 Distributed cloud.us",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "backend.production.customer.F5 Distributed cloud.us.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          },
          client_name_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherTypeBasic"
              }
            ],
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          client_selector: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaLabelSelectorType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          cookie_matchers: {
            description: `A list of predicates for all cookies that need to be matched. The criteria for matching each cookie is described in individual instances
of CookieMatcherType. The actual cookie values are extracted from the request API as a list of strings for each cookie name.
Note that all specified cookie matcher predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/policyCookieMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            type: "array",
            "x-displayname": "Cookie Matchers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for all cookies that need to be matched. The criteria for matching each cookie is described in individual instances of CookieMatcherType. The actual cookie values are extracted from the request API as a list of strings for each cookie name.",
            "x-f5xc-description-short": "List of predicates for all cookies that need to be matched.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          domain_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherTypeBasic"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for domain matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          expiration_timestamp: {
            description: `The expiration_timestamp is the RFC 3339 format timestamp at which the containing rule is considered to be logically expired. The rule continues to exist in
the configuration but is not applied anymore.`,
            format: "date-time",
            type: "string",
            "x-displayname": "Expiration Timestamp.",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              format: "date-time",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Specifies expiration_timestamp the RFC 3339 format timestamp at which the containing rule is considered to be logically expired. The rule continues to exist in the configuration but is not applied anymore.",
            "x-f5xc-description-short": "Specifies expiration_timestamp the RFC 3339 format timestamp at which the containing rule is considered to be logically expired.",
            "x-f5xc-example": "2019-12-31:44:34.171543432Z",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-ves-example": "2019-12-31:44:34.171543432Z."
          },
          headers: {
            description: `A list of predicates for various HTTP headers that need to match. The criteria for matching each HTTP header are described in individual HeaderMatcherType
instances. The actual HTTP header values are extracted from the request API as a list of strings for each HTTP header type.
Note that all specified header predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/schemapolicyHeaderMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            type: "array",
            "x-displayname": "HTTP Headers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minItems: 0,
              uniqueItems: false
            },
            "x-f5xc-description-medium": "List of predicates for various HTTP headers that need to match. The criteria for matching each HTTP header are described in individual HeaderMatcherType instances. The actual HTTP header values are extracted from the request API as a list of strings for each HTTP header type.",
            "x-f5xc-description-short": "List of predicates for various HTTP headers that need to match.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          http_method: {
            allOf: [
              {
                $ref: "#/components/schemas/policyHttpMethodMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for http method.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyIpMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_prefix_list: {
            allOf: [
              {
                $ref: "#/components/schemas/policyPrefixMatchList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_threat_category_list: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaservice_policy_ruleIPThreatCategoryListType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ja4_tls_fingerprint: {
            allOf: [
              {
                $ref: "#/components/schemas/policyJA4TlsFingerprintMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for ja4 tls fingerprint.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          jwt_claims: {
            description: `A list of predicates for various JWT claims that need to match. The criteria for matching each JWT claim are described in individual JWTClaimMatcherType
instances. The actual JWT claims values are extracted from the JWT payload as a list of strings.
Note that all specified JWT claim predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/policyJWTClaimMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            type: "array",
            "x-displayname": "JWT Claims.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for various JWT claims that need to match. The criteria for matching each JWT claim are described in individual JWTClaimMatcherType instances. The actual JWT claims values are extracted from the JWT payload as a list of strings.",
            "x-f5xc-description-short": "List of predicates for various JWT claims that need to match.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          label_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaLabelMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          log_rule_evaluation: {
            description: "Log the rule match details along with the request and continue to evaluate rules in the sequence.",
            format: "boolean",
            type: "boolean",
            "x-displayname": "Log Rule Evaluation.",
            "x-f5xc-description-short": "Log the rule match details along with the request and continue to evaluate rules in the sequence.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          mum_action: {
            allOf: [
              {
                $ref: "#/components/schemas/policyModifyAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          path: {
            allOf: [
              {
                $ref: "#/components/schemas/schemapolicyPathMatcherType"
              }
            ],
            "x-f5xc-example": "/api/v1/resources",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          port_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/schemapolicyPortMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          query_params: {
            description: `A list of predicates for all query parameters that need to be matched. The criteria for matching each query parameter are described in individual instances
of QueryParameterMatcherType. The actual query parameter values are extracted from the request API as a list of strings for each query parameter name.
Note that all specified query parameter predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/schemapolicyQueryParameterMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            type: "array",
            "x-displayname": "HTTP Query Parameters.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for all query parameters that need to be matched. The criteria for matching each query parameter are described in individual instances of QueryParameterMatcherType. The actual query parameter values are extracted from the request API as a list of strings for each query...",
            "x-f5xc-description-short": "List of predicates for all query parameters that need to be matched.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          request_constraints: {
            allOf: [
              {
                $ref: "#/components/schemas/policyRequestConstraintType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for request constraints.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          segment_policy: {
            allOf: [
              {
                $ref: "#/components/schemas/policySegmentPolicyType"
              }
            ],
            "x-f5xc-description-short": "Policy configuration for this feature.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          tls_fingerprint_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyTlsFingerprintMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for tls fingerprint matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          waf_action: {
            allOf: [
              {
                $ref: "#/components/schemas/policyWafAction"
              }
            ],
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-ves-required": "true"
          }
        },
        title: "Create service policy rule",
        type: "object",
        "x-displayname": "Create Service Policy Rule.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-short": "Create service_policy_rule creates a new object in the storage backend for metadata.namespace.",
        "x-f5xc-minimum-configuration": {
          description: "Service policy for network-level access control and traffic rules",
          example_json: `{
  "metadata": {
    "name": "allow-all",
    "namespace": "default"
  },
  "spec": {
    "allow_all_requests": {}
  }
}
`,
          example_yaml: `apiVersion: v1
kind: service_policy
metadata:
  name: allow-all
  namespace: default
spec:
  allow_all_requests: {}
`,
          mutually_exclusive_groups: [
            {
              fields: ["spec.allow_all_requests", "spec.deny_all_requests", "spec.rule_list"],
              name: "rule_choice",
              reason: "Choose exactly one rule selection method (REQUIRED)"
            },
            {
              fields: ["spec.any_server", "spec.server_name", "spec.server_selector", "spec.server_name_matcher"],
              name: "server_choice",
              reason: "Choose server scope (default: any_server)"
            }
          ],
          required_fields: ["metadata.name", "metadata.namespace"]
        },
        "x-ves-oneof-field-asn_choice": '["any_asn","asn_list","asn_matcher"]',
        "x-ves-oneof-field-client_choice": '["any_client","client_name","client_name_matcher","client_selector","ip_threat_category_list"]',
        "x-ves-oneof-field-dst_asn_choice": "[]",
        "x-ves-oneof-field-dst_ip_choice": "[]",
        "x-ves-oneof-field-ip_choice": '["any_ip","ip_matcher","ip_prefix_list"]',
        "x-ves-oneof-field-tls_fingerprint_choice": '["ja4_tls_fingerprint","tls_fingerprint_matcher"]',
        "x-ves-proto-message": "ves.io.schema.service_policy_rule.CreateSpecType"
      },
      schemaservice_policy_ruleGlobalSpecType: {
        description: "Shape of service_policy_rule in the storage backend.",
        properties: {
          action: {
            allOf: [
              {
                $ref: "#/components/schemas/policyRuleAction"
              }
            ],
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-ves-required": "true"
          },
          any_asn: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          any_client: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          any_ip: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          api_group_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyStringMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          arg_matchers: {
            description: `A list of predicates for all POST args that need to be matched. The criteria for matching each arg are described in individual instances
of ArgMatcherType. The actual arg values are extracted from the request API as a list of strings for each arg selector name.
Note that all specified arg matcher predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/policyArgMatcherType"
            },
            maxItems: 16,
            title: "arg matchers",
            type: "array",
            "x-displayname": "Argument Matchers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for all POST args that need to be matched. The criteria for matching each arg are described in individual instances of ArgMatcherType. The actual arg values are extracted from the request API as a list of strings for each arg selector name.",
            "x-f5xc-description-short": "List of predicates for all POST args that need to be matched.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          asn_list: {
            allOf: [
              {
                $ref: "#/components/schemas/policyAsnMatchList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          asn_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyAsnMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for asn matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          body_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          bot_action: {
            allOf: [
              {
                $ref: "#/components/schemas/schemapolicyBotAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          client_name: {
            description: `Exclusive with [any_client client_name_matcher client_selector ip_threat_category_list]
The expected name of the client invoking the request API.
The predicate evaluates to true if any of the actual names is the same as the expected client name.`,
            maxLength: 256,
            title: "client name",
            type: "string",
            "x-displayname": "Client Name.",
            "x-f5xc-constraints": {
              byteLength: {
                max: 256
              },
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Exclusive with [any_client client_name_matcher client_selector ip_threat_category_list] The expected name of the client invoking the request API. The predicate evaluates to true if any of the actual names is the same as the expected client name.",
            "x-f5xc-description-short": "Exclusive with [any_client client_name_matcher client_selector ip_threat_category_list] The expected name of the client invoking the request API.",
            "x-f5xc-example": "backend.production.customer.F5 Distributed cloud.us",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "256"
            },
            "x-ves-example": "backend.production.customer.F5 Distributed cloud.us.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "256"
            }
          },
          client_name_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-example": "example-resource",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          client_selector: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaLabelSelectorType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          cookie_matchers: {
            description: `A list of predicates for all cookies that need to be matched. The criteria for matching each cookie is described in individual instances
of CookieMatcherType. The actual cookie values are extracted from the request API as a list of strings for each cookie name.
Note that all specified cookie matcher predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/policyCookieMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            title: "cookie matchers",
            type: "array",
            "x-displayname": "Cookie Matchers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for all cookies that need to be matched. The criteria for matching each cookie is described in individual instances of CookieMatcherType. The actual cookie values are extracted from the request API as a list of strings for each cookie name.",
            "x-f5xc-description-short": "List of predicates for all cookies that need to be matched.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          domain_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for domain matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          expiration_timestamp: {
            description: `The expiration_timestamp is the RFC 3339 format timestamp at which the containing rule is considered to be logically expired. The rule continues to exist in
the configuration but is not applied anymore.`,
            format: "date-time",
            title: "expiration timestamp",
            type: "string",
            "x-displayname": "Expiration Timestamp.",
            "x-f5xc-constraints": {
              category: "general",
              constraintType: "string",
              format: "date-time",
              maxLength: 1024,
              metadata: {
                confidence: 0.85,
                source: "inferred",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "Specifies expiration_timestamp the RFC 3339 format timestamp at which the containing rule is considered to be logically expired. The rule continues to exist in the configuration but is not applied anymore.",
            "x-f5xc-description-short": "Specifies expiration_timestamp the RFC 3339 format timestamp at which the containing rule is considered to be logically expired.",
            "x-f5xc-example": "2019-12-31:44:34.171543432Z",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-ves-example": "2019-12-31:44:34.171543432Z."
          },
          headers: {
            description: `A list of predicates for various HTTP headers that need to match. The criteria for matching each HTTP header are described in individual HeaderMatcherType
instances. The actual HTTP header values are extracted from the request API as a list of strings for each HTTP header type.
Note that all specified header predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/schemapolicyHeaderMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            title: "headers",
            type: "array",
            "x-displayname": "HTTP Headers.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minItems: 0,
              uniqueItems: false
            },
            "x-f5xc-description-medium": "List of predicates for various HTTP headers that need to match. The criteria for matching each HTTP header are described in individual HeaderMatcherType instances. The actual HTTP header values are extracted from the request API as a list of strings for each HTTP header type.",
            "x-f5xc-description-short": "List of predicates for various HTTP headers that need to match.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          http_method: {
            allOf: [
              {
                $ref: "#/components/schemas/policyHttpMethodMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for http method.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyIpMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_prefix_list: {
            allOf: [
              {
                $ref: "#/components/schemas/policyPrefixMatchList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_threat_category_list: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaservice_policy_ruleIPThreatCategoryListType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ja4_tls_fingerprint: {
            allOf: [
              {
                $ref: "#/components/schemas/policyJA4TlsFingerprintMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for ja4 tls fingerprint.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          jwt_claims: {
            description: `A list of predicates for various JWT claims that need to match. The criteria for matching each JWT claim are described in individual JWTClaimMatcherType
instances. The actual JWT claims values are extracted from the JWT payload as a list of strings.
Note that all specified JWT claim predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/policyJWTClaimMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            title: "JWT claims",
            type: "array",
            "x-displayname": "JWT Claims.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for various JWT claims that need to match. The criteria for matching each JWT claim are described in individual JWTClaimMatcherType instances. The actual JWT claims values are extracted from the JWT payload as a list of strings.",
            "x-f5xc-description-short": "List of predicates for various JWT claims that need to match.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          label_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaLabelMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          log_rule_evaluation: {
            description: "Log the rule match details along with the request and continue to evaluate rules in the sequence.",
            format: "boolean",
            title: "Log Rule Evaluation",
            type: "boolean",
            "x-displayname": "Log Rule Evaluation.",
            "x-f5xc-description-short": "Log the rule match details along with the request and continue to evaluate rules in the sequence.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          mum_action: {
            allOf: [
              {
                $ref: "#/components/schemas/policyModifyAction"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          path: {
            allOf: [
              {
                $ref: "#/components/schemas/schemapolicyPathMatcherType"
              }
            ],
            "x-f5xc-example": "/api/v1/resources",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          port_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/schemapolicyPortMatcherType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          query_params: {
            description: `A list of predicates for all query parameters that need to be matched. The criteria for matching each query parameter are described in individual instances
of QueryParameterMatcherType. The actual query parameter values are extracted from the request API as a list of strings for each query parameter name.
Note that all specified query parameter predicates must evaluate to true.`,
            items: {
              $ref: "#/components/schemas/schemapolicyQueryParameterMatcherType__ves_io_schema_views_cdn_loadbalancer"
            },
            maxItems: 16,
            title: "query params",
            type: "array",
            "x-displayname": "HTTP Query Parameters.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "List of predicates for all query parameters that need to be matched. The criteria for matching each query parameter are described in individual instances of QueryParameterMatcherType. The actual query parameter values are extracted from the request API as a list of strings for each query...",
            "x-f5xc-description-short": "List of predicates for all query parameters that need to be matched.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16"
            }
          },
          request_constraints: {
            allOf: [
              {
                $ref: "#/components/schemas/policyRequestConstraintType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for request constraints.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          segment_policy: {
            allOf: [
              {
                $ref: "#/components/schemas/policySegmentPolicyType"
              }
            ],
            "x-f5xc-description-short": "Policy configuration for this feature.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          tls_fingerprint_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyTlsFingerprintMatcherType"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for tls fingerprint matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          user_identity_matcher: {
            allOf: [
              {
                $ref: "#/components/schemas/policyMatcherTypeBasic"
              }
            ],
            "x-f5xc-description-short": "Configuration parameter for user identity matcher.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-field-mutability": "read-only"
          },
          waf_action: {
            allOf: [
              {
                $ref: "#/components/schemas/policyWafAction"
              }
            ],
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-ves-required": "true"
          }
        },
        title: "GlobalSpecType",
        type: "object",
        "x-displayname": "Specification.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-short": "Shape of service_policy_rule in the storage backend.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaservice_policy_ruleGlobalSpecType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "action": "value",
    "waf_action": "value"
  }
}`,
          example_yaml: `# Minimal example for schemaservice_policy_ruleGlobalSpecType
metadata:
  name: example
  namespace: default
spec:
  action: value
  waf_action: value`,
          mutually_exclusive_groups: [],
          required_fields: ["action", "waf_action"]
        },
        "x-ves-oneof-field-asn_choice": '["any_asn","asn_list","asn_matcher"]',
        "x-ves-oneof-field-client_choice": '["any_client","client_name","client_name_matcher","client_selector","ip_threat_category_list"]',
        "x-ves-oneof-field-dst_asn_choice": "[]",
        "x-ves-oneof-field-dst_ip_choice": "[]",
        "x-ves-oneof-field-ip_choice": '["any_ip","ip_matcher","ip_prefix_list"]',
        "x-ves-oneof-field-tls_fingerprint_choice": '["ja4_tls_fingerprint","tls_fingerprint_matcher"]',
        "x-ves-proto-message": "ves.io.schema.service_policy_rule.GlobalSpecType"
      },
      schemaservice_policy_ruleIPThreatCategoryListType: {
        description: "List of IP threat categories.",
        properties: {
          ip_threat_categories: {
            description: "The IP threat categories is obtained from the list and is used to auto-generate equivalent label selection expressions.",
            items: {
              $ref: "#/components/schemas/policyIPThreatCategory"
            },
            maxItems: 32,
            title: "IP Threat Categories",
            type: "array",
            "x-displayname": "List of IP Threat Categories to choose.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 32,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-medium": "The IP threat categories is obtained from the list and is used to auto-generate equivalent label selection expressions.",
            "x-f5xc-description-short": "The IP threat categories is obtained from the list and is used to auto-generate equivalent label selection expressions.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "32",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.repeated.max_items": "32",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "IP Threat Category List Type",
        type: "object",
        "x-displayname": "IP Threat Category List Type.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaservice_policy_ruleIPThreatCategoryListType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "ip_threat_categories": "value"
  }
}`,
          example_yaml: `# Minimal example for schemaservice_policy_ruleIPThreatCategoryListType
metadata:
  name: example
  namespace: default
spec:
  ip_threat_categories: value`,
          mutually_exclusive_groups: [],
          required_fields: ["ip_threat_categories"]
        },
        "x-ves-proto-message": "ves.io.schema.service_policy_rule.IPThreatCategoryListType"
      },
      schemaviewsObjectRefType: {
        description: `This type establishes a direct reference from one object(the referrer) to another(the referred).
Such a reference is in form of tenant/namespace/name.`,
        properties: {
          name: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then name will hold the referred object's(e.g. Route's) name.`,
            maxLength: 128,
            minLength: 1,
            title: "name",
            type: "string",
            "x-displayname": "Name",
            "x-f5xc-constraints": {
              byteLength: {
                max: 128,
                min: 1
              },
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 128,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then name will hold the referred object's(e.g. Route's) name.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then name will hold the referred object's(e.g.",
            "x-f5xc-example": "contacts-route",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "128",
              "ves.io.schema.rules.string.min_bytes": "1"
            },
            "x-ves-example": "Contacts-route.",
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true",
              "ves.io.schema.rules.string.max_bytes": "128",
              "ves.io.schema.rules.string.min_bytes": "1"
            }
          },
          namespace: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then namespace will hold the referred object's(e.g. Route's) namespace.`,
            maxLength: 64,
            title: "namespace",
            type: "string",
            "x-displayname": "Namespace",
            "x-f5xc-constraints": {
              byteLength: {
                max: 64
              },
              category: "discovery",
              characterSet: {
                allowed: "[a-z0-9-]",
                description: "Lowercase letter start, alphanumeric with hyphens, alphanumeric end",
                required: "[a-z0-9]",
                restricted: "[^a-z0-9-]"
              },
              constraintType: "string",
              deterministic: true,
              format: "dns-label",
              formatDescription: "DNS-1035 label: must start with a lowercase letter",
              maxLength: 63,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minLength: 1,
              pattern: "^[a-z]([-a-z0-9]*[a-z0-9])?$",
              validation: {
                rfc: "RFC 1035",
                standard: "DNS-1035 label (alpha-first)"
              }
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then namespace will hold the referred object's(e.g. Route's) namespace.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then namespace will hold the referred object's(e.g.",
            "x-f5xc-example": "ns1",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "64"
            },
            "x-ves-example": "Ns1",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "64"
            }
          },
          tenant: {
            description: `When a configuration object(e.g. Virtual_host) refers to another(e.g route)
then tenant will hold the referred object's(e.g. Route's) tenant.`,
            maxLength: 64,
            readOnly: true,
            title: "tenant",
            type: "string",
            "x-displayname": "Tenant",
            "x-f5xc-constraints": {
              byteLength: {
                max: 64
              },
              category: "discovery",
              constraintType: "string",
              deterministic: true,
              maxLength: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              }
            },
            "x-f5xc-description-medium": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then tenant will hold the referred object's(e.g. Route's) tenant.",
            "x-f5xc-description-short": "When a configuration object(e.g. Virtual_host) refers to another(e.g route) then tenant will hold the referred object's(e.g.",
            "x-f5xc-example": "example-corp",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-field-mutability": "read-only",
            "x-reconciled-at": "2026-08-20T09:12:47+00:00",
            "x-reconciled-from-discovery": true,
            "x-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "64"
            },
            "x-ves-example": "Example-corp.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.string.max_bytes": "64"
            }
          }
        },
        title: "ObjectRefType",
        type: "object",
        "x-displayname": "Object reference.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-medium": "Type establishes a direct reference from one object(the referrer) to another(the referred). Such a reference is in form of tenant/namespace/name.",
        "x-f5xc-description-short": "Type establishes a direct reference from one object(the referrer) to another(the referred).",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for schemaviewsObjectRefType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "name": "value"
  }
}`,
          example_yaml: `# Minimal example for schemaviewsObjectRefType
metadata:
  name: example
  namespace: default
spec:
  name: value`,
          mutually_exclusive_groups: [],
          required_fields: ["name"]
        },
        "x-ves-proto-message": "ves.io.schema.views.ObjectRefType"
      },
      service_policyCreateRequest: {
        description: "This is the input message of the 'Create' RPC.",
        properties: {
          metadata: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaObjectCreateMetaType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            }
          },
          spec: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaservice_policyCreateSpecType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "CreateRequest is used to create an instance of service_policy",
        type: "object",
        "x-displayname": "Create Request.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-minimum-configuration": {
          description: "Service policy for network-level access control and traffic rules",
          example_json: `{
  "metadata": {
    "name": "allow-all",
    "namespace": "default"
  },
  "spec": {
    "allow_all_requests": {}
  }
}
`,
          example_yaml: `apiVersion: v1
kind: service_policy
metadata:
  name: allow-all
  namespace: default
spec:
  allow_all_requests: {}
`,
          mutually_exclusive_groups: [
            {
              fields: ["spec.allow_all_requests", "spec.deny_all_requests", "spec.rule_list"],
              name: "rule_choice",
              reason: "Choose exactly one rule selection method (REQUIRED)"
            },
            {
              fields: ["spec.any_server", "spec.server_name", "spec.server_selector", "spec.server_name_matcher"],
              name: "server_choice",
              reason: "Choose server scope (default: any_server)"
            }
          ],
          required_fields: ["metadata.name", "metadata.namespace"]
        },
        "x-ves-proto-message": "ves.io.schema.service_policy.CreateRequest"
      },
      service_policyRule: {
        description: `A Rule consists of an unordered list of predicates and an action. The predicates are evaluated against a set of input fields that are extracted from
or derived from an L7 request API. A request API is considered to match the simple rule if all predicates in the rule evaluate to true for that request. Any
predicates that are not specified in a rule are implicitly considered to be true. If a request API matches a simple rule, the action for the simple rule is
enforced.`,
        properties: {
          metadata: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaMessageMetaType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          spec: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaservice_policy_ruleGlobalSpecType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "rule",
        type: "object",
        "x-displayname": "Rule",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-medium": "Rule consists of an unordered list of predicates and an action. The predicates are evaluated against a set of input fields that are extracted from or derived from an L7 request API. A request API is considered to match the simple rule if all predicates in the rule evaluate to true for that request.",
        "x-f5xc-description-short": "Rule consists of an unordered list of predicates and an action.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for service_policyRule",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for service_policyRule
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.service_policy.Rule"
      },
      service_policyRuleList: {
        description: `A list of rules.
The order of evaluation of the rules depends on the rule combining algorithm.`,
        properties: {
          rules: {
            description: `Define the list of rules (with an order) that should be evaluated by this service policy.
Rules are evaluated from top to bottom in the list.`,
            items: {
              $ref: "#/components/schemas/service_policyRule"
            },
            maxItems: 256,
            title: "rules",
            type: "array",
            "x-displayname": "Rules",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 256,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              minItems: 0,
              uniqueItems: false
            },
            "x-f5xc-description-medium": "Define the list of rules (with an order) that should be evaluated by this service policy. Rules are evaluated from top to bottom in the list.",
            "x-f5xc-description-short": "Define the list of rules (with an order) that should be evaluated by this service policy.",
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "256",
              "ves.io.schema.rules.repeated.unique_metadata_name": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "256",
              "ves.io.schema.rules.repeated.unique_metadata_name": "true"
            }
          }
        },
        title: "rule list",
        type: "object",
        "x-displayname": "Rule List",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-short": "List of rules. The order of evaluation of the rules depends on the rule combining algorithm.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for service_policyRuleList",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for service_policyRuleList
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.service_policy.RuleList"
      },
      service_policySourceList: {
        description: "List of sources. A request belongs to this list if it satisfies any of the match criteria.",
        properties: {
          asn_list: {
            allOf: [
              {
                $ref: "#/components/schemas/policyAsnMatchList"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          asn_set: {
            description: `Addresses that belong to the ASNs in the given bgp_asn_set
The ASN is obtained by performing a lookup for the source IPv4 Address in a GeoIP DB.`,
            items: {
              $ref: "#/components/schemas/schemaviewsObjectRefType"
            },
            maxItems: 4,
            title: "asn_set",
            type: "array",
            "x-displayname": "BGP ASN Set.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 4,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-medium": "Addresses that belong to the ASNs in the given bgp_asn_set The ASN is obtained by performing a lookup for the source IPv4 Address in a GeoIP DB.",
            "x-f5xc-description-short": "Addresses that belong to the ASNs in the given bgp_asn_set The ASN is obtained by performing a lookup for the source IPv4 Address in a GeoIP DB.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "4",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "4",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          country_list: {
            description: `Addresses that belong to one of the countries in the given list
The country is obtained by performing a lookup for the source IPv4 Address in a GeoIP DB.`,
            items: {
              $ref: "#/components/schemas/policyCountryCode"
            },
            maxItems: 64,
            title: "country_list",
            type: "array",
            "x-displayname": "Country List.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 64,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-medium": "Addresses that belong to one of the countries in the given list The country is obtained by performing a lookup for the source IPv4 Address in a GeoIP DB.",
            "x-f5xc-description-short": "Addresses that belong to one of the countries in the given list The country is obtained by performing a lookup for the source IPv4 Address in a...",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.enum.defined_only": "true",
              "ves.io.schema.rules.repeated.items.enum.not_in": "[0]",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.enum.defined_only": "true",
              "ves.io.schema.rules.repeated.items.enum.not_in": "[0]",
              "ves.io.schema.rules.repeated.max_items": "64",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          default_action_allow: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_action_deny: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          default_action_next_policy: {
            allOf: [
              {
                $ref: "#/components/schemas/ioschemaEmpty"
              }
            ],
            "x-f5xc-description-short": "Policy configuration for this feature.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          ip_prefix_set: {
            description: "Addresses that are covered by the prefixes in the given ip_prefix_set.",
            items: {
              $ref: "#/components/schemas/schemaviewsObjectRefType"
            },
            maxItems: 4,
            title: "ip_prefix_set",
            type: "array",
            "x-displayname": "IP Prefix Set.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 4,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "Addresses that are covered by the prefixes in the given ip_prefix_set.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "4",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "4",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          prefix_list: {
            allOf: [
              {
                $ref: "#/components/schemas/viewsPrefixStringListType"
              }
            ],
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          },
          tls_fingerprint_classes: {
            description: "A list of known classes of TLS fingerprints to match the input TLS JA3 fingerprint against.",
            items: {
              $ref: "#/components/schemas/policyKnownTlsFingerprintClass"
            },
            maxItems: 16,
            title: "tls_fingerprint_classes",
            type: "array",
            "x-displayname": "TLS Fingerprint Classes.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of known classes of TLS fingerprints to match the input TLS JA3 fingerprint against.",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          },
          tls_fingerprint_values: {
            description: "A list of exact TLS JA3 fingerprints to match the input TLS JA3 fingerprint against.",
            items: {
              type: "string"
            },
            maxItems: 16,
            title: "tls_fingerprint_classes",
            type: "array",
            "x-displayname": "TLS Fingerprint Values.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 16,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of exact TLS JA3 fingerprints to match the input TLS JA3 fingerprint against.",
            "x-f5xc-example": "1aa7bf8b97e540ca5edd75f7b8384bfa",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "32",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "1aa7bf8b97e540ca5edd75f7b8384bfa.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.len": "32",
              "ves.io.schema.rules.repeated.max_items": "16",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "source_list",
        type: "object",
        "x-displayname": "Source List.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-description-short": "List of sources. A request belongs to this list if it satisfies any of the match criteria.",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for service_policySourceList",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for service_policySourceList
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-displayorder": "2,3,4,5,6,7,8,10",
        "x-ves-oneof-field-default_action_choice": '["default_action_allow","default_action_deny","default_action_next_policy"]',
        "x-ves-proto-message": "ves.io.schema.service_policy.SourceList"
      },
      service_policy_ruleCreateRequest: {
        description: "This is the input message of the 'Create' RPC.",
        properties: {
          metadata: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaObjectCreateMetaType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            }
          },
          spec: {
            allOf: [
              {
                $ref: "#/components/schemas/schemaservice_policy_ruleCreateSpecType"
              }
            ],
            "x-f5xc-example": '{"key": "value"}',
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            }
          }
        },
        title: "CreateRequest is used to create an instance of service_policy_rule",
        type: "object",
        "x-displayname": "Create Request.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-minimum-configuration": {
          description: "Service policy for network-level access control and traffic rules",
          example_json: `{
  "metadata": {
    "name": "allow-all",
    "namespace": "default"
  },
  "spec": {
    "allow_all_requests": {}
  }
}
`,
          example_yaml: `apiVersion: v1
kind: service_policy
metadata:
  name: allow-all
  namespace: default
spec:
  allow_all_requests: {}
`,
          mutually_exclusive_groups: [
            {
              fields: ["spec.allow_all_requests", "spec.deny_all_requests", "spec.rule_list"],
              name: "rule_choice",
              reason: "Choose exactly one rule selection method (REQUIRED)"
            },
            {
              fields: ["spec.any_server", "spec.server_name", "spec.server_selector", "spec.server_name_matcher"],
              name: "server_choice",
              reason: "Choose server scope (default: any_server)"
            }
          ],
          required_fields: ["metadata.name", "metadata.namespace"]
        },
        "x-ves-proto-message": "ves.io.schema.service_policy_rule.CreateRequest"
      },
      viewsPrefixStringListType: {
        description: "List of IPv4 prefixes that represent an endpoint.",
        properties: {
          prefixes: {
            description: "List of IPv4 prefixes that represent an endpoint.",
            items: {
              type: "string"
            },
            maxItems: 128,
            title: "ipv4 prefix list",
            type: "array",
            "x-displayname": "IPv4 Prefix List.",
            "x-f5xc-constraints": {
              category: "discovery",
              constraintType: "array",
              deterministic: true,
              maxItems: 128,
              metadata: {
                confidence: 0.99,
                source: "discovery",
                validatedAt: "2026-08-20T09:12:47+00:00"
              },
              uniqueItems: true
            },
            "x-f5xc-description-short": "List of IPv4 prefixes that represent an endpoint.",
            "x-f5xc-example": "192.0.2.0/24",
            "x-f5xc-required-for": {
              create: false,
              minimum_config: false,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.ipv4_prefix": "true",
              "ves.io.schema.rules.repeated.max_items": "128",
              "ves.io.schema.rules.repeated.unique": "true"
            },
            "x-ves-example": "192.0.2.0/24.",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.repeated.items.string.ipv4_prefix": "true",
              "ves.io.schema.rules.repeated.max_items": "128",
              "ves.io.schema.rules.repeated.unique": "true"
            }
          }
        },
        title: "ipv4 prefix list",
        type: "object",
        "x-displayname": "IPv4 Prefix List.",
        "x-f5xc-cli-domain": "other",
        "x-f5xc-description-short": "List of IPv4 prefixes that represent an endpoint.",
        "x-f5xc-example": "192.0.2.0/24",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for viewsPrefixStringListType",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {}
}`,
          example_yaml: `# Minimal example for viewsPrefixStringListType
metadata:
  name: example
  namespace: default
spec: {}`,
          mutually_exclusive_groups: [],
          required_fields: []
        },
        "x-ves-proto-message": "ves.io.schema.views.PrefixStringListType"
      },
      viewsSegmentRefList: {
        description: "List of references to Segments.",
        properties: {
          segments: {
            description: "Select list of segments.",
            items: {
              $ref: "#/components/schemas/schemaviewsObjectRefType"
            },
            title: "Segments",
            type: "array",
            "x-displayname": "Segments",
            "x-f5xc-required-for": {
              create: true,
              minimum_config: true,
              read: false,
              update: false
            },
            "x-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            },
            "x-ves-required": "true",
            "x-ves-validation-rules": {
              "ves.io.schema.rules.message.required": "true"
            }
          }
        },
        title: "Segment List",
        type: "object",
        "x-displayname": "Segment List.",
        "x-f5xc-cli-domain": "network_security",
        "x-f5xc-minimum-configuration": {
          description: "Minimum configuration for viewsSegmentRefList",
          example_json: `{
  "metadata": {
    "name": "example",
    "namespace": "default"
  },
  "spec": {
    "segments": "value"
  }
}`,
          example_yaml: `# Minimal example for viewsSegmentRefList
metadata:
  name: example
  namespace: default
spec:
  segments: value`,
          mutually_exclusive_groups: [],
          required_fields: ["segments"]
        },
        "x-ves-proto-message": "ves.io.schema.views.SegmentRefList"
      }
    }
  },
  info: {
    title: "XCify pinned F5 XC create contract",
    version: "6931752088bc2f0d5dd16aee63755cbbcfd804dd"
  },
  openapi: "3.0.3",
  "x-asm-migration-roots": {
    app_firewall: "app_firewallCreateRequest",
    ip_prefix_set: "ip_prefix_setCreateRequest",
    service_policy: "service_policyCreateRequest",
    service_policy_rule: "service_policy_ruleCreateRequest"
  }
};
// contracts/provenance.json
var provenance_default = {
  bundle_sha256: "305a95158e006f5bf9e8404679769f4ac24f092005828178a3398b6fa05ee72f",
  commit: "6931752088bc2f0d5dd16aee63755cbbcfd804dd",
  generator: {
    name: "asm-migration contract import",
    version: "2"
  },
  license: {
    attribution: "Copyright f5-sales-demo/api-specs-enriched contributors",
    spdx: "MIT"
  },
  release: "v4.0.3",
  repository: "f5-sales-demo/api-specs-enriched",
  roots: {
    app_firewall: "app_firewallCreateRequest",
    ip_prefix_set: "ip_prefix_setCreateRequest",
    service_policy: "service_policyCreateRequest",
    service_policy_rule: "service_policy_ruleCreateRequest"
  },
  schema_count: 76,
  source: {
    catalog_path: "api-catalog.json",
    catalog_sha256: "6e2a25f4d97167ddcca0116de0d1635a3c24731304ef06b8f9a402dd2f64e5c8",
    openapi_path: "openapi.json",
    source_spec_sha256: "9467423a0209b70ba871549f5f29651fe1f53e3aff12feee624fcc9e874062ad"
  }
};

// src/contract.ts
var bundle = f5xc_create_v1_default;
var provenance = provenance_default;
var schemas = bundle.components.schemas;
var roots = bundle["x-asm-migration-roots"];
function contractIdentity() {
  const digest = String(provenance.bundle_sha256);
  const source = provenance.source;
  return {
    repository: String(provenance.repository),
    commit: String(provenance.commit),
    source_spec_sha256: String(source.source_spec_sha256),
    catalog_sha256: String(source.catalog_sha256),
    bundle_sha256: digest
  };
}
function pathOf(instancePath) {
  if (!instancePath)
    return "$";
  return `$${instancePath.replace(/\/(\d+)(?=\/|$)/g, "[$1]").replace(/\/([^/]+)/g, ".$1")}`;
}
function resolveLayers(schema) {
  const result = [schema];
  const ref = schema.$ref;
  if (typeof ref === "string") {
    const name = ref.split("/").at(-1);
    const referenced = name ? schemas[name] : undefined;
    if (referenced)
      result.push(...resolveLayers(referenced));
  }
  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf)
      if (child && typeof child === "object")
        result.push(...resolveLayers(child));
  }
  return result;
}
function addIssue(issues, index, kind, parts, message) {
  let path = "$";
  for (const part of parts)
    path += typeof part === "number" ? `[${part}]` : `.${part}`;
  if (!issues.some((item) => item.resource_index === index && item.kind === kind && item.path === path && item.message === message))
    issues.push({ resource_index: index, kind, path, message });
}
function enriched(value, schema, parts, index, kind, issues) {
  const layers = resolveLayers(schema);
  const properties = {};
  let explicitMap = false;
  for (const layer of layers) {
    if (layer.properties && typeof layer.properties === "object")
      Object.assign(properties, layer.properties);
    if ("additionalProperties" in layer)
      explicitMap = layer.additionalProperties;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    if (Object.keys(properties).length) {
      for (const key of Object.keys(record).filter((key2) => !(key2 in properties)).sort())
        addIssue(issues, index, kind, [...parts, key], "field is absent from the create schema");
    } else if (explicitMap === false) {
      for (const key of Object.keys(record).sort())
        addIssue(issues, index, kind, [...parts, key], "field is absent from the create schema");
    }
    for (const [name, childSchema] of Object.entries(properties)) {
      const required = resolveLayers(childSchema).some((layer) => layer["x-f5xc-required-for"]?.create === true);
      if (required && !(name in record))
        addIssue(issues, index, kind, [...parts, name], "required create field is missing");
      if (name in record)
        enriched(record[name], childSchema, [...parts, name], index, kind, issues);
    }
    if (explicitMap && typeof explicitMap === "object") {
      for (const [name, child] of Object.entries(record))
        if (!(name in properties))
          enriched(child, explicitMap, [...parts, name], index, kind, issues);
    }
    for (const layer of layers)
      for (const [extension, encoded] of Object.entries(layer)) {
        if (!extension.startsWith("x-ves-oneof-field-") || typeof encoded !== "string")
          continue;
        const choices = JSON.parse(encoded);
        const present = choices.filter((choice) => (choice in record));
        if (present.length > 1)
          addIssue(issues, index, kind, parts, `mutually exclusive fields are present: ${present.join(", ")}`);
      }
  }
  if (Array.isArray(value)) {
    const itemSchema = layers.find((layer) => layer.items)?.items;
    if (itemSchema && typeof itemSchema === "object")
      value.forEach((child, childIndex) => {
        enriched(child, itemSchema, [...parts, childIndex], index, kind, issues);
      });
    const unique = layers.some((layer) => layer.uniqueItems === true || layer["x-f5xc-constraints"]?.uniqueItems === true);
    if (unique && new Set(value.map((item) => JSON.stringify(item))).size !== value.length)
      addIssue(issues, index, kind, parts, "array items must be unique");
  }
  for (const layer of layers) {
    const constraints = layer["x-f5xc-constraints"] ?? {};
    if (typeof value === "string") {
      if (typeof constraints.pattern === "string" && !new RegExp(`^(?:${constraints.pattern})$`).test(value))
        addIssue(issues, index, kind, parts, `does not match enriched pattern ${constraints.pattern}`);
      const byteLength = constraints.byteLength;
      if (typeof byteLength?.max === "number" && Buffer.byteLength(value) > byteLength.max)
        addIssue(issues, index, kind, parts, `UTF-8 value exceeds ${byteLength.max} bytes`);
      const rules = layer["x-validation-rules"] ?? {};
      if (rules["ves.io.schema.rules.string.ipv4_prefix"] === "true" && !validIpv4Prefix(value))
        addIssue(issues, index, kind, parts, "is not an IPv4 prefix");
    }
    if (typeof value === "number" && Number.isInteger(value)) {
      if (typeof constraints.minimum === "number" && value < constraints.minimum)
        addIssue(issues, index, kind, parts, `value is below enriched minimum ${constraints.minimum}`);
      if (typeof constraints.maximum === "number" && value > constraints.maximum)
        addIssue(issues, index, kind, parts, `value exceeds enriched maximum ${constraints.maximum}`);
      if (parts.at(-1) === "signature_id" && value !== 0 && value < 200000001)
        addIssue(issues, index, kind, parts, "signature ID must be 0 or in 200000001-299999999");
    }
  }
}
function validIpv4Prefix(value) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/.exec(value);
  return Boolean(match?.slice(1, 5).every((part) => Number(part) <= 255));
}
function isResource(value) {
  if (!value || typeof value !== "object")
    return false;
  const item = value;
  return typeof item.kind === "string" && item.metadata !== null && typeof item.metadata === "object" && item.spec !== null && typeof item.spec === "object";
}
function validateConfigPack(raw) {
  const identity = contractIdentity();
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      contract: identity,
      resource_count: 0,
      validated_resource_count: 0,
      issues: [{ path: "$", message: "config pack must be a JSON object" }]
    };
  }
  const issues = [];
  if (raw.schema_version !== "asm-migration.config-pack/v1")
    issues.push({ path: "$.schema_version", message: "must equal asm-migration.config-pack/v1" });
  if (!Array.isArray(raw.resources)) {
    issues.push({ path: "$.resources", message: "must be an array" });
    return {
      valid: false,
      contract: identity,
      resource_count: 0,
      validated_resource_count: 0,
      issues
    };
  }
  const resources = raw.resources;
  let validated = 0;
  const ajv = new import__2020.default({ strict: false, allErrors: true, validateFormats: true });
  import_ajv_formats.default(ajv);
  ajv.addFormat("boolean", true);
  resources.forEach((unknownResource, index) => {
    if (!isResource(unknownResource)) {
      issues.push({ resource_index: index, path: "$", message: "invalid resource shape" });
      return;
    }
    const resource = unknownResource;
    const kind = resource.kind;
    const schemaName = roots[kind];
    if (!schemaName) {
      issues.push({ resource_index: index, kind, path: "$", message: "unsupported resource kind" });
      return;
    }
    const before = issues.length;
    const body = { metadata: resource.metadata, spec: resource.spec };
    const validate = ajv.compile({ $ref: `#/components/schemas/${schemaName}`, components: bundle.components });
    if (!validate(body))
      for (const error of validate.errors ?? [])
        issues.push({
          resource_index: index,
          kind,
          path: pathOf(error.instancePath),
          message: error.message ?? "contract validation failed"
        });
    const rootSchema = schemas[schemaName];
    if (rootSchema)
      enriched(body, rootSchema, [], index, kind, issues);
    if (issues.length === before)
      validated += 1;
  });
  return {
    valid: issues.length === 0,
    contract: identity,
    resource_count: resources.length,
    validated_resource_count: validated,
    issues
  };
}

// src/converter.ts
import { Buffer as Buffer2 } from "buffer";

// src/naming.ts
import { createHash } from "crypto";
var OBJECT_NAME_LIMIT = 63;
function dnsLabel(value, limit = OBJECT_NAME_LIMIT) {
  let normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!normalized)
    normalized = "policy";
  if (/^[0-9]/.test(normalized))
    normalized = `p-${normalized}`;
  if (normalized.length <= limit)
    return normalized;
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 10);
  return `${normalized.slice(0, limit - digest.length - 1).replace(/-+$/g, "")}-${digest}`;
}
function uniqueRuleNames(values) {
  const seen = new Map;
  return values.map((value) => {
    const base = dnsLabel(value);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : dnsLabel(`${base}-${count + 1}`);
  });
}

// src/ranges.ts
function regexForRange(minimum, maximum) {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum) {
    throw new Error("range must satisfy 0 <= minimum <= maximum");
  }
  const patterns = [];
  let start = minimum;
  for (const stop of splitRanges(minimum, maximum)) {
    patterns.push(rangePattern(start, stop));
    start = stop + 1;
  }
  return `(?:${patterns.join("|")})`;
}
function regexesOutsideRange(minimum, maximum) {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum) {
    throw new Error("range must satisfy 0 <= minimum <= maximum");
  }
  const patterns = [".*[^0-9].*", "0[0-9]+"];
  const minimumText = String(minimum);
  const maximumText = String(maximum);
  if (minimum > 0) {
    if (minimumText.length > 1) {
      patterns.push("0");
      patterns.push(minimumText.length === 2 ? "[1-9]" : `[1-9][0-9]{0,${minimumText.length - 2}}`);
    }
    patterns.push(...fixedWidthBelow(minimumText));
  }
  patterns.push(...fixedWidthAbove(maximumText));
  patterns.push(`[1-9][0-9]{${maximumText.length},}`);
  return chunkAlternatives([...new Set(patterns)]);
}
function digitSpan(low, high) {
  return low === high ? String(low) : `[${low}-${high}]`;
}
function digitTail(length) {
  if (length === 0)
    return "";
  return length === 1 ? "[0-9]" : `[0-9]{${length}}`;
}
function fixedWidthBelow(bound) {
  const patterns = [];
  for (let index = 0;index < bound.length; index += 1) {
    const high = Number(bound[index]) - 1;
    const low = index === 0 && bound.length > 1 ? 1 : 0;
    if (high < low)
      continue;
    patterns.push(`${bound.slice(0, index)}${digitSpan(low, high)}${digitTail(bound.length - index - 1)}`);
  }
  return patterns;
}
function fixedWidthAbove(bound) {
  const patterns = [];
  for (let index = 0;index < bound.length; index += 1) {
    const low = Number(bound[index]) + 1;
    if (low > 9)
      continue;
    patterns.push(`${bound.slice(0, index)}${digitSpan(low, 9)}${digitTail(bound.length - index - 1)}`);
  }
  return patterns;
}
function chunkAlternatives(patterns) {
  const expressions = [];
  let current = [];
  for (const pattern of patterns) {
    const candidate = `^(?:${[...current, pattern].join("|")})$`;
    if (candidate.length > 256 && current.length) {
      expressions.push(`^(?:${current.join("|")})$`);
      current = [pattern];
    } else
      current.push(pattern);
  }
  if (current.length)
    expressions.push(`^(?:${current.join("|")})$`);
  if (expressions.length > 16 || expressions.some((expression) => expression.length > 256)) {
    throw new Error("range complement exceeds XC regex limits");
  }
  return expressions;
}
function splitRanges(minimum, maximum) {
  const stops = new Set([maximum]);
  let nines = 1;
  let prefix = String(minimum).slice(0, -nines);
  let stop = Number(`${prefix}${"9".repeat(nines)}`);
  while (minimum <= stop && stop < maximum) {
    stops.add(stop);
    nines += 1;
    prefix = String(minimum).slice(0, -nines);
    stop = Number(`${prefix}${"9".repeat(nines)}`);
  }
  let zeros = 1;
  stop = maximum - maximum % 10 ** zeros - 1;
  while (minimum < stop && stop < maximum) {
    stops.add(stop);
    zeros += 1;
    stop = maximum - maximum % 10 ** zeros - 1;
  }
  return [...stops].sort((a, b) => a - b);
}
function rangePattern(start, stop) {
  if (String(start).length !== String(stop).length)
    throw new Error("internal range split crossed a digit boundary");
  let pattern = "";
  let anyDigits = 0;
  for (let index = 0;index < String(start).length; index += 1) {
    const low = String(start)[index] ?? "";
    const high = String(stop)[index] ?? "";
    if (low === high)
      pattern += low;
    else if (low !== "0" || high !== "9")
      pattern += `[${low}-${high}]`;
    else
      anyDigits += 1;
  }
  if (anyDigits)
    pattern += anyDigits === 1 ? "\\d" : `\\d{${anyDigits}}`;
  return pattern;
}

// src/types.ts
class MigrationError extends Error {
  category;
  constructor(category, message) {
    super(message);
    this.category = category;
    this.name = "MigrationError";
  }
}

// src/converter.ts
var LIMITS = {
  responseCodes: 48,
  blockingPage: 4096,
  prefixes: 1024,
  prefixRefs: 4,
  rules: 256,
  signatureContexts: 1024
};
var IMPLICIT_RESPONSE_CODES = [
  100,
  101,
  102,
  103,
  200,
  201,
  202,
  203,
  204,
  205,
  206,
  207,
  208,
  226,
  300,
  301,
  302,
  303,
  304,
  305,
  306,
  307,
  308
];
var VIOLATION_MAP = {
  FILETYPE: "VIOL_FILETYPE",
  HTTP_STATUS_IN_RESPONSE: "VIOL_HTTP_RESPONSE_STATUS",
  ILLEGAL_METHOD: "VIOL_METHOD",
  METHOD: "VIOL_METHOD",
  MISSING_MANDATORY_HEADER: "VIOL_MANDATORY_HEADER"
};
var XC_HTTP_METHODS = new Set([
  "ANY",
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "CONNECT",
  "OPTIONS",
  "TRACE",
  "PATCH",
  "COPY"
]);
function chunks(values, size) {
  const result = [];
  for (let index = 0;index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}
function failOrWarn(message, code, allowPartial, warnings) {
  if (!allowPartial)
    throw new MigrationError("conversion", message);
  warnings.push({ code, message, blocking: true });
}
function baseRule(action, extra = {}) {
  return {
    action,
    waf_action: { none: {} },
    any_client: {},
    any_ip: {},
    any_asn: {},
    path: { prefix_values: ["/"] },
    ...extra
  };
}
function pathMatcher(value) {
  if (!value)
    return { prefix_values: ["/"] };
  if (!value.includes("*"))
    return { exact_values: [value] };
  const regex = `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*")}$`;
  const simple = /^\^([^.*+?{}[\]\\|()]+)\.\*\$$/.exec(regex);
  return simple ? { prefix_values: [simple[1]] } : { regex_values: [regex] };
}
function signatureRule(contextType, signatureIds, path, contextName) {
  const ids = Array.isArray(signatureIds) ? signatureIds : [signatureIds];
  const context = contextType === "global" ? "CONTEXT_ANY" : `CONTEXT_${contextType.toUpperCase()}`;
  const named = ["parameter", "header", "cookie"].includes(contextType) ? contextName : undefined;
  return baseRule("NEXT_POLICY", {
    ...path ? { path } : {},
    waf_action: {
      app_firewall_detection_control: {
        exclude_signature_contexts: ids.map((signature_id) => ({
          context,
          ...named ? { context_name: named } : {},
          signature_id
        }))
      }
    }
  });
}
function appFirewall(policy, namespace, target, options, warnings) {
  const disabled = [
    ...new Set(policy.violations.filter((item) => !item.block && VIOLATION_MAP[item.identifier]).map((item) => VIOLATION_MAP[item.identifier] ?? ""))
  ].sort();
  const statusEnforced = policy.violations.some((item) => item.identifier === "HTTP_STATUS_IN_RESPONSE" && item.block);
  let allowed;
  if (statusEnforced) {
    const responseCodes = [...new Set([...IMPLICIT_RESPONSE_CODES, ...policy.allowedResponseCodes])].sort((a, b) => a - b);
    if (responseCodes.length > LIMITS.responseCodes)
      failOrWarn(`${responseCodes.length} allowed response codes exceed pinned contract limit ${LIMITS.responseCodes}`, "response-code-limit", options.allowPartial, warnings);
    else
      allowed = { response_code: responseCodes };
  }
  let blockingPage;
  if (policy.customResponse) {
    const normalized = policy.customResponse.body.replaceAll("<%TS.request.ID()%>", "{{request_id}}");
    const encoded = Buffer2.from(normalized).toString("base64");
    if (encoded.length > LIMITS.blockingPage)
      failOrWarn(`custom blocking page exceeds pinned encoded-size limit ${LIMITS.blockingPage}`, "blocking-page-limit", options.allowPartial, warnings);
    else
      blockingPage = { response_code: "OK", blocking_page: `string:///${encoded}` };
  }
  return {
    kind: "app_firewall",
    metadata: { name: dnsLabel(`${target}-app-firewall`), namespace },
    spec: {
      ...policy.enforcementMode === "blocking" ? { blocking: {} } : { monitoring: {} },
      ...disabled.length ? { detection_settings: { violation_settings: { disabled_violation_types: disabled }, violations_view: [] } } : {},
      ...allowed ? { allowed_response_codes: allowed } : {},
      ...blockingPage ? { blocking_page: blockingPage } : {}
    }
  };
}
function clientControls(policy, namespace, target, options, warnings) {
  const resources = [];
  const rules = [];
  for (const [purpose, values, action, skipWaf] of [
    ["trusted", policy.trustedClients, "NEXT_POLICY", true],
    ["blocked", policy.blockedClients, "DENY", false]
  ]) {
    const ipv4 = values.filter((value) => !value.includes(":"));
    const ipv6 = values.filter((value) => value.includes(":"));
    if (ipv6.length)
      failOrWarn(`${purpose} IPv6 clients cannot be represented by ip_prefix_set`, "ipv6-client", options.allowPartial, warnings);
    let prefixChunks = chunks(ipv4, LIMITS.prefixes);
    if (prefixChunks.length > LIMITS.prefixRefs) {
      failOrWarn(`${purpose} clients require ${prefixChunks.length} prefix sets; rule reference limit is ${LIMITS.prefixRefs}`, "prefix-set-reference-limit", options.allowPartial, warnings);
      prefixChunks = prefixChunks.slice(0, LIMITS.prefixRefs);
    }
    const refs = [];
    prefixChunks.forEach((chunk, index) => {
      const suffix = prefixChunks.length === 1 ? "" : `-${index + 1}`;
      const name = dnsLabel(`${target}-${purpose}-clients${suffix}`);
      resources.push({
        kind: "ip_prefix_set",
        metadata: { name, namespace },
        spec: { ipv4_prefixes: chunk.map((ipv4_prefix) => ({ ipv4_prefix })) }
      });
      refs.push({ name, namespace });
    });
    if (refs.length)
      rules.push({
        metadata: { name: `${skipWaf ? "bypass-waf-for" : "deny"}-${purpose}-clients` },
        spec: {
          action,
          any_client: {},
          any_asn: {},
          path: { prefix_values: ["/"] },
          ip_matcher: { prefix_sets: refs },
          waf_action: skipWaf ? { waf_skip_processing: {} } : { none: {} }
        }
      });
  }
  return [resources, rules];
}
function serviceRules(policy, options, warnings) {
  const raw = [];
  for (const url of [...policy.urls].sort((a, b) => a.name.localeCompare(b.name))) {
    const path = pathMatcher(url.name);
    if (!url.allowed)
      raw.push([`deny-url-${url.name}`, baseRule("DENY", { path })]);
    if (!url.checkSignatures)
      raw.push([`disable-signatures-url-${url.name}`, signatureRule("url", 0, path)]);
    if (url.methods.length && url.methods.every((method) => XC_HTTP_METHODS.has(method)))
      raw.push([
        `deny-illegal-methods-url-${url.name}`,
        baseRule("DENY", { path, http_method: { methods: url.methods, invert_matcher: true } })
      ]);
  }
  if (policy.methods.length && policy.methods.every((method) => XC_HTTP_METHODS.has(method)))
    raw.push([
      "deny-illegal-methods",
      baseRule("DENY", { http_method: { methods: policy.methods, invert_matcher: true } })
    ]);
  for (const header of policy.headers) {
    if (header.mandatory)
      raw.push([
        `require-header-${header.name}`,
        baseRule("DENY", { headers: [{ name: header.name.toLowerCase(), check_not_present: {} }] })
      ]);
    if (!header.checkSignatures)
      raw.push([`disable-signatures-header-${header.name}`, signatureRule("header", 0, undefined, header.name)]);
  }
  for (const parameter of policy.parameters) {
    const path = parameter.url ? pathMatcher(parameter.url) : { prefix_values: ["/"] };
    if (parameter.minimumValue !== undefined && parameter.maximumValue !== undefined) {
      const regexes = regexesOutsideRange(parameter.minimumValue, parameter.maximumValue);
      raw.push([
        `parameter-range-${parameter.name}`,
        baseRule("DENY", {
          path,
          query_params: [{ key: parameter.name, item: { regex_values: regexes } }]
        })
      ]);
    }
    if (parameter.maximumLength !== undefined)
      raw.push([
        `parameter-maximum-length-${parameter.name}`,
        baseRule("DENY", {
          path,
          query_params: [{ key: parameter.name, item: { regex_values: [`^.{${parameter.maximumLength + 1},}$`] } }]
        })
      ]);
    if (!parameter.checkSignatures)
      raw.push([`disable-signatures-parameter-${parameter.name}`, signatureRule("parameter", 0, path, parameter.name)]);
  }
  if (policy.disallowedFileTypes.length)
    raw.push([
      "deny-file-types",
      baseRule("DENY", {
        path: { suffix_values: policy.disallowedFileTypes.map((item) => `.${item}`), transformers: ["LOWER_CASE"] }
      })
    ]);
  const mapping = new Map(options.signatures.signatures.map((item) => [item.asm_id, item.xc_id]));
  for (const override of policy.signatureOverrides) {
    const mapped = [];
    const missing = [];
    for (const asmId of override.disabledAsmIds) {
      const xcId = mapping.get(asmId);
      if (xcId)
        mapped.push(xcId);
      else if (asmId >= 200000001 && asmId <= 299999999)
        mapped.push(asmId);
      else
        missing.push(asmId);
    }
    if (missing.length)
      failOrWarn(`signature mapping missing ASM IDs: ${missing.join(", ")}`, "missing-signature", options.allowPartial, warnings);
    const ids = override.disableAll ? [0] : [...new Set(mapped)].sort((a, b) => a - b);
    chunks(ids, LIMITS.signatureContexts).forEach((chunk, index) => {
      if (!chunk.length)
        return;
      const suffix = ids.length <= LIMITS.signatureContexts ? "" : `-${index + 1}`;
      raw.push([
        `signature-exclusion-${override.contextType}-${override.contextName}${suffix}`,
        signatureRule(override.contextType, chunk, override.scopeUrl ? pathMatcher(override.scopeUrl) : undefined, override.contextName)
      ]);
    });
  }
  const names = uniqueRuleNames(raw.map(([name]) => name));
  return raw.map(([, spec], index) => ({ metadata: { name: names[index] ?? "rule" }, spec }));
}
function convert(policy, options) {
  const warnings = [];
  const unsupported = new Set(policy.unsupportedEnabledFeatures);
  for (const violation of policy.violations)
    if (!VIOLATION_MAP[violation.identifier])
      unsupported.add(violation.block ? violation.identifier : `disabled-violation:${violation.identifier}`);
  for (const method of [...policy.methods, ...policy.urls.flatMap((url) => url.methods)])
    if (!XC_HTTP_METHODS.has(method))
      unsupported.add(`http-method:${method}`);
  if (policy.modifiedCookies.length)
    unsupported.add("allowed-modified-cookie");
  if (unsupported.size) {
    const values = [...unsupported].sort();
    if (!options.allowPartial)
      throw new MigrationError("conversion", `enabled behavior cannot be represented by the pinned contract: ${values.join(", ")}`);
    warnings.push(...values.map((feature) => ({
      code: "unsupported-enabled-feature",
      message: `Enabled behavior was omitted: ${feature}`,
      blocking: true
    })));
  }
  const target = dnsLabel(options.targetName ?? policy.sourceName);
  const namespace = dnsLabel(options.namespace);
  const resources = [appFirewall(policy, namespace, target, options, warnings)];
  const [clientResources, clientRules] = clientControls(policy, namespace, target, options, warnings);
  resources.push(...clientResources);
  let rules = [...clientRules, ...serviceRules(policy, options, warnings)];
  if (rules.length > LIMITS.rules) {
    failOrWarn(`generated ${rules.length} rules; pinned contract limit is ${LIMITS.rules}`, "rule-limit", options.allowPartial, warnings);
    rules = rules.slice(0, LIMITS.rules);
    const referenced = new Set(rules.flatMap((rule) => (rule.spec.ip_matcher?.prefix_sets ?? []).map((ref) => ref.name)));
    for (let index = resources.length - 1;index >= 0; index -= 1)
      if (resources[index]?.kind === "ip_prefix_set" && !referenced.has(resources[index]?.metadata.name ?? ""))
        resources.splice(index, 1);
  }
  resources.push({
    kind: "service_policy",
    metadata: { name: dnsLabel(`${target}-service-policy`), namespace },
    spec: { rule_list: { rules } }
  });
  resources.sort((a, b) => `${a.kind}\x00${a.metadata.name}`.localeCompare(`${b.kind}\x00${b.metadata.name}`));
  const configPack = { schema_version: "asm-migration.config-pack/v1", resources };
  const validation = validateConfigPack(configPack);
  if (!validation.valid)
    throw new MigrationError("contract", `generated config pack violates pinned contract: ${validation.issues.slice(0, 5).map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  const counts = {};
  for (const resource of resources)
    counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
  const resource_counts = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  return {
    configPack,
    warnings,
    report: {
      complete: !warnings.some((warning) => warning.blocking),
      resource_counts,
      warning_count: warnings.length,
      contract: validation.contract,
      contract_valid: true
    },
    inputHashes: {}
  };
}
function mergeConfigPacks(...packs) {
  const resources = new Map;
  for (const pack of packs)
    for (const resource of pack.resources) {
      const key = `${resource.kind}/${resource.metadata.namespace}/${resource.metadata.name}`;
      const previous = resources.get(key);
      if (previous && JSON.stringify(previous) !== JSON.stringify(resource))
        throw new MigrationError("conversion", `conflicting resource identity: ${key}`);
      resources.set(key, resource);
    }
  const merged = {
    schema_version: "asm-migration.config-pack/v1",
    resources: [...resources.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, resource]) => resource)
  };
  if (!validateConfigPack(merged).valid)
    throw new MigrationError("contract", "merged config pack violates pinned contract");
  return merged;
}

// src/parser.ts
import { basename, extname } from "path";

// node_modules/fast-xml-parser/src/util.js
var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
var nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
var regexName = new RegExp("^" + nameRegexp + "$");
function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0;index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}
var isName = function(string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === "undefined");
};
function isExist(v) {
  return typeof v !== "undefined";
}

// node_modules/fast-xml-parser/src/validator.js
var defaultOptions = {
  allowBooleanAttributes: false,
  unpairedTags: []
};
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0;i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err)
        return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (;i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "\t" && xmlData[i] !== `
` && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject("InvalidTag", "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.", getLineNumberForPosition(xmlData, tagStartPos));
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) {} else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++;i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err)
                return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
}
function isWhiteSpace(char) {
  return char === " " || char === "\t" || char === `
` || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (;i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3;i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8;i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8;i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
var doubleQuote = '"';
var singleQuote = "'";
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (;i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {} else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
var validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
function validateAttributeString(attrStr, options) {
  const matches = getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i = 0;i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== undefined && matches[i][4] === undefined) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === undefined && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!attrNames.hasOwnProperty(attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (;i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (;i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return isName(attrName);
}
function validateTagName(tagname) {
  return isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}

// node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var defaultOptions2 = {
  preserveOrder: false,
  attributeNamePrefix: "@_",
  attributesGroupName: false,
  textNodeName: "#text",
  ignoreAttributes: true,
  removeNSPrefix: false,
  allowBooleanAttributes: false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true
  },
  tagValueProcessor: function(tagName, val) {
    return val;
  },
  attributeValueProcessor: function(attrName, val) {
    return val;
  },
  stopNodes: [],
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function(tagName, jPath, attrs) {
    return tagName;
  },
  captureMetaData: false
};
var buildOptions = function(options) {
  return Object.assign({}, defaultOptions2, options);
};

// node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var METADATA_SYMBOL;
if (typeof Symbol !== "function") {
  METADATA_SYMBOL = "@@xmlMetadata";
} else {
  METADATA_SYMBOL = Symbol("XML Node Metadata");
}

class XmlNode {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = [];
    this[":@"] = {};
  }
  add(key, val) {
    if (key === "__proto__")
      key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node, startIndex) {
    if (node.tagname === "__proto__")
      node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
    if (startIndex !== undefined) {
      this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
    }
  }
  static getMetaDataSymbol() {
    return METADATA_SYMBOL;
  }
}

// node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
function readDocType(xmlData, i) {
  const entities = {};
  if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
    i = i + 9;
    let angleBracketsCount = 1;
    let hasBody = false, comment = false;
    let exp = "";
    for (;i < xmlData.length; i++) {
      if (xmlData[i] === "<" && !comment) {
        if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
          i += 7;
          let entityName, val;
          [entityName, val, i] = readEntityExp(xmlData, i + 1);
          if (val.indexOf("&") === -1)
            entities[entityName] = {
              regx: RegExp(`&${entityName};`, "g"),
              val
            };
        } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
          i += 8;
          const { index } = readElementExp(xmlData, i + 1);
          i = index;
        } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
          i += 8;
        } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
          i += 9;
          const { index } = readNotationExp(xmlData, i + 1);
          i = index;
        } else if (hasSeq(xmlData, "!--", i))
          comment = true;
        else
          throw new Error(`Invalid DOCTYPE`);
        angleBracketsCount++;
        exp = "";
      } else if (xmlData[i] === ">") {
        if (comment) {
          if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
            comment = false;
            angleBracketsCount--;
          }
        } else {
          angleBracketsCount--;
        }
        if (angleBracketsCount === 0) {
          break;
        }
      } else if (xmlData[i] === "[") {
        hasBody = true;
      } else {
        exp += xmlData[i];
      }
    }
    if (angleBracketsCount !== 0) {
      throw new Error(`Unclosed DOCTYPE`);
    }
  } else {
    throw new Error(`Invalid Tag instead of DOCTYPE`);
  }
  return { entities, i };
}
var skipWhitespace = (data, index) => {
  while (index < data.length && /\s/.test(data[index])) {
    index++;
  }
  return index;
};
function readEntityExp(xmlData, i) {
  i = skipWhitespace(xmlData, i);
  let entityName = "";
  while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
    entityName += xmlData[i];
    i++;
  }
  validateEntityName(entityName);
  i = skipWhitespace(xmlData, i);
  if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
    throw new Error("External entities are not supported");
  } else if (xmlData[i] === "%") {
    throw new Error("Parameter entities are not supported");
  }
  let entityValue = "";
  [i, entityValue] = readIdentifierVal(xmlData, i, "entity");
  i--;
  return [entityName, entityValue, i];
}
function readNotationExp(xmlData, i) {
  i = skipWhitespace(xmlData, i);
  let notationName = "";
  while (i < xmlData.length && !/\s/.test(xmlData[i])) {
    notationName += xmlData[i];
    i++;
  }
  validateEntityName(notationName);
  i = skipWhitespace(xmlData, i);
  const identifierType = xmlData.substring(i, i + 6).toUpperCase();
  if (identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
    throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
  }
  i += identifierType.length;
  i = skipWhitespace(xmlData, i);
  let publicIdentifier = null;
  let systemIdentifier = null;
  if (identifierType === "PUBLIC") {
    [i, publicIdentifier] = readIdentifierVal(xmlData, i, "publicIdentifier");
    i = skipWhitespace(xmlData, i);
    if (xmlData[i] === '"' || xmlData[i] === "'") {
      [i, systemIdentifier] = readIdentifierVal(xmlData, i, "systemIdentifier");
    }
  } else if (identifierType === "SYSTEM") {
    [i, systemIdentifier] = readIdentifierVal(xmlData, i, "systemIdentifier");
    if (!systemIdentifier) {
      throw new Error("Missing mandatory system identifier for SYSTEM notation");
    }
  }
  return { notationName, publicIdentifier, systemIdentifier, index: --i };
}
function readIdentifierVal(xmlData, i, type) {
  let identifierVal = "";
  const startChar = xmlData[i];
  if (startChar !== '"' && startChar !== "'") {
    throw new Error(`Expected quoted string, found "${startChar}"`);
  }
  i++;
  while (i < xmlData.length && xmlData[i] !== startChar) {
    identifierVal += xmlData[i];
    i++;
  }
  if (xmlData[i] !== startChar) {
    throw new Error(`Unterminated ${type} value`);
  }
  i++;
  return [i, identifierVal];
}
function readElementExp(xmlData, i) {
  i = skipWhitespace(xmlData, i);
  let elementName = "";
  while (i < xmlData.length && !/\s/.test(xmlData[i])) {
    elementName += xmlData[i];
    i++;
  }
  if (!validateEntityName(elementName)) {
    throw new Error(`Invalid element name: "${elementName}"`);
  }
  i = skipWhitespace(xmlData, i);
  let contentModel = "";
  if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i))
    i += 4;
  else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i))
    i += 2;
  else if (xmlData[i] === "(") {
    i++;
    while (i < xmlData.length && xmlData[i] !== ")") {
      contentModel += xmlData[i];
      i++;
    }
    if (xmlData[i] !== ")") {
      throw new Error("Unterminated content model");
    }
  } else {
    throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
  }
  return {
    elementName,
    contentModel: contentModel.trim(),
    index: i
  };
}
function hasSeq(data, seq, i) {
  for (let j = 0;j < seq.length; j++) {
    if (seq[j] !== data[i + j + 1])
      return false;
  }
  return true;
}
function validateEntityName(name) {
  if (isName(name))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}

// node_modules/anynum/digitTable.js
var SCRIPT_ZEROS = [
  48,
  1632,
  1776,
  2406,
  2534,
  2662,
  2790,
  2918,
  3046,
  3174,
  3302,
  3430,
  3558,
  3664,
  3792,
  3872,
  4160,
  4240,
  6112,
  6160,
  6470,
  6608,
  6784,
  6800,
  6992,
  7088,
  7232,
  7248,
  65296,
  120782,
  120792,
  120802,
  120812,
  120822,
  66720,
  68912,
  69734,
  69872,
  69942,
  70096,
  70384,
  70736,
  70864,
  71248,
  71360,
  71472,
  71904,
  72016,
  72688,
  72784,
  73040,
  73120,
  73552,
  92768,
  92864,
  93008,
  123200,
  123632,
  124144,
  125264,
  130032
];
var NOT_DIGIT = 255;
var HIGH_MAP = new Map;
var LOW_MAX = 65535;
var LOW_MIN = 1632;
var TABLE_OFFSET = LOW_MIN;
var TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
var TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
for (const zero of SCRIPT_ZEROS) {
  for (let d = 0;d < 10; d++) {
    const cp = zero + d;
    if (cp <= LOW_MAX) {
      TABLE[cp - TABLE_OFFSET] = d;
    } else {
      HIGH_MAP.set(cp, d);
    }
  }
}

// node_modules/anynum/anynum.js
var CHAR_0 = 48;
var CHAR_9 = 57;
var CHAR_MINUS = 45;
var MINUS_SET = new Set([8722, 65293, 65123]);
function anynum(str) {
  if (typeof str !== "string")
    return str;
  const len = str.length;
  if (len === 0)
    return str;
  let firstHit = -1;
  for (let i = 0;i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS)
      continue;
    if (cc < TABLE_OFFSET) {
      if (MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          if (HIGH_MAP.has(cp)) {
            firstHit = i;
            break;
          }
        }
      }
      continue;
    }
    if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
      firstHit = i;
      break;
    }
  }
  if (firstHit === -1)
    return str;
  const chars = [];
  if (firstHit > 0)
    chars.push(str.slice(0, firstHit));
  for (let i = firstHit;i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
      chars.push(str[i]);
      continue;
    }
    if (cc < TABLE_OFFSET) {
      chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          const d2 = HIGH_MAP.get(cp);
          if (d2 !== undefined) {
            chars.push(String.fromCharCode(d2 + 48));
            i++;
            continue;
          }
        }
      }
      chars.push(str[i]);
      continue;
    }
    if (MINUS_SET.has(cc)) {
      chars.push("-");
      continue;
    }
    const d = TABLE[cc - TABLE_OFFSET];
    chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
  }
  return chars.join("");
}
var anynum_default = anynum;

// node_modules/strnum/strnum.js
var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
var binRegex = /^0b[01]+$/;
var octRegex = /^0o[0-7]+$/;
var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
var consider = {
  hex: true,
  binary: false,
  octal: false,
  leadingZeros: true,
  decimalPoint: ".",
  eNotation: true,
  infinity: "original",
  unicode: false
};
function toNumber(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string")
    return str;
  let trimmedStr = str.trim();
  if (trimmedStr.length === 0)
    return str;
  else if (options.skipLike !== undefined && options.skipLike.test(trimmedStr))
    return str;
  else if (trimmedStr === "0")
    return 0;
  if (options.unicode) {
    trimmedStr = anynum_default(trimmedStr);
    if (trimmedStr === "0")
      return 0;
  }
  if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (options.binary && binRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 2);
  } else if (options.octal && octRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 8);
  } else if (!isFinite(trimmedStr)) {
    return handleInfinity(str, Number(trimmedStr), options);
  } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
    return resolveEnotation(str, trimmedStr, options);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1] || "";
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const decimalAdjacentToLeadingZeros = sign ? str[leadingZeros.length + 1] === "." : str[leadingZeros.length] === ".";
      if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
        return str;
      } else {
        const num = Number(trimmedStr);
        const parsedStr = String(num);
        if (num === 0)
          return num;
        if (parsedStr.search(/[eE]/) !== -1) {
          if (options.eNotation)
            return num;
          else
            return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (parsedStr === "0")
            return num;
          else if (parsedStr === numTrimmedByZeros)
            return num;
          else if (parsedStr === `${sign}${numTrimmedByZeros}`)
            return num;
          else
            return str;
        }
        let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
        if (leadingZeros) {
          return n === parsedStr || sign + n === parsedStr ? num : str;
        } else {
          return n === parsedStr || n === sign + parsedStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
function resolveEnotation(str, trimmedStr, options) {
  if (!options.eNotation)
    return str;
  const notation = trimmedStr.match(eNotationRegx);
  if (notation) {
    let sign = notation[1] || "";
    const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
    const leadingZeros = notation[2];
    const eAdjacentToLeadingZeros = sign ? str[leadingZeros.length + 1] === eChar : str[leadingZeros.length] === eChar;
    if (leadingZeros.length > 1 && eAdjacentToLeadingZeros)
      return str;
    else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
      return Number(trimmedStr);
    } else if (leadingZeros.length > 0) {
      if (options.leadingZeros && !eAdjacentToLeadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
        return Number(trimmedStr);
      } else
        return str;
    } else {
      return Number(trimmedStr);
    }
  } else {
    return str;
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    let end = numStr.length;
    while (end > 0 && numStr.charCodeAt(end - 1) === 48)
      end--;
    numStr = numStr.slice(0, end);
    if (numStr === ".")
      numStr = "0";
    else if (numStr[0] === ".")
      numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".")
      numStr = numStr.substring(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  const str = numStr.trim();
  if (base === 2 || base === 8)
    numStr = str.substring(2);
  if (parseInt)
    return parseInt(numStr, base);
  else if (Number.parseInt)
    return Number.parseInt(numStr, base);
  else if (window && window.parseInt)
    return window.parseInt(numStr, base);
  else
    throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
function handleInfinity(str, num, options) {
  const isPositive = num === Infinity;
  switch (options.infinity.toLowerCase()) {
    case "null":
      return null;
    case "infinity":
      return num;
    case "string":
      return isPositive ? "Infinity" : "-Infinity";
    case "original":
    default:
      return str;
  }
}

// node_modules/fast-xml-parser/src/ignoreAttributes.js
function getIgnoreAttributesFn(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}

// node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
class OrderedObjParser {
  constructor(options) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.docTypeEntities = {};
    this.lastEntities = {
      apos: { regex: /&(apos|#39|#x27);/g, val: "'" },
      gt: { regex: /&(gt|#62|#x3E);/g, val: ">" },
      lt: { regex: /&(lt|#60|#x3C);/g, val: "<" },
      quot: { regex: /&(quot|#34|#x22);/g, val: '"' }
    };
    this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
    this.htmlEntities = {
      space: { regex: /&(nbsp|#160);/g, val: " " },
      cent: { regex: /&(cent|#162);/g, val: "\xA2" },
      pound: { regex: /&(pound|#163);/g, val: "\xA3" },
      yen: { regex: /&(yen|#165);/g, val: "\xA5" },
      euro: { regex: /&(euro|#8364);/g, val: "\u20AC" },
      copyright: { regex: /&(copy|#169);/g, val: "\xA9" },
      reg: { regex: /&(reg|#174);/g, val: "\xAE" },
      inr: { regex: /&(inr|#8377);/g, val: "\u20B9" },
      num_dec: { regex: /&#([0-9]{1,7});/g, val: (_, str) => String.fromCodePoint(Number.parseInt(str, 10)) },
      num_hex: { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str) => String.fromCodePoint(Number.parseInt(str, 16)) }
    };
    this.addExternalEntities = addExternalEntities;
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
  }
}
function addExternalEntities(externalEntities) {
  const entKeys = Object.keys(externalEntities);
  for (let i = 0;i < entKeys.length; i++) {
    const ent = entKeys[i];
    this.lastEntities[ent] = {
      regex: new RegExp("&" + ent + ";", "g"),
      val: externalEntities[ent]
    };
  }
}
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  if (val !== undefined) {
    if (this.options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities)
        val = this.replaceEntitiesValue(val);
      const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
      if (newval === null || newval === undefined) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (this.options.trimValues) {
        return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
var attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
function buildAttributesMap(attrStr, jPath, tagName) {
  if (this.options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    for (let i = 0;i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPath)) {
        continue;
      }
      let oldVal = matches[i][4];
      let aName = this.options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (this.options.transformAttributeName) {
          aName = this.options.transformAttributeName(aName);
        }
        if (aName === "__proto__")
          aName = "#__proto__";
        if (oldVal !== undefined) {
          if (this.options.trimValues) {
            oldVal = oldVal.trim();
          }
          oldVal = this.replaceEntitiesValue(oldVal);
          const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
          if (newVal === null || newVal === undefined) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, this.options.parseAttributeValue, this.options.numberParseOptions);
          }
        } else if (this.options.allowBooleanAttributes) {
          attrs[aName] = true;
        }
      }
    }
    if (!Object.keys(attrs).length) {
      return;
    }
    if (this.options.attributesGroupName) {
      const attrCollection = {};
      attrCollection[this.options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
var parseXml = function(xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, `
`);
  const xmlObj = new XmlNode("!xml");
  let currentNode = xmlObj;
  let textData = "";
  let jPath = "";
  for (let i = 0;i < xmlData.length; i++) {
    const ch = xmlData[i];
    if (ch === "<") {
      if (xmlData[i + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();
        if (this.options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }
        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
        }
        const lastTagName = jPath.substring(jPath.lastIndexOf(".") + 1);
        if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        let propIndex = 0;
        if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
          propIndex = jPath.lastIndexOf(".", jPath.lastIndexOf(".") - 1);
          this.tagsNodeStack.pop();
        } else {
          propIndex = jPath.lastIndexOf(".");
        }
        jPath = jPath.substring(0, propIndex);
        currentNode = this.tagsNodeStack.pop();
        textData = "";
        i = closeIndex;
      } else if (xmlData[i + 1] === "?") {
        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData)
          throw new Error("Pi Tag is not closed.");
        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) {} else {
          const childNode = new XmlNode(tagData.tagName);
          childNode.add(this.options.textNodeName, "");
          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
          }
          this.addChild(currentNode, childNode, jPath, i);
        }
        i = tagData.closeIndex + 1;
      } else if (xmlData.substr(i + 1, 3) === "!--") {
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (this.options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);
          textData = this.saveTextToParentTag(textData, currentNode, jPath);
          currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (xmlData.substr(i + 1, 2) === "!D") {
        const result = readDocType(xmlData, i);
        this.docTypeEntities = result.entities;
        i = result.i;
      } else if (xmlData.substr(i + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);
        textData = this.saveTextToParentTag(textData, currentNode, jPath);
        let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true, true);
        if (val == undefined)
          val = "";
        if (this.options.cdataPropName) {
          currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(this.options.textNodeName, val);
        }
        i = closeIndex + 2;
      } else {
        let result = readTagExp(xmlData, i, this.options.removeNSPrefix);
        let tagName = result.tagName;
        const rawTagName = result.rawTagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;
        if (this.options.transformTagName) {
          tagName = this.options.transformTagName(tagName);
        }
        if (currentNode && textData) {
          if (currentNode.tagname !== "!xml") {
            textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
          }
        }
        const lastTag = currentNode;
        if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
          currentNode = this.tagsNodeStack.pop();
          jPath = jPath.substring(0, jPath.lastIndexOf("."));
        }
        if (tagName !== xmlObj.tagname) {
          jPath += jPath ? "." + tagName : tagName;
        }
        const startIndex = i;
        if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) {
          let tagContent = "";
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              jPath = jPath.substr(0, jPath.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            i = result.closeIndex;
          } else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
            i = result.closeIndex;
          } else {
            const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result2)
              throw new Error(`Unexpected end of ${rawTagName}`);
            i = result2.i;
            tagContent = result2.tagContent;
          }
          const childNode = new XmlNode(tagName);
          if (tagName !== tagExp && attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
          }
          if (tagContent) {
            tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
          }
          jPath = jPath.substr(0, jPath.lastIndexOf("."));
          childNode.add(this.options.textNodeName, tagContent);
          this.addChild(currentNode, childNode, jPath, startIndex);
        } else {
          if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
            if (tagName[tagName.length - 1] === "/") {
              tagName = tagName.substr(0, tagName.length - 1);
              jPath = jPath.substr(0, jPath.length - 1);
              tagExp = tagName;
            } else {
              tagExp = tagExp.substr(0, tagExp.length - 1);
            }
            if (this.options.transformTagName) {
              tagName = this.options.transformTagName(tagName);
            }
            const childNode = new XmlNode(tagName);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            this.addChild(currentNode, childNode, jPath, startIndex);
            jPath = jPath.substr(0, jPath.lastIndexOf("."));
          } else {
            const childNode = new XmlNode(tagName);
            this.tagsNodeStack.push(currentNode);
            if (tagName !== tagExp && attrExpPresent) {
              childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
            }
            this.addChild(currentNode, childNode, jPath, startIndex);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};
function addChild(currentNode, childNode, jPath, startIndex) {
  if (!this.options.captureMetaData)
    startIndex = undefined;
  const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
  if (result === false) {} else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}
var replaceEntitiesValue = function(val) {
  if (this.options.processEntities) {
    for (let entityName in this.docTypeEntities) {
      const entity = this.docTypeEntities[entityName];
      val = val.replace(entity.regx, entity.val);
    }
    for (let entityName in this.lastEntities) {
      const entity = this.lastEntities[entityName];
      val = val.replace(entity.regex, entity.val);
    }
    if (this.options.htmlEntities) {
      for (let entityName in this.htmlEntities) {
        const entity = this.htmlEntities[entityName];
        val = val.replace(entity.regex, entity.val);
      }
    }
    val = val.replace(this.ampEntity.regex, this.ampEntity.val);
  }
  return val;
};
function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
  if (textData) {
    if (isLeafNode === undefined)
      isLeafNode = currentNode.child.length === 0;
    textData = this.parseTextData(textData, currentNode.tagname, jPath, false, currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false, isLeafNode);
    if (textData !== undefined && textData !== "")
      currentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode(stopNodes, jPath, currentTagName) {
  const allNodesExp = "*." + currentTagName;
  for (const stopNodePath in stopNodes) {
    const stopNodeExp = stopNodes[stopNodePath];
    if (allNodesExp === stopNodeExp || jPath === stopNodeExp)
      return true;
  }
  return false;
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary;
  let tagExp = "";
  for (let index = i;index < xmlData.length; index++) {
    let ch = xmlData[index];
    if (attrBoundary) {
      if (ch === attrBoundary)
        attrBoundary = "";
    } else if (ch === '"' || ch === "'") {
      attrBoundary = ch;
    } else if (ch === closingChar[0]) {
      if (closingChar[1]) {
        if (xmlData[index + 1] === closingChar[1]) {
          return {
            data: tagExp,
            index
          };
        }
      } else {
        return {
          data: tagExp,
          index
        };
      }
    } else if (ch === "\t") {
      ch = " ";
    }
    tagExp += ch;
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result)
    return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  for (;i < xmlData.length; i++) {
    if (xmlData[i] === "<") {
      if (xmlData[i + 1] === "/") {
        const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (xmlData[i + 1] === "?") {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 3) === "!--") {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 2) === "![") {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, ">");
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true")
      return true;
    else if (newval === "false")
      return false;
    else
      return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}

// node_modules/fast-xml-parser/src/xmlparser/node2json.js
var METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
function prettify(node, options) {
  return compress(node, options);
}
function compress(arr, options, jPath) {
  let text;
  const compressedObj = {};
  for (let i = 0;i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    let newJpath = "";
    if (jPath === undefined)
      newJpath = property;
    else
      newJpath = jPath + "." + property;
    if (property === options.textNodeName) {
      if (text === undefined)
        text = tagObj[property];
      else
        text += "" + tagObj[property];
    } else if (property === undefined) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, newJpath);
      const isLeaf = isLeafTag(val, options);
      if (tagObj[METADATA_SYMBOL2] !== undefined) {
        val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
      }
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], newJpath, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== undefined && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode)
          val[options.textNodeName] = "";
        else
          val = "";
      }
      if (compressedObj[property] !== undefined && compressedObj.hasOwnProperty(property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        if (options.isArray(property, newJpath, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
    }
  }
  if (typeof text === "string") {
    if (text.length > 0)
      compressedObj[options.textNodeName] = text;
  } else if (text !== undefined)
    compressedObj[options.textNodeName] = text;
  return compressedObj;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0;i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@")
      return key;
  }
}
function assignAttributes(obj, attrMap, jpath, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0;i < len; i++) {
      const atrrName = keys[i];
      if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}

// node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
class XMLParser {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
  }
  parse(xmlData, validationOption) {
    if (typeof xmlData === "string") {} else if (xmlData.toString) {
      xmlData = xmlData.toString();
    } else {
      throw new Error("XML data is accepted in String or Bytes[] form.");
    }
    if (validationOption) {
      if (validationOption === true)
        validationOption = {};
      const result = validate(xmlData, validationOption);
      if (result !== true) {
        throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
      }
    }
    const orderedObjParser = new OrderedObjParser(this.options);
    orderedObjParser.addExternalEntities(this.externalEntities);
    const orderedResult = orderedObjParser.parseXml(xmlData);
    if (this.options.preserveOrder || orderedResult === undefined)
      return orderedResult;
    else
      return prettify(orderedResult, this.options);
  }
  addEntity(key, value) {
    if (value.indexOf("&") !== -1) {
      throw new Error("Entity value can't have '&'");
    } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
      throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
    } else if (value === "&") {
      throw new Error("An entity with value '&' is not permitted");
    } else {
      this.externalEntities[key] = value;
    }
  }
  static getMetaDataSymbol() {
    return XmlNode.getMetaDataSymbol();
  }
}

// node_modules/fast-xml-parser/src/fxp.js
var XMLValidator = {
  validate
};

// src/parser.ts
var import_ipaddr = __toESM(require_ipaddr(), 1);
var MAX_XML_BYTES = 128 * 1024 * 1024;
var array = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
var object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function xmlText(value) {
  return String(value).replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal))).replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}
function text(node, key, fallback) {
  const value = node[key];
  if (value === undefined || value === null)
    return fallback;
  if (typeof value === "object") {
    const nested = object(value)["#text"];
    return nested === undefined ? fallback : xmlText(nested).trim();
  }
  return xmlText(value).trim();
}
function name(node, fallback = "*") {
  return xmlText(node["@_name"] ?? text(node, "name") ?? text(node, "parameter_name") ?? text(node, "header_name") ?? fallback);
}
function truth(value, fallback = false) {
  if (value === undefined || value === null)
    return fallback;
  return ["1", "true", "enabled", "yes"].includes(String(value).trim().toLowerCase());
}
function integer(value) {
  if (value === undefined || value === "" || value === "0")
    return;
  if (!/^-?\d+$/.test(value))
    throw new MigrationError("validation", "expected an integer value");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new MigrationError("validation", "integer value is outside the supported range");
  return parsed;
}
function uniqueSorted(values) {
  return [...new Set(values)].sort();
}
function controls(values) {
  const keyed = new Map;
  for (const value of values) {
    const item = object(value);
    const control = {
      name: name(item),
      mandatory: truth(text(item, "is_mandatory")),
      checkSignatures: truth(text(item, "check_attack_signatures", text(item, "check_signatures", "true")), true)
    };
    keyed.set(`${control.name}\x00${control.mandatory}\x00${control.checkSignatures}`, control);
  }
  return [...keyed.values()].sort((a, b) => `${a.name}\x00${a.mandatory}\x00${a.checkSignatures}`.localeCompare(`${b.name}\x00${b.mandatory}\x00${b.checkSignatures}`));
}
function normalizedNetwork(item) {
  const address = text(item, "ip_address") ?? (item["@_ip"] ? String(item["@_ip"]) : undefined);
  const mask = text(item, "subnet_mask") ?? (item["@_mask"] ? String(item["@_mask"]) : undefined);
  if (!address)
    return;
  try {
    const parsed = import_ipaddr.default.parse(address);
    let prefix;
    if (!mask)
      prefix = parsed.kind() === "ipv6" ? 128 : 32;
    else if (/^\d+$/.test(mask))
      prefix = Number(mask);
    else {
      const maskAddress = import_ipaddr.default.parse(mask);
      if (maskAddress.kind() !== parsed.kind())
        throw new Error("address family mismatch");
      const bits = maskAddress.toByteArray().map((byte) => byte.toString(2).padStart(8, "0")).join("");
      if (bits.includes("01"))
        throw new Error("non-contiguous mask");
      prefix = bits.replace(/0/g, "").length;
    }
    const network = parsed.kind() === "ipv4" ? import_ipaddr.default.IPv4.networkAddressFromCIDR(`${address}/${prefix}`) : import_ipaddr.default.IPv6.networkAddressFromCIDR(`${address}/${prefix}`);
    return `${network.toString()}/${prefix}`;
  } catch {
    throw new MigrationError("validation", "invalid client network");
  }
}
function parameters(root) {
  const result = new Map;
  const add = (value, url) => {
    const item = object(value);
    const minimumValue = integer(text(item, "minimum_value"));
    const maximumValue = integer(text(item, "maximum_value"));
    const maximumLength = integer(text(item, "maximum_length"));
    const parameter = {
      name: name(item),
      location: String(item["@_location"] ?? text(item, "location", "any")),
      ...url ? { url } : {},
      ...minimumValue !== undefined ? { minimumValue } : {},
      ...maximumValue !== undefined ? { maximumValue } : {},
      ...maximumLength !== undefined ? { maximumLength } : {},
      checkSignatures: truth(text(item, "check_attack_signatures", text(item, "check_signatures", "true")), true)
    };
    result.set(JSON.stringify(parameter), parameter);
  };
  for (const value of array(object(root.parameters).parameter))
    add(value);
  for (const urlValue of array(object(root.urls).url)) {
    const url = object(urlValue);
    for (const value of [...array(url.parameter), ...array(object(url.parameters).parameter)])
      add(value, name(url, "/"));
  }
  return [...result.values()].sort((a, b) => `${a.url ?? ""}\x00${a.location}\x00${a.name}`.localeCompare(`${b.url ?? ""}\x00${b.location}\x00${b.name}`));
}
function signatureOverrides(root) {
  const groups = new Map;
  const add = (attack, context) => {
    const state = String(attack["#text"] ?? "").trim().toLowerCase();
    const enabled = !["disabled", "false", "0"].includes(state) && truth(text(attack, "enabled"), true);
    if (enabled)
      return;
    const ids = new Set;
    const direct = attack["@_sig_id"] ?? attack["@_id"];
    if (direct !== undefined && /^\d+$/.test(String(direct)))
      ids.add(Number(direct));
    for (const value of array(attack.signature)) {
      const signature = object(value);
      const raw = signature["@_signature_id"] ?? signature["@_sig_id"] ?? signature["@_id"] ?? signature["#text"];
      if (raw !== undefined && /^\d+$/.test(String(raw).trim()))
        ids.add(Number(raw));
    }
    const key = `${context.type}\x00${context.name}\x00${context.scopeUrl ?? ""}`;
    const group = groups.get(key) ?? { context, ids: new Set, disableAll: false };
    for (const id of ids)
      group.ids.add(id);
    if (ids.size === 0)
      group.disableAll = true;
    groups.set(key, group);
  };
  const walk = (value, context) => {
    if (Array.isArray(value)) {
      for (const child of value)
        walk(child, context);
      return;
    }
    if (!value || typeof value !== "object")
      return;
    const node = object(value);
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("@_") || key === "#text" || key === "attack_signatures")
        continue;
      if (key === "attack_signature") {
        for (const attack of array(child))
          add(object(attack), context);
        continue;
      }
      for (const childValue of array(child)) {
        const childNode = object(childValue);
        let next = context;
        if (key === "url")
          next = { type: "url", name: name(childNode), scopeUrl: name(childNode, "/") };
        if (key === "parameter")
          next = {
            type: "parameter",
            name: name(childNode),
            ...context.scopeUrl ? { scopeUrl: context.scopeUrl } : {}
          };
        if (key === "header")
          next = { type: "header", name: name(childNode), ...context.scopeUrl ? { scopeUrl: context.scopeUrl } : {} };
        if (key === "cookie" || key === "allowed_modified_cookie")
          next = { type: "cookie", name: name(childNode), ...context.scopeUrl ? { scopeUrl: context.scopeUrl } : {} };
        walk(childValue, next);
      }
    }
  };
  walk(root, { type: "global", name: "*" });
  for (const value of array(object(root.attack_signatures).signature)) {
    const signature = object(value);
    if (truth(text(signature, "enabled"), true))
      continue;
    const raw = signature["@_signature_id"];
    if (raw !== undefined && /^\d+$/.test(String(raw))) {
      const context = { type: "global", name: "*" };
      const key = "global\x00*\x00";
      const group = groups.get(key) ?? { context, ids: new Set, disableAll: false };
      group.ids.add(Number(raw));
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => `${a.context.type}\x00${a.context.name}\x00${a.context.scopeUrl ?? ""}`.localeCompare(`${b.context.type}\x00${b.context.name}\x00${b.context.scopeUrl ?? ""}`)).map(({ context, ids, disableAll }) => ({
    contextType: context.type,
    contextName: context.name,
    disabledAsmIds: [...ids].sort((a, b) => a - b),
    disableAll,
    ...context.scopeUrl ? { scopeUrl: context.scopeUrl } : {}
  }));
}
function parseAsmXml(payload, sourcePath = "policy.xml") {
  if (payload.byteLength > MAX_XML_BYTES)
    throw new MigrationError("unsafe_input", `policy exceeds ${MAX_XML_BYTES} byte limit`);
  const prefix = new TextDecoder().decode(payload.slice(0, 65536)).toLowerCase();
  if (prefix.includes("<!doctype") || prefix.includes("<!entity"))
    throw new MigrationError("unsafe_input", "DTD and entity declarations are not allowed");
  let xml;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch {
    throw new MigrationError("validation", "invalid ASM XML encoding");
  }
  const validation = XMLValidator.validate(xml, { allowBooleanAttributes: false });
  if (validation !== true)
    throw new MigrationError("validation", "invalid ASM XML");
  let parsed;
  try {
    parsed = object(new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
      trimValues: true,
      removeNSPrefix: true,
      ignoreDeclaration: true
    }).parse(xml));
  } catch {
    throw new MigrationError("validation", "invalid ASM XML");
  }
  const root = object(parsed.policy);
  if (!parsed.policy || Object.keys(parsed).length !== 1)
    throw new MigrationError("validation", "root element must be policy");
  const blocking = object(root.blocking);
  const urls = array(object(root.urls).url).map((value) => {
    const item = object(value);
    const methodValues2 = [...array(item.method), ...array(object(item.methods).method)].map((method) => {
      const node = object(method);
      return String(node["@_name"] ?? node["#text"] ?? method).trim().toUpperCase();
    }).filter(Boolean);
    return {
      name: name(item, "/"),
      allowed: truth(text(item, "is_allowed"), true),
      checkSignatures: truth(text(item, "check_attack_signatures", text(item, "check_signatures", "true")), true),
      methods: uniqueSorted(methodValues2)
    };
  });
  const methodValues = [...array(object(root.http_methods).http_method), ...array(object(root.methods).method)].map((value) => name(object(value)).toUpperCase().replace("UPDATE", "PATCH")).filter((value) => value !== "*");
  const responseCodes = array(root.allowed_response_code).map((value) => {
    const raw = typeof value === "object" ? String(object(value)["#text"] ?? "") : String(value);
    if (!/^\d+$/.test(raw))
      throw new MigrationError("validation", "invalid HTTP response code");
    const code = Number(raw);
    if (code < 100 || code > 599)
      throw new MigrationError("validation", "HTTP response code out of range");
    return code;
  });
  const networkValues = (values) => uniqueSorted(values.map((value) => normalizedNetwork(object(value))).filter((value) => Boolean(value))).sort((a, b) => a.includes(":") === b.includes(":") ? a.localeCompare(b) : a.includes(":") ? 1 : -1);
  const customPages = array(blocking.response_page).map(object).filter((item) => item["@_cause"] === "default" && text(item, "response_type") === "custom");
  const customBody = customPages.length ? text(customPages[0] ?? {}, "response_html_code") : undefined;
  const unsupported = [
    ["csrf", object(root.csrf).enabled],
    ["session-awareness", object(root.session_awareness).enabled],
    ["redirection-protection", object(root.redirection_protection).enabled]
  ].filter(([, value]) => truth(typeof value === "object" ? object(value)["#text"] : value)).map(([key]) => key);
  return {
    sourceName: basename(sourcePath, extname(sourcePath)),
    enforcementMode: text(blocking, "enforcement_mode", "blocking")?.toLowerCase() === "transparent" ? "transparent" : "blocking",
    violations: array(blocking.violation).map((value) => {
      const item = object(value);
      return {
        identifier: String(item["@_id"] ?? name(item)),
        alarm: truth(text(item, "alarm")),
        block: truth(text(item, "block"))
      };
    }),
    urls,
    methods: uniqueSorted(methodValues),
    headers: controls([...array(object(root.headers).header), ...array(root.header)]),
    modifiedCookies: controls(array(object(root.headers).allowed_modified_cookie)),
    parameters: parameters(root),
    disallowedFileTypes: uniqueSorted(array(object(object(root.file_types).disallowed_file_types).file_type).map((value) => name(object(value)).toLowerCase().replace(/^\./, "")).filter((value) => value !== "*")),
    allowedResponseCodes: [...new Set(responseCodes)].sort((a, b) => a - b),
    trustedClients: networkValues(array(root.whitelist)),
    blockedClients: networkValues([...array(root.blacklist), ...array(object(root.blocked_clients).client)]),
    signatureOverrides: signatureOverrides(root),
    ...customBody ? { customResponse: { body: customBody, status: 200 } } : {},
    unsupportedEnabledFeatures: unsupported
  };
}
function parseSignatureDatabase(payload) {
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch {
    throw new MigrationError("signature", "invalid signature file");
  }
  const database = object(value);
  if (database.schema_version !== "asm-migration.signatures/v1" || !Array.isArray(database.signatures))
    throw new MigrationError("signature", "invalid signature file schema");
  const asmIds = new Set;
  const xcIds = new Set;
  const signatures = database.signatures.map((raw) => {
    const item = object(raw);
    const asmId = Number(item.asm_id);
    const xcId = Number(item.xc_id);
    if (!Number.isInteger(item.asm_id) || asmId <= 0 || !Number.isInteger(item.xc_id) || xcId < 200000001 || xcId > 299999999)
      throw new MigrationError("signature", "invalid signature file identifiers");
    if (asmIds.has(asmId) || xcIds.has(xcId))
      throw new MigrationError("signature", "signature IDs must be unique");
    asmIds.add(asmId);
    xcIds.add(xcId);
    return { asm_id: asmId, xc_id: xcId, ...typeof item.name === "string" ? { name: item.name } : {} };
  });
  return { schema_version: "asm-migration.signatures/v1", signatures };
}
// src/deployment.ts
import { createHash as createHash2, randomBytes } from "crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "fs";
import { dirname, parse, relative, resolve, sep } from "path";
var MANAGED_OUTPUT_FILES = ["config-pack.json", "warnings.json", "report.json", "manifest.json"];
var ORDER = ["ip_prefix_set", "app_firewall", "service_policy_rule", "service_policy"];
var COLLECTIONS = {
  ip_prefix_set: "ip_prefix_sets",
  app_firewall: "app_firewalls",
  service_policy_rule: "service_policy_rules",
  service_policy: "service_policys"
};
var TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
function abort(signal) {
  if (signal?.aborted)
    throw new DOMException("The operation was aborted.", "AbortError");
}
function hash(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
function stable(value) {
  if (Array.isArray(value))
    return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
function canonical(value) {
  return JSON.stringify(stable(value));
}
function receiptBytes(value) {
  return new TextEncoder().encode(`${JSON.stringify(stable(value), null, 2)}
`);
}
function env() {
  const rawUrl = process.env.XCSH_API_URL;
  const token = process.env.XCSH_API_TOKEN;
  const username = process.env.XCSH_USERNAME;
  const namespace = process.env.XCSH_NAMESPACE;
  if (!rawUrl || !token || !username || !namespace)
    throw new MigrationError("authentication", "XCSH_API_URL, XCSH_API_TOKEN, XCSH_USERNAME, and XCSH_NAMESPACE are required");
  let apiUrl;
  try {
    apiUrl = new URL(rawUrl);
  } catch {
    throw new MigrationError("authentication", "XCSH_API_URL is invalid");
  }
  if (apiUrl.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(apiUrl.hostname))
    throw new MigrationError("authentication", "XCSH_API_URL must use HTTPS except for a loopback test server");
  apiUrl.pathname = apiUrl.pathname.replace(/\/$/, "");
  return { apiUrl, token, username, namespace };
}
function resourcePath(environment, collection, name2) {
  const base = environment.apiUrl;
  const suffix = `/api/config/namespaces/${encodeURIComponent(environment.namespace)}/${collection}${name2 ? `/${encodeURIComponent(name2)}` : ""}`;
  const url = new URL(`${base.pathname.replace(/\/$/, "")}${suffix}`, base.origin);
  if (url.origin !== base.origin)
    throw new MigrationError("deployment", "refusing an API origin change");
  return url;
}
function safeResource(raw, fallback) {
  if (!raw || typeof raw !== "object")
    throw new MigrationError("transport", "XC returned an invalid resource");
  const value = raw;
  const metadata = value.metadata;
  const spec = value.spec;
  if (!metadata || !spec || typeof spec !== "object")
    throw new MigrationError("transport", "XC returned an invalid resource");
  return {
    kind: fallback.kind,
    metadata: {
      name: String(metadata.name ?? fallback.metadata.name),
      namespace: String(metadata.namespace ?? fallback.metadata.namespace),
      ...typeof metadata.description === "string" ? { description: metadata.description } : {},
      ...metadata.labels && typeof metadata.labels === "object" ? { labels: metadata.labels } : {},
      ...typeof metadata.disable === "boolean" ? { disable: metadata.disable } : {}
    },
    spec
  };
}
function creator(raw) {
  if (!raw || typeof raw !== "object")
    return;
  const meta = raw.system_metadata;
  return meta && typeof meta === "object" ? String(meta.creator_id ?? "") || undefined : undefined;
}
function subset(expected, actual) {
  if (Array.isArray(expected))
    return Array.isArray(actual) && expected.length === actual.length && expected.every((item, i) => subset(item, actual[i]));
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object")
      return false;
    return Object.entries(expected).every(([key, value]) => subset(value, actual[key]));
  }
  return Object.is(expected, actual);
}
function receiptFile(path, cwd) {
  const target = resolve(cwd, path);
  const root = parse(target).root;
  let cursor = root;
  for (const part of target.slice(root.length).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink())
      throw new MigrationError("receipt", "receipt path must not contain symlinked components");
  }
  const parent = dirname(target);
  if (!existsSync(parent) || !lstatSync(parent).isDirectory())
    throw new MigrationError("receipt", "receipt parent must exist and be a directory");
  if (existsSync(target) && !lstatSync(target).isFile())
    throw new MigrationError("receipt", "receipt path must be a regular file");
  return target;
}
function writeReceipt(path, receipt) {
  const temporary = `${path}.${randomBytes(12).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, receiptBytes(receipt), { mode: 384, flag: "wx" });
    const file = openSync(temporary, "r");
    try {
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    renameSync(temporary, path);
    const directory = openSync(dirname(path), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  } catch (error) {
    try {
      rmSync(temporary);
    } catch {}
    throw error;
  }
}
function readReceipt(path) {
  const receipt = JSON.parse(readFileSync(path, "utf8"));
  if (receipt.schema_version !== "asm-migration.deployment-receipt/v1")
    throw new MigrationError("receipt", "unsupported receipt schema");
  const digest = planDigest(receipt.artifact_hashes, receipt.contract, receipt.namespace, receipt.resources);
  if (digest !== receipt.plan_digest)
    throw new MigrationError("receipt", "receipt plan digest is invalid");
  return receipt;
}
function planDigest(hashes, contract, namespace, resources) {
  return hash(canonical({ artifact_hashes: hashes, contract, namespace, resources }));
}
async function request(environment, method, url, body, signal) {
  const attempts = method === "GET" ? 3 : 1;
  let last;
  for (let attempt = 0;attempt < attempts; attempt += 1) {
    abort(signal);
    try {
      const response = await fetch(url, {
        method,
        redirect: "manual",
        signal,
        headers: { Authorization: `APIToken ${environment.token}`, "Content-Type": "application/json" },
        ...body === undefined ? {} : { body: canonical(body) }
      });
      if (response.url && new URL(response.url).origin !== environment.apiUrl.origin)
        throw new MigrationError("transport", "XC response changed API origin");
      if (response.status >= 300 && response.status < 400)
        throw new MigrationError("transport", "XC redirects are not allowed");
      if (method === "GET" && TRANSIENT.has(response.status) && attempt + 1 < attempts)
        continue;
      return response;
    } catch (error) {
      last = error;
      if (error instanceof MigrationError || attempt + 1 >= attempts)
        break;
    }
  }
  throw new MigrationError("transport", `XC request failed${last instanceof DOMException && last.name === "AbortError" ? ": aborted" : ""}`);
}
async function get(environment, planned, signal) {
  const response = await request(environment, "GET", resourcePath(environment, planned.collection, planned.name), undefined, signal);
  if (response.status === 404)
    return;
  if (!response.ok)
    throw new MigrationError(response.status === 401 || response.status === 403 ? "authentication" : "transport", `XC read failed with HTTP ${response.status}`);
  const raw = await response.json();
  return { raw, resource: safeResource(raw, planned.desired) };
}
async function mutate(environment, method, planned, body, signal) {
  let response;
  try {
    response = await request(environment, method, resourcePath(environment, planned.collection, method === "POST" ? undefined : planned.name), body, signal);
  } catch {
    const observed = await get(environment, planned, signal);
    if (method === "DELETE" ? !observed : Boolean(observed && subset(planned.desired, observed.resource)))
      return;
    throw new MigrationError("transport", "mutation outcome is uncertain and reconciliation did not confirm success");
  }
  if (!response.ok)
    throw new MigrationError(response.status === 401 || response.status === 403 ? "authentication" : "deployment", `XC mutation failed with HTTP ${response.status}`);
}
function basePlanned(resource) {
  return {
    kind: resource.kind,
    name: resource.metadata.name,
    namespace: resource.metadata.namespace,
    collection: COLLECTIONS[resource.kind],
    operation: "create",
    desired: resource
  };
}
async function classify(environment, resource, signal) {
  const planned = basePlanned(resource);
  const live = await get(environment, planned, signal);
  if (!live)
    return planned;
  if (creator(live.raw) !== environment.username)
    throw new MigrationError("ownership", `resource ${resource.kind}/${resource.metadata.name} is not creator-owned`);
  planned.before = live.resource;
  planned.operation = subset(resource, live.resource) ? "noop" : "update";
  return planned;
}
function loadArtifacts(directory, receiptPath, environment) {
  const root = resolve(directory);
  const rel = relative(root, receiptPath);
  if (rel === "" || !rel.startsWith("..") && !rel.startsWith(`..${sep}`))
    throw new MigrationError("receipt", "receipt must reside outside the conversion artifact directory");
  const hashes = {};
  const parsed = {};
  for (const name2 of MANAGED_OUTPUT_FILES) {
    const path = resolve(root, name2);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink())
      throw new MigrationError("artifact", `required artifact is missing or unsafe: ${name2}`);
    const bytes = readFileSync(path);
    hashes[name2] = hash(bytes);
    parsed[name2] = JSON.parse(bytes.toString("utf8"));
  }
  const pack = parsed["config-pack.json"];
  const report = parsed["report.json"];
  const warnings = parsed["warnings.json"];
  const manifest = parsed["manifest.json"];
  const validation = validateConfigPack(pack);
  if (!validation.valid || validation.validated_resource_count !== validation.resource_count)
    throw new MigrationError("contract", "config pack does not satisfy the pinned contract");
  if (report.complete !== true || !Array.isArray(warnings) || warnings.length !== 0)
    throw new MigrationError("artifact", "deployment requires complete output with empty warnings");
  if (canonical(report.contract) !== canonical(contractIdentity()) || canonical(manifest.contract) !== canonical(contractIdentity()))
    throw new MigrationError("contract", "artifact contract does not match the pinned contract");
  const manifestInputs = manifest.inputs;
  if (!manifestInputs || typeof manifestInputs !== "object")
    throw new MigrationError("artifact", "manifest input hashes are missing");
  if (pack.resources.some((resource) => resource.metadata.namespace !== environment.namespace))
    throw new MigrationError("namespace", "artifact namespace must equal XCSH_NAMESPACE");
  return { pack, hashes };
}
async function makePlan(request2, environment, path) {
  if (!request2.artifactDirectory)
    throw new MigrationError("validation", "artifactDirectory is required for plan");
  const artifacts = loadArtifacts(resolve(request2.cwd, request2.artifactDirectory), path, environment);
  const sorted = [...artifacts.pack.resources].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.metadata.name.localeCompare(b.metadata.name));
  const resources = [];
  for (const resource of sorted)
    resources.push(await classify(environment, resource, request2.signal));
  const contract = contractIdentity();
  const digest = planDigest(artifacts.hashes, contract, environment.namespace, resources);
  return {
    schema_version: "asm-migration.deployment-receipt/v1",
    plan_digest: digest,
    artifact_hashes: artifacts.hashes,
    contract,
    namespace: environment.namespace,
    resources,
    outcomes: [],
    rollback: { status: "not_required", outcomes: [] }
  };
}
async function rollback(environment, completed, receipt, signal) {
  const failures = [];
  for (const planned of [...completed].reverse()) {
    try {
      const live = await get(environment, planned, signal);
      if (!live && planned.operation === "create") {
        receipt.rollback.outcomes.push({
          kind: planned.kind,
          name: planned.name,
          operation: planned.operation,
          status: "already_absent"
        });
        continue;
      }
      if (!live || creator(live.raw) !== environment.username || !subset(planned.desired, live.resource))
        throw new MigrationError("ownership", `rollback drift for ${planned.kind}/${planned.name}`);
      if (planned.operation === "create")
        await mutate(environment, "DELETE", planned, undefined, signal);
      else if (planned.operation === "update" && planned.before)
        await mutate(environment, "PUT", { ...planned, desired: planned.before }, planned.before, signal);
      receipt.rollback.outcomes.push({
        kind: planned.kind,
        name: planned.name,
        operation: planned.operation,
        status: "restored"
      });
    } catch {
      const outcome = {
        kind: planned.kind,
        name: planned.name,
        operation: planned.operation,
        status: "failed",
        guidance: `inspect and restore ${planned.kind}/${planned.name} manually`
      };
      failures.push(outcome);
      receipt.rollback.outcomes.push(outcome);
    }
  }
  receipt.rollback.status = failures.length ? "remediation_required" : "complete";
}
async function deploy(request2) {
  abort(request2.signal);
  const environment = env();
  const path = receiptFile(request2.receiptPath, request2.cwd);
  if (request2.action === "plan") {
    if (existsSync(path))
      throw new MigrationError("receipt", "plan requires a new receipt path");
    const receipt2 = await makePlan(request2, environment, path);
    writeReceipt(path, receipt2);
    return {
      action: "plan",
      planDigest: receipt2.plan_digest,
      outcomes: receipt2.resources.map((r) => ({
        kind: r.kind,
        name: r.name,
        operation: r.operation,
        status: "planned"
      })),
      rollback: receipt2.rollback
    };
  }
  if (!existsSync(path))
    throw new MigrationError("receipt", "receipt does not exist");
  const receipt = readReceipt(path);
  if (receipt.namespace !== environment.namespace)
    throw new MigrationError("namespace", "receipt namespace must equal XCSH_NAMESPACE");
  if (request2.action === "apply") {
    if (!request2.planDigest || request2.planDigest !== receipt.plan_digest)
      throw new MigrationError("confirmation", "planDigest must exactly match the receipt");
    if (request2.confirmation !== `APPLY ${receipt.plan_digest}`)
      throw new MigrationError("confirmation", "exact APPLY confirmation is required");
    const reclassified = [];
    for (const item of receipt.resources)
      reclassified.push(await classify(environment, item.desired, request2.signal));
    if (planDigest(receipt.artifact_hashes, receipt.contract, receipt.namespace, reclassified) !== receipt.plan_digest)
      throw new MigrationError("stale_plan", "live state changed after planning; create a new plan");
    const completed = [];
    try {
      for (const item of receipt.resources) {
        if (item.operation === "create")
          await mutate(environment, "POST", item, item.desired, request2.signal);
        else if (item.operation === "update")
          await mutate(environment, "PUT", item, item.desired, request2.signal);
        receipt.outcomes.push({
          kind: item.kind,
          name: item.name,
          operation: item.operation,
          status: item.operation === "noop" ? "unchanged" : "applied"
        });
        if (item.operation !== "noop")
          completed.push(item);
        writeReceipt(path, receipt);
      }
    } catch (error) {
      await rollback(environment, completed, receipt, request2.signal);
      writeReceipt(path, receipt);
      throw error;
    }
  } else if (request2.action === "verify") {
    receipt.outcomes = [];
    for (const item of receipt.resources) {
      const live = await get(environment, item, request2.signal);
      const ok = Boolean(live && creator(live.raw) === environment.username && subset(item.desired, live.resource));
      receipt.outcomes.push({
        kind: item.kind,
        name: item.name,
        operation: "verify",
        status: ok ? "verified" : "drift"
      });
    }
    writeReceipt(path, receipt);
    if (receipt.outcomes.some((item) => item.status === "drift"))
      throw new MigrationError("verification", "live resources differ from the deployment plan");
  } else {
    if (request2.confirmation !== `CLEANUP ${receipt.plan_digest}`)
      throw new MigrationError("confirmation", "exact CLEANUP confirmation is required");
    receipt.outcomes = [];
    for (const item of [...receipt.resources].reverse()) {
      const live = await get(environment, item, request2.signal);
      if (item.operation === "create") {
        if (!live) {
          receipt.outcomes.push({ kind: item.kind, name: item.name, operation: "cleanup", status: "already_absent" });
          continue;
        }
        if (creator(live.raw) !== environment.username || !subset(item.desired, live.resource))
          throw new MigrationError("ownership", `cleanup drift for ${item.kind}/${item.name}`);
        await mutate(environment, "DELETE", item, undefined, request2.signal);
        receipt.outcomes.push({ kind: item.kind, name: item.name, operation: "cleanup", status: "deleted" });
      } else if (item.operation === "update" && item.before) {
        if (!live || creator(live.raw) !== environment.username)
          throw new MigrationError("ownership", `cleanup drift for ${item.kind}/${item.name}`);
        if (subset(item.before, live.resource)) {
          receipt.outcomes.push({ kind: item.kind, name: item.name, operation: "cleanup", status: "already_restored" });
          continue;
        }
        if (!subset(item.desired, live.resource))
          throw new MigrationError("ownership", `cleanup drift for ${item.kind}/${item.name}`);
        await mutate(environment, "PUT", { ...item, desired: item.before }, item.before, request2.signal);
        receipt.outcomes.push({ kind: item.kind, name: item.name, operation: "cleanup", status: "restored" });
      } else
        receipt.outcomes.push({ kind: item.kind, name: item.name, operation: "cleanup", status: "unchanged" });
      writeReceipt(path, receipt);
    }
  }
  return {
    action: request2.action,
    planDigest: receipt.plan_digest,
    outcomes: receipt.outcomes,
    rollback: receipt.rollback
  };
}

// src/runtime.ts
var MANAGED_OUTPUT_FILES2 = ["config-pack.json", "warnings.json", "report.json", "manifest.json"];
var sha256 = (payload) => createHash3("sha256").update(payload).digest("hex");
function abort2(signal) {
  if (signal?.aborted)
    throw new DOMException("The operation was cancelled", "AbortError");
}
function absolute(cwd, value) {
  return isAbsolute(value) ? resolve2(value) : resolve2(cwd, value);
}
function resolveOutputDirectory(cwd, value, platform = process.platform) {
  if (platform === "darwin" && !isAbsolute(value) && (cwd === "/tmp" || cwd.startsWith("/tmp/"))) {
    return resolve2(`/private${cwd}`, value);
  }
  return absolute(cwd, value);
}
async function read(path, limit) {
  try {
    const file = Bun.file(path);
    if (!await file.exists())
      throw new Error("not found");
    if (limit !== undefined && file.size > limit)
      throw new MigrationError("unsafe_input", `policy exceeds ${limit} byte limit`);
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (error instanceof MigrationError)
      throw error;
    throw new MigrationError("io", "input file could not be read");
  }
}
function parseJson(payload) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch {
    throw new MigrationError("validation", "input is not valid UTF-8 JSON");
  }
}
async function validateInput(request2) {
  abort2(request2.signal);
  const inputPath = absolute(request2.cwd, request2.inputPath);
  const payload = await read(inputPath, request2.inputType === "asm-policy" ? MAX_XML_BYTES : undefined);
  abort2(request2.signal);
  if (request2.inputType === "asm-policy") {
    const policy = parseAsmXml(payload, inputPath);
    abort2(request2.signal);
    return {
      valid: true,
      inputType: request2.inputType,
      policy: {
        sourceName: policy.sourceName,
        enforcementMode: policy.enforcementMode,
        unsupportedEnabledFeatures: policy.unsupportedEnabledFeatures
      }
    };
  }
  const contract = validateConfigPack(parseJson(payload));
  abort2(request2.signal);
  return { valid: contract.valid, inputType: request2.inputType, contract };
}
function assertNoSymlinkDirectory(path) {
  const root = parse2(path).root;
  let cursor = root;
  for (const part of path.slice(root.length).split("/").filter(Boolean)) {
    cursor = resolve2(cursor, part);
    if (!existsSync2(cursor))
      continue;
    const stat = lstatSync2(cursor);
    if (stat.isSymbolicLink())
      throw new MigrationError("output", "output directory must not contain symlinked path components");
    if (cursor === path && !stat.isDirectory())
      throw new MigrationError("output", "output path is not a directory");
  }
}
function stable2(value) {
  if (Array.isArray(value))
    return value.map(stable2);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable2(child)]));
  return value;
}
function jsonBytes(value) {
  return new TextEncoder().encode(`${JSON.stringify(stable2(value), null, 2)}
`);
}
function syncWrite(path, payload) {
  writeFileSync2(path, payload, { mode: 384 });
  const descriptor = openSync2(path, "r");
  try {
    fsyncSync2(descriptor);
  } finally {
    closeSync2(descriptor);
  }
}
function renderDirectory(result, output, overwrite) {
  const validation = validateConfigPack(result.configPack);
  if (!validation.valid)
    throw new MigrationError("contract", "refusing to render a config pack that violates the pinned contract");
  assertNoSymlinkDirectory(output);
  mkdirSync(output, { recursive: true, mode: 448 });
  const existing = MANAGED_OUTPUT_FILES2.filter((name2) => existsSync2(resolve2(output, name2)));
  if (existing.length && !overwrite)
    throw new MigrationError("output", `managed output already exists: ${existing.join(", ")}`);
  const documents = {
    "config-pack.json": result.configPack,
    "warnings.json": result.warnings,
    "report.json": result.report,
    "manifest.json": {
      schema_version: "asm-migration.config-pack/v1",
      tool: { name: "asm-migration", version: "2.0.5" },
      inputs: Object.fromEntries(Object.entries(result.inputHashes).sort(([a], [b]) => a.localeCompare(b))),
      contract: validation.contract,
      contract_validation: { valid: validation.valid, validated_resource_count: validation.validated_resource_count }
    }
  };
  const token = randomBytes2(12).toString("hex");
  const staged = MANAGED_OUTPUT_FILES2.map((name2) => [name2, resolve2(output, `.${name2}.${token}.tmp`)]);
  try {
    for (const [name2, path] of staged)
      syncWrite(path, jsonBytes(documents[name2]));
    for (const [name2, path] of staged)
      renameSync2(path, resolve2(output, name2));
    const directory = openSync2(output, "r");
    try {
      fsyncSync2(directory);
    } finally {
      closeSync2(directory);
    }
  } catch {
    for (const [, path] of staged)
      try {
        rmSync2(path);
      } catch {}
    throw new MigrationError("output", "managed output files could not be written");
  }
}
async function convertInput(request2) {
  abort2(request2.signal);
  const policyPath = absolute(request2.cwd, request2.policyPath);
  const signaturesPath = absolute(request2.cwd, request2.signaturesPath);
  const outputDirectory = resolveOutputDirectory(request2.cwd, request2.outputDirectory);
  const policyPayload = await read(policyPath, MAX_XML_BYTES);
  abort2(request2.signal);
  const signaturePayload = await read(signaturesPath);
  abort2(request2.signal);
  const policy = parseAsmXml(policyPayload, policyPath);
  abort2(request2.signal);
  const signatures = parseSignatureDatabase(signaturePayload);
  abort2(request2.signal);
  const result = convert(policy, {
    namespace: request2.namespace,
    targetName: request2.targetName,
    allowPartial: request2.allowPartial ?? false,
    signatures
  });
  result.inputHashes = { policy: sha256(policyPayload), signatures: sha256(signaturePayload) };
  abort2(request2.signal);
  renderDirectory(result, outputDirectory, request2.overwrite ?? false);
  abort2(request2.signal);
  return {
    complete: result.report.complete,
    resourceCounts: result.report.resource_counts,
    warnings: result.warnings,
    contract: result.report.contract,
    outputFiles: [...MANAGED_OUTPUT_FILES2],
    outputDirectory
  };
}
export {
  validateInput,
  validateConfigPack,
  uniqueRuleNames,
  resolveOutputDirectory,
  renderDirectory,
  regexesOutsideRange,
  regexForRange,
  parseSignatureDatabase,
  parseAsmXml,
  mergeConfigPacks,
  jsonBytes,
  dnsLabel,
  deploy,
  convertInput,
  convert,
  contractIdentity,
  MigrationError,
  MANAGED_OUTPUT_FILES2 as MANAGED_OUTPUT_FILES
};
