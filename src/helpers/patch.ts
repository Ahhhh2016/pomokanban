import { isPlainObject } from 'is-plain-object';
import { moment } from 'obsidian';
import { getAPI } from 'obsidian-dataview';

type Key = string | number;
type Diffable = Record<Key, unknown> | unknown[];
type OpPath = Array<Key>;

const REMOVE = 'remove';
const REPLACE = 'replace';
const ADD = 'add';

export interface Op {
  op: 'remove' | 'replace' | 'add';
  path: OpPath;
  value?: unknown;
}

interface Diff {
  remove: Op[];
  replace: Op[];
  add: Op[];
}

type SkipFn = (k: OpPath, val?: unknown) => boolean;
type ToStringFn = (val: unknown) => string;

function isDiffable(obj: unknown): obj is Diffable {
  if (!obj) return false;
  if (isPlainObject(obj) || Array.isArray(obj)) return true;

  const dv = getAPI();
  if (!moment.isMoment(obj as any) && dv?.value.isObject(obj)) return true;

  return false;
}

export function diff(
  obj1: Diffable,
  obj2: Diffable,
  skip: SkipFn = () => false,
  toString: ToStringFn = (val) => String(val)
): Op[] {
  if (!isDiffable(obj1) || !isDiffable(obj2)) {
    throw new Error('both arguments must be objects or arrays');
  }

  const diffs: Diff = getDiff(
    obj1,
    obj2,
    [],
    [],
    { remove: [], replace: [], add: [] },
    skip,
    toString
  );

  // reverse removes since we want to maintain indexes
  return diffs.remove.reverse().concat(diffs.replace).concat(diffs.add);
}

function getDiff(
  obj1: Diffable,
  obj2: Diffable,
  basePath: OpPath,
  basePathForRemoves: OpPath,
  diffs: Diff,
  skip: SkipFn,
  toString: ToStringFn
) {
  if (!isDiffable(obj1) || !isDiffable(obj2)) return diffs;

  const obj1Keys = Object.keys(obj1 as object);
  const obj2Keys = Object.keys(obj2 as object);
  const obj2KeysLength = obj2Keys.length;
  const lengthDelta = (obj1 as unknown[]).length - (obj2 as unknown[]).length;

  let path: OpPath;

  if (trimFromRight(obj1 as Record<string, unknown>, obj2 as Record<string, unknown>)) {
    for (const k of obj1Keys) {
      const key = Array.isArray(obj1) ? Number(k) : (k as Key);
      if (!(key in obj2)) {
        path = basePathForRemoves.concat(key);
        if (skip(path)) continue;
        diffs.remove.push({
          op: REMOVE,
          path,
        });
      }
    }

    for (const k of obj2Keys) {
      const key = Array.isArray(obj2) ? Number(k) : (k as Key);
      pushReplaces(
        key,
        obj1,
        obj2,
        basePath.concat(key),
        basePath.concat(key),
        diffs,
        skip,
        toString
      );
    }
  } else {
    // trim from left, objects are both arrays
    for (let i = 0; i < lengthDelta; i++) {
      path = basePathForRemoves.concat(i);
      if (skip(path)) continue;
      diffs.remove.push({
        op: REMOVE,
        path,
      });
    }

    // now make a copy of obj1 with excess elements left trimmed and see if there any replaces
    const obj1Trimmed = (obj1 as unknown[]).slice(lengthDelta);
    for (let i = 0; i < obj2KeysLength; i++) {
      pushReplaces(
        i,
        obj1Trimmed,
        obj2,
        basePath.concat(i),
        // since list of removes are reversed before presenting result,
        // we need to ignore existing parent removes when doing nested removes
        basePath.concat(i + lengthDelta),
        diffs,
        skip,
        toString
      );
    }
  }

  return diffs;
}

