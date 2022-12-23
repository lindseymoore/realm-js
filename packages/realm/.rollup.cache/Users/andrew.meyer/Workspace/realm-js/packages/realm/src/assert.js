////////////////////////////////////////////////////////////////////////////
//
// Copyright 2022 Realm Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////
import { AssertionError, TypeAssertionError } from "./internal";
/**
 * Expects the condition to be truly
 * @throws {@link Error} If the condition is not truly. Throws either the {@link err} given as param
 * @param condition The condition that must be truly to avoid throwing.
 * @param err Optional message or error to throw.
 * Or a function producing this, which is useful to avoid computing the error message in case it's not needed.
 */
export function assert(condition, err) {
    if (!condition) {
        const errValue = typeof err === "function" ? err() : err;
        if (errValue instanceof Error) {
            throw err;
        }
        else if (typeof err === "string" || typeof err === "undefined") {
            throw new AssertionError(errValue);
        }
        else {
            throw new Error("Expected err to be an Err, string, undefined or a function returning either.");
        }
    }
}
/* eslint-disable-next-line @typescript-eslint/ban-types */
assert.instanceOf = (value, constructor, name) => {
    if (!(value instanceof constructor)) {
        throw new TypeAssertionError(`an instance of ${constructor.name}`, value, name);
    }
};
assert.string = (value, name) => {
    if (typeof value !== "string") {
        throw new TypeAssertionError("a string", value, name);
    }
};
assert.number = (value, name) => {
    if (typeof value !== "number") {
        throw new TypeAssertionError("a number", value, name);
    }
};
assert.boolean = (value, name) => {
    if (typeof value !== "boolean") {
        throw new TypeAssertionError("a boolean", value, name);
    }
};
assert.bigInt = (value, name) => {
    if (typeof value !== "bigint") {
        throw new TypeAssertionError("a bigint", value, name);
    }
};
assert.numberOrBigInt = (value, name) => {
    if (typeof value !== "number" && typeof value !== "bigint") {
        throw new TypeAssertionError("a number or bigint", value, name);
    }
};
/* eslint-disable-next-line @typescript-eslint/ban-types */
assert.function = (value, name) => {
    if (typeof value !== "function") {
        throw new TypeAssertionError("a function", value, name);
    }
};
assert.symbol = (value, name) => {
    if (typeof value !== "symbol") {
        throw new TypeAssertionError("a symbol", value, name);
    }
};
assert.object = (value, name) => {
    if (typeof value !== "object" || value === null) {
        throw new TypeAssertionError("an object", value, name);
    }
};
assert.undefined = (value, name) => {
    if (typeof value !== "undefined") {
        throw new TypeAssertionError("undefined", value, name);
    }
};
assert.null = (value, name) => {
    if (value !== null) {
        throw new TypeAssertionError("null", value, name);
    }
};
assert.array = (value, name) => {
    if (!Array.isArray(value)) {
        throw new TypeAssertionError("an array", value, name);
    }
};
/* eslint-disable-next-line @typescript-eslint/ban-types */
assert.extends = (value, constructor, name) => {
    assert.function(value, name);
    if (!(value.prototype instanceof constructor)) {
        throw new TypeAssertionError(`a class extending ${constructor.name}`, value, name);
    }
};
assert.iterable = (value, name) => {
    assert.object(value, name);
    if (!(Symbol.iterator in value)) {
        throw new TypeAssertionError("iterable", value, name);
    }
};
assert.never = (value, name) => {
    throw new TypeAssertionError("never", value, name);
};
// SDK specific
assert.open = (realm) => {
    assert(!realm.isClosed, "Cannot access realm that has been closed.");
};
assert.inTransaction = (realm, message = "Cannot modify managed objects outside of a write transaction.") => {
    assert.open(realm);
    assert(realm.isInTransaction, message);
};
assert.outTransaction = (realm, message = "Expected realm to be outside of a write transaction") => {
    assert.open(realm);
    assert(!realm.isInTransaction, message);
};
assert.isValid = (obj, message = "Accessing object which has been invalidated or deleted") => {
    assert(obj.isValid, message);
};
assert.isSameRealm = (realm1, realm2, message = "Expected the Realms to be the same") => {
    assert(realm1.$addr == realm2.$addr, message);
};
//# sourceMappingURL=assert.js.map