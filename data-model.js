// MOST Web Framework 2.0 Codename Blueshift BSD-3-Clause license Copyright (c) 2017-2022, THEMOST LP All rights reserved
var _ = require('lodash');
var {cloneDeep} = require('lodash');
var {sprintf} = require('sprintf-js');
var Symbol = require('symbol');
var pluralize = require('pluralize');
var async = require('async');
var {QueryUtils, MethodCallExpression, ObjectNameValidator} = require('@themost/query');
var {OpenDataParser} = require('@themost/query');
var types = require('./types');
var {DataAssociationMapping} = require('./types');
var dataListeners = require('./data-listeners');
var validators = require('./data-validator');
var dataAssociations = require('./data-associations');
var {DataNestedObjectListener} = require('./data-nested-object-listener');
var {DataReferencedObjectListener} = require('./data-ref-object-listener');
var {DataQueryable} = require('./data-queryable');
var {DataAttributeResolver} = require('./data-attribute-resolver');
var DataObjectAssociationListener = dataAssociations.DataObjectAssociationListener;
var {DataModelView} = require('./data-model-view');
var {DataFilterResolver} = require('./data-filter-resolver');
var Q = require('q');
var {SequentialEventEmitter,Args} = require('@themost/common');
var {LangUtils} = require('@themost/common');
var {TraceUtils} = require('@themost/common');
var {DataError} = require('@themost/common');
var {DataConfigurationStrategy} = require('./data-configuration');
var {ModelClassLoaderStrategy} = require('./data-configuration');
var {ModuleLoaderStrategy} = require('@themost/common');
var mappingsProperty = Symbol('mappings');
var {DataPermissionEventListener} = require('./data-permission');
// eslint-disable-next-line no-unused-vars
var {DataField} = require('./types');
var {ZeroOrOneMultiplicityListener} = require('./zero-or-one-multiplicity');
var {OnNestedQueryListener} = require('./OnNestedQueryListener');
var {OnExecuteNestedQueryable} = require('./OnExecuteNestedQueryable');
var {OnNestedQueryOptionsListener} = require('./OnNestedQueryOptionsListener');
var {hasOwnProperty} = require('./has-own-property');
var { SyncSeriesEventEmitter } = require('@themost/events');
require('@themost/promise-sequence');
var DataObjectState = types.DataObjectState;
var { OnJsonAttribute } = require('./OnJsonAttribute');
var { isObjectDeep } = require('./is-object');
var { DataStateValidatorListener } = require('./data-state-validator');
var resolver = require('./data-expand-resolver');
var isArrayLikeObject = require('lodash/isArrayLikeObject');
/**
 * @this DataModel
 * @param {DataField} field
 * @private
 */
function inferTagMapping(field) {
    /**
     * @type {DataModel|*}
     */
    var self = this;
    //validate field argument
    if (_.isNil(field)) {
        return;
    }
    var hasManyAttribute = Object.prototype.hasOwnProperty.call(field, 'many');
    // if field does not have attribute 'many'
    if (hasManyAttribute === false) {
        // do nothing
        return;
    }
    // if field has attribute 'many' but it's false
    if (hasManyAttribute === true && field.many === false) {
        return;
    }
    //check if the type of the given field is a primitive data type
    //(a data type that is defined in the collection of data types)
    var dataType = self.context.getConfiguration().getStrategy(DataConfigurationStrategy).dataTypes[field.type];
    if (_.isNil(dataType)) {
        return;
    }
    // get associated adapter name
    var associationAdapter = self.name.concat(_.upperFirst(field.name));
    // get parent field
    var parentField = self.primaryKey;
    // mapping attributes
    var mapping = _.assign({}, {
        'associationType': 'junction',
        'associationAdapter': associationAdapter,
        'cascade': 'delete',
        'parentModel': self.name,
        'parentField': parentField,
        'refersTo': field.name
    }, field.mapping);
    // and return
    return new DataAssociationMapping(mapping);
}

/**
 * @this DataModel
 * @returns {*}
 */
function getImplementedModel() {
    if (_.isNil(this['implements'])) {
        return null;
    }
    if (typeof this.context === 'undefined' || this.context === null)
        throw new Error('The underlying data context cannot be empty.');
    return this.context.model(this['implements']);
}

/**
 * @ignore
 * @class
 * @constructor
 * @augments QueryExpression
 */
function EmptyQueryExpression() {
    //
}

/**
 * @classdesc DataModel class extends a JSON data model and performs all data operations (select, insert, update and delete) in MOST Data Applications.
 <p>
     These JSON schemas are in config/models folder:
 </p>
 <pre class="prettyprint"><code>
 /
 + config
   + models
     - User.json
     - Group.json
     - Account.json
     ...
 </code></pre>
 <p class="pln">
 The following JSON schema presents a typical User model with fields, views, privileges, constraints, listeners, and seeding:
 </p>
 <pre class="prettyprint"><code>
 {
     "name": "User", "id": 90, "title": "Application Users", "inherits": "Account", "hidden": false, "sealed": false, "abstract": false, "version": "1.4",
     "fields": [
         {
             "name": "id", "title": "Id", "description": "The identifier of the item.",
             "type": "Integer",
             "nullable": false,
             "primary": true
         },
         {
             "name": "accountType",  "title": "Account Type", "description": "Contains a set of flags that define the type and scope of an account object.",
             "type": "Integer",
             "readonly":true,
             "value":"javascript:return 0;"
         },
         {
             "name": "lockoutTime", "title": "Lockout Time", "description": "The date and time that this account was locked out.",
             "type": "DateTime",
             "readonly": true
         },
         {
             "name": "logonCount", "title": "Logon Count", "description": "The number of times the account has successfully logged on.",
             "type": "Integer",
             "value": "javascript:return 0;",
             "readonly": true
         },
         {
             "name": "enabled", "title": "Enabled", "description": "Indicates whether a user is enabled or not.",
             "type": "Boolean",
             "nullable": false,
             "value": "javascript:return true;"
         },
         {
             "name": "lastLogon", "title": "Last Logon", "description": "The last time and date the user logged on.",
             "type": "DateTime",
             "readonly": true
         },
         {
             "name": "groups", "title": "User Groups", "description": "A collection of groups where user belongs.",
             "type": "Group",
             "expandable": true,
             "mapping": {
                 "associationAdapter": "GroupMembers", "parentModel": "Group",
                 "parentField": "id", "childModel": "User", "childField": "id",
                 "associationType": "junction", "cascade": "delete",
                 "select": [
                     "id",
                     "name",
                     "alternateName"
                 ]
             }
         },
         {
             "name": "additionalType",
             "value":"javascript:return this.model.name;",
             "readonly":true
         },
         {
             "name": "accountType",
             "value": "javascript:return 0;"
         }
     ], "privileges":[
         { "mask":1, "type":"self", "filter":"id eq me()" },
         { "mask":15, "type":"global", "account":"*" }
     ],
     "constraints":[
         {
             "description": "User name must be unique across different records.",
             "type":"unique",
             "fields": [ "name" ]
         }
     ],
     "views": [
         {
             "name":"list", "title":"Users", "fields":[
                 { "name":"id", "hidden":true },
                 { "name":"description" },
                 { "name":"name" },
                 { "name":"enabled" , "format":"yesno" },
                 { "name":"dateCreated", "format":"moment : 'LLL'" },
                 { "name":"dateModified", "format":"moment : 'LLL'" }
             ], "order":"dateModified desc"
         }
     ],
     "eventListeners": [
         { "name":"New User Credentials Provider", "type":"/app/controllers/user-credentials-listener" }
     ],
     "seed":[
         {
             "name":"anonymous",
             "description":"Anonymous User",
             "groups":[
                 { "name":"Guests" }
             ]
         },
         {
             "name":"admin@example.com",
             "description":"Site Administrator",
             "groups":[
                 { "name":"Administrators" }
             ]
         }
     ]
 }
 </code></pre>
 *
 * @class
 * @property {string} classPath - Gets or sets a string which represents the path of the DataObject subclass associated with this model.
 * @property {string} name - Gets or sets a string that represents the name of the model.
 * @property {number} id - Gets or sets an integer that represents the internal identifier of the model.
 * @property {boolean} hidden - Gets or sets a boolean that indicates whether the current model is hidden or not. The default value is false.
 * @property {string} title - Gets or sets a title for this data model.
 * @property {boolean} sealed - Gets or sets a boolean that indicates whether current model is sealed or not. A sealed model cannot be migrated.
 * @property {boolean} abstract - Gets or sets a boolean that indicates whether current model is an abstract model or not.
 * @property {string} version - Gets or sets the version of this data model.
 * @property {string} type - Gets or sets an internal type for this model.
 * @property {DataCachingType|string} caching - Gets or sets a string that indicates the caching type for this model. The default value is none.
 * @property {string} inherits - Gets or sets a string that contains the model that is inherited by the current model.
 * @property {string} implements - Gets or sets a string that contains the model that is implemented by the current model.
 * @property {DataField[]} fields - Gets or sets an array that represents the collection of model fields.
 * @property {DataModelEventListener[]} eventListeners - Gets or sets an array that represents the collection of model listeners.
 * @property {Array} constraints - Gets or sets the array of constraints which are defined for this model
 * @property {DataModelView[]} views - Gets or sets the array of views which are defined for this model
 * @property {DataModelPrivilege[]} privileges - Gets or sets the array of privileges which are defined for this model
 * @property {string} source - Gets or sets a string which represents the source database object for this model.
 * @property {string} view - Gets or sets a string which represents the view database object for this model.
  * @property {Array} seed - An array of objects which represents a collection of items to be seeded when the model is being generated for the first time
 * @constructor
 * @augments SequentialEventEmitter
 * @param {*=} obj An object instance that holds data model attributes. This parameter is optional.
 */