function pushReplaces(
  key: Key,
  obj1: Diffable,
  obj2: Diffable,
  path: OpPath,
  pathForRemoves: OpPath,
  diffs: Diff,
  skip: SkipFn,
  toString: ToStringFn
) {
  const obj1AtKey = (obj1 as any)[key];
  const obj2AtKey = (obj2 as any)[key];

  if (skip(path, obj2AtKey)) return;

  if (!(key in (obj1 as any)) && key in (obj2 as any)) {
    diffs.add.push({ op: ADD, path, value: obj2AtKey });
  } else if (obj1AtKey !== obj2AtKey) {
    if (
      Object(obj1AtKey) !== obj1AtKey ||
      Object(obj2AtKey) !== obj2AtKey ||
      differentTypes(obj1AtKey, obj2AtKey)
    ) {
      diffs.replace.push({ op: REPLACE, path, value: obj2AtKey });
    } else {
      if (
        !isDiffable(obj1AtKey) &&
        !isDiffable(obj2AtKey) &&
        toString(obj1AtKey) !== toString(obj2AtKey)
      ) {
        diffs.replace.push({ op: REPLACE, path, value: obj2AtKey });
      } else {
        getDiff((obj1 as any)[key], (obj2 as any)[key], path, pathForRemoves, diffs, skip, toString);
      }
    }
  }
}

function differentTypes(a: unknown, b: unknown) {
  return Object.prototype.toString.call(a) !== Object.prototype.toString.call(b);
}

function trimFromRight(obj1: Record<string, unknown>, obj2: Record<string, unknown>) {
  const lengthDelta = (obj1 as unknown[]).length - (obj2 as unknown[]).length;

  if (Array.isArray(obj1) && Array.isArray(obj2) && lengthDelta > 0) {
    let leftMatches = 0;
    let rightMatches = 0;
    for (let i = 0; i < (obj2 as unknown[]).length; i++) {
      if (String((obj1 as any)[i]) === String((obj2 as any)[i])) {
        leftMatches++;
      } else {
        break;
      }
    }

    for (let j = (obj2 as unknown[]).length; j > 0; j--) {
      if (String((obj1 as any)[j + lengthDelta]) === String((obj2 as any)[j])) {
        rightMatches++;
      } else {
        break;
      }
    }

    // bias to trim right becase it requires less index shifting
    return leftMatches >= rightMatches;
  }

  return true;
}

export function diffApply(obj: Diffable, diff: Op[]) {
  if (!isDiffable(obj)) {
    throw new Error('base object must be an object or an array');
  }

  if (!Array.isArray(diff)) {
    throw new Error('diff must be an array');
  }

  if (Array.isArray(obj)) obj = (obj as unknown[]).slice();
  else obj = { ...(obj as object) };

  for (const thisDiff of diff) {
    const thisOp = thisDiff.op;
    const thisPath = thisDiff.path;
    const pathCopy = thisPath.slice();
    const lastProp: Key | undefined = pathCopy.pop();
    let subObject = obj;

    prototypeCheck(lastProp);
    if (lastProp == null) return false;

    let thisProp: Key | undefined;
    while ((thisProp = pathCopy.shift()) !== undefined) {
      if (thisProp === undefined) break;

      prototypeCheck(thisProp);
      if (!(thisProp in (subObject as any))) {
        (subObject as any)[thisProp] = {};
        subObject = (subObject as any)[thisProp];
      } else if (Array.isArray((subObject as any)[thisProp])) {
        (subObject as any)[thisProp] = (subObject as any)[thisProp].slice();
        subObject = (subObject as any)[thisProp];
      } else if (isPlainObject((subObject as any)[thisProp])) {
        (subObject as any)[thisProp] = { ...(subObject as any)[thisProp] };
        subObject = (subObject as any)[thisProp];
      } else {
        subObject = (subObject as any)[thisProp];
      }
    }

    if (thisOp === REMOVE || thisOp === REPLACE) {
      const path = thisDiff.path;
      if (!Object.prototype.hasOwnProperty.call(subObject as object, lastProp as PropertyKey)) {
        const availableKeys = Object.keys(subObject as object);
        throw new Error(
          `expected to find property ${JSON.stringify(
            path
          )} in object; available keys: ${JSON.stringify(availableKeys)}`
        );
      }
    }

    if (thisOp === REMOVE && typeof lastProp === 'number') {
      Array.isArray(subObject)
        ? (subObject as unknown[]).splice(lastProp, 1)
        : delete (subObject as any)[lastProp];
    }

    if (thisOp === REPLACE || thisOp === ADD) {
      (subObject as any)[lastProp!] = thisDiff.value;
    }
  }

  return obj;
}

function prototypeCheck(prop?: string | number) {
  // coercion is intentional to catch prop values like `['__proto__']`
  if (prop === '__proto__' || prop === 'constructor' || prop === 'prototype') {
    throw new Error('setting of prototype values not supported');
  }
}
