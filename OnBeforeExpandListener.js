const { DataError } = require('@themost/common');
const { QueryField, SqlFormatter } = require('@themost/query');
const cloneDeep = require('lodash/cloneDeep');
const { DataAssociationMapping, DataObjectState } = require('./types');
const { eachSeries } = require('async');
const { DataPermissionEventListener } = require('./data-permission')

/**
 * @typedef {Object} SqlQueryDialect
 * @property {function(query: import('@themost/query').QueryExpression)} $query
 * 
 * @typedef {SqlFormatter && SqlQueryDialect} SqlFormatterWithQueryDialect
 * 
 */

if (typeof SqlFormatter.prototype.$query !== 'function') {
    /**
     * Formats a sub-query expression
     * @param {import('@themost/query').QueryExpression} query 
     */
    SqlFormatter.prototype.$query = function(query) {
        if (typeof query.$select === 'object') {
            return query.hasPaging() ? `(${this.formatLimitSelect(query)})` : `(${this.formatSelect(query)})`;
        }
        throw new Error('Invalid query expression. Expected a valid select expression.');
    }
}

/**
 * @class
 * @implements {import('./types').BeforeExecuteListener}
 */
class OnBeforeExpandListener {
    /**
     * 
     * @param {import('./types').DataEventArgs} event 
     * @param {function(err?: Error)} callback 
     */
    beforeExecute(event, callback) {
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
            if (typeof event.model.context.db.getFormatter !== 'function') {
                // exit without do nothing
               return callback();
            }
            const formatter = event.model.context.db.getFormatter();
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
                /**
                 * @type {{context: import('./types').DataContext}}
                 */ 
                const { context } = model;
                if (Array.isArray($expand) && $expand.length > 0) {
                    /**
                     * @type {Array<DataAssociationMapping>}
                     */
                    const mappings = $expand.filter((expr) => {
                        return expr != null;
                    }).map((expr) => {
                        if (expr instanceof DataAssociationMapping) {
                            return expr;
                        }
                        if (typeof expr === 'string') {
                            const mapping = model.inferMapping(expr);
                            if (mapping) {
                                return mapping;
                            }
                            throw new DataError('E_MAPPING', `Association mapping not found for ${model.name}.${expr}`, null, model.name, expr);
                        }
                        if (expr && expr.name) {
                            const mapping = model.inferMapping(expr.name);
                            if (mapping) {
                                if (typeof expr.options === 'object') {
                                    // clone mapping
                                    const cloned = cloneDeep(mapping); 
                                    // merge options
                                    return Object.assign(cloned.options, expr.options);
                                }
                                return mapping;
                            }
                            throw new DataError('E_MAPPING', `Association mapping not found for ${model.name}.${expr.name}`, null, model.name, expr.name);
                        }
                        throw new DataError('E_EXPR', 'Invalid association mapping expression. Expected a string or a valid data association mapping.', null, model.name);
                    });
                    if (mappings.length === 0) {
                        return callback();
                    }
                    const { viewAdapter: ModelView } = model;
                    // iterate over expands and try to include them
                    return eachSeries(mappings, (mapping, cb) => {
                        if (mapping.associationType === 'association' && mapping.childModel === model.name) {
                            // try to include json-like query for getting foreign key association
                            const options = mapping.options || {};
                            // get associated model query
                            const parentModel = context.model(mapping.parentModel);
                            void parentModel.migrateAsync().then(() => {
                                void parentModel.filterAsync(options).then((q) => {
                                    const { query } = q.prepare();
                                    if (query.$select == null) {
                                        q.select();
                                    }
                                    const { viewAdapter: ParentView } = parentModel;
                                    const fields = query.$select[ParentView] || [];
                                    query.$select = {
                                        [ParentView]: [
                                            {
                                                value: {
                                                    $jsonObject: fields
                                                }
                                            }
                                        ]
                                    };
                                    // pseudo-sql: WHERE ParentView.parentField = ModelView.childField
                                    query.where(
                                        new QueryField(mapping.parentField).from(ParentView)
                                    ).equal(
                                        new QueryField(mapping.childField).from(ModelView)
                                    );
                                    void new DataPermissionEventListener().beforeExecute({
                                        model: parentModel, // set model, the instance of parent model of the current association
                                        emitter: q, // set event emitter, the instance of data queryable
                                        query: query, // set query, the instance of the modified query expression
                                    }, (err) => {
                                        if (err) {
                                            return cb(err);
                                        }
                                        selectFields.push({
                                            [mapping.childField]: {
                                                $query: query
                                            }
                                        });
                                        // remove field from select clause
                                        const index = selectFields.findIndex((field) => {
                                            return field.$name === `${selectView}.${mapping.childField}`;
                                        });
                                        if (index >= 0) {
                                            selectFields.splice(index, 1);
                                        }
                                        Object.assign(mapping, {
                                            cancel: true
                                        });
                                        return cb();
                                    });
                                }).catch((err) => {
                                    return cb(err);
                                });
                            }).catch((err) => {
                                return cb(err);
                            })
                            
                        }
                    }, (err) => {
                        // remove cancelled mappings
                        for (let i = mappings.length - 1; i >= 0; i--) {
                            if (mappings[i].cancel) {
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
}

module.exports = {
    OnBeforeExpandListener
};