const {DataAssociationMapping} = require('./types');
const { DataError, LangUtils } = require('@themost/common');
const cloneDeep = require('lodash/cloneDeep');
const camelCase = require('lodash/camelCase');
const { applyEachSeries, eachSeries} = require('async');
const {QueryField, QueryEntity, QueryExpression} = require('@themost/query');

/**
 * Extract mappings from an instance of DataQueryable
 * @param {import('@themost/data').DataQueryable} q
 * @returns {Array<DataAssociationMapping>}
 */
function getMappings(q) {
    const {$expand, model} = q;
    if ($expand == null) {
        return [];
    }
    return $expand.filter((expr) => {
        return expr != null;
    }).map((expr) => {
        if (typeof expr === 'string') {
            const mapping = model.inferMapping(expr);
            const attribute = model.getAttribute(expr);
            if (mapping) {
                if (mapping.multiplicity) {
                    Object.assign(mapping, {
                        multiplicity: attribute.multiplicity
                    });
                }
                // return copy
                const res = cloneDeep(mapping);
                Object.assign(res, {
                    refersTo: expr,
                });
                return res;
            }
            throw new DataError('E_MAPPING', `Association mapping not found for ${model.name}.${expr}`, null, model.name, expr);
        }
        if (expr instanceof DataAssociationMapping) {
            // return copy
            const res = cloneDeep(expr);
            if (expr.refersTo) {
                const attribute = model.getAttribute(expr.refersTo);
                if (attribute && attribute.multiplicity) {
                    Object.assign(res, {
                        multiplicity: attribute.multiplicity
                    });
                }
            }
            return res;
        }
        if (expr && expr.name) {
            const mapping = cloneDeep(model.inferMapping(expr.name));
            const attribute = model.getAttribute(expr.name);
            if (mapping) {
                Object.assign(mapping, {
                    refersTo: expr.name
                });
                if (attribute.multiplicity) {
                    Object.assign(mapping, {
                        multiplicity: attribute.multiplicity
                    });
                }
                if (typeof expr.options === 'object') {
                    // merge options
                    Object.assign(mapping, {
                        options: expr.options
                    });
                }
                return mapping;
            }
            throw new DataError('ERR_ASSOC_MAPPING', `Association mapping not found for ${model.name}.${expr.name}`, null, model.name, expr.name);
        }
        throw new DataError('ERR_MAPPING_EXPR', 'Invalid association mapping expression. Expected a string or a valid data association mapping.', null, model.name);
    });
}

/**
 * @param {{ mapping: DataAssociationMapping, model:import('@themost/data').DataModel }} event
 * @param {function(err?:Error, result?: *):void} callback
 */
function onExpandingTagValues(event, callback) {
    const { mapping, model } = event;
    const { context, viewAdapter: ModelView } = model;
    if (mapping.associationType === 'junction' && mapping.childModel == null) {
        /**
         * @type {import('@themost/data').DataObjectTag}
         */
        const property = model.convert({}).property(mapping.refersTo);
        const baseModel = property.getBaseModel();
        const attribute = model.getAttribute(mapping.refersTo);
        if (attribute.type === 'Json' && attribute.additionalType !== 'null') {
            // upgrade base model
            return baseModel.migrateAsync().then(() => {
                const { viewAdapter: BaseView } = baseModel;
                const additionalModel = context.model(attribute.additionalType);
                const q = baseModel.asQueryable().select(
                    ...additionalModel.attributes.map((attribute) => {
                        return `${mapping.associationValueField}/${attribute.name} as ${attribute.name}`;
                    })
                );
                const { query } = q.prepare();
                query.where(
                    new QueryField(mapping.parentField).from(ModelView)
                ).equal(
                    new QueryField(mapping.associationObjectField).from(BaseView)
                );
                // exclude mapping
                Object.assign(mapping, {
                    exclude: true
                });
                return callback(null, {
                    [mapping.refersTo]: {
                        $jsonArray: [
                            query
                        ]
                    }
                });
            }).catch((err) => {
                return callback(err);
            });
        }
    }
    return callback();
}

/**
 * @param {{ mapping: DataAssociationMapping, model:import('@themost/data').DataModel, emitter: import('@themost/data').DataQueryable }} event
 * @param {function(err?:Error, result?: *):void} callback
 */
