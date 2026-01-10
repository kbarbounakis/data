import {TestApplication} from './TestApplication';
import { resolve } from 'path';
import {DataContext, DataEventArgs, DataQueryable} from '@themost/data';
import {TraceUtils} from '@themost/common';
import { performance } from 'perf_hooks';

function onBeforeSelectJsonArray(event: DataEventArgs, callback: (err?: Error) => void): void {
    let timer = -performance.now();
    if (event.emitter && event.emitter instanceof DataQueryable) {
        const queryable = event.emitter as DataQueryable;
        const {query} = queryable;
        if (query.$select) {
            const { viewAdapter: collection } = queryable.model;
            // search for json attributes with @json.multiplicity is zero to many
            const jsonAttributes = queryable.model.attributes.filter((x) => {
                return x.type === 'Json'
            }).filter((x) => {
                const jsonMultiplicity = Object.getOwnPropertyDescriptor(x, '@json.multiplicity');
                return jsonMultiplicity != null && jsonMultiplicity.value === 'ZeroToMany';
            }).map((x) => {
                return `${collection}.${x.name}`
            });

            const selectJsonArrayReplacer = (key: string, value: any) => {
                if (key === '$name') {
                    if (typeof value === 'string') {
                        const jsonAttribute = jsonAttributes.find((x) => {
                            return value.startsWith(x + '.');
                        })
                        if (jsonAttribute) {
                            const [collection, member] = jsonAttribute.split('.');
                            TraceUtils.debug(`Found JSON attribute in filter: ${value}`);
                            // add additional select
                            const additionalSelect = {
                                [member]: {
                                    $jsonEach: [
                                        `$${collection}.${member}`
                                    ]
                                }
                            };
                            query.$expand = query.$expand || [];
                            const alreadySelect = query.$expand.find((x: { [k: string]: any }) => {
                                const [key] = Object.keys(x);
                                return key === member;
                            })
                            if (alreadySelect == null) {
                                // force distinct selection
                                query.distinct(true);
                                // @ts-ignore
                                query.crossJoin({
                                    [member]: {
                                        $jsonEach: [
                                            `$${collection}.${member}`
                                        ]
                                    }
                                });
                            }
                            return `${member}.value.${value.substring(jsonAttribute.length + 1)}`;
                        }
                    }
                }
                return value;
            };

            query.$expand = query.$expand || [];
            const containsJsonEach = true;
            if (query.$select) {
                if (containsJsonEach) {
                    // stringify filter to search for the usage of $jsonGet pattern
                    const selectString = JSON.stringify(query.$select, selectJsonArrayReplacer);
                    query.$select = JSON.parse(selectString);
                }
            }

            if (query.$where) {
                if (containsJsonEach) {
                    // stringify filter to search for the usage of $jsonGet pattern
                    const whereString = JSON.stringify(query.$where, selectJsonArrayReplacer);
                    query.$where = JSON.parse(whereString);
                }
            }
            if (query.$order) {
                if (containsJsonEach) {
                    const orderByString = JSON.stringify(query.$order, selectJsonArrayReplacer);
                    query.$order = JSON.parse(orderByString);
                }
            }

            if (query.$group) {
                if (containsJsonEach) {
                    const groupByString = JSON.stringify(query.$group, selectJsonArrayReplacer);
                    query.$group = JSON.parse(groupByString);
                }
            }

        }
    }
    timer += performance.now();
    TraceUtils.log(`JsonEach onBeforeSelectJsonArray executed in ${timer} ms`);
    return callback();
}

const sampleProductArticles = [
    {
        name: 'Great phone', articleBody: 'This is a great phone!', author: {
            name: 'John Doe'
        }
    },
    {
        name: 'Not bad', articleBody: 'This phone is not bad for its price.', author: {
            name: 'Jane Smith'
        }
    },
    {
        name: 'Excellent', articleBody: 'Excellent value for money.', author: {
            name: 'Alice Johnson'
        }
    },
    {
        name: 'Could be better', articleBody: 'Could be better in terms of battery life.', author: {
            name: 'Bob Brown'
        }
    },
    {
        name: 'Superb', articleBody: 'Superb performance and features.', author: {
            name: 'Alice Johnson'
        }
    }
];

describe('JsonEach', () => {
    let app: TestApplication;
    let context: DataContext;
    beforeAll((done) => {
        app = new TestApplication(resolve(__dirname, 'test2'));
        context = app.createContext();
        return done();
    });
    afterAll(async () => {
        await context.finalizeAsync();
        await app.finalize();
    });

    it('should use filter on json array', async () => {
        const product = await context.model('Product').where('name').equal('Samsung Galaxy S4').getItem();
        expect(product).toBeTruthy();
        product.articles = sampleProductArticles;
        await context.model('Product').silent().save(product);

        const items = await context.model('Product')
            .on('before.execute', onBeforeSelectJsonArray)
            .where('articles/name').equal('Great phone').getItems();
        expect(items).toBeTruthy();
        expect(items.length).toBe(1);
        expect(items[0].name).toBe('Samsung Galaxy S4');
    });

    it('should use select on json array', async () => {
        const product = await context.model('Product').where('name').equal('Samsung Galaxy S4').getItem();
        expect(product).toBeTruthy();
        product.articles = sampleProductArticles;
        await context.model('Product').silent().save(product);

        const items = await context.model('Product')
            .on('before.execute', onBeforeSelectJsonArray)
            .asQueryable()
            .select('name', 'articles/author/name as author').getItems()
        expect(items).toBeTruthy();
    });

    it('should use select on nested json array', async () => {
        const product = await context.model('Product').where('name').equal('Samsung Galaxy S4').getItem();
        expect(product).toBeTruthy();
        product.articles = sampleProductArticles;
        await context.model('Product').silent().save(product);

        const items = await context.model('Order')
            .on('before.execute', onBeforeSelectJsonArray)
            .asQueryable()
            .select('orderedItem/name as product', 'orderedItem/articles/author/name as author')
            .where('orderedItem/articles/author/name').equal('Bob Brown')
            .getItems()
        expect(items).toBeTruthy();
    });

})