function DataModel(obj) {

    this.hidden = false;
    this.sealed = false;
    this.abstract = false;
    this.version = '0.1';
    //this.type = 'data';
    this.caching = 'none';
    this.fields = [];
    this.eventListeners = [];
    this.constraints = [];
    this.views = [];
    this.privileges = [];
    //extend model if obj parameter is defined
    if (obj)
    {
        if (typeof obj === 'object')
            _.assign(this, obj);
    }

    /**
     * Gets or sets the underlying data adapter
     * @type {DataContext}
     * @private
     */
    var context = null;
    var self = this;

    /**
     * @name DataModel#context
     * @type {DataContext|*}
     */

    Object.defineProperty(this, 'context', {
        get: function () {
            return context;
        }, set: function (value) {
            context = value;
            // unregister listeners
            unregisterContextListeners.call(self);
            if (context != null) {
                registerContextListeners.call(self);
            }
        }, enumerable: false, configurable: false
    });

    /**
     * @description Gets the database object associated with this data model
     * @name DataModel#sourceAdapter
     * @type {string}
     */

    Object.defineProperty(this, 'sourceAdapter', { get: function() {
        return _.isString(self.source) ? self.source :  self.name.concat('Base');
    }, enumerable: false, configurable: false});

    /**
     * @description Gets the database object associated with this data model view
     * @name DataModel#viewAdapter
     * @type {string}
     */

    Object.defineProperty(this, 'viewAdapter', { get: function() {
        return _.isString(self.view) ? self.view :  self.name.concat('Data');
    }, enumerable: false, configurable: false});

    var silent_ = false;
    /**
     * Prepares a silent data operation (for query, update, insert, delete etc).
     * In a silent execution, permission check will be omitted.
     * Any other listeners which are prepared for using silent execution will use this parameter.
     * @param {Boolean=} value
     * @returns DataModel
     */
    this.silent = function(value) {
        if (typeof value === 'undefined')
            silent_ = true;
        else
            silent_ = !!value;
        return this;
    };

    Object.defineProperty(this, '$silent', { get: function() {
        return silent_;
    }, enumerable: false, configurable: false});

    /**
     * @type {Array}
     */
    var attributes;

    /**
     * @description Gets an array of DataField objects which represents the collection of model fields (including fields which are inherited from the base model).
     * @name DataModel#attributes
     * @type {Array.<DataField>}
     */

    Object.defineProperty(this, 'attributes', { get: function() {
        //validate self field collection
        if (typeof attributes !== 'undefined' && attributes !== null)
            return attributes;
        //init attributes collection
        attributes = [];
        //get base model (if any)
        var baseModel = self.base(), field;
        var implementedModel = getImplementedModel.bind(self)();
        //enumerate fields
        var strategy = self.context.getConfiguration().getStrategy(DataConfigurationStrategy);
        self.fields.forEach(function(x) {
            if (typeof x.many === 'undefined') {
                if (typeof strategy.dataTypes[x.type] === 'undefined')
                    //set one-to-many attribute (based on a naming convention)
                    x.many = pluralize.isPlural(x.name) || (x.mapping && x.mapping.associationType === 'junction');
                else
                    //otherwise set one-to-many attribute to false
                    x.many = false;
            }
            // define virtual attribute
            if (x.many) {
                // set multiplicity property EdmMultiplicity.Many
                if (Object.prototype.hasOwnProperty.call(x, 'multiplicity') === false) {
                    x.multiplicity = 'Many';
                }
            }
            if (x.nested) {
                // try to find if current field defines one-to-one association
                var mapping = x.mapping;
                if (mapping &&
                    mapping.associationType === 'association' &&
                    mapping.parentModel === self.name) {
                    /**
                     * get child model
                     * @type {DataModel}
                     */
                    var childModel = (mapping.childModel === self.name) ? self : self.context.model(mapping.childModel);
                    // check child model constraints for one-to-one parent to child association
                    if (childModel &&
                        childModel.constraints &&
                        childModel.constraints.length &&
                        childModel.constraints.find(function (constraint) {
                            return constraint.type === 'unique' &&
                                constraint.fields &&
                                constraint.fields.length === 1 &&
                                constraint.fields.indexOf(mapping.childField) === 0;
                        })) {
                        // backward compatibility  issue
                        // set [many] attribute to true because is being used by query processing
                        x.many = true;
                        // set multiplicity property EdmMultiplicity.ZeroOrOne or EdmMultiplicity.One
                        if (typeof x.nullable === 'boolean') {
                            x.multiplicity = x.nullable ? 'ZeroOrOne' : 'One';
                        }
                        else {
                            x.multiplicity = 'ZeroOrOne';
                        }

                    }
                }
            }

            //re-define field model attribute
            if (typeof x.model === 'undefined')
                x.model = self.name;
            var clone = x;
            // if base model exists and current field is not primary key field
            var isPrimary = !!x.primary;
            if (baseModel != null && isPrimary === false) {
                // get base field
                field = baseModel.field(x.name);
                if (field) {
                    //clone field
                    clone = { };
                    //get all inherited properties
                    _.assign(clone, field);
                    //get all overridden properties
                    _.assign(clone, x);
                    //set field model
                    clone.model = field.model;
                    //set cloned attribute
                    clone.cloned = true;
                }
            }
            if (clone.insertable === false && clone.editable === false && clone.model === self.name) {
                clone.readonly = true;
            }
            //finally push field
            attributes.push(clone);
        });
        if (baseModel) {
            baseModel.attributes.forEach(function(x) {
                if (!x.primary) {
                    //check if member is overridden by the current model
                    field = self.fields.find(function(y) { return y.name === x.name; });
                    if (typeof field === 'undefined')
                        attributes.push(x);
                }
                else {
                    //try to find primary key in fields collection
                    var primaryKey = _.find(self.fields, function(y) {
                        return y.name === x.name;
                    });
                    if (typeof primaryKey === 'undefined') {
                        //add primary key field
                        primaryKey = _.assign({}, x, {
                            'type': x.type === 'Counter' ? 'Integer' : x.type,
                            'model': self.name,
                            'indexed': true,
                            'value': null,
                            'calculation': null
                        });
                        delete primaryKey.value;
                        delete primaryKey.calculation;
                        attributes.push(primaryKey);
                    }
                }
            });
        }
        if (implementedModel) {
            implementedModel.attributes.forEach(function(x) {
                field = _.find(self.fields, function(y) {
                    return y.name === x.name;
                });
                if (_.isNil(field)) {
                    attributes.push(_.assign({}, x, {
                        model:self.name
                    }));
                }
            });
        }

        return attributes;
    }, enumerable: false, configurable: false});
    /**
     * Gets the primary key name
     * @type String
    */
    this.primaryKey = undefined;
    //local variable for DateModel.primaryKey
    var primaryKey_;
    Object.defineProperty(this, 'primaryKey' , { get: function() {
        return self.getPrimaryKey();
    }, enumerable: false, configurable: false});

    this.getPrimaryKey = function() {
        if (typeof primaryKey_ !== 'undefined') { return primaryKey_; }
        var p = self.attributes.find(function(x) { return x.primary===true; });
        if (p) {
            primaryKey_ = p.name;
            return primaryKey_;
        }
    };

    /**
     * Gets an array that contains model attribute names
     * @type Array
    */
    this.attributeNames = undefined;
    Object.defineProperty(this, 'attributeNames' , { get: function() {
        return self.attributes.map(function(x) {
            return x.name;
        });
    }, enumerable: false, configurable: false});
    Object.defineProperty(this, 'constraintCollection' , { get: function() {
        var arr = [];
        if (_.isArray(self.constraints)) {
            //append constraints to collection
            self.constraints.forEach(function(x) {
                arr.push(x);
            });
        }
        //get base model
        var baseModel = self.base();
        if (baseModel) {
            //get base model constraints
            var baseArr = baseModel.constraintCollection;
            if (_.isArray(baseArr)) {
                //append to collection
                baseArr.forEach(function(x) {
                    arr.push(x);
                });
            }
        }
        return arr;
    }, enumerable: false, configurable: false});

    //call initialize method
    if (typeof this.initialize === 'function')
        this.initialize();
}

LangUtils.inherits(DataModel, SequentialEventEmitter);

/**
 * Gets a boolean which indicates whether data model is in silent mode or not
 */
DataModel.prototype.isSilent = function() {
    return this.$silent;
};

/**
 * @returns {Function}
 */
DataModel.prototype.getDataObjectType = function() {
    return this.context.getConfiguration().getStrategy(ModelClassLoaderStrategy).resolve(this);
};

/**
 * Initializes the current data model. This method is used for extending the behaviour of an install of DataModel class.
 */
DataModel.prototype.initialize = function() {
    DataModel.load.emit({
        target: this
    });
};

/**
 * Clones the current data model
 * @param {DataContext=} context - An instance of DataContext class which represents the current data context.
 * @returns {DataModel} Returns a new DataModel instance
 */
DataModel.prototype.clone = function(context) {
    // create new instance
    var cloned = new DataModel(cloneDeep(this)).silent(this.isSilent());
    // set context or this model context
    cloned.context = context || this.context;
    return cloned;
};
/**
 * @this DataModel
 * @private
 */
function unregisterContextListeners() {
    //unregister event listeners
    this.removeAllListeners('before.save');
    this.removeAllListeners('after.save');
    this.removeAllListeners('before.remove');
    this.removeAllListeners('after.remove');
    this.removeAllListeners('before.execute');
    this.removeAllListeners('after.execute');
    this.removeAllListeners('before.upgrade');
    this.removeAllListeners('after.upgrade');
}
/**
 * @this DataModel
 * @private
 */
 function registerContextListeners() {

    //description: change default max listeners (10) to 64 in order to avoid node.js message
    // for reaching the maximum number of listeners
    //author: k.barbounakis@gmail.com
    if (typeof this.setMaxListeners === 'function') {
        this.setMaxListeners(64);
    }
    var CalculatedValueListener = dataListeners.CalculatedValueListener;
    var DefaultValueListener = dataListeners.DefaultValueListener;
    var DataCachingListener = dataListeners.DataCachingListener;
    var DataModelCreateViewListener = dataListeners.DataModelCreateViewListener;
    var DataModelSeedListener = dataListeners.DataModelSeedListener;
    
    //1. State validator listener
    this.on('before.save', DataStateValidatorListener.prototype.beforeSave);
    this.on('before.remove', DataStateValidatorListener.prototype.beforeRemove);
    //2. Default values Listener
    this.on('before.save', DefaultValueListener.prototype.beforeSave);
    //3. Calculated values listener
    this.on('before.save', CalculatedValueListener.prototype.beforeSave);

    //register before execute caching
    if (this.caching==='always' || this.caching==='conditional') {
        this.on('before.execute', DataCachingListener.prototype.beforeExecute);
    }
    this.on('before.execute', OnExecuteNestedQueryable.prototype.beforeExecute);
    this.on('before.execute', OnNestedQueryOptionsListener.prototype.beforeExecute);
    this.on('before.execute', OnNestedQueryListener.prototype.beforeExecute);
    //register after execute caching
    if (this.caching==='always' || this.caching==='conditional') {
        this.on('after.execute', DataCachingListener.prototype.afterExecute);
    }

    //migration listeners
    this.on('after.upgrade',DataModelCreateViewListener.prototype.afterUpgrade);
    this.on('after.upgrade',DataModelSeedListener.prototype.afterUpgrade);
    // json listener
    this.on('after.save', OnJsonAttribute.prototype.afterSave);
    this.on('after.execute', OnJsonAttribute.prototype.afterExecute);
    this.on('before.save', OnJsonAttribute.prototype.beforeSave);
    //get module loader
    /**
     * @type {ModuleLoader|*}
     */
    var moduleLoader = this.context.getConfiguration().getStrategy(ModuleLoaderStrategy);
    //register configuration listeners
    if (this.eventListeners) {
        for (var i = 0; i < this.eventListeners.length; i++) {
            var listener = this.eventListeners[i];
            //get listener type (e.g. type: require('./custom-listener.js'))
            if (listener.type && !listener.disabled)
            {
                /**
                 * @type {{beforeSave?:function,afterSave?:function,beforeRemove?:function,afterRemove?:function,beforeExecute?:function,afterExecute?:function,beforeUpgrade?:function,afterUpgrade?:function}}
                 */
                var dataEventListener = moduleLoader.require(listener.type);
                if (typeof dataEventListener.beforeUpgrade === 'function')
                    this.on('before.upgrade', dataEventListener.beforeUpgrade);
                if (typeof dataEventListener.beforeSave === 'function')
                    this.on('before.save', dataEventListener.beforeSave);
                if (typeof dataEventListener.afterSave === 'function')
                    this.on('after.save', dataEventListener.afterSave);
                if (typeof dataEventListener.beforeRemove === 'function')
                    this.on('before.remove', dataEventListener.beforeRemove);
                if (typeof dataEventListener.afterRemove === 'function')
                    this.on('after.remove', dataEventListener.afterRemove);
                if (typeof dataEventListener.beforeExecute === 'function')
                    this.on('before.execute', dataEventListener.beforeExecute);
                if (typeof dataEventListener.afterExecute === 'function')
                    this.on('after.execute', dataEventListener.afterExecute);
                if (typeof dataEventListener.afterUpgrade === 'function')
                    this.on('after.upgrade', dataEventListener.afterUpgrade);
            }
        }
    }
    //before execute
    this.on('before.execute', DataPermissionEventListener.prototype.beforeExecute);

}

DataModel.prototype.join = function(model) {
    var result = new DataQueryable(this);
    return result.join(model);
};

/**
 * Initializes a where statement and returns an instance of DataQueryable class.
 * @param {String|*} attr - A string that represents the name of a field
 * @returns DataQueryable
*/
// eslint-disable-next-line no-unused-vars
DataModel.prototype.where = function(attr) {
    var result = new DataQueryable(this);
    return result.where.apply(result, Array.from(arguments));
};

/**
 * Initializes a full-text search statement and returns an instance of DataQueryable class.
 * @param {String} text - A string that represents the text to search for
 * @returns DataQueryable
 */
DataModel.prototype.search = function(text) {
    var result = new DataQueryable(this);
    return result.search(text);
};

/**
 * Returns a DataQueryable instance of the current model
 * @returns {DataQueryable}
 */
DataModel.prototype.asQueryable = function() {
    return new DataQueryable(this);
};

/**
 * @private
 * @this DataModel
 * @param {*} params
 * @param {Function} callback
 * @returns {*}
 */
