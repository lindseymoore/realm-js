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
import { BSON, JSONCacheMap, ObjectListeners, Realm, assert, binding, flags, getTypeName, } from "./internal";
export var UpdateMode;
(function (UpdateMode) {
    UpdateMode["Never"] = "never";
    UpdateMode["Modified"] = "modified";
    UpdateMode["All"] = "all";
})(UpdateMode || (UpdateMode = {}));
export const KEY_ARRAY = Symbol("Object#keys");
export const KEY_SET = Symbol("Object#keySet");
export const REALM = Symbol("Object#realm");
export const INTERNAL = Symbol("Object#internal");
const INTERNAL_LISTENERS = Symbol("Object#listeners");
export const INTERNAL_HELPERS = Symbol("Object.helpers");
const DEFAULT_PROPERTY_DESCRIPTOR = { configurable: true, enumerable: true, writable: true };
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const PROXY_HANDLER = {
    ownKeys(target) {
        return Reflect.ownKeys(target).concat(target[KEY_ARRAY]);
    },
    getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === "string" && target[KEY_SET].has(prop)) {
            return DEFAULT_PROPERTY_DESCRIPTOR;
        }
        const result = Reflect.getOwnPropertyDescriptor(target, prop);
        if (result && typeof prop === "symbol") {
            if (prop === INTERNAL) {
                result.enumerable = false;
                result.writable = false;
            }
            else if (prop === INTERNAL_LISTENERS) {
                result.enumerable = false;
            }
        }
        return result;
    },
};
export class RealmObject {
    /**
     * @internal
     * This property is stored on the per class prototype when transforming the schema.
     */
    static [INTERNAL_HELPERS];
    static allowValuesArrays = false;
    /**
     * @internal
     * Create an object in the database and set values on it
     */
    static create(realm, values, mode, context) {
        assert.inTransaction(realm);
        if (Array.isArray(values)) {
            if (flags.ALLOW_VALUES_ARRAYS) {
                const { persistedProperties } = context.helpers.objectSchema;
                return RealmObject.create(realm, Object.fromEntries(values.map((value, index) => {
                    const property = persistedProperties[index];
                    const propertyName = property.publicName || property.name;
                    return [propertyName, value];
                })), mode, context);
            }
            else {
                throw new Error("Array values on object creation is no longer supported");
            }
        }
        const { helpers: { properties, wrapObject, objectSchema: { persistedProperties }, }, createObj, } = context;
        // Create the underlying object
        const [obj, created] = createObj ? createObj() : this.createObj(realm, values, mode, context);
        const result = wrapObject(obj);
        assert(result);
        // Persist any values provided
        // TODO: Consider using the property helpers directly to improve performance
        for (const property of persistedProperties) {
            const propertyName = property.publicName || property.name;
            const { default: defaultValue } = properties.get(propertyName);
            if (property.isPrimary) {
                continue; // Skip setting this, as we already provided it on object creation
            }
            const propertyValue = values[propertyName];
            if (typeof propertyValue !== "undefined") {
                if (mode !== UpdateMode.Modified || result[propertyName] !== propertyValue) {
                    result[propertyName] = propertyValue;
                }
            }
            else {
                if (typeof defaultValue !== "undefined") {
                    result[propertyName] = typeof defaultValue === "function" ? defaultValue() : defaultValue;
                }
                else if (!(property.type & 896 /* binding.PropertyType.Collection */) &&
                    !(property.type & 64 /* binding.PropertyType.Nullable */) &&
                    created) {
                    throw new Error(`Missing value for property '${propertyName}'`);
                }
            }
        }
        return result;
    }
    /**
     * @internal
     * Create an object in the database and populate its primary key value, if required
     */
    static createObj(realm, values, mode, context) {
        const { helpers: { objectSchema: { name, tableKey, primaryKey }, properties, }, } = context;
        // Create the underlying object
        const table = binding.Helpers.getTable(realm.internal, tableKey);
        if (primaryKey) {
            const primaryKeyHelpers = properties.get(primaryKey);
            const primaryKeyValue = values[primaryKey];
            const pk = primaryKeyHelpers.toBinding(
            // Fallback to default value if the provided value is undefined or null
            typeof primaryKeyValue !== "undefined" && primaryKeyValue !== null
                ? primaryKeyValue
                : primaryKeyHelpers.default, undefined);
            const result = binding.Helpers.getOrCreateObjectWithPrimaryKey(table, pk);
            const [, created] = result;
            if (mode === UpdateMode.Never && !created) {
                throw new Error(`Attempting to create an object of type '${name}' with an existing primary key value '${primaryKeyValue}'.`);
            }
            return result;
        }
        else {
            return [table.createObject(), true];
        }
    }
    /**
     * @internal
     * Create a wrapper for accessing an object from the database
     */
    static createWrapper(realm, internal, constructor) {
        const result = Object.create(constructor.prototype);
        result[INTERNAL] = internal;
        // Initializing INTERNAL_LISTENERS here rather than letting it just be implicitly undefined since JS engines
        // prefer adding all fields to objects upfront. Adding optional fields later can sometimes trigger deoptimizations.
        result[INTERNAL_LISTENERS] = null;
        // Wrap in a proxy to trap keys, enabling the spread operator, and hiding our internal fields.
        return new Proxy(result, PROXY_HANDLER);
    }
    /**
     * Create a `RealmObject` wrapping an `Obj` from the binding.
     * @param realm The Realm managing the object.
     * @param values The values of the object's properties at creation.
     */
    constructor(realm, values) {
        return realm.create(this.constructor, values);
    }
    keys() {
        // copying to prevent caller from modifying the static array.
        return [...this[KEY_ARRAY]];
    }
    entries() {
        throw new Error("Not yet implemented");
    }
    /** @internal */
    toJSON(_, cache = new JSONCacheMap()) {
        // Construct a reference-id of table-name & primaryKey if it exists, or fall back to objectId.
        // Check if current objectId has already processed, to keep object references the same.
        const existing = cache.find(this);
        if (existing) {
            return existing;
        }
        const result = {};
        cache.add(this, result);
        // Move all enumerable keys to result, triggering any specific toJSON implementation in the process.
        for (const key in this) {
            const value = this[key];
            if (typeof value == "function") {
                continue;
            }
            if (value instanceof Realm.Object ||
                value instanceof Realm.OrderedCollection ||
                value instanceof Realm.Dictionary) {
                // recursively trigger `toJSON` for Realm instances with the same cache.
                result[key] = value.toJSON(key, cache);
            }
            else {
                // Other cases, including null and undefined.
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * Checks if this object has not been deleted and is part of a valid Realm.
     * @returns `true` if the object can be safely accessed, `false` if not.
     * @since 0.12.0
     */
    isValid() {
        return this[INTERNAL] && this[INTERNAL].isValid;
    }
    /**
     * The schema for the type this object belongs to.
     * @returns The schema that describes this object.
     * @since 1.8.1
     */
    objectSchema() {
        return this[REALM].getClassHelpers(this).canonicalObjectSchema;
    }
    /**
     * Returns all the objects that link to this object in the specified relationship.
     * @param objectType The type of the objects that link to this object's type.
     * @param propertyName The name of the property that references objects of this object's type.
     * @throws {@link AssertionError} If the relationship is not valid.
     * @returns The objects that link to this object.
     * @since 1.9.0
     */
    linkingObjects(objectType, propertyName) {
        const { objectSchema: { tableKey }, properties, } = this[REALM].getClassHelpers(objectType);
        const tableRef = binding.Helpers.getTable(this[REALM].internal, tableKey);
        const property = properties.get(propertyName);
        assert(objectType === property.objectType, () => `'${objectType}#${propertyName}' is not a relationship to '${this.objectSchema.name}'`);
        // Create the Result for the backlink view
        const { columnKey, collectionHelpers } = property;
        assert(collectionHelpers, "collection helpers");
        const tableView = this[INTERNAL].getBacklinkView(tableRef, columnKey);
        const results = binding.Results.fromTableView(this[REALM].internal, tableView);
        return new Realm.Results(this[REALM], results, collectionHelpers);
    }
    /**
     * Returns the total count of incoming links to this object
     * @returns The number of links to this object.
     * @since 2.6.0
     */
    linkingObjectsCount() {
        return this[INTERNAL].getBacklinkCount();
    }
    /**
     * @deprecated
     * TODO: Remove completely once the type tests are obandend.
     */
    _objectId() {
        throw new Error("This is now removed!");
    }
    /**
     * A string uniquely identifying the object across all objects of the same type.
     */
    _objectKey() {
        return this[INTERNAL].key.toString();
    }
    /**
     * Add a listener `callback` which will be called when a **live** object instance changes.
     * @param callback A function to be called when changes occur.
     *   The callback function is called with two arguments:
     *   - `obj`: the object that changed,
     *   - `changes`: a dictionary with keys `deleted`, and `changedProperties`. `deleted` is true
     *       if the object has been deleted. `changesProperties` is an array of properties that have changed
     *       their value.
     * @throws {@link TypeAssertionError} If `callback` is not a function.
     * @example
     * wine.addListener((obj, changes) => {
     *  // obj === wine
     *  console.log(`object is deleted: ${changes.deleted}`);
     *  console.log(`${changes.changedProperties.length} properties have been changed:`);
     *  changes.changedProperties.forEach(prop => {
     *      console.log(` ${prop}`);
     *   });
     * })
     * @since 2.23.0
     */
    addListener(callback) {
        assert.function(callback);
        if (!this[INTERNAL_LISTENERS]) {
            this[INTERNAL_LISTENERS] = new ObjectListeners(this[REALM].internal, this);
        }
        this[INTERNAL_LISTENERS].addListener(callback);
    }
    /**
     * Remove the listener `callback`
     * @throws {@link TypeAssertionError} If `callback` is not a function.
     * @param callback A function previously added as listener
     * @since 2.23.0
     */
    removeListener(callback) {
        assert.function(callback);
        // Note: if the INTERNAL_LISTENERS field hasn't been initialized, then we have no listeners to remove.
        this[INTERNAL_LISTENERS]?.removeListener(callback);
    }
    /**
     * Remove all listeners.
     * @since 2.23.0
     */
    removeAllListeners() {
        // Note: if the INTERNAL_LISTENERS field hasn't been initialized, then we have no listeners to remove.
        this[INTERNAL_LISTENERS]?.removeAllListeners();
    }
    /**
     * Get underlying type of a property value.
     * @param propertyName The name of the property to retrieve the type of.
     * @throws {@link Error} If property does not exist.
     * @returns Underlying type of the property value.
     * @since 10.8.0
     */
    getPropertyType(propertyName) {
        const { properties } = this[REALM].getClassHelpers(this);
        const { type, objectType, columnKey } = properties.get(propertyName);
        const typeName = getTypeName(type, objectType);
        if (typeName === "mixed") {
            // This requires actually getting the object and inferring its type
            const value = this[INTERNAL].getAny(columnKey);
            if (value === null) {
                return "null";
            }
            else if (typeof value === "bigint") {
                return "int";
            }
            else if (value instanceof binding.Float) {
                return "float";
            }
            else if (value instanceof binding.Timestamp) {
                return "date";
            }
            else if (value instanceof binding.Obj) {
                const { objectSchema } = this[REALM].getClassHelpers(value.table.key);
                return `<${objectSchema.name}>`;
            }
            else if (value instanceof binding.ObjLink) {
                const { objectSchema } = this[REALM].getClassHelpers(value.tableKey);
                return `<${objectSchema.name}>`;
            }
            else if (value instanceof ArrayBuffer) {
                return "data";
            }
            else if (typeof value === "number") {
                return "double";
            }
            else if (typeof value === "string") {
                return "string";
            }
            else if (typeof value === "boolean") {
                return "bool";
            }
            else if (value instanceof BSON.ObjectId) {
                return "objectId";
            }
            else if (value instanceof BSON.Decimal128) {
                return "decimal128";
            }
            else if (value instanceof BSON.UUID) {
                return "uuid";
            }
            else {
                throw assert.never(value, "value");
            }
        }
        else {
            return typeName;
        }
    }
}
//  We like to refer to this as "Realm.Object"
Object.defineProperty(RealmObject, "name", { value: "Realm.Object" });
//# sourceMappingURL=Object.js.map