function onExpandingAssociation(event, callback) {
    const { mapping, model, emitter } = event;
    const { context, viewAdapter: ModelView } = model;
    if (mapping.associationType === 'association' && mapping.parentModel !== model.name && mapping.childModel === model.name) {
        const parentModel = context.model(mapping.parentModel);
        if (parentModel == null) {
            return callback(new DataError('ERR_MODEL_NOT_FOUND', `${mapping.parentModel} not found`, null, mapping.childModel));
        }
        const options = mapping.options || {};
        return parentModel.migrateAsync().then(() => {
            return parentModel.filterAsync(options).then((q) => {
                const { viewAdapter: ParentModelView} = parentModel;
                // select attributes
                if (q.query.$select == null) q.select();
                // set levels
                const levels = LangUtils.parseInt(emitter.$levels);
                if (levels > 0) q.$levels = levels - 1;
                // subscribe to beforeExecute event
                q.model.once('before.execute', beforeExecute);
                // emit beforeExecute event
                void q.model.emit('before.execute', { model: q.model, emitter: q }, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    // pseudo SQL: e.g.  WHERE ProductData.id = OrderData.orderedItem
                    q.prepare();
                    q.query.where(
                        new QueryField(mapping.parentField).from(ParentModelView)
                    ).equal(
                        new QueryField(mapping.childField).from(ModelView)
                    )
                    // exclude mapping
                    Object.assign(mapping, {
                        exclude: true
                    });
                    return callback(null, {
                        [mapping.childField]: {
                            $jsonObject: [
                                q.query
                            ]
                        }
                    });
                });

            });
        }).catch((err) => {
            return callback(err);
        });
    } else if (mapping.associationType === 'association' && mapping.parentModel === model.name && mapping.childModel !== model.name) {
        const childModel = context.model(mapping.childModel);
        if (childModel == null) {
            return callback(new DataError('ERR_MODEL_NOT_FOUND', `${mapping.childModel} not found`, null, mapping.childModel));
        }
        const options = mapping.options || {};
        return childModel.migrateAsync().then(() => {
            return childModel.filterAsync(options).then((q) => {
                const { viewAdapter: ChildModelView} = childModel;
                // select attributes
                if (q.query.$select == null) q.select();
                // set levels
                const levels = LangUtils.parseInt(emitter.$levels);
                if (levels > 0) q.$levels = levels - 1;
                // subscribe to beforeExecute event
                q.model.once('before.execute', beforeExecute);
                // emit beforeExecute event
                void q.model.emit('before.execute', { model: q.model, emitter: q }, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    // pseudo SQL: e.g.  WHERE OrderData.orderedItem = ProductData.id
                    q.prepare();
                    q.query.where(
                        new QueryField(mapping.childField).from(ChildModelView)
                    ).equal(
                        new QueryField(mapping.parentField).from(ModelView)
                    )
                    // exclude mapping
                    Object.assign(mapping, {
                        exclude: true
                    });
                    // noinspection JSUnresolvedReference
                    if (mapping.multiplicity === 'ZeroOrOne') {
                        return callback(null, {
                            [mapping.refersTo]: {
                                $jsonObject: [
                                    q.query
                                ]
                            }
                        });
                    }
                    return callback(null, {
                        [mapping.refersTo]: {
                            $jsonArray: [
                                q.query
                            ]
                        }
                    });
                });

            });
        }).catch((err) => {
            return callback(err);
        });
    }
    return callback();
}

/**
 * @param {{ mapping: DataAssociationMapping, model:import('@themost/data').DataModel, emitter: import('@themost/data').DataQueryable }} event
 * @param {function(err?:Error, result?: *):void} callback
 */