function filterInternal(params, callback) {
    var self = this;
    var parser = OpenDataParser.create()
    var $joinExpressions = [];
    var view;
    var selectAs = [];
    parser.resolveMember = function(member, cb) {
        // resolve view
        var attr = self.field(member);
        if (attr) {
            member = attr.name;
            if (attr.multiplicity === 'ZeroOrOne') {
                var mapping1 = self.inferMapping(member);
                if (mapping1 && mapping1.associationType === 'junction' && mapping1.parentModel === self.name) {
                    member = attr.name.concat('/', mapping1.childField);
                    selectAs.push({
                        member: attr.name.concat('.', mapping1.childField),
                        alias: attr.name
                    });
                } else if (mapping1 && mapping1.associationType === 'junction' && mapping1.childModel === self.name) {
                    member = attr.name.concat('/', mapping1.parentField);
                    selectAs.push({
                        member: attr.name.concat('.', mapping1.parentField),
                        alias: attr.name
                    });
                } else if (mapping1 && mapping1.associationType === 'association' && mapping1.parentModel === self.name) {
                    var associatedModel = self.context.model(mapping1.childModel);
                    const primaryKey = associatedModel.attributes.find((x) => x.primary === true);
                    member = attr.name.concat('/', primaryKey.name);
                    selectAs.push({
                        member: attr.name.concat('.', primaryKey.name),
                        alias: attr.name
                    });
                }
            }
        }
        if (DataAttributeResolver.prototype.testNestedAttribute.call(self,member)) {
            try {
                var member1 = member.split('/'),
                    mapping = self.inferMapping(member1[0]),
                    expr;
                if (mapping && mapping.associationType === 'junction') {
                    var expr1 = DataAttributeResolver.prototype.resolveJunctionAttributeJoin.call(self, member);
                    expr = {
                        $expand: expr1.$expand
                    };
                    //replace member expression
                    member = expr1.$select.$name.replace(/\./g,'/');
                }
                else {
                    expr = DataAttributeResolver.prototype.resolveNestedAttributeJoin.call(self, member);
                    // get member expression
                    if (expr && expr.$select && Object.prototype.hasOwnProperty.call(expr.$select, '$value')) {
                        // get value
                        var {$value} = expr.$select;
                        // get first property
                        var [property] = Object.keys($value);
                        // check if property starts with $ (e.g. $concat, $jsonGet etc)
                        if (property && property.startsWith('$')) {
                            // get arguments
                            var {[property]: args} = $value;
                            // create method call expression
                            member = new MethodCallExpression(property.substring(1), args);
                        } else {
                            return cb(new Error('Invalid member expression. Expected a method call expression.'));
                        }
                    } else if (expr && expr.$select) {
                        member = expr.$select.$name.replace(/\./g, '/');
                    }
                }
                if (expr && expr.$expand) {
                    var arrExpr = [];
                    if (_.isArray(expr.$expand)) {
                        arrExpr.push.apply(arrExpr, expr.$expand);
                    } else {
                        arrExpr.push(expr.$expand);
                    }
                    arrExpr.forEach(function(y) {
                        var joinExpr = $joinExpressions.find(function(x) {
                            if (x.$entity && x.$entity.$as) {
                                return (x.$entity.$as === y.$entity.$as);
                            }
                            return false;
                        });
                        if (_.isNil(joinExpr))
                            $joinExpressions.push(y);
                    });
                }
            }
            catch (err) {
                cb(err);
                return;
            }
        }
        if (typeof self.resolveMember === 'function') {
            self.resolveMember.call(self, member, cb);
        } else {
            DataFilterResolver.prototype.resolveMember.call(self, member, cb);
        }
    };
    parser.resolveMethod = function(name, args, cb) {
        if (typeof self.resolveMethod === 'function') {
            self.resolveMethod.call(self, name, args, cb);
        } else {
            DataFilterResolver.prototype.resolveMethod.call(self, name, args, cb);
        }
    };
    var filter;

    if ((params instanceof DataQueryable) && (self.name === params.model.name)) {
        var q = new DataQueryable(self);
        _.assign(q, params);
        _.assign(q.query, params.query);
        return callback(null, q);
    }

    if (typeof params === 'string') {
        filter = params;
    }
    else if (typeof params === 'object') {
        filter = params.$filter;
    }

    try {

        var top = parseInt(params.$top || params.$take, 10);
        var skip = parseInt(params.$skip, 10);
        var levels = parseInt(params.$levels, 10)
        var queryOptions = {
            $filter: filter,
            $select:  params.$select,
            $orderBy: params.$orderby || params.$orderBy || params.$order,
            $groupBy: params.$groupby || params.$groupBy || params.$group,
            $top: isNaN(top) ? 0 : top,
            $skip: isNaN(skip) ? 0 : skip,
            $levels: isNaN(levels) ? -1 : levels
        };

        void parser.parseQueryOptions(queryOptions,
        /**
         * @param {Error=} err 
         * @param {{$where?:*,$order?:*,$select?:*,$group?:*}} query 
         * @returns {void}
         */ 
        function(err, query) {
            try {
                if (err) {
                    callback(err);
                } else {
                    // create an instance of data queryable
                    var q = new DataQueryable(self);
                    if (query.$select) {
                        if (q.query.$select == null) {
                            q.query.$select = {};
                        }
                        var collection = q.query.$collection;
                        // validate the usage of a data view
                        if (Array.isArray(query.$select) && query.$select.length === 1) {
                            var reTrimCollection = new RegExp('^' + collection + '.', 'ig');
                            for (let index = 0; index < query.$select.length; index++) {
                                var element = query.$select[index];
                                if (Object.prototype.hasOwnProperty.call(element, '$name')) {
                                    // get attribute name
                                    if (typeof element.$name === 'string') {
                                        view = self.dataviews(element.$name.replace(reTrimCollection, ''));
                                        if (view != null) {
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        // resolve a backward compatibility issue
                        // convert select attributes which define an association to expandable attributes
                        if (Array.isArray(query.$select)) {
                            var removeCollectionRegex = new RegExp('^' + collection + '.', 'ig');
                            for (var index = 0; index < query.$select.length; index++) {
                                var selectElement = query.$select[index];
                                if (Object.prototype.hasOwnProperty.call(selectElement, '$name')) {
                                    // get attribute name
                                    if (typeof selectElement.$name === 'string') {
                                        var selectAttributeName= selectElement.$name.replace(removeCollectionRegex, '');
                                        var selectAttribute = self.getAttribute(selectAttributeName);
                                        if (selectAttribute && selectAttribute.many) {
                                            // expand attribute
                                            q.expand(selectAttributeName);
                                            // and 
                                            query.$select.splice(index, 1);
                                            index -= 1;
                                        }
                                    }
                                }
                            }
                        }
                        if (view != null) {
                            // select view
                            q.select(view.name)
                        } else {
                            if (Array.isArray(query.$select)) {
                                // validate aliases found by resolveMember
                                if (selectAs.length > 0) {
                                    for (let index = 0; index < query.$select.length; index++) {
                                        var element1 = query.$select[index];
                                        if (Object.prototype.hasOwnProperty.call(element1, '$name')) {
                                            if (typeof element1.$name === 'string') {
                                                var item = selectAs.find(function(x) {
                                                    return x.member === element1.$name;
                                                });
                                                if (item != null) {
                                                    // add original name as alias
                                                    Object.defineProperty(element1, item.alias, {
                                                        configurable: true,
                                                        enumerable: true,
                                                        value: {
                                                            $name: element1.$name
                                                        }
                                                    });
                                                    // and delete $name property
                                                    delete element1.$name;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            // otherwise, format $select attribute
                            Object.defineProperty(q.query.$select, collection, {
                                configurable: true,
                                enumerable: true,
                                writable: true,
                                value: query.$select
                            });
                        }
                       
                    }
                    if (query.$where) {
                        q.query.$where = query.$where;
                    }
                    if (query.$order) {
                        q.query.$order = query.$order;
                    }
                    if (query.$group) {
                        q.query.$group = query.$group;
                    }
                    // assign join expressions
                    if ($joinExpressions.length>0) {
                        // concat expand expressions if there are any
                        var queryExpand = [];
                        if (Array.isArray(q.query.$expand)) {
                            queryExpand = q.query.$expand.slice();
                        } else if (typeof q.query.$expand === 'object') {
                            queryExpand = [].concat(q.query.$expand)
                        }
                        // enumerate already defined expand expressions
                        // this operation is very important when selecting items from a view
                        queryExpand.forEach(function(expandExpr) {
                            // find join expression by entity alias
                            var joinExpr = $joinExpressions.find(function(x) {
                                if (x.$entity && x.$entity.$as) {
                                    return (x.$entity.$as === expandExpr.$entity.$as);
                                }
                                return false;
                            });
                            // if join expression is not defined then add it
                            if (joinExpr == null) {
                                $joinExpressions.push(expandExpr)
                            }
                        });
                        // finally assign join expressions
                        q.query.$expand = $joinExpressions;
                    }
                    // prepare query
                    q.query.prepare();
                    // set levels
                    if (queryOptions.$levels >= 0) {
                        q.levels(queryOptions.$levels);
                    }
                    if (queryOptions.$top > 0) {
                        q.take(queryOptions.$top);
                    }
                    if (queryOptions.$skip > 0) {
                        q.skip(queryOptions.$skip);
                    }
                    // set caching
                    if (typeof params === 'object' && params.$cache === true && self.caching === 'conditional') {
                        q.cache(true);
                    }
                    // set expand
                    if (typeof params === 'object' && params.$expand != null) {
                        var matches = resolver.testExpandExpression(params.$expand);
                        if (matches && matches.length>0) {
                            q.expand.apply(q, matches);
                        }
                    }
                    return callback(null, q);
                }
            } catch (error) {
                return callback(error);
            }
        });
    }
    catch(e) {
        return callback(e);
    }
}

/**
 * Applies open data filter, ordering, grouping and paging params and returns a data queryable object
 * @param {String|{$filter:string=, $skip:number=, $levels:number=, $top:number=, $take:number=, $order:string=, $inlinecount:string=, $expand:string=,$select:string=, $orderby:string=, $group:string=, $groupby:string=}} params - A string that represents an open data filter or an object with open data parameters
 * @param {Function=} callback -  A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain an instance of DataQueryable class.
 * @returns Promise<DataQueryable>|*
 * @example
 context.model('Order').filter(context.params, function(err,q) {
    if (err) { return callback(err); }
    q.take(10, function(err, result) {
        if (err) { return callback(err); }
        callback(null, result);
    });
 });
 */
DataModel.prototype.filter = function(params, callback) {
    if (typeof callback === 'function') {
        return filterInternal.bind(this)(params, callback);
    }
    else {
        return Q.nbind(filterInternal, this)(params);
    }
};

DataModel.prototype.filterAsync = function(params) {
    return this.filter(params);
};

/**
 * Prepares a data query with the given object as parameters and returns the equivalent DataQueryable instance
 * @param {*} obj - An object which represents the query parameters
 * @returns DataQueryable - An instance of DataQueryable class that represents a data query based on the given parameters.
 * @example
 context.model('Order').find({ "paymentMethod":1 }).orderBy('dateCreated').take(10, function(err,result) {
    if (err) { return callback(err); }
    return callback(null, result);
 });
 */
DataModel.prototype.find = function(obj) {
    var self = this, result;
    if (_.isNil(obj))
    {
        result = new DataQueryable(this);
        result.where(self.primaryKey).equal(null);
        return result;
    }
    var find = { }, findSet = false;
    if (_.isObject(obj)) {
        if (hasOwnProperty(obj, self.primaryKey)) {
            find[self.primaryKey] = obj[self.primaryKey];
            findSet = true;
        }
        else {
            //get unique constraint
            var constraint = _.find(self.constraints, function(x) {
                return x.type === 'unique';
            });
            //find by constraint
            if (_.isObject(constraint) && _.isArray(constraint.fields)) {
                //search for all constrained fields
                var findAttrs = {}, constrained = true;
                _.forEach(constraint.fields, function(x) {
                   if (hasOwnProperty(obj, x)) {
                       findAttrs[x] = obj[x];
                   }
                   else {
                       constrained = false;
                   }
                });
                if (constrained) {
                    _.assign(find, findAttrs);
                    findSet = true;
                }
            }
        }
    }
    else {
        find[self.primaryKey] = obj;
        findSet = true;
    }
    if (!findSet) {
        _.forEach(self.attributeNames, function(x) {
            if (hasOwnProperty(obj, x)) {
                find[x] = obj[x];
            }
        });
    }
    result = new DataQueryable(this);
    findSet = false;
    //enumerate properties and build query
    for(var key in find) {
        if (hasOwnProperty(find, key)) {
            if (!findSet) {
                result.where(key).equal(find[key]);
                findSet = true;
            }
            else
                result.and(key).equal(find[key]);
        }
    }
    if (!findSet) {
        //there is no query defined a dummy one (e.g. primary key is null)
        result.where(self.primaryKey).equal(null);
    }
    return result;
};

/**
 * Selects the given attribute or attributes and return an instance of DataQueryable class
 * @param {...string} attr - An array of fields, a field or a view name
 * @returns {DataQueryable}
 */
// eslint-disable-next-line no-unused-vars
DataModel.prototype.select = function(attr) {
    var result = new DataQueryable(this);
    return result.select.apply(result, Array.prototype.slice.call(arguments));
};

/**
 * Prepares an ascending order by expression and returns an instance of DataQueryable class.
 * @param {*} attr - A string that is going to be used in this expression.
 * @returns DataQueryable
 });
*/
// eslint-disable-next-line no-unused-vars
DataModel.prototype.orderBy = function(attr) {
    var result = new DataQueryable(this);
    return result.orderBy.apply(result, Array.from(arguments));
};

/**
 * Takes an array of maximum [n] items.
 * @param {Number} n - The maximum number of items that is going to be retrieved
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @returns DataQueryable|undefined If callback parameter is missing then returns a DataQueryable object.
 */
DataModel.prototype.take = function(n, callback) {
    n = n || 25;
    var result = new DataQueryable(this);
    if (typeof callback === 'undefined')
        return result.take(n);
    result.take(n, callback);
};

/**
 * Returns an instance of DataResultSet of the current model.
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @returns {Promise<T>|*} If callback parameter is missing then returns a Promise object.
 * @deprecated Use DataModel.asQueryable().list().
 * @example
 context.model('User').list(function(err, result) {
    if (err) { return done(err); }
    return done(null, result);
 });
 */
DataModel.prototype.list = function(callback) {
    var result = new DataQueryable(this);
    return result.list(callback);
};

/**
 * @returns {Promise|*}
 */
DataModel.prototype.getList = function() {
    var result = new DataQueryable(this);
    return result.list();
};

/**
 * Returns the first item of the current model.
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @returns {Promise<T>|*} If callback parameter is missing then returns a Promise object.
 * @deprecated Use DataModel.asQueryable().first().
 * @example
 context.model('User').first(function(err, result) {
    if (err) { return done(err); }
    return done(null, result);
 });
*/
DataModel.prototype.first = function(callback) {
    var result = new DataQueryable(this);
    return result.select.apply(result,this.attributeNames).first(callback);
};

/**
 * A helper function for getting an object based on the given primary key value
 * @param {String|*} key - The primary key value to search for.
 * @param {Function} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result, if any.
 * @returns {Deferred|*} If callback parameter is missing then returns a Deferred object.
 * @example
 context.model('User').get(1).then(function(result) {
    return done(null, result);
}).catch(function(err) {
    return done(err);
});
 */
DataModel.prototype.get = function(key, callback) {
    var result = new DataQueryable(this);
    return result.where(this.primaryKey).equal(key).first(callback);
};

/**
 * Returns the last item of the current model based.
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @returns {Promise<T>|*} If callback parameter is missing then returns a Promise object.
 * @example
 context.model('User').last(function(err, result) {
    if (err) { return done(err); }
    return done(null, result);
 });
 */
DataModel.prototype.last = function(callback) {
    var result = new DataQueryable(this);
    return result.orderByDescending(this.primaryKey).select.apply(result,this.attributeNames).first(callback);
};

/**
 * Returns all data items.
 * @param {Function} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result, if any.
*/
DataModel.prototype.all = function(callback) {
    var result = new DataQueryable(this);
    return result.select.apply(result, this.attributeNames).all(callback);
};

/**
 * Bypasses a number of items based on the given parameter. This method is used in data paging operations.
 * @param {Number} n - The number of items to skip.
 * @returns DataQueryable
*/
DataModel.prototype.skip = function(n) {
    var result = new DataQueryable(this);
    return result.skip(n);
};

/**
 * Prepares an descending order by expression and returns an instance of DataQueryable class.
 * @param {*} attr - A string that is going to be used in this expression.
 * @returns DataQueryable
 });
 */
// eslint-disable-next-line no-unused-vars
DataModel.prototype.orderByDescending = function(attr) {
    var result = new DataQueryable(this);
    return result.orderByDescending.apply(result, Array.from(arguments));
};

/**
 * Returns the maximum value for a field.
 * @param {string} attr - A string that represents the name of the field.
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @returns {Promise<T>|*} If callback parameter is missing then returns a Promise object.
 */
DataModel.prototype.max = function(attr, callback) {
    var result = new DataQueryable(this);
    return result.max(attr, callback);
};

/**
 * Returns the minimum value for a field.
 * @param {string} attr - A string that represents the name of the field.
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @returns {Promise<T>|*} If callback parameter is missing then returns a Promise object.
 */
DataModel.prototype.min = function(attr, callback) {
    var result = new DataQueryable(this);
    return result.min(attr, callback);
};

/**
 * Gets a DataModel instance which represents the inherited data model of this item, if any.
 * @returns {DataModel}
 */
DataModel.prototype.base = function()
{
    if (_.isNil(this.inherits))
        return null;
    if (typeof this.context === 'undefined' || this.context === null)
        throw new Error('The underlying data context cannot be empty.');
    return this.context.model(this.inherits);
};

/**
 * @this DataModel
 * @private
 * @param {*} obj
 */
 function convertInternal_(obj) {
    var self = this;
    //get type parsers (or default type parsers)
    var parsers = self.parsers || types.parsers, parser, value;
    self.attributes.forEach(function(x) {
        value = obj[x.name];
        if (value) {
            //get parser for this type
            parser = parsers['parse'.concat(x.type)];
            //if a parser exists
            if (typeof parser === 'function')
            //parse value
                obj[x.name] = parser(value);
            else {
                //get mapping
                var mapping = self.inferMapping(x.name);
                if (mapping) {
                    if ((mapping.associationType==='association') && (mapping.childModel===self.name)) {
                        var associatedModel = self.context.model(mapping.parentModel);
                        if (associatedModel) {
                            if (typeof value === 'object') {
                                //set associated key value (e.g. primary key value)
                                convertInternal_.call(associatedModel, value);
                            }
                            else {
                                var field = associatedModel.field(mapping.parentField);
                                if (field) {
                                    //parse raw value
                                    parser = parsers['parse'.concat(field.type)];
                                    if (typeof parser === 'function')
                                        obj[x.name] = parser(value);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

/**
 * Converts an object or a collection of objects to the corresponding data object instance
 * @param {Array|*} obj
 * @param {boolean=} typeConvert - Forces property value conversion for each property based on field type.
 * @returns {DataObject|Array|*} - Returns an instance of DataObject (or an array of DataObject instances)
 *<p>
 This conversion of an anonymous object through DataModel.convert() may be overriden by subclassing DataObject
 and place this class in app/models folder of a MOST Data Appllication:
 </p>
 <pre class="prettyprint"><code>
 /
 + app
   + models
     + user-model.js
 </code></pre>
 <p>
 An example of user model subclassing (user-model.js):
 </p>
 <pre class="prettyprint"><code>
 var util = require('util'),
 md = require('most-data'),
 web = require('most-web');

 function UserModel(obj) {
    UserModel.super_.call(this, 'User', obj);
}
 util.inherits(UserModel, md.classes.DataObject);

 UserModel.prototype.person = function (callback) {
    var self = this, context = self.context;
    try {
        //search person by user name
        return context.model('Person').where('user/name').equal(self.name).first(callback);
    }
    catch (err) {
        callback(err);
    }
};
 if (typeof module !== 'undefined') module.exports = UserModel;
 </code></pre>
 @example
 //get User model
 var users = context.model('User');
 users.where('name').equal(context.user.name).first().then(function(result) {
    if (typeof result === 'undefined') {
        return done(new Error('User cannot be found'));
    }
    //convert result
    var user = users.convert(result);
    //get user's person
    user.person(function(err, result) {
        if (err) { return done(err); }
        if (typeof result === 'undefined') {
            return done(new Error('Person cannot be found'));
        }
        console.log('Person: ' + JSON.stringify(result));
        done(null, result);
    });
}).catch(function(err) {
   done(err);
});
 */
DataModel.prototype.convert = function(obj, typeConvert)
{
    var self = this;
    if (_.isNil(obj))
        return obj;
    /**
     * @constructor
     * @augments DataObject
     * @ignore
     */
    var DataObjectTypeCtor = self.getDataObjectType();

    if (_.isArray(obj)) {
        var arr = [], src;
        obj.forEach(function(x) {
            if (typeof x !== 'undefined' && x!=null) {
                var o = new DataObjectTypeCtor();
                if (typeof x === 'object') {
                    _.assign(o, x);
                }
                else {
                    src = {}; src[self.primaryKey] = x;
                    _.assign(o, src);
                }
                if (typeConvert)
                    convertInternal_.call(self, o);
                o.context = self.context;
                o.$$type = self.name;
                arr.push(o);
            }
        });
        return arr;
    }
    else {
        var result = new DataObjectTypeCtor();
        if (typeof obj === 'object') {
            _.assign(result, obj);
        }
        else {
            src = {}; src[self.primaryKey] = obj;
            _.assign(result, src);
        }
        if (typeConvert)
            convertInternal_.call(self, result);
        result.context = self.context;
        result.$$type = self.name;
        return result;
    }
};
/**
 * Extracts an identifier from the given parameter.
 * If the parameter is an object then gets the identifier property, otherwise tries to convert the given parameter to an identifier
 * suitable for this model.
 * @param {*} obj
 * @returns {*|undefined}
 * @example
 var id = context.model('User').idOf({ id:1, "name":"anonymous"});
 */
DataModel.prototype.idOf = function(obj) {
    if (typeof obj === 'undefined')
        return;
    if (obj===null)
        return;
    if (typeof this.primaryKey === 'undefined' || this.primaryKey === null)
        return;
    if (typeof obj === 'object')
        return obj[this.primaryKey];
    return obj;
};
/**
 * Casts the given object and returns an object that is going to be used against the underlying database.
 * @param {*} obj - The source object which is going to be cast
 * @param {number=} state - The state of the source object.
 * @returns {*} - Returns an object which is going to be against the underlying database.
 */
DataModel.prototype.cast = function(obj, state)
{
   return cast_.call(this, obj, state);
};
/**
 * @this DataModel
 * @param {*} obj
 * @param {number=} state
 * @returns {*}
 * @private
 */
function cast_(obj, state) {
    var self = this;
    if (obj==null)
        return {};
    if (typeof obj === 'object' && obj instanceof Array)
    {
        return obj.map(function(x) {
            return cast_.call(self, x, state);
        });
    }
    else
    {
        //ensure state (set default state to Insert=1)
        state = _.isNil(state) ? (_.isNil(obj.$state) ? 1 : obj.$state) : state;
        var result = {}, name, superModel;
        if (typeof obj.getSuperModel === 'function') {
            superModel = obj.getSuperModel();
        }
        self.attributes.filter(function(x) {
            return hasOwnProperty(x, 'many') ? !x.many : true;
        }).filter(function(x) {
            if (x.model!==self.name) { return false; }
            return (!x.readonly) ||
                (x.readonly && (typeof x.calculation!=='undefined') && state===2) ||
                (x.readonly && (typeof x.value!=='undefined') && state===1) ||
                (x.readonly && (typeof x.calculation!=='undefined') && state===1);
        }).filter(function(y) {
            /*
            change: 2016-02-27
            author:k.barbounakis@gmail.com
            description:exclude non editable attributes on update operation
             */
            return (state===2) ? (hasOwnProperty(y, 'editable') ? y.editable : true) : true;
        }).filter(function(x) {
            if (x.insertable === false && x.editable === false) {
                return false;
            }
            return true;
        }).forEach(function(x) {
            name = hasOwnProperty(obj, x.property) ? x.property : x.name;
            if (hasOwnProperty(obj, name))
            {
                var mapping = self.inferMapping(name);
                //if mapping is empty and a super model is defined
                if (_.isNil(mapping)) {
                    if (superModel && x.type === 'Object') {
                        //try to find if superModel has a mapping for this attribute
                        mapping = superModel.inferMapping(name);
                    }
                }
                if (mapping == null) {
                    var {[name]: value} = obj;
                    if (x.type === 'Json') {
                        if (value == null) {
                            result[x.name] = null;
                        } else {
                            var isObjectOrArray = isObjectDeep(value) || isArrayLikeObject(value);
                            Args.check(isObjectOrArray, new DataError('ERR_VALUE','Invalid attribute value. Expected a valid object or an array.', null, self.name, x.name));
                            result[x.name] = JSON.stringify(value);
                        }
                    } else {
                        result[x.name] = value;
                    }
                } else if (mapping.associationType==='association') {
                    if (typeof obj[name] === 'object' && obj[name] !== null)
                    //set associated key value (e.g. primary key value)
                        result[x.name] = obj[name][mapping.parentField];
                    else
                    //set raw value
                        result[x.name] = obj[name];
                }
            }
        });
        return result;
    }
}


/**
 * @this DataModel
 * @param {*} obj
 * @param {number=} state
 * @returns {*}
 * @private
 */
function castForValidation_(obj, state) {
    var self = this;
    if (obj==null)
        return {};
    if (typeof obj === 'object' && obj instanceof Array)
    {
        return obj.map(function(x) {
            return castForValidation_.call(self, x, state);
        });
    }
    else
    {
        //ensure state (set default state to Insert=1)
        state = _.isNil(state) ? (_.isNil(obj.$state) ? 1 : obj.$state) : state;
        var result = {}, name;
        self.attributes.filter(function(x) {
            if (x.model!==self.name) {
                if (types.parsers.parseBoolean(x.cloned) === false)
                        return false;
            }
            return (!x.readonly) ||
                (x.readonly && (typeof x.calculation!=='undefined') && state===2) ||
                (x.readonly && (typeof x.value!=='undefined') && state===1) ||
                (x.readonly && (typeof x.calculation!=='undefined') && state===1);
        }).filter(function(y) {
            /*
             change: 2016-02-27
             author:k.barbounakis@gmail.com
             description:exclude non editable attributes on update operation
             */
            return (state===2) ? (hasOwnProperty(y, 'editable') ? y.editable : true) : true;
        }).forEach(function(x) {
            name = hasOwnProperty(obj, x.property) ? x.property : x.name;
            if (hasOwnProperty(obj, name))
            {
                var mapping = self.inferMapping(name);
                if (_.isNil(mapping))
                    result[x.name] = obj[name];
                else if ((mapping.associationType==='association') && (mapping.childModel===self.name)) {
                    if ((typeof obj[name] === 'object') && (obj[name] !== null))
                    //set associated key value (e.g. primary key value)
                        result[x.name] = obj[name][mapping.parentField];
                    else
                    //set raw value
                        result[x.name] = obj[name];
                }
            }
        });
        return result;
    }
}

/**
 * Casts the given source object and returns a data object based on the current model.
 * @param {*} dest - The destination object
 * @param {*} src - The source object
 * @param {function(Error=)} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 */
DataModel.prototype.recast = function(dest, src, callback)
{
    callback = callback || function() {};
    var self = this;
    if (_.isNil(src)) {
        callback();
        return;
    }
    if (_.isNil(dest)) {
        dest = { };
    }
    async.eachSeries(self.fields, function(field, cb) {
        try {
            if (hasOwnProperty(src, field.name)) {
                //ensure db property removal
                if (field.property && field.property!==field.name)
                    delete dest[field.name];
                var mapping = self.inferMapping(field.name), name = field.property || field.name;
                if (_.isNil(mapping)) {
                    //set destination property
                    dest[name] = src[field.name];
                    cb(null);
                }
                else if (mapping.associationType==='association') {

                    if (typeof dest[name] === 'object' && dest[name] ) {
                        //check associated object
                        if (dest[name][mapping.parentField]===src[field.name]) {
                            //return
                            cb(null);
                        }
                        else {
                            //load associated item
                            var associatedModel = self.context.model(mapping.parentModel);
                            associatedModel.where(mapping.parentField).equal(src[field.name]).silent().first(function(err, result) {
                                if (err) {
                                    cb(err);
                                }
                                else {
                                    dest[name] = result;
                                    //return
                                    cb(null);
                                }
                            });
                        }
                    }
                    else {
                        //set destination property
                        dest[name] = src[field.name];
                        cb(null);
                    }
                }
            }
            else {
                cb(null);
            }
        }
        catch (e) {
            cb(e);
        }
    }, function(err) {
        callback(err);
    });
};





/**
 * Casts the given object and returns an object that was prepared for insert.
 * @param obj {*} - The object to be cast
 * @returns {*}
 */
DataModel.prototype.new = function(obj)
{
    return this.cast(obj);
};

/**
 * @this DataModel
 * @param {*|Array} obj
 * @param {Function} callback
 * @private
 */
function save_(obj, callback) {
    var self = this;
    if (_.isNil(obj)) {
        callback.call(self, null);
        return;
    }
    //ensure migration
    self.migrate(function(err) {
        if (err) { callback(err); return; }
        //do save
        var arr = [];
        if (_.isArray(obj)) {
            for (var i = 0; i < obj.length; i++)
                arr.push(obj[i]);
        }
        else
            arr.push(obj);
        var db = self.context.db;
        var res = [];
        db.executeInTransaction(function(cb) {
            async.eachSeries(arr, function(item, saveCallback) {
                saveSingleObject_.call(self, item, function(err, result) {
                    if (err) {
                        saveCallback.call(self, err);
                        return;
                    }
                    res.push(result.insertedId);
                    saveCallback.call(self, null);
                });
            }, function(err) {
                if (err) {
                    res = null;
                    cb(err);
                    return;
                }
                cb(null);
            });
        }, function(err) {
            callback.call(self, err, res);
        });
    });
}

/**
 * Saves the given object or array of objects
 * @param obj {*|Array}
 * @param callback {Function=} - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 * @returns {Promise<T>|*} - If callback parameter is missing then returns a Promise object.
 * @example
 //save a new group (Sales)
 var group = { "description":"Sales Users", "name":"Sales" };
 context.model("Group").save(group).then(function() {
        console.log('A new group was created with ID ' + group.id);
        done();
    }).catch(function(err) {
        done(err);
    });
 */
DataModel.prototype.save = function(obj, callback)
{
    var self = this;
    if (typeof callback === 'undefined') {
        return Q.Promise(function(resolve, reject) {
            return save_.bind(self)( obj, function(err) {
                if (err) {
                    return reject(err);
                }
                return resolve(obj);
            });
        });
    }
    return save_.bind(self)(obj, callback);
};
/**
 * Infers the state of the given object.
 * @param {DataObject|*} obj - The source object
 * @param {Function} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 * @see DataObjectState
 */
DataModel.prototype.inferState = function(obj, callback) {
    var self = this;
    var e = { model:self, target:obj };
    DataStateValidatorListener.prototype.beforeSave(e, function(err) {
        //if error return error
        if (err) { return callback(err); }
        //otherwise return the calucated state
        callback(null, e.state);
    });
};
/**
 * 
 * @param {*} obj 
 * @returns {Promise<*>}
 */
DataModel.prototype.inferStateAsync = function(obj) {
    var self = this;
    return new Promise(function(resolve, reject) {
        self.inferState(obj, function(err, result) {
            if (err) {
                return reject(err);
            }
            return resolve(result);
        });
    });
};

/**
 * @this DataModel
 * @param {*} obj
 * @param {Function} callback
 * @private
 */
function saveBaseObject_(obj, callback) {
    //ensure callback
    callback = callback || function() {};
    var self = this, base = self.base();
    //if obj is an array of objects throw exception (invoke callback with error)
    if (_.isArray(obj)) {
        callback.call(self, new Error('Invalid argument. Base object cannot be an array.'));
        return 0;
    }
    //if current model does not have a base model
    if (base===null) {
        //exit operation
        callback.call(self, null);
    }
    else {
        base.silent();
        //perform operation
        saveSingleObject_.call(base, obj, function(err, result) {
            callback.call(self, err, result);
        });
    }
}

/**
 * @this DataModel
 * @param {*} obj
 * @param {Function} callback
 * @private
 */
 function saveSingleObject_(obj, callback) {
    var self = this,
        NotNullConstraintListener = dataListeners.NotNullConstraintListener,
        DataValidatorListener = validators.DataValidatorListener,
        UniqueConstraintListener = dataListeners.UniqueConstraintListener;
    callback = callback || function() {};
    if (obj==null) {
        callback.call(self);
        return;
    }
    if (_.isArray(obj)) {
        callback.call(self, new Error('Invalid argument. Source object cannot be an array.'));
        return 0;
    }
    //set super model (for further processing)
    if (typeof obj.getSuperModel !== 'function') {
        obj.getSuperModel = function() {
            return self;
        }
    }
    if (obj.$state === 4) {
        return removeSingleObject_.call(self, obj, callback);
    }
    //get object state before any other operation
    var state = obj.$state ? obj.$state : (obj[self.primaryKey]!=null ? 2 : 1);
    var e = {
        model: self,
        target: obj,
        state:state
    };

    var beforeSaveListeners = [
        DataNestedObjectListener.prototype.beforeSave,
        DataObjectAssociationListener.prototype.beforeSave,
        UniqueConstraintListener.prototype.beforeSave,
        DataValidatorListener.prototype.beforeSave,
        NotNullConstraintListener.prototype.beforeSave,
        DataPermissionEventListener.prototype.beforeSave
    ]
    var afterSaveListeners = [
        DataNestedObjectListener.prototype.afterSave,
        DataObjectAssociationListener.prototype.afterSave,
        ZeroOrOneMultiplicityListener.prototype.afterSave
    ];

    beforeSaveListeners.forEach(function(listener) {
        self.once('before.save', listener);
    });

    afterSaveListeners.forEach(function(listener) {
       self.once('after.save', listener);
    });

    //execute before update events
    self.emit('before.save', e, function(err) {
        //if an error occurred
        beforeSaveListeners.forEach(function(listener) {
            self.removeListener('before.save', listener);
        });
        if (err) {
            afterSaveListeners.forEach(function(listener) {
                self.removeListener('after.save', listener);
            });
            //invoke callback with error
            return callback(err);
        }
        //otherwise execute save operation
        else {
            //save base object if any
            saveBaseObject_.call(self, e.target, function(err, result) {
                if (err) {
                    afterSaveListeners.forEach(function(listener) {
                        self.removeListener('after.save', listener);
                    });
                    return callback(err);
                }
                //if result is defined
                if (result!==undefined)
                //sync original object
                    _.assign(e.target, result);
                //get db context
                var db = self.context.db;
                //create insert query
                var target = self.cast(e.target, e.state);
                var q = null, key = target[self.primaryKey];
                if (e.state===1)
                    //create insert statement
                    q = QueryUtils.insert(target).into(self.sourceAdapter);
                else
                {
                    //create update statement
                    if (key)
                        delete target[self.primaryKey];
                    if (Object.keys(target).length>0)
                        q = QueryUtils.update(self.sourceAdapter).set(target).where(self.primaryKey).equal(e.target[self.primaryKey]);
                    else
                        //object does not have any properties other than primary key. do nothing
                        q = new EmptyQueryExpression();
                }
                if (q instanceof EmptyQueryExpression) {
                    if (key)
                        target[self.primaryKey] = key;
                    //get updated object
                    self.recast(e.target, target, function(err) {
                        if (err) {
                            afterSaveListeners.forEach(function(listener) {
                                self.removeListener('after.save', listener);
                            });
                            //and return error
                            return callback(err);
                        }
                        else {
                            //execute after update events
                            self.emit('after.save',e, function(err) {
                                afterSaveListeners.forEach(function(listener) {
                                    self.removeListener('after.save', listener);
                                });
                                //and return
                                return callback(err, e.target);
                            });
                        }
                    });
                }
                else {
                    var pm = e.model.field(self.primaryKey), nextIdentity, adapter = e.model.sourceAdapter;
                    if (_.isNil(pm)) {
                        return callback(new DataError('EMODEL','The primary key of the specified cannot be found',null, e.model.name))
                    }
                    //search if adapter has a nextIdentity function (also primary key must be a counter and state equal to insert)
                    if (pm.type === 'Counter' && typeof db.nextIdentity === 'function' && e.state===1) {
                        nextIdentity = db.nextIdentity;
                    }
                    else {
                        //otherwise use a dummy nextIdentity function
                        nextIdentity = function(a, b, callback) { return callback(); }
                    }
                    nextIdentity.call(db, adapter, pm.name, function(err, insertedId) {
                        if (err) {
                            afterSaveListeners.forEach(function(listener) {
                                self.removeListener('after.save', listener);
                            });
                            return callback(err);
                        }
                        if (insertedId) {
                            //get object to insert
                            if (q.$insert) {
                                var o = q.$insert[adapter];
                                if (o) {
                                    //set the generated primary key
                                    o[pm.name] = insertedId;
                                }
                            }
                        }
                        db.execute(q, null, function(err, result) {
                            if (err) {
                                afterSaveListeners.forEach(function(listener) {
                                    self.removeListener('after.save', listener);
                                });
                                return callback(err);
                            }
                            else {
                                if (key)
                                    target[self.primaryKey] = key;
                                //get updated object
                                self.recast(e.target, target, function(err) {
                                    if (err) {
                                        afterSaveListeners.forEach(function(listener) {
                                            self.removeListener('after.save', listener);
                                        });
                                        return callback(err);
                                    }
                                    else {
                                        if (pm.type==='Counter' && typeof db.nextIdentity !== 'function' && e.state===1) {
                                            //if data adapter contains lastIdentity function
                                            var lastIdentity = db.lastIdentity || function(lastCallback) {
                                                    if (_.isNil(result))
                                                        lastCallback(null, { insertId: null});
                                                    lastCallback(null, result);
                                                };
                                            lastIdentity.call(db, function(err, lastResult) {
                                                if (lastResult)
                                                    if (lastResult.insertId)
                                                        e.target[self.primaryKey] = lastResult.insertId;
                                                // raise after save listeners
                                                self.emit('after.save',e, function(err) {
                                                    afterSaveListeners.forEach(function(listener) {
                                                        self.removeListener('after.save', listener);
                                                    });
                                                    //invoke callback
                                                    return callback(err, e.target);
                                                });
                                            });
                                        }
                                        else {
                                            //raise after save listeners
                                            self.emit('after.save',e, function(err) {
                                                afterSaveListeners.forEach(function(listener) {
                                                    self.removeListener('after.save', listener);
                                                });
                                                //invoke callback
                                                return callback(err, e.target);
                                            });
                                        }
                                    }
                                });
                            }
                        });
                    });

                }
            });
        }
    });
}
/**
 * Gets an array of strings which contains the super types of this model e.g. User model may have ['Account','Thing'] as super types
 * @returns {Array}
 */
DataModel.prototype.getSuperTypes = function() {
    var result=[];
    var baseModel = this.base();
    while(baseModel!=null) {
        result.unshift(baseModel.name);
        baseModel = baseModel.base();
    }
    return result;
};

/**
 * @this DataModel
 * @param {*|Array} obj
 * @param {Function} callback
 * @private
 */
function update_(obj, callback) {
    var self = this;
    //ensure callback
    callback = callback || function() {};
    if (obj == null) {
        callback.call(self, null);
    }
    //set state
    if (_.isArray(obj)) {
        obj.forEach(function(x) {x['$state'] = 2; })
    }
    else {
        obj['$state'] = 2;
    }
    self.save(obj, callback);
}

/**
 * Updates an item or an array of items
 * @param obj {*|Array} - The item or the array of items to update
 * @param callback {Function=} - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 * @returns {Promise<T>|*} - If callback parameter is missing then returns a Promise object.
 */
DataModel.prototype.update = function(obj, callback)
{
    if (typeof callback !== 'function') {
        var d = Q.defer();
        update_.call(this, obj, function(err, result) {
            if (err) { return d.reject(err); }
            d.resolve(result);
        });
        return d.promise;
    }
    else {
        return update_.call(this, obj, callback);
    }
};

/**
 * @this DataModel
 * @param {*|Array} obj
 * @param {Function} callback
 * @private
 */
function insert_(obj, callback) {
    var self = this;
    //ensure callback
    callback = callback || function() {};
    if ((obj===null) || obj === undefined) {
        callback.call(self, null);
    }
    //set state
    if (_.isArray(obj)) {
        obj.forEach(function(x) {x['$state'] = 1; })
    }
    else {
        obj['$state'] = 1;
    }
    self.save(obj, callback);
}

/**
 * Inserts an item or an array of items
 * @param obj {*|Array} - The item or the array of items to update
 * @param callback {Function=} - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 * @returns {Promise<T>|*} - If callback parameter is missing then returns a Promise object.
 */
DataModel.prototype.insert = function(obj, callback)
{
    if (typeof callback !== 'function') {
        var d = Q.defer();
        insert_.call(this, obj, function(err, result) {
            if (err) { return d.reject(err); }
            d.resolve(result);
        });
        return d.promise;
    }
    else {
        return insert_.call(this, obj, callback);
    }
};

/**
 * @this DataModel
 * @param {*|Array} obj
 * @param {Function} callback
 * @private
 */
function remove_(obj, callback) {
    var self = this;
    if (obj==null)
    {
        callback.call(self, null);
        return;
    }

    self.migrate(function(err) {
        if (err) { callback(err); return; }
        var arr = [];
        if (_.isArray(obj)) {
            for (var i = 0; i < obj.length; i++)
                arr.push(obj[i]);
        }
        else
            arr.push(obj);
        //delete objects
        var db = self.context.db;
        db.executeInTransaction(function(cb) {
            async.eachSeries(arr, function(item, removeCallback) {
                removeSingleObject_.call(self, item, function(err) {
                    if (err) {
                        removeCallback.call(self, err);
                        return;
                    }
                    removeCallback.call(self, null);
                });
            }, function(err) {
                if (err) {
                    cb(err);
                    return;
                }
                cb(null);
            });
        }, function(err) {
            callback.call(self, err);
        });
    });
}

/**
 * Deletes the given object or array of objects
 * @param obj {*|Array} The item or the array of items to delete
 * @param callback {Function=} - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 * @returns {Promise<T>|*} - If callback parameter is missing then returns a Promise object.
 * @example
 //remove group (Sales)
 var group = { "name":"Sales" };
 context.model("Group").remove(group).then(function() {
        done();
    }).catch(function(err) {
        done(err);
    });
 */
DataModel.prototype.remove = function(obj, callback)
{
    if (typeof callback !== 'function') {
        var d = Q.defer();
        remove_.call(this, obj, function(err, result) {
            if (err) { return d.reject(err); }
            d.resolve(result);
        });
        return d.promise;
    }
    else {
        return remove_.call(this, obj, callback);
    }
};

/**
 * @this DataModel
 * @param {Object} obj
 * @param {Function} callback
 * @private
 */
 function removeSingleObject_(obj, callback) {
    var self = this;
    callback = callback || function() {};
    if (obj==null) {
        callback.call(self);
        return;
    }
    if (_.isArray(obj)) {
        callback.call(self, new Error('Invalid argument. Object cannot be an array.'));
        return 0;
    }
    var e = {
        model: self,
        target: obj,
        state: 4
    };
    //register nested objects listener
    self.once('before.remove', DataNestedObjectListener.prototype.beforeRemove);
    //register data referenced object listener
    self.once('before.remove', DataReferencedObjectListener.prototype.beforeRemove);
    //before remove (validate permissions)
    self.once('before.remove', DataPermissionEventListener.prototype.beforeRemove);
    //execute before update events
    self.emit('before.remove', e, function(err) {
        //if an error occurred
        self.removeListener('before.remove', DataPermissionEventListener.prototype.beforeRemove);
        self.removeListener('before.remove', DataReferencedObjectListener.prototype.beforeRemove);
        self.removeListener('before.remove', DataNestedObjectListener.prototype.beforeRemove);
        if (err) {
            //invoke callback with error
            return callback(err);
        }
        //get db context
        var db = self.context.db;
        //create delete query
        var q = QueryUtils.delete(self.sourceAdapter).where(self.primaryKey).equal(obj[self.primaryKey]);
        //execute delete query
        db.execute(q, null, function(err) {
            if (err) {
                return callback(err);
            }
            //remove base object
            removeBaseObject_.call(self, e.target, function(err, result) {
                if (err) {
                    return callback(err);
                }
                if (typeof result !== 'undefined' && result !== null) {
                    _.assign(e.target, result);
                }
                //execute after remove events
                self.emit('after.remove',e, function(err) {
                    //invoke callback
                    return callback(err, e.target);
                });
            });
        });
    });

}

/**
 * @this DataModel
 * @param {*} obj
 * @param {Function} callback
 * @private
 */
function removeBaseObject_(obj, callback) {
    //ensure callback
    callback = callback || function() {};
    var self = this, base = self.base();
    //if obj is an array of objects throw exception (invoke callback with error)
    if (_.isArray(obj)) {
        callback.call(self, new Error('Invalid argument. Object cannot be an array.'));
        return 0;
    }
    //if current model does not have a base model
    if (_.isNil(base)) {
        //exit operation
        callback.call(self, null);
    }
    else {
        base.silent();
        //perform operation
        removeSingleObject_.call(base, obj, function(err, result) {
            callback.call(self, err, result);
        });
    }
}

/**
 * Validates that the given string is plural or not.
 * @param s {string}
 * @returns {boolean}
 * @private
 */
DataModel.PluralExpression = /([a-zA-Z]+?)([e']s|[^aiou]s)$/;

/**
 * Performing an automatic migration of current data model based on the current model's definition.
 * @param {Function} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise. The second argument will contain the result.
 */
DataModel.prototype.migrate = function(callback)
{
    var self = this;
    //cache: data model migration
    //prepare migration cache
    var configuration = self.context.getConfiguration();
    configuration.cache = configuration.cache || { };
    if (Object.prototype.hasOwnProperty.call(configuration.cache, self.name) === false) {
        // set cache
        Object.defineProperty(configuration.cache, self.name, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: {}
        });
    }
    if (configuration.cache[self.name].version === self.version) {
        //model has already been migrated, so do nothing
        return callback(null, false);
    }
    if (self.abstract) {
        return new callback(new DataError('EABSTRACT','An abstract model cannot be instantiated.',null,self.name));
    }
    //do not migrate sealed models
    if (self.sealed) {
        return callback(null, false);
    }
    var context = self.context;
    //do migration
    var fields = self.attributes.filter(function(x) {
        if (x.insertable === false && x.editable === false && x.model === self.name) {
            if (typeof x.query === 'undefined') {
                throw new DataError('E_MODEL', 'A non-insertable and non-editable field should have a custom query defined.', null, self.name, x.name);
            }
            // validate source and view
            if (self.sourceAdapter === self.viewAdapter) {
                throw new DataError('E_MODEL', 'A data model with the same source and view data object cannot have virtual columns.', null, self.name, x.name);
            }
            // exclude virtual column
            return false;
        }
        return (self.name === x.model) && (!x.many);
    });

    if ((fields===null) || (fields.length===0))
        throw new Error('Migration is not valid for this model. The model has no fields.');
    var migration = new types.DataModelMigration();
    migration.add = _.map(fields, function(x) {
        return _.assign({ }, x);
    });
    migration.version = self.version != null ? self.version : '0.0';
    migration.appliesTo = self.sourceAdapter;
    migration.model = self.name;
    migration.description = sprintf('%s migration (version %s)', this.title || this.name, migration.version);
    if (context===null)
        throw new Error('The underlying data context cannot be empty.');

    // get source adapter name (without schema)
    var qualifiedNameRegEx = new RegExp(ObjectNameValidator.validator.pattern, 'g');
    var matches = migration.appliesTo.match(qualifiedNameRegEx);
    Args.check(matches && matches.length, new DataError('ERR_INVALID_SOURCE', 'The database object of the given data model appears to be invalid based on the current validation rules.', null, self.name));
    // Select the last match from the regex results because it represents the most specific or relevant part of the qualified name.
    var [appliesTo] = matches.slice(-1);

    //get all related models
    var models = [];
    var db = context.db;
    var baseModel = self.base();
    if (baseModel!==null) {
        models.push(baseModel);
    }
    /**
     * Formats index name
     * @param {string} table
     * @param {string} attribute
     * @returns {string}
     */
    const formatIndexName = function(table, attribute) {
        return 'INDEX_' + table.toUpperCase() + '_' + attribute.toUpperCase();
    }
    //validate associated models
    migration.add.forEach(function(x) {
        //validate mapping
        var mapping = self.inferMapping(x.name);
        if (mapping && mapping.associationType === 'association') {
            if (mapping.childModel === self.name) {
                //get parent model
                var parentModel = self.context.model(mapping.parentModel),
                    attr = parentModel.getAttribute(mapping.parentField);
                if (attr) {
                        if (attr.type === 'Counter') {
                            x.type = 'Integer';
                        }
                        else {
                            x.type = attr.type;
                        }

                }
            }
            migration.indexes.push({
                name: formatIndexName(appliesTo, x.name),
                columns: [ x.name ]
            });
        }
        else if (x.indexed === true) {
            migration.indexes.push({
                name: formatIndexName(appliesTo, x.name),
                columns: [ x.name ]
            });
        }
    });

    //execute transaction
    db.executeInTransaction(function(tr) {
        if (models.length===0) {
            self.emit('before.upgrade', { model:self }, function(err) {
                if (err) { return tr(err); }
                db.migrate(migration, function(err) {
                    if (err) { return tr(err); }
                    if (migration.updated) {
                        return tr();
                    }
                    //execute after migrate events
                    self.emit('after.upgrade', { model:self }, function(err) {
                        migration.updated = true;
                        return tr(err);
                    });
                });
            });
        }
        else {
            async.eachSeries(models,function(m, cb)
            {
                if (m) {
                    m.migrate(cb);
                }
                else {
                    return cb();
                }
            }, function(err) {
                if (err) { return tr(err); }
                self.emit('before.upgrade', { model:self }, function(err) {
                    if (err) { return tr(err); }
                    db.migrate(migration, function(err) {
                        if (err) { return tr(err);  }
                        if (migration.updated) {
                            return tr();
                        }
                        //execute after migrate events
                        self.emit('after.upgrade', { model:self }, function(err) {
                            migration.updated = true;
                            return tr(err);
                        });
                    });
                });
            });
        }
    }, function(err) {
        if (err) {
            return callback(err);
        }
        try {
            // validate caching property
            if (Object.prototype.hasOwnProperty.call(configuration.cache, self.name) === false) {
                // and assign it if it's missing
                Object.defineProperty(configuration.cache, self.name, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: {}
                });
            }
            // get caching property
            const cached = Object.getOwnPropertyDescriptor(configuration.cache, self.name);
            Object.assign(cached.value, {
                version: self.version
            });
        } catch(err1) {
            return callback(err1);
        }
        return callback(null, !!migration.updated);
    });
};
/**
 * Performs an async upgrade of this model based on current model definition
 * @returns {Promise<boolean>}
 */
DataModel.prototype.migrateAsync = function() {
    const self = this;
    return new Promise(function (resolve, reject) {
        self.migrate(function(err, result) {
            if (err) {
                return reject(err);
            }
            return resolve(result);
        });
    });
}

/**
 * Gets an instance of DataField class which represents the primary key of this model.
 * @returns {DataField|*}
 */
DataModel.prototype.key = function()
{
    return this.attributes.find(function(x) { return x.primary===true; });
};
/**
 * Gets an instance of DataField class based on the given name.
 * @param {String} name - The name of the field.
 * @return {DataField|*} - Returns a data field if exists. Otherwise returns null.
 */
DataModel.prototype.field = function(name)
{
    if (typeof name !== 'string')
        return null;
    return this.attributes.find(function(x) { return (x.name===name) || (x.property===name); });
};
/**
 *
 * @param {string|*} attr
 * @param {string=} alias
 * @returns {DataQueryable|QueryField|*}
 */
DataModel.prototype.fieldOf = function(attr, alias) {
    var q = new DataQueryable(this);
    return q.fieldOf(attr, alias);
};

/**
 * Gets an instance of DataModelView class which represents a model view with the given name.
 * @param {string} name - A string that represents the name of the view.
 * @returns {DataModelView|undefined}
 *@example
 var view = context.model('Person').dataviews('summary');
 *
 */
DataModel.prototype.dataviews = function(name) {
    var self = this;
    var re = new RegExp('^' + name.replace('*','\\*').replace('$','\\$') + '$', 'ig');
    var view = self.views.filter(function(x) { return re.test(x.name);})[0];
    if (_.isNil(view))
        return;
    return _.assign(new DataModelView(self), view);
};

/**
 * Gets an instance of DataModelView class which represents a model view with the given name.
 * @param {string} name - A string that represents the name of the view.
 * @returns {DataModelView|undefined}
 *@example
 var view = context.model('Person').getDataView('summary');
 *
 */
DataModel.prototype.getDataView = function(name) {
    var self = this;
    var re = new RegExp('^' + name.replace('$','\\$') + '$', 'ig');
    var view = self.views.filter(function(x) { return re.test(x.name);})[0];
    if (_.isNil(view))
    {
        return _.assign(new DataModelView(self), {
            'name':'default',
            'title':'Default View',
            'fields': self.attributes.map(function(x) {
                return { 'name':x.name }
            })
        });
    }
    return _.assign(new DataModelView(self), view);
};


/**
 * @this DataModel
 * @param conf
 * @param name
 * @returns {*}
 * @private
 */
function inferDefaultMapping(conf, name) {
    var self = this;
    var field = self.field(name);
    //get field model type
    var associatedModel = self.context.model(field.type);
    if ((typeof associatedModel === 'undefined') || (associatedModel === null))
    {
        if (typeof field.many === 'boolean' && field.many) {
            //validate primitive type mapping
            var tagMapping = inferTagMapping.call(self, field);
            if (tagMapping) {
                //apply data association mapping to definition
                var definitionField = conf.fields.find(function(x) {
                    return x.name === field.name;
                });
                definitionField.mapping = field.mapping = tagMapping;
                return new DataAssociationMapping(definitionField.mapping);
            }
        }
        return null;
    }
    var associatedField;
    //in this case we have two possible associations. Junction or Foreign Key association
    //try to find a field that belongs to the associated model and holds the foreign key of this model.

    //get all associated model fields with type equal to this model
    var testFields = _.filter(associatedModel.attributes, function(x) {
       return x.type === self.name;
    });
    if (field.many === true) {
        //if associated model has only one field with type equal to this model
        if (testFields.length === 1) {
            //create a regular expression that is going to be used to test
            // if field name is equal to the pluralized string of associated model name
            // e.g. orders -> Order
            var reTestFieldName = new RegExp('^' + pluralize.plural(associatedModel.name)  + '$', 'ig');
            //create a regular expression to test
            // if the name of the associated field is equal to this model name
            // e.g. Person model has a field named user with type User
            var reTestName = new RegExp('^' + self.name + '$','ig');
            if (reTestName.test(testFields[0].name) && reTestFieldName.test(field.name)) {
                //then we have a default one-to-many association
                associatedField = testFields[0];
            }
        }
    }
    else {
        /*
        associatedField = associatedModel.attributes.find(function (x) {
            return x.type === self.name;
        });
        */
    }
    if (associatedField)
    {
        if (associatedField.many)
        {
            //return a data relation (parent model is the associated model)
            return new DataAssociationMapping({
                parentModel:associatedModel.name,
                parentField:associatedModel.primaryKey,
                childModel:self.name,
                childField:field.name,
                associationType:'association',
                cascade:'none'
            });
        }
        else
        {
            //return a data relation (parent model is the current model)
            return new DataAssociationMapping({
                parentModel:self.name,
                parentField:self.primaryKey,
                childModel:associatedModel.name,
                childField:associatedField.name,
                associationType:'association',
                cascade:'none',
                refersTo:field.property || field.name
            });
        }
    }
    else {
        var many = _.isBoolean(field.many) ? field.many : pluralize.isPlural(field.name);
        if (many) {
            //return a data junction
            return new DataAssociationMapping({
                associationAdapter: field.model.concat(_.upperFirst(field.name)),
                parentModel: self.name, parentField: self.primaryKey,
                childModel: associatedModel.name,
                childField: associatedModel.primaryKey,
                associationType: 'junction',
                cascade: 'none'
            });
        }
        else {
            return new DataAssociationMapping({
                parentModel: associatedModel.name,
                parentField: associatedModel.primaryKey,
                childModel: self.name,
                childField: field.name,
                associationType: 'association',
                cascade: 'none'
            });
        }
    }
}


/**
 * Gets a field association mapping based on field attributes, if any. Otherwise returns null.
 * @param {string} name - The name of the field
 * @returns {DataAssociationMapping|*}
 */
DataModel.prototype.inferMapping = function(name) {

    var self = this;
    //ensure model cached mappings
    var conf = self.context.model(self.name);
    if (typeof conf === 'undefined' || conf === null) {
        return;
    }
    if (_.isNil(conf[mappingsProperty])) {
        conf[mappingsProperty] = { };
    }

    if (_.isObject(conf[mappingsProperty][name])) {
        if (conf[mappingsProperty][name] instanceof DataAssociationMapping)
            return conf[mappingsProperty][name];
        else
            return  new DataAssociationMapping(conf[mappingsProperty][name]);
    }

    var field = self.field(name);
    var result;
    if (_.isNil(field))
        return null;
    //get default mapping
    var defaultMapping = inferDefaultMapping.bind(this)(conf, name);
    if (_.isNil(defaultMapping)) {
        //set mapping to null
        conf[mappingsProperty][name] = defaultMapping;
        return defaultMapping;
    }
    //extend default mapping attributes
    var mapping = _.assign(defaultMapping, field.mapping);

    var associationAdapter;
    if (mapping.associationType === 'junction' && mapping.associationAdapter && typeof mapping.associationObjectField === 'undefined') {
        // validate association adapter
        associationAdapter = self.context.model(mapping.associationAdapter);
        if (associationAdapter) {
            // try to find association adapter parent field
            var associationParentAttr = _.find(associationAdapter.attributes, function (x) {
                return (x.primary === 'undefined' || x.primary === false) && x.type === mapping.parentModel;
            });
            if (associationParentAttr) {
                mapping.associationObjectField = associationParentAttr.name;
            }
        }
    }
    if (mapping.associationType === 'junction' && typeof mapping.associationObjectField === 'undefined') {
        // todo: remove this rule and use always "object" as association object field (solve backward compatibility issues)
        // set default object field
        mapping.associationObjectField = 'parentId';
        if (mapping.refersTo && mapping.parentModel === self.name) {
            // get type
            var refersTo = self.getAttribute(mapping.refersTo);
            // validate data object tag association
            if (refersTo && self.context.getConfiguration().getStrategy(DataConfigurationStrategy).hasDataType(refersTo.type)) {
                mapping.associationObjectField = 'object';
            }
        }
    }
    if (mapping.associationType === 'junction' && mapping.associationAdapter && typeof mapping.associationValueField === 'undefined') {
        // validate association adapter
        associationAdapter = self.context.model(mapping.associationAdapter);
        if (associationAdapter) {
            // try to find association adapter parent field
            var associationChildAttr = _.find(associationAdapter.attributes, function (x) {
                return typeof (x.primary === 'undefined' || x.primary === false) &&  x.type === mapping.childModel;
            });
            if (associationChildAttr) {
                mapping.associationValueField = associationChildAttr.name;
            }
        }
    }
    if (mapping.associationType === 'junction' && typeof mapping.associationValueField === 'undefined') {
        // todo: remove this rule and use always "value" as association value field (solve backward compatibility issues)
        // set default object field
        mapping.associationValueField = 'valueId';
        if (mapping.refersTo && mapping.parentModel === self.name) {
            // get type
            var refersToAttr = self.getAttribute(mapping.refersTo);
            // validate data object tag association
            if (refersToAttr && self.context.getConfiguration().getStrategy(DataConfigurationStrategy).hasDataType(refersToAttr.type)) {
                mapping.associationValueField = 'value';
            }
        }
    }

    //if field model is different than the current model
    if (field.model !== self.name) {
        //if field mapping is already associated with the current model
        // (child or parent model is equal to the current model)
        if ((mapping.childModel===self.name) || (mapping.parentModel===self.name)) {
            //cache mapping
            conf[mappingsProperty][name] = new DataAssociationMapping(mapping);
            //do nothing and return field mapping
            return conf[mappingsProperty][name];
        }
        //get super types
        var superTypes = self.getSuperTypes();
        //map an inherited association
        //1. super model has a foreign key association with another model
        //(where super model is the child or the parent model)
        if (mapping.associationType === 'association') {
            //create a new cloned association
            result = new DataAssociationMapping(mapping);
            //check super types
            if (superTypes.indexOf(mapping.childModel)>=0) {
                //set child model equal to current model
                result.childModel = self.name;
            }
            else if (superTypes.indexOf(mapping.parentModel)>=0) {
                //set child model equal to current model
                result.parentModel = self.name;
            }
            else {
                //this is an exception
                throw new DataError('EMAP','An inherited data association cannot be mapped.');
            }
            //cache mapping
            conf[mappingsProperty][name] = result;
            //and finally return the newly created DataAssociationMapping object
            return result;
        }
        //2. super model has a junction (many-to-many association) with another model
        //(where super model is the child or the parent model)
        else if (mapping.associationType === 'junction') {
            //create a new cloned association
            result = new DataAssociationMapping(mapping);
            if (superTypes.indexOf(mapping.childModel)>=0) {
                //set child model equal to current model
                result.childModel = self.name;
            }
            else if (superTypes.indexOf(mapping.parentModel)>=0) {
                //set parent model equal to current model
                result.parentModel = self.name;
            }
            else {
                //this is an exception
                throw new DataError('EMAP','An inherited data association cannot be mapped.');
            }
            //cache mapping
            conf[mappingsProperty][name] = result;
            //and finally return the newly created DataAssociationMapping object
            return result;
        }
    }
    //in any other case return the association mapping object
    if (mapping instanceof DataAssociationMapping) {
        //cache mapping
        conf[mappingsProperty][name] = mapping;
        //and return
        return mapping;
    }
    result = _.assign(new DataAssociationMapping(), mapping);
    //cache mapping
    conf[mappingsProperty][name] = result;
    //and return
    return result;

};


/**
 * @this DataModel
 * @param {*} obj
 * @param {number} state
 * @param {Function} callback
 * @private
 */
function validate_(obj, state, callback) {
    /**
     * @type {DataModel|*}
     */
    var self = this;
    if (_.isNil(obj)) {
        return callback();
    }
    //get object copy (based on the defined state)
    var objCopy = castForValidation_.call (self, obj, state);

    var attributes = self.attributes.filter(function(x) {
        if (x.model!==self.name) {
            if (!x.cloned)
                return false;
        }
        return (!x.readonly) ||
            (x.readonly && (typeof x.calculation!=='undefined') && state===2) ||
            (x.readonly && (typeof x.value!=='undefined') && state===1) ||
            (x.readonly && (typeof x.calculation!=='undefined') && state===1);
    }).filter(function(y) {
        return (state===2) ? (hasOwnProperty(y, 'editable') ? y.editable : true) : true;
    });

    /**
     * @type {ModuleLoader|*}
     */
    var moduleLoader = this.context.getConfiguration().getStrategy(ModuleLoaderStrategy);

    async.eachSeries(attributes, function(attr, cb) {
        var validationResult;
        //get value
        var value = objCopy[attr.name];
        //build validators array
        var arrValidators=[];
        var hasProperty = hasOwnProperty(objCopy, attr.name);
        //-- RequiredValidator
        if (hasOwnProperty(attr, 'nullable') && !attr.nullable)
        {
            if (state===1 && !attr.primary) {
                arrValidators.push(new validators.RequiredValidator());
            }
            else if (state===2 && !attr.primary && hasProperty) {
                arrValidators.push(new validators.RequiredValidator());
            }
        }
        //-- MaxLengthValidator
        if (hasOwnProperty(attr, 'size') && hasProperty) {
            if (!(attr.validation && attr.validation.maxLength))
                arrValidators.push(new validators.MaxLengthValidator(attr.size));
        }
        //-- CustomValidator
        var validator = attr.validation && attr.validation.validator;
        if (typeof validator === 'string' && hasProperty === true) {
            var validatorModule;
            try {
                validatorModule = moduleLoader.require(validator);
            }
            catch (err) {
                TraceUtils.debug(sprintf('Data validator module (%s) cannot be loaded', validator));
                TraceUtils.debug(err);
                return cb(err);
            }
            if (typeof validatorModule.createInstance !== 'function') {
                TraceUtils.debug(sprintf('Data validator module (%s) does not export createInstance() method.', attr.validation.type));
                return cb(new Error('Invalid data validator type.'));
            }
            arrValidators.push(validatorModule.createInstance(attr));
        }

        if (typeof validator === 'function') {
            var executeValidator = new validators.AsyncExecuteValidator(self, validator);
            executeValidator.message = attr.validation && attr.validation.message;
            arrValidators.push(executeValidator);
        }
        
        //-- DataTypeValidator #1
        if (attr.validation && hasProperty) {
            if (typeof attr.validation.type === 'string') {
                arrValidators.push(new validators.DataTypeValidator(attr.validation.type));
            }
            else {
                //convert validation data to pseudo type declaration
                var validationProperties = {
                    properties:attr.validation
                };
                arrValidators.push(new validators.DataTypeValidator(validationProperties));
            }
        }
        //-- DataTypeValidator #2
        if (attr.type && hasProperty) {
            arrValidators.push(new validators.DataTypeValidator(attr.type));
        }

        if (arrValidators.length === 0) {
            return cb();
        }
        //do validation
        async.eachSeries(arrValidators, function(validator, cb) {

            try {
                //set context
                if (typeof validator.setContext === 'function') {
                    validator.setContext(self.context);
                }
                //set target
                validator.target = obj;
                if (typeof validator.validateSync === 'function') {
                    validationResult = validator.validateSync(value);
                    if (validationResult) {
                        return cb(new DataError(validationResult.code || 'EVALIDATE',validationResult.message, validationResult.innerMessage, self.name, attr.name));
                    }
                    else {
                        return cb();
                    }
                }
                else if (typeof validator.validate === 'function') {
                    return validator.validate(value, function(err, validationResult) {
                        if (err) {
                            return cb(err);
                        }
                        if (validationResult) {
                            return cb(new DataError(validationResult.code || 'EVALIDATE',validationResult.message, validationResult.innerMessage, self.name, attr.name));
                        }
                        return cb();
                    });
                }
                else {
                    TraceUtils.debug(sprintf('Data validator (%s) does not have either validate() or validateSync() methods.', attr.validation.type));
                    return cb(new Error('Invalid data validator type.'));
                }
            }
            catch(err) {
                return cb(err);
            }
        }, function(err) {
            return cb(err);
        });

    }, function(err) {
        return callback(err);
    });
}
/**
 * Validates the given object against validation rules which are defined either by the data type or the definition of each attribute
 <p>Read more about data validation <a href="DataValidatorListener.html">here</a>.</p>
 * @param {*} obj - The data object which is going to be validated
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 * @returns {Promise|*} - If callback parameter is missing then returns a Promise object.
 */
DataModel.prototype.validateForUpdate = function(obj, callback) {
    if (typeof callback !== 'function') {
        var d = Q.defer();
        validate_.call(this, obj, 2, function(err, result) {
            if (err) { return d.reject(err); }
            d.resolve(result);
        });
        return d.promise;
    }
    else {
        return validate_.call(this, obj, callback);
    }
};

/**
 * Validates the given object against validation rules which are defined either by the data type or the definition of each attribute
 <p>Read more about data validation <a href="DataValidatorListener.html">here</a>.</p>
 * @param {*} obj - The data object which is going to be validated
 * @param {Function=} callback - A callback function where the first argument will contain the Error object if an error occurred, or null otherwise.
 * @returns {Promise|*} - If callback parameter is missing then returns a Promise object.
 <p>Read more about data validation <a href="DataValidationListener.html">here</a></p>
 */
DataModel.prototype.validateForInsert = function(obj, callback) {
    if (typeof callback !== 'function') {
        var d = Q.defer();
        validate_.call(this, obj, 1, function(err, result) {
            if (err) { return d.reject(err); }
            d.resolve(result);
        });
        return d.promise;
    }
    else {
        return validate_.call(this, obj, callback);
    }
};

/**
 * Sets the number of levels of the expandable attributes.
 * The default value is 1 which means that any expandable attribute will be flat (without any other nested attribute).
 * If the value is greater than 1 then the nested objects may contain other nested objects and so on.
 * @param {Number=} value - A number which represents the number of levels which are going to be used in expandable attributes.
 * @returns {DataQueryable}
 * @example
 //get orders, expand customer and get customer's nested objects if any.
 context.model('Order')
 .levels(2)
 .orderByDescending('dateCreated)
 .expand('customer')
 .getItems().then(function(result) {
        done(null, result);
    }).catch(function(err) {
        done(err);
    });
 */
DataModel.prototype.levels = function(value) {
    var result = new DataQueryable(this);
    return result.levels(value);
};
/**
 * Gets an array of active models which are derived from this model.
 * @returns {Promise|*}
 * @example
 * context.model("Thing").getSubTypes().then(function(result) {
        console.log(JSON.stringify(result,null,4));
        return done();
    }).catch(function(err) {
        return done(err);
    });
 */
DataModel.prototype.getSubTypes = function () {
    var self = this;
    var d = Q.defer();
    process.nextTick(function() {
        var migrations = self.context.model('Migration');
        if (_.isNil(migrations)) {
            return d.resolve([]);
        }
        migrations.silent()
            .select('model')
            .groupBy('model')
            .all().then(function(result) {
            var conf = self.context.getConfiguration().getStrategy(DataConfigurationStrategy), arr = [];
            result.forEach(function(x) {
                var m = conf.getModelDefinition(x.model);
                if (m && m.inherits === self.name) {
                    arr.push(m.name);
                }
            });
            return d.resolve(arr);
        }).catch(function(err) {
            return d.reject(err)
        });
    });
    return d.promise;
};
/**
 * @param {boolean=} deep
 * @returns {Promise}
 */
DataModel.prototype.getReferenceMappings = function (deep) {
    var self = this,
        context = self.context;
    deep = (typeof deep === 'undefined') ? true : types.parsers.parseBoolean(deep);
    var d = Q.defer();
    process.nextTick(function() {
        var referenceMappings = [], name = self.name, attributes;
        var migrations = self.context.model('Migration');
        if (_.isNil(migrations)) {
            return d.resolve([]);
        }
        migrations.silent()
            .select('model')
            .groupBy('model')
            .all().then(function(result) {
            _.forEach(result, function(x) {
                var m = context.model(x.model);
                if (_.isNil(m)) {
                    return;
                }
                if (deep) {
                    attributes = m.attributes;
                } else {
                    attributes = _.filter(m.attributes, function(a) {
                        return a.model === m.name;
                    });
                }
                _.forEach(attributes, function(y) {
                    var mapping = m.inferMapping(y.name);
                    if (mapping && ((mapping.parentModel === name) || (mapping.childModel === name && mapping.associationType === 'junction'))) {
                        referenceMappings.push(_.assign(mapping, { refersTo:y.name }));
                    }
                });
            });
            return d.resolve(referenceMappings);
        }).catch(function(err) {
            return d.reject(err)
        });
    });
    return d.promise;
};


/**
 * Gets an attribute of this data model.
 * @param {string} name
 */
DataModel.prototype.getAttribute = function (name) {
    if (_.isNil(name)) { return; }
    if (typeof name !== 'string') { return; }
    return this.attributes.find(function(x) { return x.name === name; });
};

/**
 * Gets a collection of DataObject instances by executing the defined query.
 * @returns {Promise|*}
 */
DataModel.prototype.getTypedItems = function() {
    var self = this,
        d = Q.defer();
    process.nextTick(function() {
        var q = new DataQueryable(self);
        q.getTypedItems().then(function (result) {
            return d.resolve(result);
        }).catch(function(err) {
            return d.reject(err);
        });
    });
    return d.promise;
};

/**
 * Gets a collection of DataObject instances by executing the defined query.
 * @returns {Promise|*}
 */
DataModel.prototype.getItems = function() {
    var self = this,
        d = Q.defer();
    process.nextTick(function() {
        var q = new DataQueryable(self);
        q.getItems().then(function (result) {
            return d.resolve(result);
        }).catch(function(err) {
            return d.reject(err);
        });
    });
    return d.promise;
};

/**
 * Gets a result set that contains a collection of DataObject instances by executing the defined query.
 * @returns {Promise|*}
 */
DataModel.prototype.getTypedList = function() {
    var self = this,
        d = Q.defer();
    process.nextTick(function() {
        var q = new DataQueryable(self);
        q.getTypedList().then(function (result) {
            return d.resolve(result);
        }).catch(function(err) {
            return d.reject(err);
        });
    });
    return d.promise;
};

/**
 * Gets a result set that contains a collection of DataObject instances by executing the defined query.
 * @returns {Promise|*}
 */
DataModel.prototype.getList = function() {
    var self = this,
        d = Q.defer();
    process.nextTick(function() {
        var q = new DataQueryable(self);
        q.list().then(function (result) {
            return d.resolve(result);
        }).catch(function(err) {
            return d.reject(err);
        });
    });
    return d.promise;
};
/**
 * @param obj {*|Array<*>}
 * @param callback {Function}
 * @returns {void|Promise<*>}
 */
DataModel.prototype.upsert = function(obj, callback) {
    if (typeof callback === 'undefined') {
        return this.upsertAsync(obj);
    } else {
        return this.upsertAsync(obj).then(function(result) {
            return callback(null, result);
        }).catch(function(err) {
            return callback(err);
        });
    }
};

/**
 * @param {*|Array<*>} obj
 * @returns {Promise<*>}
 */
DataModel.prototype.upsertAsync = function(obj) {
    var items = [];
    var self = this;
    // create a clone
    var thisModel = this.clone(this.context);
    // format object(s) to array
    if (Array.isArray(obj)) {
        items = obj;
    } else {
        items.push(obj);
    }
    return Promise.sequence(items.map(function(item) {
        return function() {
            if (thisModel.primaryKey == null) {
                throw new DataError('E_PKEY', 'Primary key cannot be empty at this context', null, thisModel.name);
            }
            if (item[thisModel.primaryKey] == null) {
                delete item[thisModel.primaryKey];
                return new Promise(function(resolve, reject) {
                    self.inferState(item, function(err, state) {
                        if (err) {
                            return reject(err);
                        }
                        Object.assign(item, {
                            $state: state
                        });
                        return resolve(item);
                    });
                });
            }
            // try to find object by primary key
            return thisModel.where(thisModel.primaryKey).equal(item[thisModel.primaryKey]).silent().count().then(function(result) {
                // if object does not exist, set state to insert
                Object.assign(item, {
                    $state: (result === 0) ? DataObjectState.Insert : DataObjectState.Update
                });
                // and return item
                return Promise.resolve(item);
            });
        }
    })).then(function() {
        // finally do update
        return self.save(items).then(function(results) {
            // delete $state
            items.forEach(function (item) {
                delete item.$state;
            });
            return Array.isArray(obj) ? results : results[0];
        });
    });
}

DataModel.load = new SyncSeriesEventEmitter();

module.exports = {
    DataModel
};
