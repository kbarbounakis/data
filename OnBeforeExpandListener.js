const { DataError } = require('@themost/common');
const { QueryField } = require('@themost/query');
const cloneDeep = require('lodash/cloneDeep');
const { DataAssociationMapping } = require('./types');
const { series } = require('async');
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
                    if (mappings.length > 0) {
                        return callback();
                    }
                    const { viewAdapter: ModelView } = model;
                    // iterate over expands and try to include them
                    return series(mappings, ((mapping, cb) => {
                        if (mapping.associationType === 'association' && mapping.many === false) {
                            // try to include json-like query for getting foreign key association
                            const options = mapping.options || {};
                            // get associated model query
                            const parentModel = context.model(mapping.parentModel);
                            return parentModel.filterAsync(options).then((q) => {
                                const { query } = q.prepare();
                                const { viewAdapter: ParentView } = parentModel;
                                // pseudo-sql: WHERE ParentView.parentField = ModelView.childField
                                query.where(
                                    new QueryField(mapping.parentField).from(ParentView)
                                ).equal(
                                    new QueryField(mapping.childField).from(ModelView)
                                );
                                return cb();
                            }).catch((err) => {
                                return cb(err);
                            });
                        }
                    }, (err) => {
                        if (err) {
                            return callback(err);
                        }
                        return callback();
                    }));
                }
            } catch (err) {
                return callback(err);
            }
            
        }
        return callback();
    }
}

module.exports = {
    OnBeforeExecuteListener: OnBeforeExpandListener
};