function onExpandingJunction(event, callback) {
    const { mapping, model, emitter } = event;
    const { context, viewAdapter: ModelView } = model;
    if (mapping.associationType === 'junction' && mapping.parentModel === model.name && mapping.childModel != null) {
        /**
         * @type {import('@themost/data').DataObjectJunction}
         */
        const property = model.convert({}).property(mapping.refersTo);
        const baseModel = property.getBaseModel();
        const { viewAdapter: BaseView } = baseModel;
        const childModel = context.model(mapping.childModel);
        if (childModel == null) {
            return callback(new DataError('ERR_MODEL_NOT_FOUND', `${mapping.parentModel} not found`, null, mapping.childModel));
        }
        const options = mapping.options || {};
        return childModel.migrateAsync().then(() => {
            return childModel.filterAsync(options).then((q) => {
                const { viewAdapter: ChildModelView} = childModel;
                // select attributes
                if (q.query.$select == null) q.select();
                // set levels
                const levels = LangUtils.parseInt(emitter.$levels);
                if (levels > 0) q.$levels = levels - 1;
                // subscribe to beforeExecute event
                q.model.once('before.execute', beforeExecute);
                // emit beforeExecute event
                void q.model.emit('before.execute', { model: q.model, emitter: q }, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    // join with junction table
                    // pseudo SQL: JOIN GroupMembers AS j0 ON GroupData.id = j0.parentId
                    // WHERE j0.valueId = UserData.id
                    const junctionView = camelCase(BaseView);
                    q.query.join(new QueryEntity(BaseView).as(junctionView)).with(
                        new QueryExpression().where(
                            new QueryField(mapping.childField).from(ChildModelView)
                        ).equal(
                            new QueryField(mapping.associationValueField).from(junctionView)
                        )
                    ).where(
                        new QueryField(mapping.associationObjectField).from(junctionView)
                    ).equal(
                        new QueryField(mapping.parentField).from(ModelView)
                    );
                    // exclude mapping
                    Object.assign(mapping, {
                        exclude: true
                    });
                    if (mapping.multiplicity === 'ZeroOrOne') {
                        return callback(null, {
                            [mapping.refersTo]: {
                                $jsonObject: [
                                    q.query
                                ]
                            }
                        });
                    }
                    return callback(null, {
                        [mapping.refersTo]: {
                            $jsonArray: [
                                q.query
                            ]
                        }
                    });
                });

            });
        }).catch((err) => {
            return callback(err);
        });
    } else if (mapping.associationType === 'junction' && mapping.childModel === model.name) {
        /**
         * @type {import('@themost/data').DataObjectJunction}
         */
        const property = model.convert({}).property(mapping.refersTo);
        const baseModel = property.getBaseModel();
        const { viewAdapter: BaseView } = baseModel;
        const parentModel = context.model(mapping.parentModel);
        if (parentModel == null) {
            return callback(new DataError('ERR_MODEL_NOT_FOUND', `${mapping.parentModel} not found`, null, mapping.childModel));
        }
        const options = mapping.options || {};
        return parentModel.migrateAsync().then(() => {
            return parentModel.filterAsync(options).then((q) => {
                const { viewAdapter: ParentModelView} = parentModel;
                 // select attributes
                 if (q.query.$select == null) q.select();
                 // set levels
                 const levels = LangUtils.parseInt(emitter.$levels);
                 if (levels > 0) q.$levels = levels - 1;
                    // subscribe to beforeExecute event
                 q.model.once('before.execute', beforeExecute);
                 // emit beforeExecute event
                 void q.model.emit('before.execute', { model: q.model, emitter: q }, (err) => {
                     if (err) {
                         return callback(err);
                     }
                     // join with junction table
                     // pseudo SQL: JOIN GroupMembers AS j0 ON GroupData.id = j0.parentId
                     // WHERE j0.valueId = UserData.id
                     const junctionView = camelCase(BaseView);
                     q.query.join(new QueryEntity(BaseView).as(junctionView)).with(
                         new QueryExpression().where(
                             new QueryField(mapping.parentField).from(ParentModelView)
                         ).equal(
                             new QueryField(mapping.associationObjectField).from(junctionView)
                         )
                     ).where(
                         new QueryField(mapping.associationValueField).from(junctionView)
                     ).equal(
                         new QueryField(mapping.childField).from(ModelView)
                     );
                     // exclude mapping
                     Object.assign(mapping, {
                         exclude: true
                     });
                     return callback(null, {
                         [mapping.refersTo]: {
                             $jsonArray: [
                                 q.query
                             ]
                         }
                     });
                 });

            });
        }).catch((err) => {
            return callback(err);
        });

    }
    return callback();
}


/**
 * Listener for 'beforeExecute' event.
 * @param {import('@themost/data').DataEventArgs} event
 * @param {function(err?:Error)} callback
 */
function beforeExecute(event, callback) {
    if (typeof event.result !== 'undefined') {
        return callback();
    }
    if (event.emitter) {
        /**
         * @type {{emitter:import('./data-queryable').DataQueryable}}
         */
        const {emitter} = event;
        // Check if the emitter is a queryable object and if it has a select clause
        if (emitter.query && emitter.query.$select == null) {
            return callback();
        }
        // validate that formatter supports json array
        // noinspection JSUnresolvedReference
        if (typeof event.model.context.db.getFormatter !== 'function') {
            // exit without do nothing
            return callback();
        }
        // noinspection JSUnresolvedReference
        const formatter = event.model.context.db.getFormatter();
        if (formatter == null) {
            // exit without do nothing
            return callback();
        }
        // noinspection JSUnresolvedReference
        if (typeof formatter.$jsonGroupArray !== 'function') {
            // the formatter does not support json group array
            // exit without do nothing
            return callback();
        }
        const [selectView] = Object.keys(emitter.query.$select);
        const selectFields = emitter.query.$select[selectView];
        try {
            /**
             * @type {{expands:Array<*>, model:import('./data-model').DataModel}}
             */
            const {$expand, model} = emitter;
            if (Array.isArray($expand) && $expand.length > 0) {
                /**
                 * @type {Array<DataAssociationMapping>}
                 */
                const mappings = getMappings(emitter);
                if (mappings.length === 0) {
                    return callback();
                }
                // iterate over expands and try to include them
                return eachSeries(mappings, (mapping, cb) => {
                    const event = { mapping, model, emitter };
                    void applyEachSeries([
                        onExpandingTagValues,
                        onExpandingJunction,
                        onExpandingAssociation
                    ], event, (err, results) => {
                      if (err) {
                          return cb(err);
                      }
                        const selectField = results.find((x) => x != null);
                        if (selectField) {
                            selectFields.push(selectField);
                        }
                        return cb();
                    });
                }, (err) => {
                    // remove cancelled mappings
                    for (let i = mappings.length - 1; i >= 0; i--) {
                        // noinspection JSUnresolvedReference
                        if (mappings[i].exclude === true) {
                            $expand.splice(i, 1);
                        }
                    }
                    if (err) {
                        return callback(err);
                    }
                    return callback();
                });
            }
        } catch (err) {
            return callback(err);
        }

    }
    return callback();
}

module.exports = {
    beforeExecute
}